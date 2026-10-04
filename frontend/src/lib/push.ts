// Web Push for reading reminders. The service worker (public/sw.js) shows the notifications.
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { isIOS, isStandalone } from './install'

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker registration failed', err))
  })
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export type PushState =
  | 'loading'
  | 'unsupported' // the browser has no Web Push
  | 'needs-install' // iOS only allows push for apps added to the Home Screen
  | 'denied' // the user blocked notifications for this site
  | 'off'
  | 'on'

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

function base64UrlToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false
  const view = new Uint8Array(a)
  return view.every((v, i) => v === b[i])
}

/** Asks for permission and subscribes this device. Call it from a click so browsers show the prompt. */
export async function enablePush(): Promise<void> {
  // Requesting first, before any await, keeps the click's user activation for the permission prompt
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings.')
  const [reg, { publicKey }] = await Promise.all([navigator.serviceWorker.ready, api.push.key()])
  const key = base64UrlToBytes(publicKey)
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with a different server key can't receive our messages, so replace it
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await api.push.subscribe(sub.toJSON())
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const sub = await currentSubscription()
  if (!sub) return
  await api.push.unsubscribe(sub.endpoint).catch(() => {})
  await sub.unsubscribe()
}

/** The state when it can be known without asking the service worker, otherwise null. */
function immediateState(): PushState | null {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return null
}

async function subscribedState(): Promise<PushState> {
  const sub = await currentSubscription()
  if (sub) {
    // Re-register on every visit, in case the server dropped it or another account used this browser
    api.push.subscribe(sub.toJSON()).catch(() => {})
  }
  return sub ? 'on' : 'off'
}

export function usePush() {
  const [state, setState] = useState<PushState>(() => immediateState() ?? 'loading')

  const refresh = useCallback(async () => {
    setState(immediateState() ?? (await subscribedState()))
  }, [])

  useEffect(() => {
    if (immediateState()) return
    let cancelled = false
    subscribedState().then((s) => cancelled || setState(s))
    return () => {
      cancelled = true
    }
  }, [])

  return { state, refresh }
}
