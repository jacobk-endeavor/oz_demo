from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import StreamingResponse

from app.dependencies import get_current_user, require_non_basic
from app.services.ingestion_engine import run_ingestion

router = APIRouter(
    prefix="/api/ingestion",
    tags=["ingestion"],
    dependencies=[Depends(require_non_basic)],
)


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    contents = await file.read()

    async def event_stream():
        async for event in run_ingestion(contents):
            yield event

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
