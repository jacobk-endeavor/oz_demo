from datetime import datetime, timezone

from sqlalchemy import delete, select

from app.models.ask_elephant_sync import AskElephantSyncFailure, AskElephantSyncState
from app.repositories._base_repo import BaseRepo


class AskElephantSyncRepo(BaseRepo[AskElephantSyncState]):
    _model = AskElephantSyncState

    async def get_or_create_state(self, source: str) -> AskElephantSyncState:
        result = await self._db.execute(
            select(AskElephantSyncState).where(
                AskElephantSyncState.source == source
            )
        )
        state = result.scalar_one_or_none()
        if state:
            return state

        state = AskElephantSyncState(source=source)
        self._db.add(state)
        await self._db.flush()
        return state

    async def list_failure_ids(self, limit: int) -> list[str]:
        result = await self._db.execute(
            select(AskElephantSyncFailure.engagement_id)
            .order_by(AskElephantSyncFailure.last_seen_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def record_failure(self, engagement_id: str, error: str) -> None:
        now = datetime.now(timezone.utc)
        result = await self._db.execute(
            select(AskElephantSyncFailure).where(
                AskElephantSyncFailure.engagement_id == engagement_id
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.error = error
            existing.attempts += 1
            existing.last_seen_at = now
            return

        self._db.add(
            AskElephantSyncFailure(
                engagement_id=engagement_id,
                error=error,
                attempts=1,
                first_seen_at=now,
                last_seen_at=now,
            )
        )

    async def clear_failure(self, engagement_id: str) -> None:
        await self._db.execute(
            delete(AskElephantSyncFailure).where(
                AskElephantSyncFailure.engagement_id == engagement_id
            )
        )
