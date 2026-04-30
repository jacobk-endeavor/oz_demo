from __future__ import annotations

import re

from app.models.enums import LeadCompanyType, LeadIndustry

LEAD_INDUSTRY_VALUES = tuple(item.value for item in LeadIndustry)
LEAD_COMPANY_TYPE_VALUES = tuple(item.value for item in LeadCompanyType)
_BUYING_GROUP_SPLIT_RE = re.compile(r"[,\n;]+")


def _normalize_label(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()


def normalize_buying_groups(*values: str | list[str] | tuple[str, ...] | None) -> list[str] | None:
    groups: list[str] = []
    seen: set[str] = set()

    def add_group(raw: str) -> None:
        cleaned = raw.strip()
        if not cleaned or cleaned in {"-", "N/A", "n/a"}:
            return
        key = cleaned.casefold()
        if key in seen:
            return
        seen.add(key)
        groups.append(cleaned)

    for value in values:
        if value is None:
            continue
        if isinstance(value, (list, tuple)):
            for item in value:
                if item is not None:
                    add_group(str(item))
            continue
        for part in _BUYING_GROUP_SPLIT_RE.split(value):
            add_group(part)

    return groups or ([] if values else None)


def normalize_hq_phone(value: str | None) -> str | None:
    if not value:
        return None

    cleaned = value.strip()
    if not cleaned or cleaned in {"-", "N/A", "n/a"}:
        return None

    digits = "".join(ch for ch in cleaned if ch.isdigit())
    if cleaned.startswith("+") and digits:
        return f"+{digits}"
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return cleaned


_INDUSTRY_ALIASES = {
    "electrical": LeadIndustry.ELECTRICAL,
    "electrical distribution": LeadIndustry.ELECTRICAL,
    "electrical distributor": LeadIndustry.ELECTRICAL,
    "electrical supply": LeadIndustry.ELECTRICAL,
    "electrical manufacturing": LeadIndustry.ELECTRICAL,
    "electrical manufacturer": LeadIndustry.ELECTRICAL,
    "wholesale electrical distributor": LeadIndustry.ELECTRICAL,
    "plumbing": LeadIndustry.PLUMBING,
    "plumbing distribution": LeadIndustry.PLUMBING,
    "plumbing distributor": LeadIndustry.PLUMBING,
    "plumbing supply distribution": LeadIndustry.PLUMBING,
    "plumbing wholesalers": LeadIndustry.PLUMBING,
    "plumbing manufacturing": LeadIndustry.PLUMBING,
    "plumbing manufacturer": LeadIndustry.PLUMBING,
    "hvac": LeadIndustry.HVAC,
    "hvac distribution": LeadIndustry.HVAC,
    "hvac distributor": LeadIndustry.HVAC,
    "hvac wholesalers": LeadIndustry.HVAC,
    "hvac wholesale": LeadIndustry.HVAC,
    "hvacr wholesale": LeadIndustry.HVAC,
    "hvac r wholesale distribution": LeadIndustry.HVAC,
    "hvac manufacturing": LeadIndustry.HVAC,
    "hvac manufacturer": LeadIndustry.HVAC,
    "building materials": LeadIndustry.BUILDING_MATERIALS,
    "building materials distribution": LeadIndustry.BUILDING_MATERIALS,
    "building materials distributor": LeadIndustry.BUILDING_MATERIALS,
    "building materials manufacturing": LeadIndustry.BUILDING_MATERIALS,
    "building materials manufacturer": LeadIndustry.BUILDING_MATERIALS,
    "construction supply": LeadIndustry.BUILDING_MATERIALS,
    "wholesale building materials": LeadIndustry.BUILDING_MATERIALS,
    "tile": LeadIndustry.BUILDING_MATERIALS,
    "flooring distribution": LeadIndustry.BUILDING_MATERIALS,
    "medical": LeadIndustry.MEDICAL,
    "medical distribution": LeadIndustry.MEDICAL,
    "medical distributor": LeadIndustry.MEDICAL,
    "medical manufacturing": LeadIndustry.MEDICAL,
    "medical manufacturer": LeadIndustry.MEDICAL,
    "medical supply": LeadIndustry.MEDICAL,
    "medical supply and device distribution": LeadIndustry.MEDICAL,
    "wholesale medical supplies": LeadIndustry.MEDICAL,
    "automotive": LeadIndustry.AUTOMOTIVE,
    "automotive distribution": LeadIndustry.AUTOMOTIVE,
    "automotive distributor": LeadIndustry.AUTOMOTIVE,
    "automotive manufacturing": LeadIndustry.AUTOMOTIVE,
    "automotive manufacturer": LeadIndustry.AUTOMOTIVE,
    "lumber": LeadIndustry.LUMBER,
    "lumber distribution": LeadIndustry.LUMBER,
    "lumber distributor": LeadIndustry.LUMBER,
    "lumber manufacturing": LeadIndustry.LUMBER,
    "lumber manufacturer": LeadIndustry.LUMBER,
    "fasteners": LeadIndustry.FASTENERS,
    "fastener distribution": LeadIndustry.FASTENERS,
    "fasteners distribution": LeadIndustry.FASTENERS,
    "fastener distributor": LeadIndustry.FASTENERS,
    "fasteners distributor": LeadIndustry.FASTENERS,
    "fastener manufacturing": LeadIndustry.FASTENERS,
    "fasteners manufacturing": LeadIndustry.FASTENERS,
    "fastener manufacturer": LeadIndustry.FASTENERS,
    "fasteners manufacturer": LeadIndustry.FASTENERS,
    "industrial fastener distribution": LeadIndustry.FASTENERS,
    "safety equipment": LeadIndustry.SAFETY_EQUIPMENT,
    "safety equipment distribution": LeadIndustry.SAFETY_EQUIPMENT,
    "safety equipment distributor": LeadIndustry.SAFETY_EQUIPMENT,
    "safety equipment manufacturing": LeadIndustry.SAFETY_EQUIPMENT,
    "safety equipment manufacturer": LeadIndustry.SAFETY_EQUIPMENT,
    "safety supply": LeadIndustry.SAFETY_EQUIPMENT,
    "safety supplies": LeadIndustry.SAFETY_EQUIPMENT,
    "safety products": LeadIndustry.SAFETY_EQUIPMENT,
    "industrial safety": LeadIndustry.SAFETY_EQUIPMENT,
    "personal protective equipment": LeadIndustry.SAFETY_EQUIPMENT,
    "ppe": LeadIndustry.SAFETY_EQUIPMENT,
    "pvf": LeadIndustry.PVF,
    "pipe valves fittings": LeadIndustry.PVF,
    "pipes valves fittings": LeadIndustry.PVF,
    "pipe valves fittings distribution": LeadIndustry.PVF,
    "pipe valves fittings manufacturer": LeadIndustry.PVF,
    "pipe valves fitting distributor": LeadIndustry.PVF,
    "pipe valves fitting manufacturer": LeadIndustry.PVF,
    "pvf distribution": LeadIndustry.PVF,
    "pvf distributor": LeadIndustry.PVF,
    "pvf manufacturing": LeadIndustry.PVF,
    "pvf manufacturer": LeadIndustry.PVF,
    "fluid power": LeadIndustry.FLUID_POWER,
    "fluid power distribution": LeadIndustry.FLUID_POWER,
    "fluid power distributor": LeadIndustry.FLUID_POWER,
    "fluid power manufacturing": LeadIndustry.FLUID_POWER,
    "fluid power manufacturer": LeadIndustry.FLUID_POWER,
    "services contractors": LeadIndustry.SERVICES_CONTRACTORS,
    "services": LeadIndustry.SERVICES_CONTRACTORS,
    "contractors": LeadIndustry.SERVICES_CONTRACTORS,
    "contractor": LeadIndustry.SERVICES_CONTRACTORS,
    "professional services": LeadIndustry.SERVICES_CONTRACTORS,
    "general services": LeadIndustry.SERVICES_CONTRACTORS,
    "special trade contractors": LeadIndustry.SERVICES_CONTRACTORS,
    "construction and engineering": LeadIndustry.SERVICES_CONTRACTORS,
    "industrial machinery maintenance": LeadIndustry.SERVICES_CONTRACTORS,
    "automotive services": LeadIndustry.SERVICES_CONTRACTORS,
    "communication services": LeadIndustry.SERVICES_CONTRACTORS,
    "transportation services": LeadIndustry.SERVICES_CONTRACTORS,
    "other": LeadIndustry.OTHER_UNKNOWN,
    "unknown": LeadIndustry.OTHER_UNKNOWN,
    "other unknown": LeadIndustry.OTHER_UNKNOWN,
    "industrial distribution": LeadIndustry.OTHER_UNKNOWN,
    "general distribution": LeadIndustry.OTHER_UNKNOWN,
    "general manufacturing": LeadIndustry.OTHER_UNKNOWN,
    "manufacturing": LeadIndustry.OTHER_UNKNOWN,
    "wholesaler": LeadIndustry.OTHER_UNKNOWN,
    "supplier manufacturer": LeadIndustry.OTHER_UNKNOWN,
    "supplier": LeadIndustry.OTHER_UNKNOWN,
    "consumer goods": LeadIndustry.OTHER_UNKNOWN,
    "industrial supplies": LeadIndustry.OTHER_UNKNOWN,
    "industrial supply": LeadIndustry.OTHER_UNKNOWN,
    "nonclassifiable establishments": LeadIndustry.OTHER_UNKNOWN,
}

_COMPANY_TYPE_ALIASES = {
    "distributor": LeadCompanyType.DISTRIBUTOR,
    "distribution": LeadCompanyType.DISTRIBUTOR,
    "distributor wholesaler": LeadCompanyType.DISTRIBUTOR,
    "wholesaler": LeadCompanyType.DISTRIBUTOR,
    "wholesale": LeadCompanyType.DISTRIBUTOR,
    "supplier": LeadCompanyType.DISTRIBUTOR,
    "merchant wholesaler": LeadCompanyType.DISTRIBUTOR,
    "manufacturer": LeadCompanyType.MANUFACTURER,
    "manufacturing": LeadCompanyType.MANUFACTURER,
    "producer": LeadCompanyType.MANUFACTURER,
    "fabricator": LeadCompanyType.MANUFACTURER,
    "other": LeadCompanyType.OTHER,
    "unknown": LeadCompanyType.OTHER,
    "services": LeadCompanyType.OTHER,
    "contractor": LeadCompanyType.OTHER,
    "contractors": LeadCompanyType.OTHER,
    "service provider": LeadCompanyType.OTHER,
}


def normalize_lead_industry(value: LeadIndustry | str | None) -> LeadIndustry | None:
    if value is None or value == "":
        return None
    if isinstance(value, LeadIndustry):
        return value

    normalized = _normalize_label(value)
    if not normalized:
        return None

    for item in LeadIndustry:
        if normalized == _normalize_label(item.value):
            return item
    return _INDUSTRY_ALIASES.get(normalized)


def normalize_lead_company_type(
    value: LeadCompanyType | str | None,
) -> LeadCompanyType | None:
    if value is None or value == "":
        return None
    if isinstance(value, LeadCompanyType):
        return value

    normalized = _normalize_label(value)
    if not normalized:
        return None

    for item in LeadCompanyType:
        if normalized == _normalize_label(item.value):
            return item

    exact = _COMPANY_TYPE_ALIASES.get(normalized)
    if exact is not None:
        return exact

    if any(token in normalized for token in ("manufacturer", "manufacturing", "producer", "fabricator")):
        return LeadCompanyType.MANUFACTURER
    if any(
        token in normalized
        for token in (
            "distributor",
            "distribution",
            "wholesaler",
            "wholesale",
            "supplier",
            "merchant wholesaler",
        )
    ):
        return LeadCompanyType.DISTRIBUTOR
    if any(token in normalized for token in ("service", "contractor", "contractors", "unknown", "other")):
        return LeadCompanyType.OTHER
    return None
