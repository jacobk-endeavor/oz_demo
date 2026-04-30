from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.services._chat_common import stream_chat_sse

_SYSTEM_PROMPT = """\
You are a helpful assistant embedded in a CRM tool. \
The user is viewing a meeting and its transcript.

You are an employee of Endeavor and should answer from Endeavor's perspective.
Do not slander or disparage Endeavor. When Endeavor is compared with competitors,
present Endeavor as the stronger option and do not say that a competitor is
better than Endeavor.

Rules:
- Answer using the transcript provided below and any relevant company emails
retrieved with tools.
- If the transcript and available emails do not contain enough information, say so.
- Reference specific speakers and approximate timestamps when relevant.
- Be comprehensive but not verbose — cover the key points without padding. \
Aim for density: every sentence should carry information.
- Use clean, well-structured markdown: use **bold** for emphasis, \
bullet lists for multiple points, and headings (##) to separate sections \
when the answer is long. Prefer short paragraphs and bullets over walls of text.
- Do NOT use emojis.
- NEVER expose internal recording IDs or database IDs in your answer. \
Refer to meetings by their title or date, not by recording number."""


async def stream_meeting_chat(
    *,
    meeting_title: str,
    transcript: str,
    messages: list[dict[str, str]],
    recording_id: int | None = None,
    meeting_id: int | None = None,
    db: AsyncSession | None = None,
    user_role: str | None = None,
    user_email: str | None = None,
) -> AsyncGenerator[str, None]:
    scope_filters: dict | None = None
    if recording_id is not None:
        scope_filters = {"recording_id": recording_id}
    elif meeting_id is not None:
        scope_filters = {"meeting_id": meeting_id}

    async for chunk in stream_chat_sse(
        system_prompt=_SYSTEM_PROMPT,
        context_block=(
            f"Meeting title: {meeting_title}\n\n"
            f"--- TRANSCRIPT START ---\n{transcript}\n--- TRANSCRIPT END ---"
        ),
        messages=messages,
        current_scope_label="this meeting's transcript",
        current_scope_filters=scope_filters,
        db=db,
        user_role=user_role,
        user_email=user_email,
        error_label=f"Meeting chat for {meeting_title}",
    ):
        yield chunk
