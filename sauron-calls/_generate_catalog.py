#!/usr/bin/env python3
"""One-off generator for products.json, buyers.json, calls.json — run from repo root if needed."""
import json
import hashlib
from datetime import datetime, timezone

from identities import buyer_contact_at_index, terms_tone_for_buyer, terms_voice_for_tone

PRODUCT_DEFS = [
    ("abx_capboard", "ABX CAPBOARD", "trim_exterior", "piece", "Aluminum/composite cap and fascia boards; exterior trim accessory.", 5, 10),
    ("cedar_bevel", "CEDAR BEVEL", "siding", "sq_ft", "Bevel cedar siding; exterior spec and appearance grades.", 7, 14),
    ("cedar_siding", "CEDAR SIDING", "siding", "sq_ft", "Cedar siding assortment; job-lot and stocking SKUs.", 7, 14),
    ("cedar_lmd", "CEDAR LMD", "lumber_dimension", "board_foot", "Cedar dimensional lumber; various nominal sizes.", 5, 12),
    ("doug_fir", "DOUG FIR", "lumber_dimension", "board_foot", "Douglas fir framing and appearance; studs and boards.", 3, 10),
    ("furu_pres_treated", "FURU PRES TREATED", "treated", "piece", "Preservative-treated furring and utility stock for exterior exposure.", 3, 7),
    ("fur_trim", "FURU-TRIM", "trim_interior", "linear_ft", "Furring/trim strips; interior packs and contractor counts.", 3, 7),
    ("ijoist_ewp_lvl", "I-JOIST/EWP/LVL", "engineered_wood", "piece", "Engineered floor and header members; vendor-specific depths.", 10, 21),
    ("mcl", "MCL", "lumber_general", "board_foot", "Miscellaneous contractor lumber line; mixed softwood stocking.", 3, 10),
    ("perm", "PERM", "trim_moulding", "linear_ft", "Pre-matched primed SPF moulding and jambs.", 5, 12),
    ("ponderosa_pine", "PONDEROSA PINE", "lumber_dimension", "board_foot", "Ponderosa pine boards; craft and utility lines.", 5, 14),
    ("red_red_fir", "RED RED FIR", "lumber_dimension", "board_foot", "Fir appearance grades; decking and fascia applications.", 7, 14),
    ("select_tie_pine", "SELECT TIE PINE", "lumber_dimension", "board_foot", "Select tie/manufactured pine assortments for packaged goods.", 5, 12),
    ("syp_hf_2", "SYP/HF 2", "lumber_dimension", "board_foot", "Southern yellow pine / HF #2 dimensional and boards.", 2, 7),
    ("thermally_mod", "THERMALLY MOD", "specialty_wood", "board_foot", "Thermally modified decking/cladding; extended lead on some widths.", 14, 28),
    ("t_groove", "T-GROOVE", "paneling", "sq_ft", "Tongue-and-groove paneling and porch ceiling stock.", 5, 14),
    ("western_red_cedar", "WESTERN RED CEDAR", "siding_trim", "board_foot", "WRC boards, bevel, and clears; high rotation SKU.", 7, 14),
    ("yellow_pine", "YELLOW PINE", "lumber_dimension", "board_foot", "Yellow pine boards and dimension for industrial and retail.", 3, 10),
    ("eastern_wht_pin_ac", "EASTERN WHT PIN AC", "lumber_dimension", "board_foot", "Eastern white pine; kiln dried appearance grades.", 5, 12),
    ("frp", "FRP", "panel_system", "sheet", "Fiberglass reinforced wall panels; commercial kitchens and restrooms.", 3, 10),
]

NAME_TO_ID = {label: pid for pid, label, *_ in PRODUCT_DEFS}

