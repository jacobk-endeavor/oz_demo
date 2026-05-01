def render(record: dict) -> tuple[str, str]:
    sku = record.get("sku", "unknown")
    locator = f"[catalog:sku={sku}]"
    line = record.get("product_line_code") or record.get("product_line") or "unknown"
    sub_category = record.get("sub_category", "unknown")
    description = record.get("description", "Unknown product")
    uom = record.get("uom", "unknown")
    unit_price = record.get("unit_price_median", record.get("unit_price_avg"))
    qty_sold = record.get("total_qty_sold")
    total_sales = record.get("total_sales")
    body = (
        f"{description} - sub-category {sub_category} in product line {line}. "
        f"UoM {uom}. unit_price ~{unit_price}, qty_sold {qty_sold}, total_sales {total_sales}."
    )
    return locator, body
