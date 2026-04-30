from __future__ import annotations

import re
from datetime import datetime

from app.models.enums import ERP, Competitor


# ERP fuzzy mapping: common shorthand → canonical enum value
ERP_ALIASES: dict[str, ERP] = {
    "prophet 21": ERP.EPICOR_PROPHET_21,
    "epicor prophet 21": ERP.EPICOR_PROPHET_21,
    "p21": ERP.EPICOR_PROPHET_21,
    "sap s/4hana": ERP.SAP_S4HANA,
    "s/4hana": ERP.SAP_S4HANA,
    "s4hana": ERP.SAP_S4HANA,
    "sap ecc": ERP.SAP_ECC,
    "ecc": ERP.SAP_ECC,
    "oracle netsuite": ERP.ORACLE_NETSUITE,
    "netsuite": ERP.ORACLE_NETSUITE,
    "microsoft dynamics 365": ERP.MICROSOFT_DYNAMICS_365,
    "dynamics 365": ERP.MICROSOFT_DYNAMICS_365,
    "d365": ERP.MICROSOFT_DYNAMICS_365,
    "epicor eclipse": ERP.EPICOR_ECLIPSE,
    "eclipse": ERP.EPICOR_ECLIPSE,
    "infor cloudsuite": ERP.INFOR_CLOUDSUITE,
    "cloudsuite": ERP.INFOR_CLOUDSUITE,
    "infor sx.e": ERP.INFOR_SXE,
    "sx.e": ERP.INFOR_SXE,
    "sxe": ERP.INFOR_SXE,
    "salesforce": ERP.SALESFORCE,
    "oracle jd edwards": ERP.ORACLE_JD_EDWARDS,
    "jd edwards": ERP.ORACLE_JD_EDWARDS,
    "jde": ERP.ORACLE_JD_EDWARDS,
}

COMPETITOR_ALIASES: dict[str, Competitor] = {
    "canals": Competitor.CANALS,
    "conexiom": Competitor.CONEXIOM,
    "revalgo": Competitor.REVALGO,
}


def match_erp(raw: str) -> ERP | None:
    if not raw or not raw.strip():
        return None
    return ERP_ALIASES.get(raw.strip().lower())


def match_competitor(raw: str) -> Competitor | None:
    if not raw or not raw.strip():
        return None
    return COMPETITOR_ALIASES.get(raw.strip().lower())


def parse_contributor_name(raw: str) -> tuple[str, str]:
    """Parse 'LASTNAME, FIRSTNAME' → (first_name, last_name)."""
    raw = raw.strip().strip('"')
    if "," in raw:
        parts = raw.split(",", 1)
        last_name = parts[0].strip().title()
        first_name = parts[1].strip().title()
        # Remove suffixes like MR., MRS., JR., etc.
        first_name = re.sub(
            r"\s+(Mr\.?|Mrs\.?|Ms\.?|Jr\.?|Sr\.?|III|II|IV)$",
            "",
            first_name,
            flags=re.IGNORECASE,
        ).strip()
        return first_name, last_name
    # Fallback: space-separated
    parts = raw.split()
    if len(parts) >= 2:
        return parts[0].title(), " ".join(parts[1:]).title()
    return raw.title(), ""


def split_person_name(raw: str) -> tuple[str, str]:
    """Split 'First Last' into (first_name, last_name)."""
    raw = raw.strip()
    parts = raw.split(None, 1)
    if len(parts) >= 2:
        return parts[0].strip(), parts[1].strip()
    return raw, ""


_NULL_VALUES = {"null", "none", "n/a", "na", "nil", "-", ""}


def _row_dict(header: list[str], row: list[str]) -> dict[str, str]:
    """Zip header and row into a dict, stripping whitespace and treating null variants as empty."""
    return {
        h.strip(): ("" if not v or v.strip().lower() in _NULL_VALUES else v.strip())
        for h, v in zip(header, row)
    }


def _safe_int(val: str) -> int | None:
    if not val:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _safe_float(val: str) -> float | None:
    if not val:
        return None
    try:
        return float(val.replace(",", ""))
    except (ValueError, TypeError):
        return None


def _split_multi(val: str) -> list[str]:
    """Split on semicolons, commas, or pipes and return non-empty values."""
    parts = re.split(r"[;|,]", val)
    return [p.strip() for p in parts if p.strip()]


# ---------------------------------------------------------------------------
# Action-dict helpers
# ---------------------------------------------------------------------------


def _upsert_company(name: str, **extra) -> dict:
    return {"action": "upsert_company", "name": name, **extra}


