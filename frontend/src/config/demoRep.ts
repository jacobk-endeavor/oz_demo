/**
 * Demo “field rep” persona — driven by Vite env so one place (.env) updates copy and mock data.
 */
const first = import.meta.env.VITE_DEMO_REP_FIRST_NAME?.trim() || 'Sami'
const last = import.meta.env.VITE_DEMO_REP_LAST_NAME?.trim() || 'Torres'

export const DEMO_REP_FIRST_NAME = first
export const DEMO_REP_LAST_NAME = last
export const DEMO_REP_FULL_NAME = `${first} ${last}`.trim()
