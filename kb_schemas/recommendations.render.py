def render(rule: dict, kind: str, index: int) -> tuple[str, str]:
    left = rule.get("left_sku", "unknown")
    right = rule.get("right_sku", "unknown")
    locator = f"[recs:{kind}:{left}#{index}]"
    co_invoices = rule.get("co_invoices")
    confidence = rule.get("confidence")
    lift = rule.get("lift")
    body = (
        f"{kind.replace('_', ' ').title()} rule: customers who buy {left} also buy {right}. "
        f"co_invoices={co_invoices}, confidence={confidence}, lift={lift}."
    )
    return locator, body
