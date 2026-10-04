// Divides a corpus into a number of daily portions of about equal length.
import { addDays, parseDateKey, toDateKey, todayKey } from '../../lib/dates'
import type { Corpus, ReadingPlan } from '../../lib/types'
import { corpora, isTalmud, placeLabelEn, placeLabelHe, sectionRef, type Book } from './catalog'

/** Part of one section: segments `from` to `to` (1-based, inclusive). */
export type Piece = { book: Book; section: number; from: number; to: number; whole: boolean }

export type Portion = { day: number; pieces: Piece[] }

type Unit = { book: Book; section: number; segment: number | null; weight: number }

/**
 * Portions end on whole sections (chapters, or amudim for the Talmud) whenever there are at least
 * as many sections as days. Longer plans, like two mishnayot a day, split sections into segments.
 * Tanach and Mishna sections are weighted by their number of verses or mishnayot, so a day of short
 * chapters covers more of them. Every amud counts the same, like the daf yomi.
 */
function units(corpus: Corpus, days: number): Unit[] {
  const books = corpora[corpus].books
  const sections: Unit[] = books.flatMap((book) =>
    book.lengths.flatMap((len, section) =>
      len > 0 ? [{ book, section, segment: null, weight: isTalmud(book) ? 1 : len }] : [],
    ),
  )
  if (sections.length >= days) return sections
  return sections.flatMap((u) =>
    Array.from({ length: u.book.lengths[u.section] }, (_, i) => ({ ...u, segment: i + 1, weight: 1 })),
  )
}

const cache = new Map<string, Portion[]>()

export function buildPortions(corpus: Corpus, days: number): Portion[] {
  const key = `${corpus}:${days}`
  const cached = cache.get(key)
  if (cached) return cached

  const list = units(corpus, days)
  const total = list.reduce((sum, u) => sum + u.weight, 0)
  const portions: Portion[] = []
  let i = 0
  let done = 0
  for (let day = 0; day < days; day++) {
    // Each day ends where the running total comes closest to its share of the whole, while
    // taking at least one unit and leaving at least one for every remaining day
    const target = (total * (day + 1)) / days
    const last = list.length - (days - day - 1)
    const start = i
    done += list[i++]?.weight ?? 0
    while (i < last && Math.abs(done + list[i].weight - target) < Math.abs(done - target)) done += list[i++].weight
    portions.push({ day, pieces: toPieces(list.slice(start, i)) })
  }
  cache.set(key, portions)
  return portions
}

function toPieces(list: Unit[]): Piece[] {
  const pieces: Piece[] = []
  for (const u of list) {
    const prev = pieces.at(-1)
    if (u.segment !== null && prev && prev.book === u.book && prev.section === u.section) {
      prev.to = u.segment
      prev.whole = prev.from === 1 && prev.to === u.book.lengths[u.section]
      continue
    }
    const len = u.book.lengths[u.section]
    const from = u.segment ?? 1
    const to = u.segment ?? len
    pieces.push({ book: u.book, section: u.section, from, to, whole: from === 1 && to === len })
  }
  return pieces
}

export const pieceRef = (p: Piece) => sectionRef(p.book, p.section)

/** "Genesis 1–31", "Genesis 48 – Exodus 3" or "Mishnah Berakhot 1:1–1:2". */
export function portionLabel(portion: Portion, lang: 'en' | 'he'): string {
  const first = portion.pieces[0]
  const last = portion.pieces.at(-1)
  if (!first || !last) return ''
  const partial = portion.pieces.some((p) => !p.whole)
  const place = lang === 'en' ? placeLabelEn : placeLabelHe
  const start = place(first.book, first.section, partial ? first.from : null)
  if (first === last && first.from === first.to && partial) return start
  if (first === last && !partial) return start
  const end = place(last.book, last.section, partial ? last.to : null)
  // Within one book, the end drops the repeated book name
  const bookName = lang === 'en' ? first.book.en : first.book.he
  return first.book === last.book ? `${start}–${end.slice(bookName.length + 1)}` : `${start} – ${end}`
}

/** How many sections (or segments) a portion covers, for summaries like "about 31 chapters a day". */
export function averagePortionSize(corpus: Corpus, days: number): { count: number; unit: string } {
  const info = corpora[corpus]
  const sections = info.books.reduce((n, b) => n + b.lengths.filter((l) => l > 0).length, 0)
  if (sections >= days) return { count: sections / days, unit: info.sections }
  const segments = info.books.reduce((n, b) => n + b.lengths.reduce((a, l) => a + l, 0), 0)
  return { count: segments / days, unit: corpus === 'tanakh' ? 'verses' : corpus === 'mishnah' ? 'mishnayot' : 'lines' }
}

// --- plan dates and progress ---

export const planDate = (plan: Pick<ReadingPlan, 'startDate'>, day: number) =>
  toDateKey(addDays(parseDateKey(plan.startDate), day))

export const planEndDate = (plan: Pick<ReadingPlan, 'startDate' | 'days'>) => planDate(plan, plan.days - 1)

/** The day index for a date: negative before the plan starts, ≥ days after it ends. */
export function dayIndex(plan: Pick<ReadingPlan, 'startDate'>, dateKey = todayKey()): number {
  return Math.round((parseDateKey(dateKey).getTime() - parseDateKey(plan.startDate).getTime()) / 86_400_000)
}

export type PlanStatus = {
  today: number // today's day index, clamped to the plan
  due: number // portions that should be read by the end of today
  behind: number // due portions not yet read
  completed: number
  finished: boolean
  notStarted: boolean
  ended: boolean // the last day has passed
  next: number // the first unread portion, or today's if all due ones are read
}

export function planStatus(plan: ReadingPlan): PlanStatus {
  const raw = dayIndex(plan)
  const done = new Set(plan.completed)
  const due = Math.max(0, Math.min(raw + 1, plan.days))
  let behind = 0
  for (let d = 0; d < due; d++) if (!done.has(d)) behind++
  const today = Math.max(0, Math.min(raw, plan.days - 1))
  let next = today
  for (let d = 0; d < plan.days; d++) {
    if (!done.has(d)) {
      next = d <= today ? d : today
      break
    }
  }
  return {
    today,
    due,
    behind,
    completed: done.size,
    finished: done.size >= plan.days,
    notStarted: raw < 0,
    ended: raw >= plan.days,
    next,
  }
}

/** The number of days from start through the day before the same date `months` later. */
export function daysForMonths(startKey: string, months: number): number {
  const start = parseDateKey(startKey)
  const end = new Date(start.getFullYear(), start.getMonth() + months, start.getDate())
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}