def _link_industry_groups(company_name: str, groups: list[str]) -> list[dict]:
    """Upsert each industry group and link it to the company."""
    actions: list[dict] = []
    for g in groups:
        actions.append({"action": "upsert_industry_group", "name": g})
        actions.append({
            "action": "link_company_industry_group",
            "company_name": company_name,
            "industry_group_name": g,
        })
    return actions


def _link_pe_group(company_name: str, pe_name: str) -> list[dict]:
    """Upsert a PE group and link it to the company."""
    return [
        {"action": "upsert_pe_group", "name": pe_name},
        {
            "action": "link_company_pe_group",
            "company_name": company_name,
            "pe_group_name": pe_name,
        },
    ]


# ---------------------------------------------------------------------------
# Per-CSV-type parsers. Each returns a list of action dicts for one row.
# ---------------------------------------------------------------------------


def parse_buying_groups(header: list[str], row: list[str]) -> list[dict]:
    d = _row_dict(header, row)
    normalized_keys = {k.lower() for k in d}

    # Detect format: new per-person format vs old multi-value format
    if "position on board" in normalized_keys or "position at company" in normalized_keys:
        return _parse_buying_groups_per_person(d)
    return _parse_buying_groups_multi(d)


def _parse_buying_groups_per_person(d: dict[str, str]) -> list[dict]:
    """New format: Name, Company, Position at Company, Buying Group, Position on Board, Source"""
    company_name = d.get("Company", "").strip()
    person_name = d.get("Name", "").strip()
    if not company_name or not person_name:
        return []

    actions: list[dict] = [_upsert_company(company_name, is_named_account=True)]

    bg = d.get("Buying Group", "").strip()
    if bg:
        actions.extend(_link_industry_groups(company_name, [bg]))

    # Person with position(s) — one for company, one for IG
    first, last = split_person_name(person_name)
    if first:
        company_title = d.get("Position at Company", "").strip()
        board_pos = d.get("Position on Board", "").strip()

        # Position at company
        if company_title:
            actions.append({
                "action": "upsert_person",
                "first_name": first,
                "last_name": last,
                "company_name": company_name,
                "role": _guess_role(company_title),
                "title": company_title,
                "is_named_account": True,
            })

        # Position at industry group (board seat)
        if bg and board_pos:
            actions.append({
                "action": "upsert_person",
                "first_name": first,
                "last_name": last,
                "industry_group_name": bg,
                "role": "Board Member",
                "title": board_pos,
                "is_named_account": True,
                # company_name used only for email enrichment fallback
                "_enrichment_company": company_name,
            })

        # If neither title nor board position, create at least a company position
        if not company_title and not board_pos:
            actions.append({
                "action": "upsert_person",
                "first_name": first,
                "last_name": last,
                "company_name": company_name,
                "role": "Board Member",
                "title": "Board Member",
                "is_named_account": True,
            })

    return actions


def _parse_buying_groups_multi(d: dict[str, str]) -> list[dict]:
    """Old format: Company, Board Member(s), Buying Group(s), Source"""
    company_name = d.get("Company", "").strip()
    if not company_name:
        return []

    actions: list[dict] = [_upsert_company(company_name, is_named_account=True)]

    buying_groups = _split_multi(d.get("Buying Group(s)", ""))
    actions.extend(_link_industry_groups(company_name, buying_groups))

    members = _split_multi(d.get("Board Member(s)", ""))
    for member in members:
        first, last = split_person_name(member)
        if not first:
            continue
        actions.append({
            "action": "upsert_person",
            "first_name": first,
            "last_name": last,
            "company_name": company_name,
            "role": "Board Member",
            "title": "Board Member",
            "is_named_account": True,
        })

    return actions


def parse_donations(header: list[str], row: list[str]) -> list[dict]:
    d = _row_dict(header, row)
    contributor = d.get("contributor_name", "")
    employer = d.get("contributor_employer", "")
    if not contributor or not employer:
        return []

    first, last = parse_contributor_name(contributor)
    occupation = d.get("contributor_occupation", "").strip().title()
    amount = _safe_float(d.get("contribution_receipt_amount", ""))
    committee = d.get("committee_name", "").strip()

    # Parse timestamp: try contribution_receipt_date first, fallback to report_year
    ts_str = d.get("contribution_receipt_date", "").strip()
    timestamp = None
    if ts_str:
        try:
            timestamp = datetime.strptime(ts_str.split(" ")[0], "%Y-%m-%d")
        except ValueError:
            pass
    if not timestamp:
        year_str = d.get("report_year", "").strip()
        if year_str:
            try:
                timestamp = datetime(int(year_str), 1, 1)
            except ValueError:
                pass

    actions: list[dict] = [_upsert_company(employer, is_named_account=False)]

    # Person with donation
    actions.append({
        "action": "upsert_person_with_donation",
        "first_name": first,
        "last_name": last,
        "company_name": employer,
        "title": occupation or "Unknown",
        "role": _guess_role(occupation),
        "donation": {
            "committee": committee,
            "amount": amount or 0.0,
            "timestamp": timestamp,
        },
    })

    return actions


