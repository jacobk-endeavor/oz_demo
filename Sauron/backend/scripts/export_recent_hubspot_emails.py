"""Export recent HubSpot email activity to a JSON file.

Usage:
    uv run python scripts/export_recent_hubspot_emails.py
    uv run python scripts/export_recent_hubspot_emails.py --days 14
    uv run python scripts/export_recent_hubspot_emails.py --output exports/hubspot_recent_emails.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_PATH = BACKEND_ROOT / ".env"
DEFAULT_OUTPUT_PATH = BACKEND_ROOT / "exports" / "hubspot_recent_emails.json"
HUBSPOT_BASE_URL = "https://api.hubapi.com"
MAX_PAGE_SIZE = 200
MAX_ATTEMPTS = 4
TOKEN_ENV_KEYS = (
    "HUBSPOT_API_KEY",
    "HUBSPOT_SECRET",
    "HUBSPOT_ACCESS_TOKEN",
)
EMAIL_PROPERTIES = [
    "hs_createdate",
    "hs_lastmodifieddate",
    "hs_timestamp",
    "hs_email_direction",
    "hs_email_status",
    "hs_email_subject",
    "hs_body_preview",
    "hs_email_from_email",
    "hs_email_to_email",
    "hs_email_cc_email",
    "hs_email_bcc_email",
    "hubspot_owner_id",
]


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]

        values[key] = value

    return values


def _load_hubspot_token(env_path: Path) -> str:
    env_values = _read_env_file(env_path)

    for key in TOKEN_ENV_KEYS:
        value = os.environ.get(key) or env_values.get(key)
        if value:
            return value

    expected_keys = ", ".join(TOKEN_ENV_KEYS)
    raise SystemExit(
        "Missing HubSpot token. Set one of "
        f"{expected_keys} in your shell or in {env_path}."
    )


async def _post_with_retries(
    client: httpx.AsyncClient,
    path: str,
    *,
    token: str,
    json_body: dict,
) -> dict:
    url = f"{HUBSPOT_BASE_URL}{path}"
    delay_seconds = 1.0

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = await client.post(
                url,
                json=json_body,
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError:
            if attempt == MAX_ATTEMPTS:
                raise
            await asyncio.sleep(delay_seconds)
            delay_seconds = min(delay_seconds * 2, 30.0)
            continue

        if response.status_code == 429 or response.status_code >= 500:
            if attempt == MAX_ATTEMPTS:
                response.raise_for_status()
            retry_after = response.headers.get("Retry-After")
            wait_seconds = (
                float(retry_after)
                if retry_after and retry_after.isdigit()
                else delay_seconds
            )
            await asyncio.sleep(wait_seconds)
            delay_seconds = min(delay_seconds * 2, 30.0)
            continue

        response.raise_for_status()
        return response.json()

    return {}


async def _fetch_recent_emails(
    *,
    client: httpx.AsyncClient,
    token: str,
    days: int,
    page_size: int,
) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_ms = str(int(cutoff.timestamp() * 1000))

    results: list[dict] = []
    after: str | None = None

    while True:
        body = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "propertyName": "hs_createdate",
                            "operator": "GTE",
                            "value": cutoff_ms,
                        }
                    ]
                }
            ],
            "sorts": [
                {
                    "propertyName": "hs_createdate",
                    "direction": "DESCENDING",
                }
            ],
            "properties": EMAIL_PROPERTIES,
            "limit": page_size,
        }
        if after is not None:
            body["after"] = after

        data = await _post_with_retries(
            client,
            "/crm/v3/objects/emails/search",
            token=token,
            json_body=body,
        )
        batch = data.get("results", [])
        results.extend(batch)

        next_page = data.get("paging", {}).get("next", {})
        after = next_page.get("after")
        if not after:
            break
        if len(results) >= 10_000:
            raise SystemExit(
                "HubSpot search returned more than 10,000 results. "
                "Use a smaller --days window."
            )

    return results


def _build_output(*, days: int, results: list[dict]) -> dict:
    exported_at = datetime.now(timezone.utc).isoformat()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return {
        "objectType": "emails",
        "exportedAt": exported_at,
        "lookbackDays": days,
        "cutoff": cutoff,
        "total": len(results),
        "properties": EMAIL_PROPERTIES,
        "results": results,
    }


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


async def _main() -> None:
    parser = argparse.ArgumentParser(
        description="Export recent HubSpot email activity to a JSON file."
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Look back this many days for email activity (default: 30).",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=MAX_PAGE_SIZE,
        help="HubSpot search page size, max 200 (default: 200).",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=DEFAULT_ENV_PATH,
        help="Path to the env file containing the HubSpot token.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Path to the output JSON file.",
    )
    args = parser.parse_args()

    if args.days <= 0:
        raise SystemExit("--days must be greater than 0.")
    if args.page_size <= 0 or args.page_size > MAX_PAGE_SIZE:
        raise SystemExit("--page-size must be between 1 and 200.")

    token = _load_hubspot_token(args.env_file.resolve())

    async with httpx.AsyncClient(timeout=30.0) as client:
        results = await _fetch_recent_emails(
            client=client,
            token=token,
            days=args.days,
            page_size=args.page_size,
        )

    payload = _build_output(days=args.days, results=results)
    output_path = args.output.resolve()
    _write_json(output_path, payload)
    print(output_path)


if __name__ == "__main__":
    asyncio.run(_main())
