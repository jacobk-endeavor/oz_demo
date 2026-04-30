import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import async_session
from app.services.company_key_facts import (
    list_company_ids_needing_key_facts,
    refresh_company_key_facts,
)
from scripts._backfill_script import run_backfill_cli


async def _list_ids(include_existing: bool) -> list[int]:
    async with async_session() as db:
        return await list_company_ids_needing_key_facts(
            db, include_existing=include_existing
        )


async def _refresh_one(company_id: int) -> tuple[int, bool, str | None]:
    try:
        async with async_session() as db:
            updated = await refresh_company_key_facts(db, company_id)
            return company_id, updated, None
    except Exception as exc:
        return company_id, False, str(exc)


if __name__ == "__main__":
    run_backfill_cli(
        list_ids=_list_ids,
        refresh_one=_refresh_one,
        label="Company key facts",
        description="Extract structured key facts for companies from transcripts.",
        stats_all_label="with_transcripts",
        stats_missing_label="missing_key_facts",
    )
