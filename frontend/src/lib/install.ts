// Installing the site as an app. Chromium browsers fire `beforeinstallprompt`, which can be saved and
// replayed from an Install button. Safari has no such event, so iOS users get instructions instead.
import { useSyncExternalStore } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Starts listening for the install prompt. Call it at startup: the event can fire before React renders. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)

export function useInstallPrompt() {
  const event = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => deferred,
  )
  return {
    canPrompt: !!event,
    async install() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      notify()
      return outcome === 'accepted'
    },
  }
}