def parse_ad_leads(header: list[str], row: list[str]) -> list[dict]:
    d = _row_dict(header, row)
    company_name = d.get("company", "").strip()
    if not company_name:
        return []
    return [_upsert_company(company_name, is_named_account=False)]


def parse_acquisitions(header: list[str], row: list[str]) -> list[dict]:
    d = _row_dict(header, row)
    acquirer = d.get("Acquirer", "").strip()
    acquiree = d.get("Acquiree", "").strip()
    if not acquirer or not acquiree:
        return []

    return [
        _upsert_company(acquirer, is_named_account=False),
        _upsert_company(acquiree, is_named_account=False),
        {"action": "set_parent_company", "acquirer_name": acquirer, "acquiree_name": acquiree},
    ]


def parse_mdm_list(header: list[str], row: list[str]) -> list[dict]:
    d = _row_dict(header, row)
    name = d.get("Name", "").strip()
    if not name:
        return []
    return [_upsert_company(name, is_named_account=True)]


def parse_conexiom_canals(header: list[str], row: list[str]) -> list[dict]:
    d = _row_dict(header, row)
    name = d.get("Name", "").strip()
    if not name:
        return []

    domain = d.get("Domain", "").strip() or None
    competitor = match_competitor(d.get("Comp", ""))

    return [_upsert_company(name, domain=domain, competitor=competitor, is_named_account=True)]


def parse_bdr_leads(header: list[str], row: list[str]) -> list[dict]:
    d = _row_dict(header, row)
    company_name = d.get("Account Name", "").strip()
    if not company_name:
        return []

    domain = d.get("Domain", "").strip() or None
    erp = match_erp(d.get("ERP", ""))
    employee_count = _safe_int(d.get("Num of Users", ""))
    location_count = _safe_int(d.get("# Locations", ""))
    revenue = d.get("Annual Revenue", "").strip() or None

    actions: list[dict] = [
        _upsert_company(
            company_name,
            domain=domain,
            erp=erp,
            employee_count=employee_count,
            location_count=location_count,
            revenue=revenue,
            is_named_account=True,
        )
    ]

    for field in ("Primary Buying Group", "Other Buying Group", "Associations"):
        actions.extend(_link_industry_groups(company_name, _split_multi(d.get(field, ""))))

    return actions


def parse_pe_ownership(header: list[str], row: list[str]) -> list[dict]:
    d = _row_dict(header, row)
    company_name = d.get("Company Name", "").strip()
    if not company_name:
        return []

    actions: list[dict] = [_upsert_company(company_name, is_named_account=True)]

    ownership = d.get("Ownership Type", "").strip()
    pe_firm = d.get("PE Firm Name", "").strip()
    md_name = d.get("MD Name", "").strip()

    if ownership.lower() == "private equity owned" and pe_firm:
        actions.extend(_link_pe_group(company_name, pe_firm))

        if md_name:
            first, last = split_person_name(md_name)
            if first:
                actions.append({
                    "action": "upsert_person",
                    "first_name": first,
                    "last_name": last,
                    "pe_group_name": pe_firm,
                    "role": "Managing Director",
                    "title": "Managing Director",
                })

    return actions


def _guess_role(occupation: str) -> str:
    """Try to map an occupation string to a role enum value."""
    if not occupation:
        return "Other"
    upper = occupation.upper()
    if "CEO" in upper or "CHIEF EXECUTIVE" in upper:
        return "CEO"
    if "CIO" in upper or "CHIEF INFORMATION" in upper:
        return "CIO"
    if "CCO" in upper or "CHIEF COMMERCIAL" in upper or "CHIEF COMPLIANCE" in upper:
        return "CCO"
    if "COO" in upper or "CHIEF OPERATING" in upper:
        return "COO"
    if "PRESIDENT" in upper:
        return "President"
    if "MANAGING DIRECTOR" in upper:
        return "Managing Director"
    if "BOARD" in upper or "DIRECTOR" in upper:
        return "Board Member"
    if "VP" in upper or "VICE PRESIDENT" in upper:
        return "VP-Level"
    if "CHIEF" in upper or "C-SUITE" in upper:
        return "Other C-Suite"
    return "Other"
