export type User = {
  id: string
  email: string
  displayName: string
  role: 'user' | 'admin'
  createdAt: string
}

export type Note = {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export type NoteSummary = {
  id: string
  title: string
  preview: string
  updatedAt: string
}

export type Priority = 0 | 1 | 2 | 3

export type Todo = {
  id: string
  title: string
  done: boolean
  dueDate: string | null // YYYY-MM-DD
  priority: Priority
  noteId: string | null
  noteTitle: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export const EVENT_COLORS = ['blue', 'green', 'red', 'amber', 'purple', 'slate'] as const
export type EventColor = (typeof EVENT_COLORS)[number]

export type CalendarEvent = {
  id: string
  title: string
  description: string
  startsAt: string // ISO timestamp
  endsAt: string
  allDay: boolean
  color: EventColor
  noteId: string | null
  noteTitle: string | null
  createdAt: string
  updatedAt: string
}

export type Corpus = 'tanakh' | 'mishnah' | 'bavli'

export type ReadingPlan = {
  id: string
  corpus: Corpus
  title: string
  startDate: string // YYYY-MM-DD
  days: number
  reminderTime: string | null // HH:MM in `timezone`
  timezone: string
  completed: number[] // completed day indexes, starting at 0
  createdAt: string
}

export type Bookmark = {
  id: string
  ref: string // section ref, such as "Genesis 1" or "Berakhot 2a"
  segment: number | null // 1-based verse or line within the section
  label: string
  corpus: Corpus
  createdAt: string
}

export type HebrewText = {
  ref: string
  heRef: string
  segments: string[]
}
