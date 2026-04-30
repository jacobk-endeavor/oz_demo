from enum import Enum


class CSVType(str, Enum):
    BUYING_GROUPS = "buying_groups"
    DONATIONS = "donations"
    AD_LEADS = "ad_leads"
    ACQUISITIONS = "acquisitions"
    MDM_LIST = "mdm_list"
    CONEXIOM_CANALS = "conexiom_canals"
    BDR_LEADS = "bdr_leads"
    PE_OWNERSHIP = "pe_ownership"


def detect_csv_type(header_row: list[str]) -> CSVType:
    """Determine CSV type from its header columns."""
    normalized = {col.strip().lower() for col in header_row}

    if "board member(s)" in normalized or "buying group(s)" in normalized:
        return CSVType.BUYING_GROUPS
    if "buying group" in normalized and "position on board" in normalized:
        return CSVType.BUYING_GROUPS
    if "ownership type" in normalized and "pe firm name" in normalized:
        return CSVType.PE_OWNERSHIP
    if "committee_name" in normalized and "contributor_name" in normalized:
        return CSVType.DONATIONS
    if "acquirer" in normalized and "acquiree" in normalized:
        return CSVType.ACQUISITIONS
    if "account owner" in normalized and "account name" in normalized:
        return CSVType.BDR_LEADS
    if "comp" in normalized and "name" in normalized:
        return CSVType.CONEXIOM_CANALS
    if normalized == {"company"}:
        return CSVType.AD_LEADS
    if "name" in normalized and len(normalized) == 1:
        return CSVType.MDM_LIST

    raise ValueError(f"Unrecognized CSV format with headers: {header_row}")
