"""North American timezone normalization for lead filtering."""

from __future__ import annotations

_ZONE_MEMBERS: dict[str, list[str]] = {
    "Eastern": [
        # US
        "America/New_York",
        "America/Detroit",
        "America/Indiana/Indianapolis",
        "America/Indiana/Vincennes",
        "America/Indiana/Winamac",
        "America/Indiana/Marengo",
        "America/Indiana/Petersburg",
        "America/Indiana/Vevay",
        "America/Kentucky/Louisville",
        "America/Kentucky/Monticello",
        "US/Eastern",
        "US/East-Indiana",
        "EST",
        "EST5EDT",
        # Canada
        "America/Toronto",
        "America/Montreal",
        "America/Iqaluit",
        "America/Nipigon",
        "America/Thunder_Bay",
        "America/Pangnirtung",
        "Canada/Eastern",
        # South America (UTC-5)
        "America/Bogota",
        "America/Lima",
        "America/Guayaquil",
        "America/Rio_Branco",
    ],
    "Central": [
        # US
        "America/Chicago",
        "America/Indiana/Knox",
        "America/Indiana/Tell_City",
        "America/Menominee",
        "America/North_Dakota/Beulah",
        "America/North_Dakota/Center",
        "America/North_Dakota/New_Salem",
        "US/Central",
        "CST",
        "CST6CDT",
        # Canada
        "America/Winnipeg",
        "America/Rainy_River",
        "America/Rankin_Inlet",
        "America/Resolute",
        "America/Regina",
        "America/Swift_Current",
        "Canada/Central",
        "Canada/Saskatchewan",
        # Central America / Mexico (UTC-6)
        "America/Mexico_City",
        "America/Costa_Rica",
        "America/El_Salvador",
        "America/Guatemala",
        "America/Managua",
        "America/Tegucigalpa",
        "America/Merida",
        "America/Monterrey",
        "America/Bahia_Banderas",
    ],
    "Mountain": [
        # US
        "America/Denver",
        "America/Boise",
        "America/Phoenix",
        "US/Mountain",
        "US/Arizona",
        "MST",
        "MST7MDT",
        # Canada
        "America/Edmonton",
        "America/Cambridge_Bay",
        "America/Inuvik",
        "America/Yellowknife",
        "America/Dawson_Creek",
        "America/Creston",
        "America/Fort_Nelson",
        "Canada/Mountain",
        # Mexico (UTC-7)
        "America/Chihuahua",
        "America/Mazatlan",
        "America/Hermosillo",
    ],
    "Pacific": [
        # US
        "America/Los_Angeles",
        "US/Pacific",
        "PST",
        "PST8PDT",
        # Canada
        "America/Vancouver",
        "America/Whitehorse",
        "America/Dawson",
        "Canada/Pacific",
        "Canada/Yukon",
        # Mexico (UTC-8)
        "America/Tijuana",
        "Mexico/BajaNorte",
    ],
    "South America": [
        "America/Sao_Paulo",
        "America/Argentina/Buenos_Aires",
        "America/Argentina/Cordoba",
        "America/Argentina/Salta",
        "America/Argentina/Tucuman",
        "America/Argentina/Mendoza",
        "America/Argentina/San_Juan",
        "America/Argentina/San_Luis",
        "America/Argentina/Jujuy",
        "America/Argentina/Catamarca",
        "America/Argentina/La_Rioja",
        "America/Argentina/Rio_Gallegos",
        "America/Argentina/Ushuaia",
        "America/Montevideo",
        "America/Santiago",
        "America/Asuncion",
        "America/Caracas",
        "America/La_Paz",
        "America/Manaus",
        "America/Cuiaba",
        "America/Campo_Grande",
        "America/Fortaleza",
        "America/Recife",
        "America/Belem",
        "America/Bahia",
        "America/Maceio",
        "America/Araguaina",
        "America/Cayenne",
        "America/Paramaribo",
        "America/Guyana",
    ],
    "Alaska": [
        "America/Anchorage",
        "America/Juneau",
        "America/Sitka",
        "America/Yakutat",
        "America/Nome",
        "America/Metlakatla",
        "America/Adak",
        "US/Alaska",
        "US/Aleutian",
    ],
    "Hawaii": [
        "Pacific/Honolulu",
        "US/Hawaii",
        "HST",
    ],
    "Europe": [
        "Europe/London",
        "Europe/Dublin",
        "Europe/Lisbon",
        "Europe/Paris",
        "Europe/Berlin",
        "Europe/Amsterdam",
        "Europe/Brussels",
        "Europe/Zurich",
        "Europe/Vienna",
        "Europe/Rome",
        "Europe/Madrid",
        "Europe/Stockholm",
        "Europe/Oslo",
        "Europe/Copenhagen",
        "Europe/Helsinki",
        "Europe/Warsaw",
        "Europe/Prague",
        "Europe/Budapest",
        "Europe/Bucharest",
        "Europe/Athens",
        "Europe/Sofia",
        "Europe/Istanbul",
        "Europe/Moscow",
        "Europe/Kiev",
        "Europe/Kyiv",
        "Europe/Vilnius",
        "Europe/Riga",
        "Europe/Tallinn",
        "Europe/Minsk",
        "Europe/Luxembourg",
        "Europe/Zagreb",
        "Europe/Belgrade",
        "Europe/Bratislava",
        "Europe/Ljubljana",
        "Europe/Sarajevo",
        "Europe/Skopje",
        "Europe/Tirane",
        "Europe/Chisinau",
        "Europe/Malta",
        "Europe/Monaco",
        "Europe/Andorra",
        "Europe/Gibraltar",
        "Europe/San_Marino",
        "Europe/Vatican",
        "Europe/Vaduz",
        "Europe/Kaliningrad",
        "Europe/Samara",
        "Europe/Volgograd",
        "Europe/Simferopol",
        "Europe/Ulyanovsk",
        "Europe/Astrakhan",
        "Europe/Saratov",
        "Europe/Kirov",
    ],
}

