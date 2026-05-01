/**
 * `vite.config.ts` pulls in `backend/oz/*` for middleware. Minimal typings so frontend `tsc` resolves.
 */
declare module 'vite' {
  export function defineConfig(config: unknown): unknown
  export function loadEnv(mode: string, envDir: string, prefix: string): Record<string, string>
}

declare module 'pg' {
  export class Pool {
    constructor(config?: Record<string, unknown>)
    query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
    end(): Promise<void>
  }
}
