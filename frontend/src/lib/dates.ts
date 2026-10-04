// Dates are handled in the browser's local time zone. Todo due dates are plain
// calendar days ("YYYY-MM-DD" keys); events are absolute ISO timestamps.

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** The Sunday on or before the 1st of the month: the first cell of a 6-week month grid. */
export function monthGridStart(monthStart: Date): Date {
  return addDays(monthStart, -monthStart.getDay())
}

export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Combines a date key and "HH:MM" into a local Date. */
export function combine(dateKey: string, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = parseDateKey(dateKey)
  d.setHours(h, m)
  return d
}

export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatDay(key: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return parseDateKey(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...opts })
}

export function formatMonth(d: Date): string {
  return d.toLocaleDateString([], { month: 'long', year: 'numeric' })
}

/** "Today", "Tomorrow", "Yesterday" or a short date. */
export function relativeDay(key: string): string {
  const diff = Math.round((parseDateKey(key).getTime() - parseDateKey(todayKey()).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return formatDay(key)
}

/** Whether an event overlaps the local calendar day starting at dayStart. */
export function eventOnDay(ev: { startsAt: string; endsAt: string }, dayStart: Date): boolean {
  const start = new Date(ev.startsAt).getTime()
  const end = new Date(ev.endsAt).getTime()
  const dayEnd = addDays(dayStart, 1).getTime()
  return start < dayEnd && (end > dayStart.getTime() || start >= dayStart.getTime())
}

export function formatRelativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
