"""Split a meeting transcript into overlapping chunks for embedding.

Transcripts use the format:
    [H:MM:SS] Speaker Name: spoken text ...
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_TURN_RE = re.compile(
    r"\[(\d+:\d{2}:\d{2})\]\s+([^:]+?):\s*",
)

_CHARS_PER_TOKEN = 4


@dataclass
class Turn:
    timestamp: str
    speaker: str
    text: str

    @property
    def token_estimate(self) -> int:
        header = f"[{self.timestamp}] {self.speaker}: "
        return (len(header) + len(self.text)) // _CHARS_PER_TOKEN


@dataclass
class Chunk:
    text: str
    start_ts: str
    end_ts: str
    speakers: list[str] = field(default_factory=list)


def _parse_turns(transcript: str) -> list[Turn]:
    matches = list(_TURN_RE.finditer(transcript))
    if not matches:
        return [Turn(timestamp="0:00:00", speaker="Unknown", text=transcript.strip())]

    turns: list[Turn] = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(transcript)
        text = transcript[start:end].strip()
        if text:
            turns.append(Turn(timestamp=m.group(1), speaker=m.group(2).strip(), text=text))
    return turns


def _reconstruct_text(turns: list[Turn]) -> str:
    return "\n\n".join(
        f"[{t.timestamp}] {t.speaker}: {t.text}" for t in turns
    )


def chunk_transcript(
    transcript: str,
    *,
    target_tokens: int = 1000,
    overlap_turns: int = 2,
) -> list[Chunk]:
    """Split *transcript* into chunks of roughly *target_tokens* tokens.

    Speaker-turn boundaries are always respected (a turn is never split).
    The last *overlap_turns* turns of each chunk are repeated at the start
    of the next chunk so context is preserved across boundaries.
    """
    if not transcript or not transcript.strip():
        return []

    turns = _parse_turns(transcript)
    if not turns:
        return []

    chunks: list[Chunk] = []
    i = 0

    while i < len(turns):
        group: list[Turn] = []
        tokens = 0

        while i < len(turns):
            t = turns[i]
            est = t.token_estimate
            if group and tokens + est > target_tokens:
                break
            group.append(t)
            tokens += est
            i += 1

        speakers = sorted(set(t.speaker for t in group))
        chunks.append(Chunk(
            text=_reconstruct_text(group),
            start_ts=group[0].timestamp,
            end_ts=group[-1].timestamp,
            speakers=speakers,
        ))

        if i < len(turns):
            i -= min(overlap_turns, len(group) - 1)

    return chunks
