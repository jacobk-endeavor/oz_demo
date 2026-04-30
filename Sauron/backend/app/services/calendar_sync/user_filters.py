EXCLUDED_USER_EMAILS = {
    "epd-staff@endeavorai.com",
    "sales-staff@endeavorai.com",
    "staff@endeavorai.com",
    "growth-staff@endeavorai.com",
}


def is_excluded_user_email(email: str | None) -> bool:
    if not email:
        return False
    return email.lower() in EXCLUDED_USER_EMAILS
