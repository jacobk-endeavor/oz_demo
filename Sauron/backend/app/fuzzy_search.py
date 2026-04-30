from sqlalchemy import Text, and_, case, cast, func, or_

FUZZY_MATCH_THRESHOLD = 0.2


def normalize_search_term(search: str | None) -> str | None:
    if search is None:
        return None
    normalized = search.strip().lower()
    return normalized or None


def _lowered(expr):
    return func.lower(func.coalesce(cast(expr, Text), ""))


def fuzzy_text_match(
    column,
    normalized_search: str,
    *,
    threshold: float = FUZZY_MATCH_THRESHOLD,
):
    lowered_column = _lowered(column)
    search_text = cast(normalized_search, Text)
    return or_(
        lowered_column.like(f"%{normalized_search}%"),
        func.similarity(lowered_column, search_text) >= threshold,
    )


def fuzzy_text_score(column, normalized_search: str):
    lowered_column = _lowered(column)
    return func.similarity(lowered_column, cast(normalized_search, Text))


def relevance_score(column_or_expr, normalized_search: str):
    """Weighted relevance score: exact > prefix > contains > trigram similarity."""
    lowered = _lowered(column_or_expr)
    search_text = cast(normalized_search, Text)
    return (
        case((lowered == normalized_search, 1), else_=0) * 120
        + case((lowered.like(f"{normalized_search}%"), 1), else_=0) * 40
        + case((lowered.like(f"%{normalized_search}%"), 1), else_=0) * 15
        + func.similarity(lowered, search_text) * 4
    )


def strict_multi_word_filter(searchable_exprs: list, normalized_search: str):
    """For multi-word searches, require each token in at least one expression.

    Returns None when the search is a single token (not applicable).
    """
    tokens = [t for t in normalized_search.split() if t]
    if len(tokens) <= 1:
        return None
    lowered_exprs = [_lowered(expr) for expr in searchable_exprs]
    token_filters = []
    for token in tokens:
        pattern = f"%{token}%"
        token_filters.append(or_(*(le.like(pattern) for le in lowered_exprs)))
    return and_(*token_filters)
