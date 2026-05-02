import { useSyncExternalStore } from 'react'

const MOBILE_MAX_WIDTH_MEDIA = '(max-width: 767px)'

function subscribeMobileLayout(cb: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const mq = window.matchMedia(MOBILE_MAX_WIDTH_MEDIA)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function getMobileLayoutMatches() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(MOBILE_MAX_WIDTH_MEDIA).matches
}

function getMobileLayoutServerSnapshot() {
  return false
}

/** True when viewport ≤767px — slide-out renders as a bottom sheet instead of a right drawer. */
export function useOzSlideOutMobileSheetLayout() {
  return useSyncExternalStore(
    subscribeMobileLayout,
    getMobileLayoutMatches,
    getMobileLayoutServerSnapshot,
  )
}
