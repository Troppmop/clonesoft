import { Plus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { Button, inputClass, Spinner } from '../../components/ui'
import { formatRelativeTime } from '../../lib/dates'
import { useCreateNote, useNotes } from '../../lib/queries'

export default function NotesApp() {
  const [search, setSearch] = useState('')
  const q = useDeferredValue(search.trim())
  const { data: notes, isLoading } = useNotes(q)
  const createNote = useCreateNote()
  const navigate = useNavigate()
  const { noteId } = useParams()

  function newNote() {
    createNote.mutate({}, { onSuccess: (note) => navigate(`/apps/notes/${note.id}`) })
  }

  return (
    <div className="flex h-full">
      {/* On small screens the list and the editor take turns filling the screen */}
      <aside
        className={`w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-72 ${noteId ? 'hidden' : 'flex'}`}
      >
        <div className="space-y-2 border-b border-slate-200 p-3">
          <Button className="w-full" onClick={newNote} disabled={createNote.isPending}>
            <Plus size={16} /> New note
          </Button>
          <div className="relative">
            <Search size={15} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputClass} pl-8`}
              placeholder="Search notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && <Spinner className="mx-auto mt-6" />}
          {notes?.length === 0 && (
            <p className="mt-6 text-center text-sm text-slate-400">{q ? 'No matching notes' : 'No notes yet'}</p>
          )}
          {notes?.map((note) => (
            <NavLink
              key={note.id}
              to={`/apps/notes/${note.id}`}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 ${isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'}`
              }
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{note.title || 'Untitled note'}</span>
                <span className="shrink-0 text-xs text-slate-400">{formatRelativeTime(note.updatedAt)}</span>
              </div>
              <p className="truncate text-xs text-slate-500">{note.preview || 'Empty'}</p>
            </NavLink>
          ))}
        </div>
      </aside>
      <section className={`min-w-0 flex-1 ${noteId ? 'flex' : 'hidden md:flex'}`}>
        <Outlet />
      </section>
    </div>
  )
}

export function NoNoteSelected() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
      Select a note or create a new one
    </div>
  )
}
