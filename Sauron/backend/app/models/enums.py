import enum


class Vertical(str, enum.Enum):
    BEARINGS = "Bearings"
    BUILDING_MATERIALS = "Building materials"
    ELECTRICAL = "Electrical"
    FASTENERS = "Fasteners"
    FIRE_EQUIPMENT = "Fire equipment"
    FLUID_POWER = "Fluid power"
    FRAMING = "Framing"
    GLASS = "Glass"
    GYPSUM = "Gypsum"
    HVAC = "HVAC"
    INDUSTRIAL_SUPPLY = "Industrial supply"
    LUMBER = "Lumber"
    MEDICAL = "Medical"
    MRO = "MRO"
    OUTDOOR_SUPPLY = "Outdoor supply"
    PACKAGING = "Packaging"
    PLUMBING = "Plumbing"
    POWER_TRANSMISSION = "Power transmission"
    PVF = "PVF"
    ROOFING = "Roofing"
    SAFETY_EQUIPMENT = "Safety equipment"
    TILING = "Tiling"
    TOOLS = "Tools"
    WIRE = "Wire"


class ERP(str, enum.Enum):
    EPICOR_PROPHET_21 = "Epicor Prophet 21"
    SAP_S4HANA = "SAP S/4HANA"
    SAP_ECC = "SAP ECC"
    ORACLE_NETSUITE = "Oracle NetSuite"
    MICROSOFT_DYNAMICS_365 = "Microsoft Dynamics 365"
    EPICOR_ECLIPSE = "Epicor Eclipse"
    INFOR_CLOUDSUITE = "Infor CloudSuite"
    INFOR_SXE = "Infor SX.e"
    SALESFORCE = "Salesforce"
    ORACLE_JD_EDWARDS = "Oracle JD Edwards"


class Competitor(str, enum.Enum):
    CANALS = "Canals"
    CONEXIOM = "Conexiom"
    REVALGO = "Revalgo"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    EXEC = "exec"
    BDR = "bdr"
    AE = "ae"
    PICKWORTH = "pickworth"
    BASIC = "basic"


class Role(str, enum.Enum):
    CEO = "CEO"
    CIO = "CIO"
    CCO = "CCO"
    COO = "COO"
    PRESIDENT = "President"
    OTHER_C_SUITE = "Other C-Suite"
    VP_LEVEL = "VP-Level"
    BOARD_MEMBER = "Board Member"
    MANAGING_DIRECTOR = "Managing Director"
    OTHER = "Other"


class DealStatus(str, enum.Enum):
    NEW_LEAD = "New lead"
    OPEN = "Open"
    CLOSED = "Closed"
    DEAD = "Dead"


class Product(str, enum.Enum):
    ORDER_ENTRY = "Order Entry"
    QUOTING = "Quoting"
    PRICE_OPTIMIZATION = "Price Optimization"
    ACCOUNTS_PAYABLE = "Accounts Payable"
    ACCOUNTS_RECEIVABLE = "Accounts Receivable"
    SALES_ANALYTICS = "Sales Analytics"
    OTHER = "Other"


class DealStage(str, enum.Enum):
    DISCOVERY_BOOKED = "Discovery Booked"
    POST_DISCOVERY = "Post Discovery"
    DEMO_BOOKED = "Demo Booked"
    POST_DEMO = "Post Demo"
    ROI_SCHEDULED = "ROI Scheduled"
    FINAL_REVIEW = "Final Review"


class LeadTier(str, enum.Enum):
    TIER_1 = "Tier 1"
    TIER_2 = "Tier 2"
    TIER_3 = "Tier 3"


class LeadIndustry(str, enum.Enum):
    ELECTRICAL = "Electrical"
    PLUMBING = "Plumbing"
    HVAC = "HVAC"
    BUILDING_MATERIALS = "Building Materials"
    MEDICAL = "Medical"
    AUTOMOTIVE = "Automotive"
    SERVICES_CONTRACTORS = "Services / Contractors"
    OTHER_UNKNOWN = "Other / Unknown"
    LUMBER = "Lumber"
    FASTENERS = "Fasteners"
    PVF = "PVF (Pipes, Valves, Fittings)"
    FLUID_POWER = "Fluid Power"
    SAFETY_EQUIPMENT = "Safety Equipment"


class LeadCompanyType(str, enum.Enum):
    DISTRIBUTOR = "Distributor"
    MANUFACTURER = "Manufacturer"
    OTHER = "Other"


class ActionCategory(str, enum.Enum):
    CALL = "call"
    EMAIL = "email"
    MEETING = "meeting"
    NOTE = "note"
    SITE_VISIT = "site_visit"
    OTHER = "other"


class EmailDirection(str, enum.Enum):
    SENT = "sent"
    RECEIVED = "received"
