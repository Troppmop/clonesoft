import { Check, Flag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { relativeDay, todayKey } from '../lib/dates'
import { useDeleteTodo, useSaveTodo } from '../lib/queries'
import type { Todo } from '../lib/types'
import { NoteChip } from './linked'
import TodoDialog from './TodoDialog'

const priorityColors = ['', 'text-sky-500', 'text-amber-500', 'text-red-500']

export default function TodoItem({ todo, showNote = true }: { todo: Todo; showNote?: boolean }) {
  const save = useSaveTodo()
  const remove = useDeleteTodo()
  const [editing, setEditing] = useState(false)
  const overdue = !todo.done && todo.dueDate !== null && todo.dueDate < todayKey()

  return (
    <>
      <div className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
        <button
          type="button"
          onClick={() => save.mutate({ id: todo.id, done: !todo.done })}
          className={`mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border transition-colors ${
            todo.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-500'
          }`}
          aria-label={todo.done ? 'Mark as not done' : 'Mark as done'}
        >
          {todo.done && <Check size={12} strokeWidth={3} />}
        </button>
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left">
          <span className={`block text-sm ${todo.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            {todo.title}
          </span>
          {(todo.dueDate || todo.priority > 0 || (showNote && todo.noteId)) && (
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
              {todo.dueDate && (
                <span className={overdue ? 'font-medium text-red-600' : 'text-slate-500'}>
                  {relativeDay(todo.dueDate)}
                </span>
              )}
              {todo.priority > 0 && <Flag size={12} className={priorityColors[todo.priority]} fill="currentColor" />}
              {showNote && todo.noteId && <NoteChip id={todo.noteId} title={todo.noteTitle} />}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => remove.mutate(todo.id)}
          className="invisible rounded p-0.5 text-slate-400 group-hover:visible hover:text-red-600 focus:visible"
          aria-label="Delete todo"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {editing && <TodoDialog todo={todo} onClose={() => setEditing(false)} />}
    </>
  )
}
