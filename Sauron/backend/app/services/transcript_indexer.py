"""Index meeting-recording transcripts into TurboPuffer for hybrid search."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.associations import meeting_company, meeting_person, meeting_sales_rep
from app.models.meeting import Meeting
from app.models.meeting_recording import MeetingRecording
from app.services.embeddings import embed_texts
from app.services.transcript_chunker import chunk_transcript

logger = logging.getLogger(__name__)

NAMESPACE = "sauron-transcripts"

_CONTENT_SCHEMA = {
    "content": {"type": "string", "full_text_search": True, "filterable": False},
}


# ---------------------------------------------------------------------------
# Lazy async TurboPuffer client
# ---------------------------------------------------------------------------

_tpuf_client = None


def _get_tpuf():
    global _tpuf_client
    if _tpuf_client is None:
        import turbopuffer

        _tpuf_client = turbopuffer.AsyncTurbopuffer(
            api_key=settings.turbopuffer_api_key,
            region=settings.turbopuffer_region,
        )
    return _tpuf_client


def _ns():
    return _get_tpuf().namespace(NAMESPACE)


def is_enabled() -> bool:
    return bool(settings.turbopuffer_api_key)


# ---------------------------------------------------------------------------
# Metadata helpers
# ---------------------------------------------------------------------------


async def _load_meeting_metadata(
    db: AsyncSession, meeting_id: int
) -> tuple[list[int], list[int], list[int]]:
    """Return (company_ids, person_ids, sales_rep_ids) linked to *meeting_id*."""
    company_ids: list[int] = []
    person_ids: list[int] = []
    sales_rep_ids: list[int] = []

    rows = await db.execute(
        select(meeting_company.c.company_id).where(
            meeting_company.c.meeting_id == meeting_id
        )
    )
    company_ids = [r[0] for r in rows.all()]

    rows = await db.execute(
        select(meeting_person.c.person_id).where(
            meeting_person.c.meeting_id == meeting_id
        )
    )
    person_ids = [r[0] for r in rows.all()]

    rows = await db.execute(
        select(meeting_sales_rep.c.sales_rep_id).where(
            meeting_sales_rep.c.meeting_id == meeting_id
        )
    )
    sales_rep_ids = [r[0] for r in rows.all()]

    return company_ids, person_ids, sales_rep_ids


# ---------------------------------------------------------------------------
# Index / delete
# ---------------------------------------------------------------------------


async def index_transcript(recording_id: int, db: AsyncSession) -> int:
    """Chunk, embed, and upsert a single recording.  Returns chunk count."""
    if not is_enabled():
        return 0

    rec = (
        await db.execute(
            select(
                MeetingRecording.id,
                MeetingRecording.title,
                MeetingRecording.transcript,
                MeetingRecording.meeting_id,
                MeetingRecording.start_at,
            ).where(MeetingRecording.id == recording_id)
        )
    ).one_or_none()

    if rec is None:
        logger.warning("Recording %s not found for indexing", recording_id)
        return 0

    transcript = (rec.transcript or "").strip()
    if not transcript:
        return 0

    chunks = chunk_transcript(transcript)
    if not chunks:
        return 0

    company_ids: list[int] = []
    person_ids: list[int] = []
    sales_rep_ids: list[int] = []
    meeting_title = rec.title or ""

    if rec.meeting_id is not None:
        company_ids, person_ids, sales_rep_ids = await _load_meeting_metadata(
            db, rec.meeting_id
        )
        meeting_row = (
            await db.execute(
                select(Meeting.title).where(Meeting.id == rec.meeting_id)
            )
        ).scalar_one_or_none()
        if meeting_row:
            meeting_title = meeting_row

    texts = [c.text for c in chunks]
    embeddings = await embed_texts(
        texts,
        operation="transcript_indexing",
        metadata={
            "recording_id": recording_id,
            "meeting_id": rec.meeting_id,
            "chunk_count": len(texts),
            "meeting_title": meeting_title,
        },
    )

    ns = _ns()

    await ns.write(
        delete_by_filter=["recording_id", "Eq", recording_id],
    )

    rows = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        rows.append(
            {
                "id": f"{recording_id}-{i}",
                "vector": embedding,
                "content": chunk.text,
                "recording_id": recording_id,
                "meeting_id": rec.meeting_id,
                "title": meeting_title,
                "start_ts": chunk.start_ts,
                "end_ts": chunk.end_ts,
                "speakers": chunk.speakers,
                "company_ids": company_ids or None,
                "person_ids": person_ids or None,
                "sales_rep_ids": sales_rep_ids or None,
                "chunk_index": i,
            }
        )

    await ns.write(
        upsert_rows=rows,
        distance_metric="cosine_distance",
        schema=_CONTENT_SCHEMA,
    )

    logger.info(
        "Indexed recording %s (%d chunks) into TurboPuffer",
        recording_id,
        len(rows),
    )
    return len(rows)


async def delete_transcript(recording_id: int) -> None:
    """Remove all chunks for *recording_id* from TurboPuffer."""
    if not is_enabled():
        return
    await _ns().write(
        delete_by_filter=["recording_id", "Eq", recording_id],
    )


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


@dataclass
class SearchResult:
    text: str
    recording_id: int
    meeting_id: int | None
    title: str
    start_ts: str
    end_ts: str
    speakers: list[str]
    score: float


async def search_transcripts(
    query: str,
    *,
    top_k: int = 15,
    recording_id: int | None = None,
    meeting_id: int | None = None,
    company_ids: list[int] | None = None,
    person_ids: list[int] | None = None,
) -> list[SearchResult]:
    """Hybrid search (vector + BM25) over indexed transcripts.

    Returns the best-ranked chunks, optionally filtered by entity IDs.
    """
    if not is_enabled():
        return []

    try:
        query_embedding = (
            await embed_texts(
                [query],
                operation="search_transcripts_query",
                metadata={
                    "query": query,
                    "top_k": top_k,
                    "recording_id": recording_id,
                    "meeting_id": meeting_id,
                    "company_ids": company_ids,
                    "person_ids": person_ids,
                },
            )
        )[0]
    except Exception:
        logger.exception(
            "Transcript search embedding failed | query=%r top_k=%d recording_id=%s meeting_id=%s company_ids=%s person_ids=%s",
            query,
            top_k,
            recording_id,
            meeting_id,
            company_ids,
            person_ids,
        )
        raise

    filters: list | None = None
    conditions: list = []

    if recording_id is not None:
        conditions.append(["recording_id", "Eq", recording_id])
    if meeting_id is not None:
        conditions.append(["meeting_id", "Eq", meeting_id])
    if company_ids:
        conditions.append(["company_ids", "ContainsAny", company_ids])
    if person_ids:
        conditions.append(["person_ids", "ContainsAny", person_ids])

    if len(conditions) == 1:
        filters = conditions[0]
    elif len(conditions) > 1:
        filters = ["And", conditions]

    ns = _ns()

    query_kwargs: dict = {
        "top_k": top_k,
        "exclude_attributes": ["vector"],
    }
    if filters:
        query_kwargs["filters"] = filters

    multi_resp = await ns.multi_query(
        queries=[
            {"rank_by": ["vector", "ANN", query_embedding], **query_kwargs},
            {"rank_by": ["content", "BM25", query], **query_kwargs},
        ],
    )

    vector_rows = multi_resp.results[0].rows or []
    bm25_rows = multi_resp.results[1].rows or []

    fused = _reciprocal_rank_fusion(vector_rows, bm25_rows, k=60)

    results: list[SearchResult] = []
    for doc_id, score in fused[:top_k]:
        row = _find_row(doc_id, vector_rows, bm25_rows)
        if row is None:
            continue
        attrs = row.model_dump()
        results.append(
            SearchResult(
                text=attrs.get("content", ""),
                recording_id=attrs.get("recording_id", 0),
                meeting_id=attrs.get("meeting_id"),
                title=attrs.get("title", ""),
                start_ts=attrs.get("start_ts", ""),
                end_ts=attrs.get("end_ts", ""),
                speakers=attrs.get("speakers", []),
                score=score,
            )
        )
    return results


# ---------------------------------------------------------------------------
# RRF helpers
# ---------------------------------------------------------------------------


def _reciprocal_rank_fusion(
    *result_lists,
    k: int = 60,
) -> list[tuple[str, float]]:
    """Combine multiple ranked lists via Reciprocal Rank Fusion."""
    scores: dict[str, float] = {}
    for result_list in result_lists:
        for rank, row in enumerate(result_list):
            doc_id = str(row.id)
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


def _find_row(doc_id: str, *result_lists):
    for result_list in result_lists:
        for row in result_list:
            if str(row.id) == doc_id:
                return row
    return None


# ---------------------------------------------------------------------------
# Context formatting
# ---------------------------------------------------------------------------


def format_search_results_as_context(results: list[SearchResult]) -> str:
    """Build a transcript context block from search results for LLM consumption."""
    if not results:
        return ""

    seen: dict[int, list[SearchResult]] = {}
    for r in results:
        seen.setdefault(r.recording_id, []).append(r)

    parts: list[str] = []
    for rec_id, chunks in seen.items():
        chunks.sort(key=lambda c: c.start_ts)
        title = chunks[0].title
        header = f"--- MEETING: {title} (recording_id: {rec_id}) ---"
        body = "\n\n".join(c.text for c in chunks)
        parts.append(f"{header}\n{body}")

    return "\n\n".join(parts)