RAW_BUYERS = [
    ("ac_dutton_co", "A.C. DUTTON CO.", "full_line_lumber_yard", "PA", "Reading", "M", """ABX CAPBOARD, CEDAR BEVEL, CEDAR SIDING, CEDAR LMD, DOUG FIR, FURU PRES TREATED, FURU-TRIM, I-JOIST/EWP/LVL, MCL, PERM, PONDEROSA PINE, RED RED FIR, SELECT TIE PINE, SYP/HF 2, THERMALLY MOD, T-GROOVE, WESTERN RED CEDAR, YELLOW PINE"""),
    ("ad_moyer_road_supply", "A.D.MOYER ROAD SUPPLY", "regional_lumber_yard", "PA", "Pottsville", "S", "CEDAR BEVEL, EASTERN WHT PIN AC, FRP, I-JOIST/EWP/LVL, SYP/HF 2, WESTERN RED CEDAR"),
    ("aj_blosenski_services_inc", "A. J. BLOSENSKI SERVICES INC", "contractor_service", "PA", "West Chester", "XS", "FURU-TRIM"),
    ("abc_supply_profile_a", "ABC SUPPLY", "national_pro_dealer", "NJ", "Trenton", "L", "ABX CAPBOARD, CEDAR SIDING, CEDAR LMD, FURU-TRIM, MCL, PONDEROSA PINE, SYP/HF 2, WESTERN RED CEDAR"),
    ("abc_supply_profile_b", "ABC SUPPLY", "national_pro_dealer", "NY", "Rochester", "XL", "ABX CAPBOARD, CEDAR BEVEL, CEDAR SIDING, CEDAR LMD, FURU PRES TREATED, MCL, PERM, PONDEROSA PINE, SYP/HF 2, T-GROOVE, WESTERN RED CEDAR"),
    ("ace_hardware", "ACE HARDWARE", "retail_coop", "OH", "Columbus", "S", "SYP/HF 2"),
    ("ace_hardware_platt", "ACE HARDWARE/PLATT", "retail_coop", "OR", "Portland", "S", "WESTERN RED CEDAR"),
    ("ace_hardware_wharnton", "ACE HARDWARE/WHARTON", "retail_coop", "NJ", "Wharton", "M", "ABX CAPBOARD, CEDAR SIDING, EASTERN WHT PIN AC, I-JOIST/EWP/LVL, MCL, WESTERN RED CEDAR, SYP/HF 2, YELLOW PINE"),
    ("ace_lumber", "ACE LUMBER", "independent_yard", "NY", "Buffalo", "M", "CEDAR LMD, DOUG FIR, EASTERN WHT PIN AC, I-JOIST/EWP/LVL, SYP/HF 2, MCL, PERM, RED RED FIR, WESTERN RED CEDAR, YELLOW PINE"),
    ("aew_building_materials_inc", "A.E.W BUILDING MATERIALS INC", "commercial_subcontractor_supply", "PA", "Philadelphia", "S", "FRP, FURU-TRIM"),
    ("agway_lumber", "AGWAY LUMBER", "ag_coop_style_yard", "NY", "Ithaca", "S", "WESTERN RED CEDAR"),
    ("alcoa_gw_millwork_lumber", "ALCOA/G&W MILLWORK & LUMBER", "millwork_distributor", "TN", "Knoxville", "M", "RED RED FIR, T-GROOVE"),
    ("alderfer_lumber_co_inc", "ALDERFER LUMBER CO INC", "independent_yard", "PA", "Telford", "M", "DOUG FIR, PERM, WESTERN RED CEDAR"),
    ("am_lumber", "AM LUMBER", "cash_carry_yard", "CT", "New Haven", "XS", "SYP/HF 2"),
    ("american_builders_contractor_supply", "AMERICAN BUILDERS & CONTRACTOR SUPPLY", "pro_supply", "NC", "Charlotte", "L", "I-JOIST/EWP/LVL, SELECT TIE PINE, SYP/HF 2, WESTERN RED CEDAR"),
    ("andrews", "ANDREWS", "hardware_lumber_combo", "NY", "Elmira", "S", "MCL, PERM"),
    ("anthony_forest_products_co", "ANTHONY FOREST PRODUCTS CO", "wood_components_mfg", "AR", "El Dorado", "M", "PONDEROSA PINE"),
    ("arizona_lumber_supply", "ARIZONA LUMBER & SUPPLY", "regional_yard", "AZ", "Phoenix", "M", "CEDAR BEVEL, WESTERN RED CEDAR"),
    ("aston_lumber", "ASTON LUMBER", "independent_yard", "PA", "Aston", "M", "CEDAR LMD, T-GROOVE, WESTERN RED CEDAR"),
    ("bh_smith_profile_a", "B.H. SMITH", "legacy_lumber_yard", "NY", "Cooperstown", "XS", "WESTERN RED CEDAR"),
    ("bh_smith_profile_b", "B.H. SMITH", "legacy_lumber_yard", "NY", "Oneonta", "S", "I-JOIST/EWP/LVL, WESTERN RED CEDAR"),
    ("babcock_lumber", "BABCOCK LUMBER", "independent_yard", "PA", "Scranton", "M", "ABX CAPBOARD, MCL"),
    ("bah_lumber_profile_a", "B.A.H. LUMBER", "pro_yard", "VA", "Richmond", "M", "I-JOIST/EWP/LVL, PONDEROSA PINE"),
    ("bah_lumber_profile_b", "B.A.H. LUMBER", "pro_yard", "VA", "Norfolk", "S", "CEDAR BEVEL, WESTERN RED CEDAR"),
    ("baker_lumber", "BAKER LUMBER", "independent_yard", "WV", "Martinsburg", "S", "WESTERN RED CEDAR"),
    ("baker_plumbing_supply", "BAKER PLUMBING SUPPLY", "specialty_dealer", "MD", "Baltimore", "XS", "T-GROOVE"),
    ("barbara_building_products", "BARBARA BUILDING PRODUCTS", "commercial_dealer", "NJ", "Newark", "L", "I-JOIST/EWP/LVL, MCL, T-GROOVE"),
    ("barkley_lumber", "BARKLEY LUMBER", "independent_yard", "KY", "Lexington", "S", "WESTERN RED CEDAR"),
    ("bes_lumber_profile_a", "B.E.S. LUMBER", "pro_yard", "MD", "Salisbury", "M", "CEDAR BEVEL, CEDAR LMD, I-JOIST/EWP/LVL, WESTERN RED CEDAR"),
    ("bes_lumber_profile_b", "B.E.S. LUMBER", "pro_yard", "DE", "Wilmington", "L", "ABX CAPBOARD, CEDAR LMD, I-JOIST/EWP/LVL, MCL, PONDEROSA PINE, SYP/HF 2, YELLOW PINE"),
    ("bellet_lumber", "BELLET LUMBER", "independent_yard", "PA", "Bethlehem", "S", "WESTERN RED CEDAR"),
    ("benchmark_lumber", "BENCHMARK LUMBER", "full_line_yard", "OH", "Cleveland", "L", "I-JOIST/EWP/LVL, FURU-TRIM, RED RED FIR, WESTERN RED CEDAR, YELLOW PINE"),
    ("benchmark_building_supply", "BENCHMARK BUILDING SUPPLY", "pro_dealer", "IN", "Indianapolis", "S", "WESTERN RED CEDAR"),
    ("berry", "BERRY", "multi_branch_yard", "PA", "Lancaster", "M", "CEDAR BEVEL, CEDAR LMD, FURU-TRIM, WESTERN RED CEDAR, YELLOW PINE"),
    ("blackmon_building_supply", "BLACKMON BUILDING SUPPLY", "pro_supply", "SC", "Greenville", "M", "MCL, SYP/HF 2, YELLOW PINE"),
    ("boardman_inc", "BOARDMAN INC", "commercial_gc_supply", "NY", "Syracuse", "L", "I-JOIST/EWP/LVL, FURU PRES TREATED, PERM, T-GROOVE, WESTERN RED CEDAR"),
    ("bohemia_building_materials", "BOHEMIA BUILDING MATERIALS", "long_island_pro", "NY", "Bohemia", "XL", "ABX CAPBOARD, DOUG FIR, FRP, I-JOIST/EWP/LVL, SYP/HF 2"),
    ("borth_lumber_company_inc", "BORTH LUMBER COMPANY INC", "independent_yard", "PA", "Harrisburg", "XL", "ABX CAPBOARD, CEDAR BEVEL, CEDAR LMD, FURU PRES TREATED, MCL, PERM, PONDEROSA PINE, RED RED FIR, SELECT TIE PINE, WESTERN RED CEDAR, YELLOW PINE"),
    ("boss_lumber_co_inc", "BOSS LUMBER CO INC", "pro_yard", "PA", "Altoona", "S", "ABX CAPBOARD, T-GROOVE"),
    ("boston_lumber_co_inc", "BOSTON LUMBER CO INC", "structural_dealer", "MA", "Boston", "M", "I-JOIST/EWP/LVL"),
    ("brandt_lumber_products", "BRANDT LUMBER PRODUCTS", "distributor", "WI", "Madison", "S", "CEDAR BEVEL, WESTERN RED CEDAR"),
    ("bs_lumber_supply", "B.S. LUMBER & SUPPLY", "full_line_yard", "PA", "Erie", "L", "CEDAR BEVEL, CEDAR SIDING, CEDAR LMD, EASTERN WHT PIN AC, I-JOIST/EWP/LVL, MCL, RED RED FIR, SYP/HF 2, WESTERN RED CEDAR, YELLOW PINE"),
    ("boardman_beams", "BOARDMAN BEAMS", "component_fab", "OH", "Youngstown", "S", "WESTERN RED CEDAR"),
    ("bottrell_lumber_co_inc", "BOTTRELL LUMBER CO INC", "pro_yard", "PA", "Pittsburgh", "L", "FRP, I-JOIST/EWP/LVL, FURU PRES TREATED, MCL, PERM"),
    ("brainerd_building_products", "BRAINERD BUILDING PRODUCTS", "dealer", "MN", "Brainerd", "M", "ABX CAPBOARD, WESTERN RED CEDAR, MCL"),
    ("briere_a_j_lumber", "BRIERE-A & J LUMBER", "independent_yard", "NY", "Albany", "L", "ABX CAPBOARD, DOUG FIR, I-JOIST/EWP/LVL, FURU PRES TREATED, WESTERN RED CEDAR"),
    ("brooks_lumber", "BROOKS-LUMBER", "small_yard", "ME", "Portland", "XS", "FURU-TRIM"),
    ("building_supply_center", "BUILDING SUPPLY CENTER", "full_line_flagship", "PA", "Allentown", "XL", "ABX CAPBOARD, CEDAR BEVEL, CEDAR SIDING, CEDAR LMD, DOUG FIR, EASTERN WHT PIN AC, FRP, FURU-TRIM, I-JOIST/EWP/LVL, SELECT TIE PINE, MCL, PONDEROSA PINE, RED RED FIR, SYP/HF 2, T-GROOVE, WESTERN RED CEDAR, YELLOW PINE"),
]

