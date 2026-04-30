"""Query lead revenue from the DB and render a bucketed Plotly chart as HTML.

Usage:
    uv run python scripts/plot_lead_revenue.py
    uv run python scripts/plot_lead_revenue.py --bins 5,10,25,50,100,250,500,1000
    uv run python scripts/plot_lead_revenue.py --assigned-only
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import async_session, engine as db_engine
from app.models.lead import Lead, LeadCompanyProfile

_REVENUE_PATTERN = re.compile(
    r"^(?P<value>\d+(?:\.\d+)?)\s*(?P<suffix>b|bn|billion|m|mm|million)?$",
    re.IGNORECASE,
)


@dataclass(slots=True)
class RevenueBucket:
    label: str
    count: int


DEFAULT_BINS_ARG = "1,2.5,5,7.5,10,15,20,25,35,50,75,100,150,200,250,350,500,750,1000"


def _parse_revenue_m(raw: str | None) -> Decimal | None:
    """Parse revenue strings into millions of USD."""
    if raw is None:
        return None

    cleaned = raw.strip()
    if not cleaned:
        return None

    cleaned = cleaned.replace(",", "")
    cleaned = cleaned.replace("$", "")
    cleaned = re.sub(r"\busd\b", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)

    match = _REVENUE_PATTERN.fullmatch(cleaned)
    if match is None:
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return None

    value = Decimal(match.group("value"))
    suffix = (match.group("suffix") or "").lower()
    if suffix in {"b", "bn", "billion"}:
        return value * Decimal("1000")
    return value


def _format_revenue_m(value_m: Decimal) -> str:
    if value_m >= Decimal("1000"):
        value_b = value_m / Decimal("1000")
        return f"${value_b.quantize(Decimal('0.1')).normalize()}B"
    if value_m == value_m.to_integral():
        return f"${int(value_m)}M"
    return f"${value_m.normalize()}M"


def _parse_bucket_edges(raw: str) -> list[Decimal]:
    edges: list[Decimal] = []
    for part in raw.split(","):
        cleaned = part.strip()
        if not cleaned:
            continue
        try:
            value = Decimal(cleaned)
        except InvalidOperation as exc:
            raise ValueError(f"Invalid bucket edge: {cleaned!r}") from exc
        if value <= 0:
            raise ValueError("Bucket edges must be greater than 0.")
        edges.append(value)

    if not edges:
        raise ValueError("At least one bucket edge is required.")

    for previous, current in zip(edges, edges[1:]):
        if current <= previous:
            raise ValueError("Bucket edges must be strictly increasing.")

    return edges


def _build_buckets(
    revenues_m: list[Decimal], bucket_edges_m: list[Decimal]
) -> list[RevenueBucket]:
    counts = [0] * (len(bucket_edges_m) + 1)

    for revenue_m in revenues_m:
        bucket_index = len(bucket_edges_m)
        for index, upper_bound in enumerate(bucket_edges_m):
            if revenue_m < upper_bound:
                bucket_index = index
                break
        counts[bucket_index] += 1

    buckets: list[RevenueBucket] = []
    lower_bound = Decimal("0")
    for index, count in enumerate(counts):
        if index < len(bucket_edges_m):
            upper_bound = bucket_edges_m[index]
            if index == 0:
                label = f"<{_format_revenue_m(upper_bound)}"
            else:
                label = (
                    f"{_format_revenue_m(lower_bound)}-<{_format_revenue_m(upper_bound)}"
                )
            lower_bound = upper_bound
        else:
            label = f"{_format_revenue_m(lower_bound)}+"
        buckets.append(RevenueBucket(label=label, count=count))
    return buckets


def _render_plotly_html(
    buckets: list[RevenueBucket], title: str, subtitle: str
) -> str:
    labels = [bucket.label for bucket in buckets]
    counts = [bucket.count for bucket in buckets]
    chart_height = max(700, 170 + len(buckets) * 34)

    data = [
        {
            "type": "bar",
            "orientation": "h",
            "x": counts,
            "y": labels,
            "marker": {"color": "#38bdf8"},
            "text": counts,
            "textposition": "outside",
            "cliponaxis": False,
            "hovertemplate": "Revenue range: %{y}<br>Lead count: %{x}<extra></extra>",
        }
    ]
    layout = {
        "title": {
            "text": (
                f"{title}<br>"
                f"<span style='font-size:14px;color:#94a3b8'>{subtitle}</span>"
            ),
            "x": 0.02,
        },
        "height": chart_height,
        "paper_bgcolor": "#0f172a",
        "plot_bgcolor": "#0f172a",
        "font": {"color": "#e2e8f0", "family": "Arial, sans-serif"},
        "margin": {"l": 180, "r": 80, "t": 110, "b": 70},
        "xaxis": {
            "title": "Lead count",
            "gridcolor": "#1e293b",
            "zerolinecolor": "#1e293b",
            "automargin": True,
        },
        "yaxis": {
            "title": "Annual revenue range",
            "automargin": True,
            "autorange": "reversed",
            "categoryorder": "array",
            "categoryarray": labels,
        },
    }
    config = {
        "displayModeBar": True,
        "responsive": True,
    }

    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
    <style>
      body {{
        margin: 0;
        background: #0f172a;
        color: #e2e8f0;
        font-family: Arial, sans-serif;
      }}

      #chart {{
        width: 100vw;
        height: {chart_height}px;
      }}
    </style>
  </head>
  <body>
    <div id="chart"></div>
    <script>
      const data = {json.dumps(data)};
      const layout = {json.dumps(layout)};
      const config = {json.dumps(config)};
      Plotly.newPlot("chart", data, layout, config);
    </script>
  </body>
</html>
"""


