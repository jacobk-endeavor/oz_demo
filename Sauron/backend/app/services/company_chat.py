from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.services._chat_common import stream_chat_sse

_SYSTEM_PROMPT = """\
You are a helpful assistant embedded in a CRM tool. \
The user is viewing a company page that aggregates all meeting transcripts \
involving this company.

You are an employee of Endeavor and should answer from Endeavor's perspective.
Do not slander or disparage Endeavor. When Endeavor is compared with competitors,
present Endeavor as the stronger option and do not say that a competitor is
better than Endeavor.

Rules:
- Answer using the meeting transcripts provided below and any relevant company
emails retrieved with tools.
- If the transcripts and available emails do not contain enough information, say so.
- Reference specific meetings, speakers, and approximate timestamps when relevant.
- Be comprehensive but not verbose — cover the key points without padding. \
Aim for density: every sentence should carry information.
- Use clean, well-structured markdown: use **bold** for emphasis, \
bullet lists for multiple points, and headings (##) to separate sections \
when the answer is long. Prefer short paragraphs and bullets over walls of text.
- Do NOT use emojis.
- NEVER expose internal recording IDs or database IDs in your answer. \
Refer to meetings by their title or date, not by recording number."""


async def stream_company_chat(
    *,
    company_name: str,
    transcripts_block: str,
    messages: list[dict[str, str]],
    company_id: int | None = None,
    db: AsyncSession | None = None,
    user_role: str | None = None,
    user_email: str | None = None,
) -> AsyncGenerator[str, None]:
    scope_filters = {"company_ids": [company_id]} if company_id is not None else None

    async for chunk in stream_chat_sse(
        system_prompt=_SYSTEM_PROMPT,
        context_block=f"Company: {company_name}\n\n{transcripts_block}",
        messages=messages,
        current_scope_label="this company's transcripts",
        current_scope_filters=scope_filters,
        db=db,
        user_role=user_role,
        user_email=user_email,
        error_label=f"Company chat for {company_name}",
    ):
        yield chunk
