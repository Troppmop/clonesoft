import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarPlus, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import EventDialog from '../../components/EventDialog'
import { eventColorClasses } from '../../lib/eventColors'
import TodoItem from '../../components/TodoItem'
import { Button, ErrorText, inputClass, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { formatDay, formatTime, toDateKey } from '../../lib/dates'
import { invalidateLinked, keys, useDeleteNote, useEvents, useNote, useSaveTodo, useTodos } from '../../lib/queries'
import type { CalendarEvent, Note } from '../../lib/types'

export default function NoteEditor() {
  const { noteId = '' } = useParams()
  const { data: note, error, isLoading } = useNote(noteId)

  if (isLoading) return <Spinner className="m-auto" />
  if (error || !note) return <div className="m-auto"><ErrorText error={error ?? 'Note not found'} /></div>
  // key: remount per note so local editing state never leaks between notes
  return <Editor key={note.id} note={note} />
}

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'
type Patch = { title?: string; content?: string }

const AUTOSAVE_DELAY_MS = 700

function Editor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const pending = useRef<Patch>({})
  const timer = useRef<number | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const qc = useQueryClient()
  const navigate = useNavigate()
  const deleteNote = useDeleteNote()

  // Saves are chained so they always reach the server in order
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    chain.current = chain.current.then(async () => {
      const patch = pending.current
      if (!Object.keys(patch).length) return
      pending.current = {}
      setStatus('saving')
      try {
        const saved = await api.notes.update(note.id, patch)
        qc.setQueryData(keys.note(note.id), saved)
        // Todos and events display their note's title, so refresh them when it changes
        if (patch.title !== undefined) invalidateLinked(qc)
        else qc.invalidateQueries({ queryKey: ['notes'] })
        setStatus(Object.keys(pending.current).length ? 'unsaved' : 'saved')
      } catch {
        pending.current = { ...patch, ...pending.current }
        setStatus('error')
      }
    })
    return chain.current
  }, [note.id, qc])

  function edit(patch: Patch) {
    Object.assign(pending.current, patch)
    setStatus('unsaved')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS)
  }

  // Save immediately when leaving the note, and warn before closing the tab with unsaved edits
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      flush()
    }
  }, [flush])

  async function remove() {
    if (!confirm('Delete this note? Linked todos and events are kept.')) return
    window.clearTimeout(timer.current)
    pending.current = {}
    await deleteNote.mutateAsync(note.id)
    navigate('/apps/notes')
  }

  const statusText = { saved: 'Saved', unsaved: 'Unsaved changes', saving: 'Saving…', error: 'Save failed, retrying on next edit' }

  return (
    <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
          <Link to="/apps/notes" className="text-slate-500 md:hidden" aria-label="Back to notes">
            <ArrowLeft size={18} />
          </Link>
          <span className={`text-xs ${status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>{statusText[status]}</span>
          <Button variant="danger" className="ml-auto" onClick={remove} title="Delete note">
            <Trash2 size={16} />
          </Button>
        </div>
        <input
          className="px-6 pt-5 pb-2 text-2xl font-semibold outline-none placeholder:text-slate-300"
          placeholder="Untitled note"
          value={title}
          autoFocus={!note.title}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value)
            edit({ title: e.target.value })
          }}
        />
        <textarea
          className="min-h-64 flex-1 resize-none px-6 pb-6 leading-relaxed outline-none placeholder:text-slate-300"
          placeholder="Start writing…"
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            edit({ content: e.target.value })
          }}
        />
      </div>
      <LinkedPanel noteId={note.id} />
    </div>
  )
}

function LinkedPanel({ noteId }: { noteId: string }) {
  const { data: todos = [] } = useTodos({ noteId })
  const { data: events = [] } = useEvents({ noteId })
  const saveTodo = useSaveTodo()
  const [newTodo, setNewTodo] = useState('')
  const [eventDialog, setEventDialog] = useState<CalendarEvent | 'new' | null>(null)

  function addTodo(e: FormEvent) {
    e.preventDefault()
    if (!newTodo.trim()) return
    saveTodo.mutate({ title: newTodo, noteId }, { onSuccess: () => setNewTodo('') })
  }

  return (
    <aside className="shrink-0 space-y-6 overflow-y-auto border-t border-slate-200 bg-slate-50 p-4 lg:w-80 lg:border-t-0 lg:border-l">
      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Todos from this note</h3>
        <form onSubmit={addTodo} className="mb-2 flex gap-2">
          <input className={inputClass} placeholder="Add a todo" value={newTodo} onChange={(e) => setNewTodo(e.target.value)} />
          <Button type="submit" variant="secondary" aria-label="Add todo" disabled={saveTodo.isPending}>
            <Plus size={16} />
          </Button>
        </form>
        {todos.map((t) => <TodoItem key={t.id} todo={t} showNote={false} />)}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Events</h3>
          <Button variant="ghost" onClick={() => setEventDialog('new')}>
            <CalendarPlus size={15} /> Schedule
          </Button>
        </div>
        {events.length === 0 && <p className="text-sm text-slate-400">No events linked to this note</p>}
        {events.map((ev) => (
          <button
            key={ev.id}
            type="button"
            onClick={() => setEventDialog(ev)}
            className={`mb-1.5 block w-full rounded-lg border px-3 py-2 text-left text-sm ${eventColorClasses[ev.color].chip}`}
          >
            <span className="block font-medium">{ev.title}</span>
            <span className="text-xs opacity-80">
              {formatDay(toDateKey(new Date(ev.startsAt)))}
              {!ev.allDay && ` · ${formatTime(ev.startsAt)}`}
            </span>
          </button>
        ))}
        <Link to="/apps/calendar" className="text-xs text-indigo-600">Open calendar →</Link>
      </section>

      {eventDialog && (
        <EventDialog
          event={eventDialog === 'new' ? undefined : eventDialog}
          defaults={{ noteId }}
          onClose={() => setEventDialog(null)}
        />
      )}
    </aside>
  )
}
