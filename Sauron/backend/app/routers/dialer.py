from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VoiceGrant
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse

from app.contact_phone_utils import primary_phone_number, serialize_phone_model
from app.config import settings
from app.database import async_session
from app.dependencies import get_current_user, get_db
from app.models.enums import UserRole
from app.fuzzy_search import fuzzy_text_match, normalize_search_term, relevance_score, strict_multi_word_filter
from app.models.lead import Lead, LeadContact, LeadContactPhone
from app.models.user import User
from app.services._openrouter import chat_completion

logger = logging.getLogger(__name__)

_PREFIX = "dialer-transcription"


def _terminal(message: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[{_PREFIX} {ts}] {message}", flush=True)


router = APIRouter(prefix="/api/dialer", tags=["dialer"])


# ---------------------------------------------------------------------------
# Sync TwiML App voice URL from env on startup
# ---------------------------------------------------------------------------


def sync_twiml_app_voice_url() -> None:
    """Update the TwiML App's Voice Request URL to match twilio_base_url.

    This removes the dependency on the URL manually configured in the
    Twilio console — the env variable is the single source of truth.
    """
    required = (
        settings.twilio_account_sid,
        settings.twilio_api_key_sid,
        settings.twilio_api_key_secret,
        settings.twilio_twiml_app_sid,
        settings.twilio_base_url,
    )
    if not all(required):
        logger.info(
            "[dialer] Skipping TwiML App sync — one or more Twilio settings are empty"
        )
        return

    voice_url = f"{settings.twilio_base_url.rstrip('/')}/api/dialer/twiml"

    try:
        client = TwilioClient(
            settings.twilio_api_key_sid,
            settings.twilio_api_key_secret,
            settings.twilio_account_sid,
        )
        client.applications(settings.twilio_twiml_app_sid).update(
            voice_url=voice_url,
            voice_method="POST",
        )
        logger.info(
            "[dialer] TwiML App %s voice URL set to %s",
            settings.twilio_twiml_app_sid,
            voice_url,
        )
    except Exception:
        logger.exception(
            "[dialer] Failed to update TwiML App voice URL — "
            "calls will use the URL configured in the Twilio console"
        )

# ---------------------------------------------------------------------------
# In-memory real-time transcript store
# ---------------------------------------------------------------------------

_transcripts: dict[str, list[dict[str, Any]]] = {}
_subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}
_call_session_map: dict[str, str] = {}

_CLEANUP_DELAY_SECS = 600
_SSE_TIMEOUT_SECS = 120


def _publish(session_id: str, event: dict[str, Any]) -> None:
    _transcripts.setdefault(session_id, []).append(event)
    for q in _subscribers.get(session_id, []):
        q.put_nowait(event)


def _cleanup_session(session_id: str, call_sid: str) -> None:
    _transcripts.pop(session_id, None)
    _subscribers.pop(session_id, None)
    _call_session_map.pop(call_sid, None)


# ---------------------------------------------------------------------------
# Contact search
# ---------------------------------------------------------------------------


class _DialerContactPhone(BaseModel):
    id: int
    number: str
    type: str
    is_primary: bool


class _DialerContact(BaseModel):
    id: int
    first_name: str
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    phone_numbers: list[_DialerContactPhone] = []
    title: str | None = None
    company: str
    lead_id: int


