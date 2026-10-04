import type {
  Bookmark,
  CalendarEvent,
  Corpus,
  EventColor,
  HebrewText,
  Note,
  NoteSummary,
  Priority,
  ReadingPlan,
  Todo,
  User,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`)
  return data as T
}

function query(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => !!e[1])
  return entries.length ? `?${new URLSearchParams(entries)}` : ''
}

export type TodoFilter = {
  status?: 'open' | 'done' | 'all'
  from?: string // due date, YYYY-MM-DD, inclusive
  to?: string
  noteId?: string
}

export type EventFilter = { from: string; to: string } | { noteId: string }

export type TodoInput = {
  title: string
  done: boolean
  dueDate: string | null
  priority: Priority
  noteId: string | null
}

export type EventInput = {
  title: string
  description: string
  startsAt: string
  endsAt: string
  allDay: boolean
  color: EventColor
  noteId: string | null
}

export type PlanInput = {
  corpus: Corpus
  title: string
  startDate: string
  days: number
  reminderTime: string | null
  timezone: string
}

export type BookmarkInput = Pick<Bookmark, 'ref' | 'segment' | 'label'>

export const api = {
  auth: {
    me: () => request<User>('GET', '/auth/me'),
    login: (email: string, password: string) => request<User>('POST', '/auth/login', { email, password }),
    register: (displayName: string, email: string, password: string) =>
      request<User>('POST', '/auth/register', { displayName, email, password }),
    logout: () => request<void>('POST', '/auth/logout'),
  },
  notes: {
    list: (q = '') => request<NoteSummary[]>('GET', `/notes${query({ q })}`),
    get: (id: string) => request<Note>('GET', `/notes/${id}`),
    create: (input: Partial<Pick<Note, 'title' | 'content'>> = {}) => request<Note>('POST', '/notes', input),
    update: (id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) =>
      request<Note>('PATCH', `/notes/${id}`, patch),
    remove: (id: string) => request<void>('DELETE', `/notes/${id}`),
  },
  todos: {
    list: (filter: TodoFilter = {}) => request<Todo[]>('GET', `/todos${query(filter)}`),
    create: (input: Partial<TodoInput> & { title: string }) => request<Todo>('POST', '/todos', input),
    update: (id: string, patch: Partial<TodoInput>) => request<Todo>('PATCH', `/todos/${id}`, patch),
    remove: (id: string) => request<void>('DELETE', `/todos/${id}`),
  },
  events: {
    list: (filter: EventFilter) => request<CalendarEvent[]>('GET', `/events${query(filter)}`),
    get: (id: string) => request<CalendarEvent>('GET', `/events/${id}`),
    create: (input: Partial<EventInput> & Pick<EventInput, 'title' | 'startsAt' | 'endsAt'>) =>
      request<CalendarEvent>('POST', '/events', input),
    update: (id: string, patch: Partial<EventInput>) => request<CalendarEvent>('PATCH', `/events/${id}`, patch),
    remove: (id: string) => request<void>('DELETE', `/events/${id}`),
  },
  learning: {
    texts: (refs: string[]) =>
      request<HebrewText[]>('GET', `/learning/texts?${new URLSearchParams(refs.map((r) => ['ref', r]))}`),
    plans: () => request<ReadingPlan[]>('GET', '/learning/plans'),
    createPlan: (input: PlanInput) => request<ReadingPlan>('POST', '/learning/plans', input),
    updatePlan: (id: string, patch: Partial<Pick<PlanInput, 'title' | 'reminderTime' | 'timezone'>>) =>
      request<ReadingPlan>('PATCH', `/learning/plans/${id}`, patch),
    removePlan: (id: string) => request<void>('DELETE', `/learning/plans/${id}`),
    setDay: (id: string, day: number, done: boolean) =>
      request<ReadingPlan>(done ? 'PUT' : 'DELETE', `/learning/plans/${id}/progress/${day}`),
    bookmarks: () => request<Bookmark[]>('GET', '/learning/bookmarks'),
    createBookmark: (input: BookmarkInput) => request<Bookmark>('POST', '/learning/bookmarks', input),
    removeBookmark: (id: string) => request<void>('DELETE', `/learning/bookmarks/${id}`),
  },
  push: {
    key: () => request<{ publicKey: string }>('GET', '/push/key'),
    subscribe: (sub: PushSubscriptionJSON) => request<void>('POST', '/push/subscriptions', sub),
    unsubscribe: (endpoint: string) => request<void>('DELETE', '/push/subscriptions', { endpoint }),
    test: () => request<{ sent: number }>('POST', '/push/test'),
  },
}
