// Small pieces shared by several apps for showing and choosing cross-app links.
import { NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { useNotes } from '../lib/queries'
import { inputClass } from './ui'

export function NoteSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { data: notes = [] } = useNotes()
  return (
    <select className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">No linked note</option>
      {notes.map((n) => (
        <option key={n.id} value={n.id}>
          {n.title || 'Untitled note'}
        </option>
      ))}
    </select>
  )
}

export function NoteChip({ id, title }: { id: string; title: string | null }) {
  return (
    <Link
      to={`/apps/notes/${id}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-40 items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 hover:bg-amber-100"
      title="Open linked note"
    >
      <NotebookPen size={12} className="shrink-0" />
      <span className="truncate">{title || 'Untitled note'}</span>
    </Link>
  )
}
