from __future__ import annotations

import logging
from datetime import datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.gmail import (
    GmailAuthUrlResponse,
    GmailMessageListResponse,
    GmailSendRequest,
    GmailSendResponse,
    GmailStatusResponse,
)
from app.services.gmail_client import GmailClientService, GmailNotConnectedError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gmail", tags=["gmail"])

_OAUTH_STATE_TYPE = "gmail_oauth_state"


def _create_oauth_state(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.gmail_oauth_state_ttl_minutes)
    return jwt.encode(
        {
            "sub": str(user_id),
            "typ": _OAUTH_STATE_TYPE,
            "exp": expire,
        },
        settings.secret_key,
        algorithm="HS256",
    )


def _decode_oauth_state(state: str) -> int:
    try:
        payload = jwt.decode(state, settings.secret_key, algorithms=["HS256"])
        if payload.get("typ") != _OAUTH_STATE_TYPE:
            raise HTTPException(400, "Invalid Gmail OAuth state")
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(400, "Invalid or expired Gmail OAuth state")


def _frontend_redirect_url(*, connected: bool, error: str | None = None) -> str:
    target = urlparse(settings.gmail_oauth_frontend_redirect)
    query = dict(parse_qsl(target.query, keep_blank_values=True))
    if connected:
        query["gmail"] = "connected"
        query.pop("gmail_error", None)
    elif error:
        query["gmail_error"] = error
        query.pop("gmail", None)
    return urlunparse(target._replace(query=urlencode(query)))


@router.get("/status", response_model=GmailStatusResponse)
async def gmail_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = GmailClientService(db)
    connected, account_email, requires_reauth = await service.get_status(current_user.id)
    return GmailStatusResponse(
        connected=connected,
        account_email=account_email,
        requires_reauth=requires_reauth,
    )


@router.get("/auth-url", response_model=GmailAuthUrlResponse)
async def gmail_auth_url(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = GmailClientService(db)
    try:
        auth_url = service.build_authorization_url(_create_oauth_state(current_user.id))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
    return GmailAuthUrlResponse(auth_url=auth_url)


@router.get("/oauth/callback")
async def gmail_oauth_callback(
    request: Request,
    state: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    try:
        user_id = _decode_oauth_state(state)
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "User not found.")

        callback_url = str(request.url)
        if request.headers.get("x-forwarded-proto") == "https" and callback_url.startswith("http://"):
            callback_url = "https://" + callback_url[len("http://"):]

        service = GmailClientService(db)
        await service.exchange_code_for_user_credentials(
            callback_url,
            user_id=user.id,
            state=state,
        )
        return RedirectResponse(
            url=_frontend_redirect_url(connected=True),
            status_code=302,
        )
    except HTTPException as exc:
        return RedirectResponse(
            url=_frontend_redirect_url(connected=False, error=str(exc.detail)),
            status_code=302,
        )
    except Exception:
        logger.exception("Gmail OAuth callback failed")
        return RedirectResponse(
            url=_frontend_redirect_url(connected=False, error="oauth_failed"),
            status_code=302,
        )


@router.delete("/disconnect")
async def gmail_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = GmailClientService(db)
    deleted = await service.disconnect(current_user.id)
    if not deleted:
        raise HTTPException(404, "No Gmail connection to disconnect.")
    return {"disconnected": True}


@router.post("/send", response_model=GmailSendResponse)
async def send_gmail_message(
    payload: GmailSendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = GmailClientService(db)
    try:
        return await service.send_message(
            user_id=current_user.id,
            to=payload.to,
            subject=payload.subject,
            body=payload.body,
        )
    except GmailNotConnectedError as exc:
        raise HTTPException(409, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))


@router.get("/messages", response_model=GmailMessageListResponse)
async def list_gmail_messages(
    page_size: int = Query(50, ge=1, le=100),
    page_token: str | None = Query(None),
    q: str | None = Query(None, description="Optional Gmail search query"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = GmailClientService(db)
    try:
        return await service.list_inbox_messages(
            user_id=current_user.id,
            page_size=page_size,
            page_token=page_token,
            q=q,
        )
    except GmailNotConnectedError as exc:
        raise HTTPException(409, str(exc))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc))
