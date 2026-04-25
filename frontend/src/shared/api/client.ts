class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(`API error ${res.status}: ${res.statusText}`, res.status, body)
  }
  return res.json() as Promise<T>
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
    })
    return parseResponse<T>(res)
  },

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return parseResponse<T>(res)
  },

  async stream(
    path: string,
    body: unknown,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => null)
      throw new ApiError(
        `API stream error ${res.status}: ${res.statusText}`,
        res.status,
        errBody,
      )
    }
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      onChunk(decoder.decode(value, { stream: true }))
    }
  },
}
