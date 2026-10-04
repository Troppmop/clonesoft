// Reader preferences, kept per browser.
import { useSyncExternalStore } from 'react'

export type ReaderSettings = {
  fontSize: number // px
  vowels: boolean
  cantillation: boolean
}

const KEY = 'learning.reader'
const defaults: ReaderSettings = { fontSize: 24, vowels: true, cantillation: true }
export const FONT_SIZES = { min: 16, max: 40, step: 2 }

function load(): ReaderSettings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

let current = load()
const listeners = new Set<() => void>()

export function setReaderSettings(patch: Partial<ReaderSettings>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage can be unavailable (private mode); the setting still applies until reload
  }
  listeners.forEach((l) => l())
}

export function useReaderSettings(): ReaderSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