@router.get("/contacts", response_model=list[_DialerContact])
async def search_contacts(
    search: str = Query("", min_length=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search lead contacts for the dialer. BDRs only see their own leads' contacts."""
    query = (
        select(LeadContact)
        .join(Lead, LeadContact.lead_id == Lead.id)
        .options(
            joinedload(LeadContact.lead).load_only(Lead.id, Lead.company),
            selectinload(LeadContact.phone_numbers),
        )
    )

    if user.role == UserRole.BDR:
        query = query.where(Lead.user_id == user.id)

    searchable = [
        LeadContact.first_name,
        LeadContact.last_name,
        LeadContact.email,
        LeadContact.phone,
        Lead.company,
    ]

    term = normalize_search_term(search)
    if term:
        query = query.where(
            or_(
                *(fuzzy_text_match(col, term) for col in searchable),
                LeadContact.phone_numbers.any(
                    fuzzy_text_match(LeadContactPhone.number, term)
                ),
            )
        )

        multi_word = strict_multi_word_filter(searchable, term)
        if multi_word is not None:
            query = query.where(multi_word)

        score = sum(relevance_score(col, term) for col in searchable)
        query = query.order_by(score.desc(), LeadContact.id).limit(20)
    else:
        query = query.order_by(LeadContact.first_name).limit(20)

    result = await db.execute(query)
    contacts = result.scalars().unique().all()
    return [
        _DialerContact(
            id=contact.id,
            first_name=contact.first_name,
            last_name=contact.last_name,
            email=contact.email,
            phone=contact.phone or primary_phone_number(
                [serialize_phone_model(phone) for phone in contact.phone_numbers]
            ),
            phone_numbers=[
                _DialerContactPhone(
                    id=phone.id,
                    number=phone.number,
                    type=phone.type,
                    is_primary=phone.is_primary,
                )
                for phone in contact.phone_numbers
            ],
            title=contact.title,
            company=contact.lead.company,
            lead_id=contact.lead.id,
        )
        for contact in contacts
    ]


# ---------------------------------------------------------------------------
# Token
# ---------------------------------------------------------------------------


@router.get("/token")
async def get_voice_token(user: User = Depends(get_current_user)):
    """Generate a Twilio Access Token with a Voice grant for browser-based calling."""
    if not settings.twilio_account_sid:
        raise HTTPException(
            status_code=400, detail="Twilio credentials are not configured"
        )
    if not settings.twilio_twiml_app_sid:
        raise HTTPException(
            status_code=400, detail="Twilio TwiML App SID is not configured"
        )
    if not settings.twilio_api_key_sid or not settings.twilio_api_key_secret:
        raise HTTPException(
            status_code=400,
            detail="Twilio API Key (TWILIO_API_KEY_SID / TWILIO_API_KEY_SECRET) is not configured",
        )

    token = AccessToken(
        settings.twilio_account_sid,
        settings.twilio_api_key_sid,
        settings.twilio_api_key_secret,
        identity=user.email,
    )
    token.add_grant(
        VoiceGrant(
            outgoing_application_sid=settings.twilio_twiml_app_sid,
            incoming_allow=False,
        )
    )

    return {"token": token.to_jwt()}


# ---------------------------------------------------------------------------
# TwiML webhook (called by Twilio, unauthenticated)
# ---------------------------------------------------------------------------


@router.post("/twiml")
async def twiml_webhook(request: Request):
    """TwiML webhook hit by Twilio when a browser-initiated call connects (no auth)."""
    form = await request.form()
    form_dict = dict(form)
    logger.info("[twiml] Incoming form data: %s", form_dict)

    to = form.get("To", "")
    session_id = form.get("SessionId", "")
    call_sid = form.get("CallSid", "")

    logger.info("[twiml] To=%s  CallSid=%s  SessionId=%s", to, call_sid, session_id)

    if call_sid and session_id:
        _call_session_map[str(call_sid)] = str(session_id)
        logger.info("[twiml] Mapped CallSid %s -> SessionId %s", call_sid, session_id)
    else:
        logger.warning(
            "[twiml] Missing CallSid or SessionId — transcription will NOT be enabled. "
            "CallSid=%r, SessionId=%r",
            call_sid,
            session_id,
        )

    # Resolve per-user phone number; fall back to the default env phone number.
    caller_id = settings.twilio_phone_number
    from_field = str(form.get("From", ""))
    if from_field.startswith("client:"):
        client_email = from_field[len("client:"):]
        async with async_session() as db:
            result = await db.execute(select(User).where(User.email == client_email))
            caller_user = result.scalar_one_or_none()
            if caller_user and caller_user.phone_number:
                caller_id = caller_user.phone_number
                logger.info("[twiml] Using per-user phone number for %s: %s", client_email, caller_id)

    resp = VoiceResponse()
    if to:
        if settings.twilio_base_url and session_id:
            callback_url = (
                f"{settings.twilio_base_url.rstrip('/')}"
                f"/api/dialer/transcription-callback"
            )
            logger.info("[twiml] Enabling transcription — callback_url=%s", callback_url)
            start = resp.start()
            start.transcription(
                status_callback_url=callback_url,
                track="both_tracks",
                inbound_track_label="agent",
                outbound_track_label="customer",
                partial_results=False,
                language_code="en-US",
                profanity_filter=False,
                enable_automatic_punctuation=True,
            )
        else:
            logger.warning(
                "[twiml] Transcription SKIPPED — twilio_base_url=%r, session_id=%r",
                settings.twilio_base_url,
                session_id,
            )
        resp.dial(caller_id=caller_id).number(str(to))
    else:
        resp.say("No destination number was provided.")

    twiml_xml = str(resp)
    logger.info("[twiml] Returning TwiML:\n%s", twiml_xml)

    return Response(content=twiml_xml, media_type="application/xml")


# ---------------------------------------------------------------------------
# Transcription callback (called by Twilio, unauthenticated)
# ---------------------------------------------------------------------------

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.post("/transcription-callback")
async def transcription_callback(request: Request):
    """Receives real-time transcription events from Twilio."""
    form = await request.form()
    form_dict = dict(form)

    call_sid = str(form.get("CallSid", ""))
    event_type = str(form.get("TranscriptionEvent", ""))
    session_id = _call_session_map.get(call_sid)

    _terminal(f"event={event_type}  CallSid={call_sid}  session={session_id}")
    logger.debug("[transcription-cb] Full form data: %s", form_dict)

    if not session_id:
        _terminal(f"⚠ No session mapping for CallSid={call_sid} — dropping event. Known={list(_call_session_map.keys())}")
        return Response(status_code=200)

    ts = str(form.get("Timestamp", ""))

    if event_type == "transcription-content":
        track = str(form.get("Track", ""))
        raw = str(form.get("TranscriptionData", "{}"))
        is_final = str(form.get("Final", "false")).lower() == "true"
        seq = str(form.get("SequenceId", "0"))

        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            data = {}

        text = data.get("transcript", "")
        confidence = data.get("confidence", 0)

        label = "FINAL" if is_final else "partial"
        _terminal(
            f"[{track}] ({label} seq={seq} conf={confidence:.2f}) "
            f"{text[:200] if text else '<empty>'}"
        )

        if text:
            subs = len(_subscribers.get(session_id, []))
            _terminal(f"  → published to session={session_id}  subscribers={subs}")
            _publish(session_id, {
                "type": "utterance",
                "track": track,
                "text": text,
                "is_final": is_final,
                "confidence": confidence,
                "sequence_id": int(seq),
                "timestamp": ts,
            })

    elif event_type == "transcription-started":
        _terminal(f"▶ Transcription STARTED  session={session_id}  CallSid={call_sid}")
        _publish(session_id, {"type": "started", "timestamp": ts})

    elif event_type == "transcription-stopped":
        history_len = len(_transcripts.get(session_id, []))
        _terminal(f"■ Transcription STOPPED  session={session_id}  CallSid={call_sid}  total_events={history_len}")
        _publish(session_id, {"type": "stopped", "timestamp": ts})
        loop = asyncio.get_event_loop()
        loop.call_later(_CLEANUP_DELAY_SECS, _cleanup_session, session_id, call_sid)

    elif event_type == "transcription-error":
        err_code = str(form.get("TranscriptionErrorCode", ""))
        err_msg = str(form.get("TranscriptionError", ""))
        _terminal(f"✗ ERROR code={err_code}  message={err_msg}  CallSid={call_sid}")
        _publish(session_id, {
            "type": "error",
            "code": err_code,
            "message": err_msg,
            "timestamp": ts,
        })
    else:
        _terminal(f"? Unknown event type: {event_type}")

    return Response(status_code=200)


# ---------------------------------------------------------------------------
# SSE transcript stream (authenticated, consumed by frontend)
# ---------------------------------------------------------------------------


@router.get("/transcript-stream/{session_id}")
async def transcript_stream(
    session_id: str,
    user: User = Depends(get_current_user),
):
    """SSE endpoint that streams live transcription events to the browser."""

    logger.info(
        "[sse] Client connected for session %s  (user=%s)  history_len=%d  subscribers=%d",
        session_id,
        user.email,
        len(_transcripts.get(session_id, [])),
        len(_subscribers.get(session_id, [])),
    )

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    _subscribers.setdefault(session_id, []).append(queue)

    async def event_generator():
        try:
            history = _transcripts.get(session_id, [])
            logger.info("[sse] Replaying %d history entries for session %s", len(history), session_id)
            for entry in history:
                yield f"data: {json.dumps(entry)}\n\n"

            deadline = time.monotonic() + _SSE_TIMEOUT_SECS
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    logger.info("[sse] Timeout reached for session %s", session_id)
                    yield f"data: {json.dumps({'type': 'timeout'})}\n\n"
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=remaining)
                except asyncio.TimeoutError:
                    logger.info("[sse] Timeout waiting for events, session %s", session_id)
                    yield f"data: {json.dumps({'type': 'timeout'})}\n\n"
                    break
                logger.info("[sse] Forwarding event type=%s to client, session %s", event.get("type"), session_id)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") == "stopped":
                    break
        finally:
            subs = _subscribers.get(session_id, [])
            if queue in subs:
                subs.remove(queue)
            logger.info("[sse] Client disconnected for session %s", session_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ---------------------------------------------------------------------------
# Transcript summarization
# ---------------------------------------------------------------------------

_SUMMARIZE_MODEL = "openai/gpt-oss-120b"

_SUMMARIZE_SYSTEM_PROMPT = (
    "You are an assistant that summarizes sales call transcripts. "
    "Given a transcript between a sales rep and a customer, produce a concise summary "
    "covering: key topics discussed, any action items or next steps, and the outcome "
    "or sentiment of the call. Write in plain prose, 2-5 sentences. "
    "Do not include any preamble or labels — just the summary text."
)


class _SummarizeRequest(BaseModel):
    transcript: str


@router.post("/summarize-transcript")
async def summarize_transcript(
    body: _SummarizeRequest,
    user: User = Depends(get_current_user),
):
    """Use an LLM to generate a concise summary of a call transcript."""
    if not body.transcript.strip():
        return {"summary": ""}

    logger.info(
        "[summarize] Generating summary for %d-char transcript (user=%s)",
        len(body.transcript),
        user.email,
    )

    try:
        result = await chat_completion(
            model=_SUMMARIZE_MODEL,
            messages=[
                {"role": "system", "content": _SUMMARIZE_SYSTEM_PROMPT},
                {"role": "user", "content": body.transcript},
            ],
            temperature=0.3,
        )
        summary = result["choices"][0]["message"]["content"].strip()
        logger.info("[summarize] Summary generated (%d chars)", len(summary))
        return {"summary": summary}
    except Exception:
        logger.exception("[summarize] Failed to generate summary")
        raise HTTPException(status_code=502, detail="Failed to generate call summary")
