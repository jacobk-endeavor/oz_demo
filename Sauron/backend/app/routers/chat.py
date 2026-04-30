from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.dependencies import get_current_user, get_db
from app.models.chat import ChatConversation, ChatMessage
from app.models.user import User
from app.schemas.chat import (
    ChatConversationRead,
    ChatConversationSummaryRead,
    GeneralChatRequest,
)
from app.services._openrouter import CHAT_MODEL, chat_completion, extract_content
from app.services.general_chat import stream_general_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])
logger = logging.getLogger(__name__)

_LIST_LIMIT = 100
_DEFAULT_CONVERSATION_TITLE = "New message"


def _normalize_generated_title(title: str, *, max_length: int = 80) -> str:
    normalized = " ".join(title.replace("\n", " ").split()).strip().strip("\"'")
    if not normalized:
        return _DEFAULT_CONVERSATION_TITLE
    if len(normalized) <= max_length:
        return normalized
    return f"{normalized[: max_length - 3].rstrip()}..."


def _fallback_conversation_title(messages: list[dict[str, str]]) -> str | None:
    for message in messages:
        if message.get("role") != "user":
            continue
        content = (message.get("content") or "").strip()
        if not content:
            continue
        title = _normalize_generated_title(content)
        if title != _DEFAULT_CONVERSATION_TITLE:
            return title
    return None


def _extract_text_from_sse_chunk(chunk: str) -> str:
    if not chunk.startswith("data: "):
        return ""
    raw = chunk[6:].strip()
    if not raw or raw == "[DONE]":
        return ""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return ""
    return parsed if isinstance(parsed, str) else ""


async def _get_conversation_or_404(
    *,
    db: AsyncSession,
    user_id: int,
    conversation_id: int,
    with_messages: bool = False,
) -> ChatConversation:
    stmt = select(ChatConversation).where(
        ChatConversation.id == conversation_id,
        ChatConversation.user_id == user_id,
    )
    if with_messages:
        stmt = stmt.options(selectinload(ChatConversation.messages))
    conversation = (await db.execute(stmt)).scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Chat conversation not found")
    return conversation


async def _load_message_history(
    db: AsyncSession, conversation_id: int
) -> list[dict[str, str]]:
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
    )
    return [
        {"role": message.role, "content": message.content}
        for message in result.scalars().all()
    ]


async def _persist_assistant_message(
    conversation_id: int, assistant_content: str
) -> None:
    saved_at = datetime.now(timezone.utc)
    async with async_session() as db:
        conversation = (
            await db.execute(
                select(ChatConversation).where(ChatConversation.id == conversation_id)
            )
        ).scalar_one_or_none()
        if conversation is None:
            return
        db.add(
            ChatMessage(
                conversation_id=conversation_id,
                role="assistant",
                content=assistant_content,
                created_at=saved_at,
            )
        )
        conversation.updated_at = saved_at
        conversation.last_message_at = saved_at
        await db.commit()


async def _finalize_conversation_response(
    conversation_id: int,
    *,
    assistant_content: str,
    existing_title: str | None,
    title_messages: list[dict[str, str]] | None = None,
) -> None:
    await _persist_assistant_message(conversation_id, assistant_content)
    if title_messages is None:
        return
    await _maybe_update_conversation_title(
        conversation_id,
        existing_title=existing_title,
        messages=title_messages,
    )


async def _generate_conversation_title(
    messages: list[dict[str, str]],
) -> str | None:
    if not messages:
        return None

    prompt_messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": (
                "You write concise chat conversation titles. "
                "Return only a short title of 2 to 5 words, with no quotes, no markdown, "
                "and no trailing punctuation."
            ),
        }
    ]
    for message in messages[:4]:
        role = message.get("role")
        content = (message.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        prompt_messages.append(
            {
                "role": role,
                "content": content[:1200],
            }
        )

    if len(prompt_messages) == 1:
        return None

    try:
        response = await chat_completion(
            model=CHAT_MODEL,
            messages=prompt_messages,
            temperature=0,
        )
    except Exception:
        logger.exception("Failed to generate chat conversation title")
        return None

    content = extract_content(response)
    if not content:
        return None
    title = _normalize_generated_title(content)
    if title == _DEFAULT_CONVERSATION_TITLE:
        return None
    return title


async def _maybe_update_conversation_title(
    conversation_id: int,
    *,
    existing_title: str | None,
    messages: list[dict[str, str]],
) -> None:
    if (existing_title or "").strip() not in {"", _DEFAULT_CONVERSATION_TITLE}:
        return

    final_title = await _generate_conversation_title(messages)
    if not final_title:
        final_title = _fallback_conversation_title(messages)
    if not final_title:
        return

    async with async_session() as db:
        conversation = (
            await db.execute(
                select(ChatConversation).where(ChatConversation.id == conversation_id)
            )
        ).scalar_one_or_none()
        if conversation is None:
            return
        if (conversation.title or "").strip() not in {"", _DEFAULT_CONVERSATION_TITLE}:
            return
        conversation.title = final_title
        await db.commit()


async def _resolve_conversation_title(messages: list[dict[str, str]]) -> str:
    final_title = await _generate_conversation_title(messages)
    if not final_title:
        final_title = _fallback_conversation_title(messages)
    return final_title or _DEFAULT_CONVERSATION_TITLE


def _log_background_task_error(task: asyncio.Task[None]) -> None:
    try:
        task.result()
    except Exception:
        logger.exception("Background chat finalization failed")


@router.get("/conversations", response_model=list[ChatConversationSummaryRead])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.user_id == current_user.id)
        .order_by(
            ChatConversation.last_message_at.desc(),
            ChatConversation.updated_at.desc(),
            ChatConversation.id.desc(),
        )
        .limit(_LIST_LIMIT)
    )
    return result.scalars().all()


