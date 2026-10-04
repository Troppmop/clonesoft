// Shared react-query hooks. Notes, todos and events reference each other (todos and events
// show their linked note's title), so mutations invalidate every affected list.
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  api,
  ApiError,
  type BookmarkInput,
  type EventFilter,
  type EventInput,
  type PlanInput,
  type TodoFilter,
  type TodoInput,
} from './api'
import type { Bookmark, HebrewText, ReadingPlan } from './types'

export const keys = {
  me: ['me'] as const,
  notes: (q = '') => ['notes', q] as const,
  note: (id: string) => ['note', id] as const,
  todos: (filter: TodoFilter = {}) => ['todos', filter] as const,
  events: (filter: EventFilter) => ['events', filter] as const,
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.auth.me()
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
    staleTime: Infinity,
  })
}

export const useNotes = (q = '') => useQuery({ queryKey: keys.notes(q), queryFn: () => api.notes.list(q) })

export const useNote = (id: string) => useQuery({ queryKey: keys.note(id), queryFn: () => api.notes.get(id) })

export const useTodos = (filter: TodoFilter = {}) =>
  useQuery({ queryKey: keys.todos(filter), queryFn: () => api.todos.list(filter) })

export const useEvents = (filter: EventFilter) =>
  useQuery({ queryKey: keys.events(filter), queryFn: () => api.events.list(filter) })

export function invalidateLinked(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['notes'] }),
    qc.invalidateQueries({ queryKey: ['todos'] }),
    qc.invalidateQueries({ queryKey: ['events'] }),
  ])
}

export function useSaveTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<TodoInput> & { id?: string }) =>
      id ? api.todos.update(id, input) : api.todos.create(input as TodoInput),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  })
}

export function useDeleteTodo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.todos.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  })
}

export function useSaveEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<EventInput> & { id?: string }) =>
      id ? api.events.update(id, input) : api.events.create(input as EventInput),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.events.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { title?: string; content?: string } = {}) => api.notes.create(input),
    onSuccess: (note) => {
      qc.setQueryData(keys.note(note.id), note)
      return qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.notes.remove(id),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: keys.note(id) })
      return invalidateLinked(qc)
    },
  })
}

// --- Learning ---

export const learningKeys = {
  plans: ['learning', 'plans'] as const,
  bookmarks: ['learning', 'bookmarks'] as const,
  texts: (refs: string[]) => ['learning', 'texts', refs.join('|')] as const,
}

export const usePlans = () => useQuery({ queryKey: learningKeys.plans, queryFn: api.learning.plans })

export function usePlan(id: string) {
  const query = usePlans()
  return { ...query, data: query.data?.find((p) => p.id === id) }
}

function replacePlan(qc: QueryClient, plan: ReadingPlan) {
  qc.setQueryData<ReadingPlan[]>(learningKeys.plans, (list = []) =>
    list.some((p) => p.id === plan.id) ? list.map((p) => (p.id === plan.id ? plan : p)) : [...list, plan],
  )
}

export function useCreatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PlanInput) => api.learning.createPlan(input),
    onSuccess: (plan) => replacePlan(qc, plan),
  })
}

export function useUpdatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Parameters<typeof api.learning.updatePlan>[1] & { id: string }) =>
      api.learning.updatePlan(id, patch),
    onSuccess: (plan) => replacePlan(qc, plan),
  })
}

export function useDeletePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.learning.removePlan(id),
    onSuccess: (_, id) => qc.setQueryData<ReadingPlan[]>(learningKeys.plans, (list = []) => list.filter((p) => p.id !== id)),
  })
}

/** Marks a day's portion read or unread, updating the plan right away so the checkmark doesn't lag. */
export function useSetDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, day, done }: { planId: string; day: number; done: boolean }) =>
      api.learning.setDay(planId, day, done),
    onMutate: async ({ planId, day, done }) => {
      await qc.cancelQueries({ queryKey: learningKeys.plans })
      const previous = qc.getQueryData<ReadingPlan[]>(learningKeys.plans)
      qc.setQueryData<ReadingPlan[]>(learningKeys.plans, (list = []) =>
        list.map((p) =>
          p.id !== planId
            ? p
            : { ...p, completed: done ? [...new Set([...p.completed, day])].sort((a, b) => a - b) : p.completed.filter((d) => d !== day) },
        ),
      )
      return { previous }
    },
    onError: (_, __, ctx) => ctx?.previous && qc.setQueryData(learningKeys.plans, ctx.previous),
    onSuccess: (plan) => replacePlan(qc, plan),
  })
}

export const useBookmarks = () => useQuery({ queryKey: learningKeys.bookmarks, queryFn: api.learning.bookmarks })

export function useSaveBookmark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BookmarkInput) => api.learning.createBookmark(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.bookmarks }),
  })
}

export function useDeleteBookmark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.learning.removeBookmark(id),
    onSuccess: (_, id) => qc.setQueryData<Bookmark[]>(learningKeys.bookmarks, (list = []) => list.filter((b) => b.id !== id)),
  })
}

// The texts endpoint takes up to 80 refs, so long portions are loaded in several requests
const TEXT_CHUNK = 40

/** Loads Hebrew texts for section refs, returning them keyed by ref once every chunk has loaded. */
export function useTexts(refs: string[]) {
  const chunks: string[][] = []
  for (let i = 0; i < refs.length; i += TEXT_CHUNK) chunks.push(refs.slice(i, i + TEXT_CHUNK))
  return useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: learningKeys.texts(chunk),
      queryFn: () => api.learning.texts(chunk),
      staleTime: Infinity,
      gcTime: 30 * 60_000,
    })),
    combine: (results) => {
      const error = results.find((r) => r.error)?.error ?? null
      const done = results.every((r) => r.data)
      const texts = new Map<string, HebrewText>()
      if (done) for (const r of results) for (const t of r.data!) texts.set(t.ref, t)
      return { texts: done ? texts : undefined, error, isLoading: !done && !error }
    },
  })
}
