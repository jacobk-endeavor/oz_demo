"""Generate vector embeddings via the OpenRouter embeddings API."""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "google/gemini-embedding-001"
EMBEDDING_DIMS = 768
_BASE_URL = "https://openrouter.ai/api/v1"
_MAX_BATCH = 20

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=_BASE_URL,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10),
        )
    return _client


def _truncate_for_log(value: str, max_chars: int = 160) -> str:
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars]}... [truncated {len(value) - max_chars} chars]"


def _preview_texts_for_log(texts: list[str], max_items: int = 3) -> list[str]:
    return [_truncate_for_log((text or "").replace("\n", "\\n")) for text in texts[:max_items]]


async def embed_texts(
    texts: list[str],
    *,
    operation: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> list[list[float]]:
    """Return embeddings for *texts* using Gemini Embedding 001.

    Automatically batches into groups of ``_MAX_BATCH`` when the input list
    is large.  Returns one embedding (``list[float]``) per input text, in
    the same order.
    """
    if not texts:
        return []

    client = _get_client()
    all_embeddings: list[list[float]] = []

    for start in range(0, len(texts), _MAX_BATCH):
        batch = texts[start : start + _MAX_BATCH]
        batch_number = (start // _MAX_BATCH) + 1
        total_batches = (len(texts) + _MAX_BATCH - 1) // _MAX_BATCH
        payload = {
            "model": EMBEDDING_MODEL,
            "input": batch,
            "dimensions": EMBEDDING_DIMS,
        }
        try:
            resp = await client.post("/embeddings", json=payload)
            resp.raise_for_status()
        except Exception:
            logger.exception(
                "Embedding request failed | operation=%s batch=%d/%d model=%s dims=%d total_texts=%d batch_size=%d previews=%s metadata=%s",
                operation or "unspecified",
                batch_number,
                total_batches,
                EMBEDDING_MODEL,
                EMBEDDING_DIMS,
                len(texts),
                len(batch),
                json.dumps(_preview_texts_for_log(batch), ensure_ascii=True),
                json.dumps(metadata or {}, ensure_ascii=True, default=str),
            )
            raise
        data = resp.json()
        sorted_items = sorted(data["data"], key=lambda d: d["index"])
        all_embeddings.extend(item["embedding"] for item in sorted_items)

    return all_embeddings
