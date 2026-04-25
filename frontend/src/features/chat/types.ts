export interface Citation {
  kind: 'obs' | 'conc'
  id: string
  statement: string
  layer: number
  category: string
  doc_slug: string | null
  wikilink: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

export interface ChatResponse {
  reply: string
  citations: Citation[]
  session_id: string
}
