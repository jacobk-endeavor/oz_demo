from __future__ import annotations

import json

import httpx

from app.config import settings
from app.services._openrouter import chat_completion, extract_content


class DomainResolver:
    """Resolves company names to domains.

    Fallback chain:
    1. Clearout autocomplete API (confidence >= 85)
    2. Google search via ScrapingDog -> Gemini 3 Flash via OpenRouter to pick best domain
    """

    def __init__(self, client: httpx.AsyncClient):
        self._client = client
        self._cache: dict[str, str | None] = {}

    async def resolve(self, company_name: str) -> str | None:
        """Resolve a company/org name to a domain."""
        normalized = company_name.strip().lower()
        if normalized in self._cache:
            return self._cache[normalized]

        domain = await self._try_clearout(company_name.strip())
        if domain:
            self._cache[normalized] = domain
            return domain

        if settings.scraping_dog_api_key and settings.openrouter_api_key:
            domain = await self._try_google_llm(company_name.strip())
            if domain:
                self._cache[normalized] = domain
                return domain

        self._cache[normalized] = None
        return None

    async def _try_clearout(self, company_name: str) -> str | None:
        try:
            resp = await self._client.get(
                "https://api.clearout.io/public/companies/autocomplete",
                params={"query": company_name},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "success" and data.get("data"):
                best = data["data"][0]
                if best.get("confidence_score", 0) >= 85:
                    return best["domain"]
        except (httpx.HTTPError, KeyError, IndexError):
            pass
        return None

    _DOMAIN_SCHEMA = {
        "type": "json_schema",
        "json_schema": {
            "name": "domain_result",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": ["string", "null"],
                        "description": "The company's bare website domain (e.g. 'example.com'), or null if no match found.",
                    },
                },
                "required": ["domain"],
                "additionalProperties": False,
            },
        },
    }

    async def _try_google_llm(self, company_name: str) -> str | None:
        search_results = await self._google_search(company_name)
        if not search_results:
            return None

        try:
            response = await chat_completion(
                model="google/gemini-3-flash-preview",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a domain resolver. Given a company name and Google search results, "
                            "identify the company's primary website domain. "
                            "Return the bare domain (e.g. 'example.com') without https:// or paths. "
                            "Ignore social media profiles, directories, and news articles — "
                            "only return the company's own website domain. "
                            "Return null if none of the results match the company."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Company name: {company_name}\n\nSearch results:\n{search_results}",
                    },
                ],
                temperature=0,
                response_format=self._DOMAIN_SCHEMA,
            )
            raw = extract_content(response)
            if raw:
                result = json.loads(raw)
                domain = result.get("domain")
                if domain:
                    return domain.strip().lower()
        except Exception:
            pass
        return None

    async def _google_search(self, company_name: str) -> str | None:
        """Search Google via ScrapingDog and return formatted results."""
        try:
            resp = await self._client.get(
                "https://api.scrapingdog.com/google",
                params={
                    "api_key": settings.scraping_dog_api_key,
                    "query": f"{company_name} official website",
                    "results": 10,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            results = data.get("organic_results", data.get("organic_data", []))
            if not results:
                return None

            lines = []
            for r in results[:10]:
                title = r.get("title", "")
                link = r.get("link", r.get("url", ""))
                snippet = r.get("snippet", r.get("description", ""))
                lines.append(f"- {title}\n  URL: {link}\n  {snippet}")

            return "\n".join(lines)
        except (httpx.HTTPError, json.JSONDecodeError):
            return None
