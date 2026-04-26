/**
 * Demo Milwaukee-metro company rows (synthetic / public-profile style).
 * Source: LinkedIn-style company blurbs; lead source is assigned at hydration time.
 */
export type MilwaukeeCompanySeed = {
  name: string
  description: string
  /**
   * Demo-only: skus and lines a Russin / exterior buyer is likely to pull
   * (synthetic, aligned with Thermory + AZEK + Deckorators runs).
   */
  productsRequested?: string
  primaryIndustry: string
  size: string
  type: string
  location: string
  country: string
  linkedInUrl: string
}

export const MILWAUKEE_COMPANY_SEED: MilwaukeeCompanySeed[] = [
  {
    name: 'Hudson Valley Deck & Porch Co.',
    description:
      "Residential exterior contractor: premium decking, siding, porch floors, and railing for waterside and historic homes. They pull Thermory cladding, AZEK and Millboard surfacing, and Deckorators rails through Russin, with factory finishing and custom milling to keep field cuts and reveals tight. Morgan Ellis is the day-to-day PM the Russin team follows on the Hudson Valley portfolio.",
    productsRequested:
      'Thermory Ash 1×6 (cladding) · AZEK Vintage wide board (deck) · Deckorators ALX aluminum rail · AZEK Vintage trim · Simpson DTT2Z ledger · Boral TruExterior 5/4 (trim stock) — Russin WIP + RingCentral job-line',
    primaryIndustry: 'Residential Building Construction',
    size: '11-50 employees',
    type: 'Privately Held',
    location: 'Montgomery, NY',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/hudson-valley-deck-porch',
  },
  {
    name: 'North River Lumber & Building Supply',
    description:
      'Independent lumberyard and pro desk serving trade contractors. They buy engineered wood, cap-stock, and trim through distribution—not a walk-in big-box—and lean on Russin for Thermory, AZEK, and specialty exterior lines, dealer order status, and will-call for multi-line jobs (same **Check Order** workflow homeowners never see on the B2B side).',
    productsRequested:
      'HubSpot-opportunity line from last deck package: Thermory Drift 1×6, AZEK Harvest capped, Fortress/powder post kits, Voyage fascia; Outlook PO thread + Salesforce opp # tied to the Newburgh will-call',
    primaryIndustry: 'Building Materials',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Newburgh, NY',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/north-river-lumber-building-supply',
  },
  {
    name: 'Kenwood Siding & Window Co.',
    description:
      'Multi-trade exteriors shop: siding, soffit, and deck systems for new-build and re-sides. Running Thermory open-joint and AZEK Porch for premium specs; Deckorators rail on most municipal bid work. B2B orders flow through Russin with Apollo touches and a standing RingCentral queue for the PM desk.',
    productsRequested:
      "Apollo sequence “Thermory spec deck”: Drift 1×6, AZEK Porch, ALX top rail, Simpson hangers — ZoomInfo + LinkedIn on the two estimators we loop in.",
    primaryIndustry: 'Building Materials',
    size: '11-50 employees',
    type: 'Privately Held',
    location: 'Waukesha, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/kenwood-siding-window-co',
  },
  {
    name: 'Sensient Technologies Corporation',
    description:
      "We Bring Life to Products. Our name communicates what we do: Enhance SENSory experiences through specialized ingredIENTs, delivered through proprietary TECHNOLOGIES. Sensient Technologies Corporation is a leading global manufacturer and marketer of colors, flavors, essential oils and extracts.",
    primaryIndustry: 'Food and Beverage Manufacturing',
    size: '1,001-5,000 employees',
    type: 'Public Company',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/sensient',
  },
  {
    name: 'A. O. Smith Corporation',
    description:
      'Celebrating its 150th year of business, A. O. Smith is a leading global water technology and manufacturing company that proudly employs more than 12,000 people who together provide water heating and water treatment solutions. The company is headquartered in Milwaukee, Wisconsin.',
    primaryIndustry: 'Manufacturing',
    size: '10,001+ employees',
    type: 'Public Company',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/a-o-smith-corporation',
  },
  {
    name: 'A. O. Smith Corporation (duplicate listing)',
    description:
      'A. O. Smith Corporation is one of the world\'s leading manufacturers of residential and commercial water heaters and boilers, offering a comprehensive product line featuring the best-known brands in North America, China, and India. The company was founded in 1874 in Milwaukee, Wisconsin where today the company is headquartered.',
    primaryIndustry: 'Manufacturing',
    size: '10,001+ employees',
    type: 'Public Company',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/a.-o.-smith-corporation',
  },
  {
    name: 'Wipfli',
    description:
      "Always advancing. Always progressing. From curiosity to clarity to results. That’s Wipfli. We’re Wipfli, a top 25 advisory firm with a strong CPA foundation serving 54,000 clients across today’s most complex industries. For more than 90 years, we have evolved and grown to help our clients take on whatever comes next.",
    primaryIndustry: 'Business Consulting and Services',
    size: '1,001-5,000 employees',
    type: 'Partnership',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/wipfli',
  },
  {
    name: 'Kalypso: A Rockwell Automation Business',
    description:
      "As Rockwell Automation’s digital service arm, we bring digital solutions to product problems. We weave a digital thread throughout your company, so information and data flow freely – from ideation to product development through manufacturing and supply chain.",
    primaryIndustry: 'Business Consulting and Services',
    size: '1,001-5,000 employees',
    type: 'Public Company',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/kalypso',
  },
  {
    name: 'Badger Meter',
    description:
      'With more than a century of water technology innovation, Badger Meter is a global provider of industry-leading smart water solutions encompassing flow measurement, water quality and pressure monitoring. An innovator in flow measurement, water quality and control products, serving water utilities, municipalities and commercial and industrial customers worldwide.',
    primaryIndustry: 'Utilities',
    size: '1,001-5,000 employees',
    type: 'Public Company',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/badger-meter',
  },
  {
    name: 'Rite-Hite',
    description:
      "Rite-Hite, headquartered in Milwaukee, Wisconsin USA is a world-wide leader in the development, manufacture, and sale of loading dock safety systems, industrial door solutions and in-plant products. All of our products are designed for maximum safety, productivity, efficiency and reduced energy costs at your facility.",
    primaryIndustry: 'Machinery Manufacturing',
    size: '1,001-5,000 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/rite-hite',
  },
  {
    name: 'WEC Energy Group',
    description:
      'WEC Energy Group is one of the nation’s largest electric and natural gas delivery companies, with deep operational expertise, scale and financial resources to meet the region’s future energy needs. We focus on reliable service, customer satisfaction and shareholder value.',
    primaryIndustry: 'Utilities',
    size: '5,001-10,000 employees',
    type: 'Public Company',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/wec-energy-group',
  },
  {
    name: 'VAX VacationAccess',
    description:
      'VAX VacationAccess is the premier online resource for travel advisors to research, market and sell the industry’s leading agent-friendly leisure travel suppliers. With over 200,000+ active advisors, VAX is a proud advocate for travel agents and works with suppliers who support the advisor distribution model.',
    primaryIndustry: 'Travel Arrangements',
    size: '1,001-5,000 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/vax-vacationaccess',
  },
  {
    name: 'Alliance Life Sciences',
    description:
      'Alliance Life Sciences is now part of EVERSANA. EVERSANA combines the leading global life science services into an integrated, independent and intelligent commercialization platform.',
    primaryIndustry: 'Pharmaceutical Manufacturing',
    size: '1,001-5,000 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/alliance-life-sciences-consulting-group-inc',
  },
  {
    name: 'HCA Consulting Group',
    description:
      'At HCA Consulting Group, we empower businesses worldwide through seamless offshoring and outsourcing solutions that drive efficiency, unlock growth, and put people first. We help our clients focus on their core strengths—while we handle the rest with integrity, empathy, and excellence.',
    primaryIndustry: 'Outsourcing and Offshoring Consulting',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/hcaconsultinggroup',
  },
  {
    name: 'Hal Leonard',
    description:
      "Founded in 1947, Hal Leonard is the world's largest provider of music publications and music instruction materials. In its catalog of more than one million titles available in print and digitally, Hal Leonard represents many of the world's best-known and most respected publishers, artists, songwriters, and arrangers.",
    primaryIndustry: 'Musicians',
    size: '501-1,000 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/hal-leonard-llc',
  },
  {
    name: 'National Fluid Power Association',
    description:
      'The National Fluid Power Association (NFPA) is a 501(c) (6) trade association serving manufacturers of fluid power (hydraulic and pneumatic) components and systems, their distributors, suppliers and related educators. NFPA is a forum where all fluid power channel partners work together to advance fluid power technology.',
    primaryIndustry: 'Non-profit Organizations',
    size: '11-50 employees',
    type: 'Non Profit',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/national-fluid-power-association',
  },
  {
    name: 'Dohmen Life Science Services',
    description:
      'Dohmen Life Science Services is now EVERSANA. EVERSANATM combines the leading global life science services into an integrated, independent and intelligent commercialization platform.',
    primaryIndustry: 'Pharmaceutical Manufacturing',
    size: '1,001-5,000 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/dohmen-life-science-services',
  },
  {
    name: 'Lesaffre North America',
    description:
      'Since 1853, Lesaffre and Red Star have used their passion and expertise to bring superior yeast & ingredients to the commercial baking industry. We proudly lead the industry with our Saf-Instant, Red Star and Saf-Pro Ingredients brand products that have set the standard of quality and innovation for generations.',
    primaryIndustry: 'Food and Beverage Manufacturing',
    size: '501-1,000 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/lesaffre-na',
  },
  {
    name: 'S3 AeroDefense',
    description:
      'Founded as S3 International in 2005, S3 AeroDefense is your trusted partner for comprehensive aircraft sustainment, offering global military operators a full range of solutions, including spares distribution, repair and overhaul services, and program management.',
    primaryIndustry: 'Aviation & Aerospace',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/s3-aerodefense-llc',
  },
  {
    name: 'Derco',
    description:
      'Derco, a Lockheed Martin company, has been providing full military and commercial logistics support since 1979. The organization was founded on industry-leading customer service, quality OEM products, and innovative services for aircraft operators worldwide.',
    primaryIndustry: 'Aviation & Aerospace',
    size: '201-500 employees',
    type: 'Public Company',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/derco-aerospace',
  },
  {
    name: 'Royal Enfield North America',
    description:
      'Royal Enfield is the oldest, fastest growing and largest middle-weight motorcycle company in the world. Established in 2015 and located in Milwaukee, Wisconsin, Royal Enfield North America (RENA) was established as the first wholly-owned subsidiary company.',
    primaryIndustry: 'Motor Vehicle Manufacturing',
    size: '11-50 employees',
    type: 'Public Company',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/royalenfieldna',
  },
  {
    name: 'PFERD North America',
    description:
      'PFERD is a global manufacturer and distributor of abrasives, brushes and power tools that generate more precise, easier and faster results for those working with metal cutting, grinding, and finishing applications. A U.S. subsidiary of August Rüggeberg GmbH & Co. of Marienheide, Germany, PFERD INC is part of a global network represented in over 30 countries around the world.',
    primaryIndustry: 'Machinery Manufacturing',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/pferd-america',
  },
  {
    name: 'Godfrey & Kahn',
    description:
      'Our firm was founded in 1957 on a simple idea - judge our success by the success of our clients. For over 65 years, we have served clients by first understanding their business and their needs, and then by offering strategic legal advice and smart, practical solutions to real-world problems.',
    primaryIndustry: 'Law Practice',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/godfreykahn',
  },
  {
    name: 'Steele Solutions, Inc',
    description:
      'Steele Solutions, Inc. is a North American leader in the design and manufacturing of complex work platforms, custom chutes, and security lockers. The company partners with industry-leading integrators who lead warehouse automation projects for large e-commerce retailers and parcel providers.',
    primaryIndustry: 'Manufacturing',
    size: '501-1,000 employees',
    type: 'Privately Held',
    location: 'South Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/steele-solutions-inc',
  },
  {
    name: 'Office Furniture Resources',
    description:
      "Office Furniture Resources (OFR), the Midwest’s largest office furniture liquidator, is a full service office furniture dealership providing commercial-grade New, Used and Refurbished furniture to businesses of all sizes. OFR is a certified Woman-Owned Business. Established in 1991, OFR operates throughout the Midwest, with showrooms in Chicago, Milwaukee and Madison.",
    primaryIndustry: 'Furniture and Home Furnishings Manufacturing',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/office-furniture-resources',
  },
  {
    name: 'Marsh Electronics, Inc.',
    description:
      'Marsh Electronics is a trusted stocking distributor of electronic components, offering a comprehensive range of passive, electromechanical, and power semiconductor products from leading manufacturers. Our value-added division, MarVac, enhances efficiency by providing product modifications and assembly services.',
    primaryIndustry: 'Appliances, Electrical, and Electronics Manufacturing',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/marsh-electronics-inc-',
  },
  {
    name: 'Standard Electric Supply Co.',
    description:
      'At Standard Electric Supply Co., our entire business is built around providing superior customer service and support. Our goal as a distributor is not only to deliver quality products on time, but also to help you reduce your overall operating costs and increase productivity. Serving customers since 1919.',
    primaryIndustry: 'Wholesale',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/standardelectricsupply',
  },
  {
    name: 'Lucas Milhaupt',
    description:
      "Lucas Milhaupt is a global leader and one of the most prolific suppliers in the brazing industry. Since 1942, Lucas Milhaupt has leveraged its deep material science proficiency to produce innovative metal joining solutions that enhance process efficiencies, improve quality, and promote safety for all our valued customers.",
    primaryIndustry: 'Fabricated Metal Products',
    size: '501-1,000 employees',
    type: 'Public Company',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/lucas-milhaupt',
  },
  {
    name: 'Health Strategies Group',
    description:
      'Health Strategies Group is now EVERSANA. EVERSANATM combines the leading global life science services into an integrated, independent and intelligent commercialization platform with services rooted in the patient experience.',
    primaryIndustry: 'Pharmaceutical Manufacturing',
    size: '1,001-5,000 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/health-strategies-group',
  },
  {
    name: 'Service Pro by MSI Data',
    description:
      'Service Pro by MSI Data enables field service companies to improve the efficiency and effectiveness of their field workforce. Focused on the enterprise, scheduling and the mobile worker, our core suite of highly configurable applications include Field Service Management Software, Technician Scheduling and Dispatching, GPS Mapping, Asset Management, Mobile Field Service and Mobile Inspection Automation.',
    primaryIndustry: 'Software Development',
    size: '11-50 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/msi-data',
  },
  {
    name: 'MKEStartup.News',
    description:
      'A working group of startup company funders and founders, led by former Milwaukee County Executive and MMAC board member Chris Abele, has launched a $500,000 effort to strengthen startup and entrepreneurship efforts in Milwaukee.',
    primaryIndustry: 'Non-profit Organizations',
    size: '11-50 employees',
    type: 'Non Profit',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/mkestartup-news',
  },
  {
    name: 'Charter Wire',
    description:
      'With two locations and an industry leader in cold rolled and formed steel for over 80 years, we are constantly looking to expand our reach and share our experience. Visit our website to learn more about Charter Wire.',
    primaryIndustry: 'Industrial Machinery Manufacturing',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/charterwire',
  },
  {
    name: 'Associated Bag',
    description:
      'Founded in 1938 and known for its quality packaging, shipping, and workplace products and excellent customer service, Associated Bag features one or two day delivery to most of the United States. Associated Bag is headquartered in Milwaukee, Wisconsin with additional distribution centers in Reno, Nevada; Dallas, Texas; and Harrisburg, Pennsylvania.',
    primaryIndustry: 'Packaging and Containers Manufacturing',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/associated-bag',
  },
  {
    name: 'Marsh Electronics, Inc. (alt listing)',
    description:
      'Marsh Electronics is a broad-line stocking distributor offering electronic components from leading manufacturers of passive, electromechanical, and power semi-conductor products. Our Valued Added division, known as MarVac, can provide product modification and assembly services.',
    primaryIndustry: 'Appliances, Electrical, and Electronics Manufacturing',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/marsh-electronics-inc.',
  },
  {
    name: 'Znode',
    description:
      'Znode (znode.com) is the most flexible, scalable B2B ecommerce platform. Leading manufacturers and distributors choose Znode for its extensible API-first architecture, configurable B2B features, and unlimited scale. Znode is a distributed multi-tenant SaaS product of Amla Commerce, Inc. (amla.io).',
    primaryIndustry: 'Software Development',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/znode-llc',
  },
  {
    name: 'Regal Holdings',
    description:
      'For more than 80 years, Regal Holdings (formerly Regal Ware) has enriched life by bringing families together. A fourth-generation, family-owned company rooted in Wisconsin, Regal Holdings is a multi-business platform that provides strategic leadership, shared expertise, and scalable systems to a growing portfolio of cookware and kitchen essentials brands.',
    primaryIndustry: 'Manufacturing',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/regal-holdings-global',
  },
  {
    name: 'Innovative Medical Devices, Inc.',
    description:
      'Innovative Medical Devices, Inc. is a medical device sales, marketing and distribution company. Since 1982 IMD has helped many growing medical device companies reach market leadership positions. Our seasoned sales team actively represents products to acute care facilities in the states of Wisconsin, Michigan, Illinois, Indiana and Ohio.',
    primaryIndustry: 'Medical Equipment Manufacturing',
    size: '11-50 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/innovative-medical-devices-inc.',
  },
  {
    name: 'Associated Bag (alt listing)',
    description:
      'Founded in 1938 and known for its quality packaging, shipping, and workplace products and excellent customer service, Associated Bag features one or two day delivery to most of the United States. Additional distribution centers in Reno, Dallas, and Harrisburg.',
    primaryIndustry: 'Packaging and Containers Manufacturing',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/associated-bag-company',
  },
  {
    name: 'Olympus Group',
    description:
      'Since 1893, Olympus Group has been a leader in the custom printing and sewing industry, specializing in large format digital and dye-sublimation printing. Our Mascot Division combines our unique in-house printing and sewing capabilities to create some of the world’s most iconic mascot costumes.',
    primaryIndustry: 'Printing Services',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/olympus-group',
  },
  {
    name: 'Part Analytics',
    description:
      'Part Analytics is a Venture-backed startup focused on transforming direct material procurement by digitizing manual processes and harmonizing data from multiple disparate sources. Its AI-powered supply management solution with a modern and intuitive UI enables smarter data-driven decision making.',
    primaryIndustry: 'Software Development',
    size: '11-50 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/part-analytics',
  },
  {
    name: 'PFlow Industries, Inc.',
    description:
      'We do the heavy lifting! As the founder of the vertical reciprocating conveyor (VRC) industry in 1977, PFlow Industries custom engineers and manufactures VRCs for diverse applications including, but not limited to, those in the manufacturing, warehousing, distribution, and retail industries.',
    primaryIndustry: 'Machinery Manufacturing',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/pflow-industries',
  },
  {
    name: 'Brew City Brand/Good Land Supply Co.',
    description:
      'Family owned and founded in Milwaukee in 1986 (a.k.a. ‘Brew City’ and Algonquian for The Good Land), Brew City Brand is an apparel & brand marketing agency with deep roots in consumer marketing. Our five Milwaukee-based retail locations provide the perfect testing ground for our latest concepts.',
    primaryIndustry: 'Retail Apparel and Fashion',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/brewcitybrands',
  },
  {
    name: 'PaveDrain, LLC.',
    description:
      'The goal of PaveDrain, LLC is to be the leader in the marketing and manufacturing of permeable pavement designs that balance the delicate synergy between economics and environmentally friendly products for stormwater management.',
    primaryIndustry: 'Construction',
    size: '2-10 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/pavedrain',
  },
  {
    name: 'Grace Matthews, Inc.',
    description:
      'Grace Matthews is a leading provider of middle-market transaction advisory services for manufacturers, distributors, and service providers across the chemicals, specialty materials, and life sciences markets. Since our founding in 1999, Grace Matthews has successfully completed more than 150 transactions on behalf of private companies, private equity firms, and large multinational corporations.',
    primaryIndustry: 'Investment Banking',
    size: '11-50 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/grace-matthews-inc-',
  },
  {
    name: 'Agricycle Global',
    description:
      'Agricycle is a house of ethical brands using a systems-based zero waste approach to international development. Agricycle transforms food waste and agricultural byproducts across the world into all-natural and organic CPG brands sold in the U.S.',
    primaryIndustry: 'Food and Beverage Manufacturing',
    size: '11-50 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/agricycleglobal',
  },
  {
    name: 'Coakley Brothers & Brothers Interiors (Design, Furniture, Construction, Installation, Moving)',
    description:
      'Coakley Brothers & Brothers Interiors are your single source for transforming a working, living or healing environment—from designing and furnishing your space to installation and the final move. Founded in downtown Milwaukee in 1888, Coakley Brothers has been a premier service company for 135 years.',
    primaryIndustry: 'Architecture and Planning',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/brothers-business-interiors',
  },
  {
    name: 'Tax Airfreight, Inc.',
    description:
      'We are a marketplace leader in providing transportation and logistics service solutions throughout the greater Midwest United States. We employ over 350 staff within 5 operational facilities in the Midwest area (Wisconsin, Illinois, and Minnesota).',
    primaryIndustry: 'Transportation/Trucking/Railroad',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/tax-airfreight-inc.',
  },
  {
    name: 'BDPros',
    description:
      'Business Development Pros (BDPros) is a full-service outsourced business development partner with over 15 years of experience helping B2B companies generate revenue and build predictable pipeline. We combine sales strategy, execution, and marketing alignment to create scalable growth systems, not just short-term wins.',
    primaryIndustry: 'Business Consulting and Services',
    size: '11-50 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/business-development-pros-llc.',
  },
  {
    name: 'Cove',
    description:
      "Embedded finance was supposed to change everything. Then everyone built the same three products. That's who Cove is for: companies with distribution and customer relationships who need lightweight embedded money experiences without building a fintech from scratch.",
    primaryIndustry: 'Financial Services',
    size: '2-10 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/covedev',
  },
  {
    name: 'Advanced Plating Technologies',
    description:
      'Advanced Plating Technologies is an industry leading, metal finishing job shop that provides engineered solutions in surface finishing across a range of demanding sectors including the medical, defense, power transmission/distribution, telecommunication and the petrochemical markets.',
    primaryIndustry: 'Appliances, Electrical, and Electronics Manufacturing',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, WI',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/advanced-plating-technologies',
  },
  {
    name: 'Lakefront Brewery',
    description:
      'On December 2, 1987, brothers Russ and Jim Klisch opened Lakefront Brewery and sold their first batch of beer to a neighborhood tavern in Milwaukee. Now, we’re one of Wisconsin’s largest craft breweries. Our tours are among the most popular in the U.S.; over 100,000 people tour the brewery each year.',
    primaryIndustry: 'Food and Beverage Services',
    size: '51-200 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/lakefront-brewery',
  },
  {
    name: 'Midwest Refrigerated Services',
    description:
      'Midwest Refrigerated Services is a full-service 3PL company providing integrated refrigerated & ambient logistics services for the food industry. Based in Milwaukee, WI, we operate the largest fresh/frozen 48 state LTL consolidation pool with more than 80+ trucks, and offer multiple sites with ambient, cooler, and air-conditioned storage, distribution and cross-docking services.',
    primaryIndustry: 'Warehousing and Storage',
    size: '201-500 employees',
    type: 'Privately Held',
    location: 'Milwaukee, Wisconsin',
    country: 'United States',
    linkedInUrl: 'https://www.linkedin.com/company/midwest-refrigerated-services',
  },
]
