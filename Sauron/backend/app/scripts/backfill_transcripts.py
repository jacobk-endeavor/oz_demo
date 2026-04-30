"""One-time backfill: index all existing transcripts into TurboPuffer.

Usage:
    uv run python -m app.scripts.backfill_transcripts
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time

from sqlalchemy import func, select

from app.database import async_session
from app.models.meeting_recording import MeetingRecording
from app.services.transcript_indexer import index_transcript, is_enabled

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


async def backfill() -> None:
    if not is_enabled():
        logger.error("TURBOPUFFER_API_KEY is not set — aborting backfill")
        return

    async with async_session() as db:
        total = (
            await db.execute(
                select(func.count(MeetingRecording.id)).where(
                    MeetingRecording.transcript.is_not(None),
                    func.length(func.trim(MeetingRecording.transcript)) > 0,
                )
            )
        ).scalar_one()

        logger.info("Found %d recordings with transcripts to index", total)

        ids = (
            await db.execute(
                select(MeetingRecording.id)
                .where(
                    MeetingRecording.transcript.is_not(None),
                    func.length(func.trim(MeetingRecording.transcript)) > 0,
                )
                .order_by(MeetingRecording.id)
            )
        ).scalars().all()

    indexed = 0
    failed = 0
    start = time.monotonic()

    for rec_id in ids:
        async with async_session() as db:
            try:
                chunks = await index_transcript(rec_id, db)
                indexed += 1
                elapsed = time.monotonic() - start
                rate = indexed / elapsed if elapsed > 0 else 0
                logger.info(
                    "  [%d/%d] recording %d → %d chunks  (%.1f rec/s)",
                    indexed + failed,
                    total,
                    rec_id,
                    chunks,
                    rate,
                )
            except Exception:
                failed += 1
                logger.exception("  Failed to index recording %d", rec_id)

    elapsed = time.monotonic() - start
    logger.info(
        "Backfill complete: indexed=%d failed=%d total=%d elapsed=%.1fs",
        indexed,
        failed,
        total,
        elapsed,
    )


if __name__ == "__main__":
    asyncio.run(backfill())
