import { ChevronDown, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import TodoItem from '../../components/TodoItem'
import { Button, ErrorText, inputClass, Spinner } from '../../components/ui'
import { todayKey } from '../../lib/dates'
import { useSaveTodo, useTodos } from '../../lib/queries'
import type { Todo } from '../../lib/types'

function groupOpenTodos(todos: Todo[]) {
  const today = todayKey()
  const groups: Record<'Overdue' | 'Today' | 'Upcoming' | 'Someday', Todo[]> = {
    Overdue: [],
    Today: [],
    Upcoming: [],
    Someday: [],
  }
  for (const t of todos) {
    if (!t.dueDate) groups.Someday.push(t)
    else if (t.dueDate < today) groups.Overdue.push(t)
    else if (t.dueDate === today) groups.Today.push(t)
    else groups.Upcoming.push(t)
  }
  return Object.entries(groups).filter(([, list]) => list.length > 0)
}

export default function TodosApp() {
  const { data: todos = [], isLoading, error } = useTodos()
  const save = useSaveTodo()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [showDone, setShowDone] = useState(false)

  const open = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done)

  function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    save.mutate({ title, dueDate: dueDate || null }, { onSuccess: () => setTitle('') })
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Todo</h1>
      <form onSubmit={add} className="mb-6 flex gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <input
          className="min-w-0 flex-1 px-2 text-sm outline-none"
          placeholder="What needs doing?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="date"
          className={`${inputClass} w-auto!`}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
        />
        <Button type="submit" disabled={save.isPending}>
          <Plus size={16} /> Add
        </Button>
      </form>
      <ErrorText error={error ?? save.error} />
      {isLoading && <Spinner className="mx-auto" />}
      {!isLoading && open.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">Nothing to do. Add a todo above.</p>
      )}

      {groupOpenTodos(open).map(([label, list]) => (
        <section key={label} className="mb-5">
          <h2 className={`mb-1 px-2 text-xs font-semibold tracking-wide uppercase ${label === 'Overdue' ? 'text-red-600' : 'text-slate-500'}`}>
            {label} <span className="font-normal text-slate-400">{list.length}</span>
          </h2>
          {list.map((t) => <TodoItem key={t.id} todo={t} />)}
        </section>
      ))}

      {done.length > 0 && (
        <section className="border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setShowDone(!showDone)}
            className="mb-1 flex items-center gap-1 px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase"
          >
            <ChevronDown size={14} className={showDone ? '' : '-rotate-90'} />
            Completed <span className="font-normal text-slate-400">{done.length}</span>
          </button>
          {showDone && done.map((t) => <TodoItem key={t.id} todo={t} />)}
        </section>
      )}
    </div>
  )
}