async def _fetch_revenue_values(assigned_only: bool) -> tuple[list[Decimal], int, int]:
    stmt = (
        select(LeadCompanyProfile.revenue_m)
        .select_from(LeadCompanyProfile)
        .join(Lead, LeadCompanyProfile.lead_id == Lead.id)
        .where(LeadCompanyProfile.revenue_m.is_not(None))
    )
    if assigned_only:
        stmt = stmt.where(Lead.user_id.is_not(None))

    async with async_session() as db:
        rows = (await db.execute(stmt)).scalars().all()

    values: list[Decimal] = []
    skipped = 0
    for raw_revenue in rows:
        parsed = _parse_revenue_m(raw_revenue)
        if parsed is None:
            skipped += 1
            continue
        values.append(parsed)

    return values, len(rows), skipped


async def _main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Query lead revenue from the database and write a bucketed Plotly chart as HTML."
        )
    )
    parser.add_argument(
        "--bins",
        type=str,
        default=DEFAULT_BINS_ARG,
        help=(
            "Comma-separated revenue bucket edges in USD millions "
            f"(default: {DEFAULT_BINS_ARG})."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("lead_revenue_chart.html"),
        help="Where to write the HTML chart (default: lead_revenue_chart.html).",
    )
    parser.add_argument(
        "--assigned-only",
        action="store_true",
        help="Include only leads assigned to a user.",
    )
    args = parser.parse_args()
    bucket_edges_m = _parse_bucket_edges(args.bins)

    try:
        values, raw_count, skipped = await _fetch_revenue_values(
            assigned_only=args.assigned_only
        )
        if not values:
            raise RuntimeError("No leads with numeric revenue data were found.")

        buckets = _build_buckets(values, bucket_edges_m)
        subtitle = (
            f"All leads grouped by annual revenue range (USD millions). "
            f"Parsed {len(values)} numeric values; skipped {skipped} non-numeric values."
        )
        html = _render_plotly_html(
            buckets, title="Lead Revenue Distribution", subtitle=subtitle
        )

        output_path = args.output.resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(html, encoding="utf-8")

        print(
            f"Fetched {raw_count} leads with non-empty revenue values. "
            f"Parsed {len(values)} numeric values and skipped {skipped} non-numeric values."
        )
        print("Bucket counts:")
        for bucket in buckets:
            print(f"  {bucket.label}: {bucket.count}")
        print(f"Wrote Plotly HTML chart to {output_path}")
    finally:
        await db_engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
