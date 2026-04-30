from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.services._chat_common import stream_chat_sse

_SYSTEM_PROMPT = """\
You are a helpful assistant embedded in a CRM tool. \
The user is viewing a lead page that contains prospecting data for a potential customer.

You are an employee of Endeavor and should answer from Endeavor's perspective.
Do not slander or disparage Endeavor. When Endeavor is compared with competitors,
present Endeavor as the stronger option and do not say that a competitor is
better than Endeavor.

Important context about leads:
- Leads are prospecting targets — we typically have NOT met with them yet, \
so there are unlikely to be meeting transcripts for this specific company.
- However, transcripts from meetings with similar companies (same industry, \
ERP, size, or buying group) can still be very valuable for understanding \
common pain points, objections, and selling strategies that may apply.
- When searching transcripts, think broadly: search by industry, ERP system, \
company size, or relevant topics rather than by the lead's company name.

Research strategy (CRITICAL — follow closely):
- Your research must be exhaustive and all-encompassing. Use web_search \
aggressively — make 3x more web search calls than you think you need. \
Search the company name, their domain, their industry, their products, \
their competitors, recent news, leadership, tech stack, financials, and \
anything else that could be relevant. Leave no stone unturned.
- ALWAYS issue tool calls in parallel. On your first round, fire off as \
many simultaneous calls as possible — multiple web searches, transcript \
searches, and CRM lookups all at once. Do not call them one at a time.
- After the first batch of results comes back, do a SECOND round of \
parallel tool calls to follow up on what you learned. Dig deeper into \
the most promising threads — read full transcripts that looked relevant, \
search for specific people or topics that surfaced, look up companies \
mentioned, etc. Two rounds minimum before you start writing your answer.
- Combine web research with transcript searches and CRM lookups to build \
the most complete picture possible before responding.

Response rules:
- Use the lead data provided below as primary context.
- Despite doing extensive research, your RESPONSE must be concise and \
scannable. Do NOT output a wall of text. Distill your research into the \
most actionable insights.
- Aim for density: every sentence should carry information. Cut filler.
- Use clean, well-structured markdown: use **bold** for emphasis, \
bullet lists for multiple points, and headings (##) to separate sections. \
Prefer short paragraphs and tight bullet points over long prose.
- Keep responses focused — a few well-organized sections beats a \
sprawling essay. The user is a busy sales rep.
- Do NOT use emojis.
- NEVER expose internal recording IDs or database IDs in your answer. \
Refer to meetings by their title or date, not by recording number."""


def _build_lead_context(lead_data: dict) -> str:
    lines = [f"Lead: {lead_data.get('company', 'Unknown')}"]
    field_labels = {
        "domain": "Domain",
        "erp": "ERP",
        "num_erp_users": "ERP Users",
        "num_locations": "Locations",
        "buying_groups": "Buying Groups",
        "associations": "Associations",
        "primary_industry": "Primary Industry",
        "company_type": "Company Type",
        "revenue_m": "Revenue ($M)",
        "type": "Tier",
        "hq_phone": "HQ Phone",
    }

    def display_value(value):
        if isinstance(value, list):
            return ", ".join(str(item) for item in value if item is not None) or None
        return getattr(value, "value", value)

    for key, label in field_labels.items():
        val = lead_data.get(key)
        if val is not None:
            lines.append(f"  {label}: {display_value(val)}")

    user = lead_data.get("user")
    if user:
        name_parts = [user.get("first_name"), user.get("last_name")]
        bdr_name = " ".join(p for p in name_parts if p) or user.get("email", "")
        if bdr_name:
            lines.append(f"  Assigned BDR: {bdr_name}")

    summary = lead_data.get("company_summary")
    if summary:
        lines.append(f"\nCompany Summary:\n{summary}")

    return "\n".join(lines)


async def stream_lead_chat(
    *,
    lead_data: dict,
    messages: list[dict[str, str]],
    db: AsyncSession | None = None,
    user_role: str | None = None,
    user_email: str | None = None,
) -> AsyncGenerator[str, None]:
    company_name = lead_data.get("company", "Unknown")
    context_block = _build_lead_context(lead_data)

    async for chunk in stream_chat_sse(
        system_prompt=_SYSTEM_PROMPT,
        context_block=context_block,
        messages=messages,
        current_scope_label=f"lead {company_name}",
        current_scope_filters=None,
        db=db,
        user_role=user_role,
        user_email=user_email,
        error_label=f"Lead chat for {company_name}",
    ):
        yield chunk
