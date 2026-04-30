from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.oz_chat import OzChatRequest
from app.services.oz_chat_runtime import RuntimeContext, run_oz_chat_runtime

router = APIRouter(prefix="/api/oz", tags=["oz-chat"])


def _sse_data(payload: dict | str) -> str:
    if isinstance(payload, str):
        return f"data: {payload}\n\n"
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/chat")
async def stream_oz_chat(
    body: OzChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    async def _stream():
        context = RuntimeContext(
            user_id=current_user.id,
            user_email=current_user.email,
            user_role=(
                current_user.role.value
                if hasattr(current_user.role, "value")
                else str(current_user.role)
            ),
            db=db,
        )
        async for event in run_oz_chat_runtime(request=body, context=context):
            yield _sse_data(event)
        yield _sse_data("[DONE]")

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

