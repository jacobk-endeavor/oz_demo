"""Centralized domain normalization utilities.

Every path that stores or looks up a domain should funnel through
``normalize_domain`` so that subdomains like ``shop.example.com`` and
``blog.example.com`` both resolve to ``example.com``.
"""

from __future__ import annotations

import re

import tldextract

_extractor = tldextract.TLDExtract(cache_dir=None)


def extract_root_domain(domain: str) -> str:
    """Return the registered root domain, stripping any subdomains.

    >>> extract_root_domain("shop.example.com")
    'example.com'
    >>> extract_root_domain("www.example.co.uk")
    'example.co.uk'
    >>> extract_root_domain("example.com")
    'example.com'
    """
    ext = _extractor(domain)
    if ext.domain and ext.suffix:
        return f"{ext.domain}.{ext.suffix}"
    return domain


def normalize_domain(value: str | None) -> str | None:
    """Normalize a raw domain/URL string to a lowercase root domain.

    Strips protocol, path, ``www.`` prefix, and any subdomains so that all
    variants of the same company domain collapse to a single canonical form.
    """
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    normalized = normalized.lower()
    normalized = re.sub(r"^https?://", "", normalized)
    normalized = normalized.split("/", 1)[0]
    return extract_root_domain(normalized) or None