SCENARIOS = [
    "RUSH_JOB", "SPEC_SUBSTITUTION", "FREIGHT_CONSTRAINED", "FIRST_TIME_BUYER",
    "PRICE_PUSHBACK", "STOCK_CHECK", "MULTI_LINE_JOB_QUOTE", "ADD_ON_REORDER",
]
OUTCOMES = [
    "VERBAL_COMMIT", "QUOTE_FOLLOWUP", "CALLBACK_SCHEDULED", "NURTURE_STALL", "NOT_A_FIT",
]


def parse_products(s: str):
    parts = [p.strip() for p in s.split(",")]
    ids = []
    for p in parts:
        if not p:
            continue
        pid = NAME_TO_ID.get(p)
        if pid is None:
            raise ValueError(f"Unknown product label: {p!r}")
        ids.append(pid)
    return ids


def seed_str(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def main():
    base = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    products = []
    for pid, label, cat, unit, desc, lt_min, lt_max in PRODUCT_DEFS:
        products.append({
            "product_id": pid,
            "short_name": label,
            "category": cat,
            "typical_unit": unit,
            "description": desc,
            "lead_time_days": {"typical_min": lt_min, "typical_max": lt_max},
            "certifications_common": [],
            "substitution_notes": None,
        })

    buyers = []
    calls = []
    for i, row in enumerate(RAW_BUYERS):
        bid, name, ctype, st, city, tier, prod_str = row
        city_fixed = city
        pids = parse_products(prod_str)
        g, f, full = buyer_contact_at_index(i)
        tt = terms_tone_for_buyer(tier, i)
        buyers.append({
            "buyer_id": bid,
            "company_name": name,
            "customer_type": ctype,
            "primary_region": "US",
            "ship_to": {"city": city_fixed, "state": st},
            "annual_volume_tier": tier,
            "default_contact": {
                "given_name": g,
                "family_name": f,
                "full_name": full,
                "title": "Purchasing" if tier in ("L", "XL") else "Buyer/Owner",
                "phone_placeholder": f"+1-555-{1000 + (i % 9000):04d}",
            },
            "terms_tone": tt,
            "terms_voice": terms_voice_for_tone(tt),
            "payment_terms_typical": "Per quote and approved account file",
            "notes": f"Synthetic Russin Lumber account profile for transcript generation ({ctype.replace('_', ' ')}).",
            "product_ids": pids,
        })

        scen = SCENARIOS[i % len(SCENARIOS)]
        out = OUTCOMES[i % len(OUTCOMES)]
        call_id = f"call_russin_{i+1:04d}"
        calls.append({
            "call_id": call_id,
            "schema_version": "1.0",
            "created_at": base,
            "updated_at": base,
            "supplier": {
                "name": "Russin Lumber",
                "party_type": "seller",
                "default_rep_role": "inside_sales",
            },
            "buyer_id": bid,
            "customer": {
                "company_name": name,
                "contact_name": buyers[-1]["default_contact"]["full_name"],
            },
            "channel": "phone",
            "language": "en-US",
            "scenario_tag": scen,
            "outcome_target": out,
            "primary_product_ids": pids[: min(8, len(pids))],
            "metadata": {
                "generation_seed": seed_str(call_id, bid, scen, out),
                "priority": "normal" if tier != "XL" else "high",
                "compliance_flags": [],
                "transcript_status": "pending",
                "target_turn_range": [18, 40],
                "account_tier_volume": tier,
                "terms_tone": tt,
            },
            "transcript": None,
        })

    root = __import__("pathlib").Path(__file__).resolve().parent
    (root / "products.json").write_text(json.dumps({"schema_version": "1.0", "products": products}, indent=2) + "\n", encoding="utf-8")
    (root / "buyers.json").write_text(json.dumps({"schema_version": "1.0", "buyers": buyers}, indent=2) + "\n", encoding="utf-8")
    (root / "calls.json").write_text(json.dumps({"schema_version": "1.0", "call_count": len(calls), "calls": calls}, indent=2) + "\n", encoding="utf-8")
    print("Wrote products.json, buyers.json, calls.json")


if __name__ == "__main__":
    main()