@router.get("/conversations/{conversation_id}", response_model=ChatConversationRead)
async def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_conversation_or_404(
        db=db,
        user_id=current_user.id,
        conversation_id=conversation_id,
        with_messages=True,
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conversation = await _get_conversation_or_404(
        db=db,
        user_id=current_user.id,
        conversation_id=conversation_id,
    )
    await db.delete(conversation)
    await db.commit()


@router.delete("/conversations/{conversation_id}/messages/{message_index}", status_code=204)
async def delete_conversation_message(
    conversation_id: int,
    message_index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if message_index < 0:
        raise HTTPException(status_code=400, detail="Message index must be non-negative")

    conversation = await _get_conversation_or_404(
        db=db,
        user_id=current_user.id,
        conversation_id=conversation_id,
    )
    messages = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )
    ).scalars().all()
    if message_index >= len(messages):
        raise HTTPException(status_code=404, detail="Chat message not found")

    await db.delete(messages[message_index])
    await db.flush()

    remaining_messages = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )
    ).scalars().all()
    if not remaining_messages:
        await db.delete(conversation)
        await db.commit()
        return

    conversation.updated_at = datetime.now(timezone.utc)
    conversation.last_message_at = remaining_messages[-1].created_at
    conversation.title = await _resolve_conversation_title(
        [
            {"role": message.role, "content": message.content}
            for message in remaining_messages
        ]
    )
    await db.commit()


@router.post("")
async def general_chat(
    body: GeneralChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    message_content = body.message.strip()
    if not message_content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    now = datetime.now(timezone.utc)
    if body.conversation_id is None:
        conversation = ChatConversation(
            user_id=current_user.id,
            title=_DEFAULT_CONVERSATION_TITLE,
            created_at=now,
            updated_at=now,
            last_message_at=now,
        )
        db.add(conversation)
        await db.flush()
    else:
        conversation = await _get_conversation_or_404(
            db=db,
            user_id=current_user.id,
            conversation_id=body.conversation_id,
        )
        conversation.updated_at = now
        conversation.last_message_at = now

    db.add(
        ChatMessage(
            conversation_id=conversation.id,
            role="user",
            content=message_content,
            created_at=now,
        )
    )
    await db.commit()

    messages = await _load_message_history(db, conversation.id)

    async def _stream_and_persist():
        assistant_parts: list[str] = []
        try:
            async for chunk in stream_general_chat(
                messages=messages,
                user_role=(
                    current_user.role.value
                    if hasattr(current_user.role, "value")
                    else str(current_user.role)
                ),
                user_email=current_user.email,
                db=db,
            ):
                assistant_text = _extract_text_from_sse_chunk(chunk)
                if assistant_text:
                    assistant_parts.append(assistant_text)
                yield chunk
        finally:
            assistant_content = "".join(assistant_parts).strip()
            if not assistant_content:
                return
            try:
                title_messages = None
                if body.conversation_id is None:
                    title_messages = [
                        *messages,
                        {"role": "assistant", "content": assistant_content},
                    ]
                finalize_task = asyncio.create_task(
                    _finalize_conversation_response(
                        conversation.id,
                        assistant_content=assistant_content,
                        existing_title=conversation.title,
                        title_messages=title_messages,
                    )
                )
                finalize_task.add_done_callback(_log_background_task_error)
                await asyncio.shield(finalize_task)
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception(
                    "Failed to persist assistant chat message for conversation %s",
                    conversation.id,
                )

    return StreamingResponse(
        _stream_and_persist(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Conversation-Id": str(conversation.id),
        },
    )
