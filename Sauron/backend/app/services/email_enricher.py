import httpx

from app.config import settings


class EmailEnricher:
    """Enriches person records with email via Apollo API."""

    def __init__(self, client: httpx.AsyncClient):
        self._client = client

    async def enrich(
        self,
        first_name: str,
        last_name: str,
        organization_name: str,
        domain: str | None = None,
    ) -> str | None:
        if not settings.apollo_api_key:
            return None

        body: dict = {
            "first_name": first_name,
            "last_name": last_name,
            "organization_name": organization_name,
        }
        if domain:
            body["domain"] = domain

        try:
            resp = await self._client.post(
                "https://api.apollo.io/api/v1/people/match",
                headers={"x-api-key": settings.apollo_api_key},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("person", {}).get("email")
        except (httpx.HTTPError, KeyError, AttributeError):
            return None
