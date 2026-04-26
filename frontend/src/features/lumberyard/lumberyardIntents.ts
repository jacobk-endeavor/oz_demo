/**
 * Heuristic intents for the lumberyard activity grid (calls, email, field notes) + intel.
 */

export function matchLumberyardTableIntent(input: string): boolean {
  const t = input.toLowerCase()
  if (t.length < 6) return false
  // "What have my customers been requesting" (and close variants) → activity table
  const aboutOurCustomers =
    t.includes('my customers') ||
    t.includes('our customers') ||
    t.includes('customers have been') ||
    t.includes('customers been') ||
    t.includes('customers are asking') ||
    t.includes("customers' requests") ||
    t.includes('customer requests')
  const askingForProduct =
    t.includes('request') ||
    t.includes('requesting') ||
    t.includes('requested') ||
    t.includes('asking') ||
    t.includes('asked') ||
    t.includes('want') ||
    t.includes('look for') ||
    t.includes('looking for')
  if (aboutOurCustomers && askingForProduct) {
    if (/\bwhat\b|show|list|open|see|tell|give|summary|lately|recent|been|have|are|how|which|who/.test(t)) return true
  }
  if (t.includes('what have my customers') || t.includes("what've my customers") || t.includes('whatve my customers'))
    return true
  if (t.includes('what have our customers') || t.includes("what've our customers")) return true
  // Similar phrasing: customer / client / buyer + want · ask · order · need (B2B “what are they asking for”)
  const customerDemandParaphrases = [
    'what do my customers',
    'what do our customers',
    'what are my customers',
    'what are our customers',
    'what have customers',
    'what have our clients',
    'what have my clients',
    'what did my customers',
    'what did our customers',
    'what customers want',
    'what customers are asking',
    'customers asking for',
    'customers looking for',
    'customers want to order',
    'our clients want',
    'our clients are asking',
    'my clients are asking',
    'tell me what customers',
    'show me what customers',
    'list what customers',
    'give me a summary of what customers',
    'recent requests from customers',
    'recent customer requests',
    'latest customer requests',
    'inbound customer requests',
    'what people are asking for',
    'what buyers are',
    "what are buyers asking",
    'voice of the customer',
    'pull up what customers',
    'what’s selling to customers',
    "what's selling to customers",
  ]
  if (customerDemandParaphrases.some((h) => t.includes(h))) return true
  const productIntent = /(want|wants|ask|request|requests|requested|requesting|order|ordered|ordering|look(ing)? for|after|interested|demand|quote|need(?!\s+to\b)|needs|needed|needing)/.test(
    t,
  )
  if (
    /(show|tell|list|pull up|open|see|what|how|which|give me|summarize|summary)/.test(t) &&
    /(my|our|the)?\s*(customer|customers|client|clients|buyer|buyers|account)/.test(t) &&
    productIntent
  ) {
    return true
  }
  const hits = [
    'call we',
    "calls we'",
    'calls we have',
    'lumberyard call',
    'lumber yard call',
    'sales call',
    'show me the what call', // "show me the what calls we've"
    "what calls we'",
    'what calls we have',
    'list of calls',
    'call recordings',
    'listen to the call',
    'play the call',
    'our calls',
    'transcripts for',
  ]
  if (hits.some((h) => t.includes(h))) return true
  if ((t.includes('show') || t.includes('list') || t.includes('open')) && t.includes('call') && t.includes('we')) {
    return true
  }
  if ((t.includes('transcript') || t.includes('recording')) && (t.includes('lumber') || t.includes('yard'))) {
    return true
  }
  return false
}

/**
 * When we should use the RAG+intel path (and open the right-hand table) even
 * if the user did not say "show table" explicitly.
 */
export function matchLumberyardAnalyticsOrResearchIntent(input: string): boolean {
  const t = input.toLowerCase()
  if (t.length < 8) return false
  if (
    /%|percent|revenue|share of sales|what products|which products|competitor|on their website|sell online|who sells|timbertech|home depot|menards|lowes|84 lumber|weyer|simpson|advantech|field notes|outlook|teams|call center/.test(
      t,
    ) &&
    (t.includes('product') || t.includes('competitor') || t.includes('call') || t.includes('transcript') || t.includes('customer') || t.includes('sale') || t.includes('lumber') || t.includes('website') || t.includes('online'))
  ) {
    return true
  }
  if (t.includes('lumberyard') && (t.includes('?') || t.includes('ask'))) return true
  // Align with table intent: product/customer demand questions (same panel + intel)
  if (
    /\b(what|which|how|show|list|tell|give|summarize|pull)\b/.test(t) &&
    /\b(customer|customers|client|clients|buyer|buyers|our accounts)\b/.test(t) &&
    /\b(ask(ing)?|wants?|request(ing|ed|s)?|order(ing|ed)?|look(ing)? for|interested|demand|need(?!\s+to\b)|needs|needed|needing)\b/.test(
      t,
    )
  ) {
    return true
  }
  return false
}
