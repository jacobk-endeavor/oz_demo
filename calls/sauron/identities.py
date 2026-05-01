"""Shared identity and terms helpers for Russin call generation."""

from __future__ import annotations

RUSSIN_REP_FIRST_NAMES = ("Jacob", "Sami", "Ryan", "Joanna")

GIVEN = [
    "Jordan", "Rita", "Derek", "Amanda", "Marcus", "Sofia", "Devon", "Claire", "Hassan", "Renee",
    "Owen", "Priya", "Tyler", "Elena", "Javier", "Naomi", "Kyle", "Anika", "Rob", "Melissa",
    "Vincent", "Tara", "Neil", "Yuki", "Calvin", "Gabriela", "Steve", "Monica", "Brett", "Layla",
    "Will", "Kim", "Nick", "Louisa", "Frank", "Dina", "Ed", "Helena", "Pat", "Angela",
    "Chris", "Maria", "Dan", "Gina", "Alex", "Luisa", "Tom", "Sarah",
]

FAMILY = [
    "Meyers", "Sokolov", "Nguyen", "Patel", "Kowalski", "Hernandez", "Washington", "Obeng",
    "Yamamoto", "Briggs", "Okafor", "Lund", "Reyes", "Diallo", "Frost", "Kim", "Morales",
    "Chen", "Bauer", "Kravitz", "Esposito", "Olsen", "Hayes", "Ibrahim", "Park", "Nowak",
    "Vasquez", "Walsh", "Singh", "Costa", "Hughes", "Abbott", "Romano", "Dubois", "Keller",
    "Fernandez", "Novak", "Santos", "Adebayo", "Doyle", "Curtis", "Bennett", "Perez", "Li",
    "Martinez", "O'Brien", "Schmidt", "Khan",
]


def russin_rep_for_call_index(index: int) -> str:
    """0-based call index in batch → rotating rep first name."""
    return RUSSIN_REP_FIRST_NAMES[index % len(RUSSIN_REP_FIRST_NAMES)]


def buyer_contact_at_index(index: int) -> tuple[str, str, str]:
    """Return (given, family, full) for buyer row *index*."""
    g = GIVEN[index % len(GIVEN)]
    f = FAMILY[(index * 11) % len(FAMILY)]
    return g, f, f"{g} {f}"


def terms_tone_for_buyer(tier: str, index: int) -> str:
    if tier in ("XS", "S") and index % 3 == 0:
        return "needs_written_confirmation"
    if tier == "XS":
        return "needs_written_confirmation"
    return "established_open_account"


def terms_voice_for_tone(tone: str) -> str:
    if tone == "needs_written_confirmation":
        return (
            "Payment and terms are whatever is on the formal quote and your approved account file—"
            "do not promise NET 30 or open terms on this call. Say credit may need to confirm anything "
            "new, and the written quote governs."
        )
    return (
        "Established account: you may briefly reference usual terms if it fits, but still say the "
        "written quote confirms numbers and terms—no open-ended verbal guarantees."
    )


__all__ = [
    "RUSSIN_REP_FIRST_NAMES",
    "GIVEN",
    "FAMILY",
    "russin_rep_for_call_index",
    "buyer_contact_at_index",
    "terms_tone_for_buyer",
    "terms_voice_for_tone",
]
