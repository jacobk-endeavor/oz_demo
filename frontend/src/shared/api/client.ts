import { getDemoResponse, isDemoMode } from './demoApi'

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

function getFallback<T>(method: 'GET' | 'POST', path: string, body?: unknown): T | undefined {
  return getDemoResponse<T>(method, path, body)
}

function shouldUseDemoFallback(err: unknown): boolean {
  if (isDemoMode) return true
  if (err instanceof SyntaxError || err instanceof TypeError) return true
  return err instanceof ApiError && [404, 405].includes(err.status)
}

export const api = {
  async get<T>(path: string): Promise<T> {
    if (isDemoMode) {
      const demo = getFallback<T>('GET', path)
      if (demo !== undefined) return demo
    }

    try {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
      })
      return await parseResponse<T>(res)
    } catch (err) {
      const demo = getFallback<T>('GET', path)
      if (demo !== undefined && shouldUseDemoFallback(err)) return demo
      throw err
    }
  },

  async post<T>(path: string, body: unknown): Promise<T> {
    if (isDemoMode) {
      const demo = getFallback<T>('POST', path, body)
      if (demo !== undefined) return demo
    }

    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return await parseResponse<T>(res)
    } catch (err) {
      const demo = getFallback<T>('POST', path, body)
      if (demo !== undefined && shouldUseDemoFallback(err)) return demo
      throw err
    }
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