_IANA_TO_LABEL: dict[str, str] = {}
for _label, _members in _ZONE_MEMBERS.items():
    for _iana in _members:
        _IANA_TO_LABEL[_iana] = _label


def normalize_timezone(iana_tz: str) -> str:
    """Map an IANA timezone to a display label.

    US/Canadian zones collapse to 'Eastern', 'Central', etc.
    Alaska, Hawaii, and Europe are their own groups.
    Everything else is returned as-is.
    """
    label = _IANA_TO_LABEL.get(iana_tz)
    if label:
        return label
    if iana_tz.startswith("Europe/"):
        return "Europe"
    return iana_tz


_PREFIX_GROUPS: dict[str, str] = {
    "Europe": "Europe/",
}


_DISPLAY_ORDER = [
    "Eastern",
    "Central",
    "Mountain",
    "Pacific",
    "Alaska",
    "Hawaii",
    "South America",
    "Europe",
]
_ORDER_MAP = {label: i for i, label in enumerate(_DISPLAY_ORDER)}


def sort_timezone_labels(labels: set[str]) -> list[str]:
    """Sort timezone labels: core-4 first, then other named groups, then raw IANA."""
    sentinel = len(_DISPLAY_ORDER)
    return sorted(labels, key=lambda l: (_ORDER_MAP.get(l, sentinel), l))


def expand_timezone_labels(labels: list[str]) -> tuple[list[str], list[str]]:
    """Expand display labels back to IANA timezone strings.

    Returns ``(exact_values, prefix_patterns)``.
    - Named groups (Eastern, Alaska, …) expand to their member IANA values.
    - Prefix groups (Europe) expand to a prefix string for LIKE matching.
    - Raw IANA values pass through as exact matches.
    """
    exact: list[str] = []
    prefixes: list[str] = []
    for label in labels:
        if label in _ZONE_MEMBERS:
            exact.extend(_ZONE_MEMBERS[label])
        elif label in _PREFIX_GROUPS:
            prefixes.append(_PREFIX_GROUPS[label])
        else:
            exact.append(label)
    return exact, prefixes
