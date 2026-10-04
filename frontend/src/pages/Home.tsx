import { Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { searchApps } from '../apps/registry'
import { eventColorClasses } from '../lib/eventColors'
import TodoItem from '../components/TodoItem'
import { formatRelativeTime, formatTime, startOfDay, addDays, todayKey } from '../lib/dates'
import { useEvents, useMe, useNotes, useTodos } from '../lib/queries'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Home() {
  const { data: user } = useMe()
  const [q, setQ] = useState('')
  const results = searchApps(q)
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">
        {greeting()}, {user?.displayName}
      </h1>
      <p className="mb-6 text-slate-500">Pick an app to get started.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (results[0]) navigate(results[0].path)
        }}
        className="relative mb-6"
      >
        <Search size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
        <input
          className="w-full rounded-xl border border-slate-200 bg-white py-3 pr-4 pl-11 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          placeholder="Search apps…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </form>

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((app) => (
          <Link
            key={app.id}
            to={app.path}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
          >
            <span className={`mb-3 grid size-11 place-items-center rounded-xl ${app.accent}`}>
              <app.icon size={22} />
            </span>
            <h2 className="font-semibold group-hover:text-indigo-600">{app.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{app.description}</p>
          </Link>
        ))}
        {results.length === 0 && <p className="text-sm text-slate-400">No apps match “{q}”.</p>}
      </div>

      <TodayOverview />
    </div>
  )
}

function TodayOverview() {
  const [today] = useState(() => startOfDay(new Date()))
  const { data: events = [] } = useEvents({ from: today.toISOString(), to: addDays(today, 1).toISOString() })
  const { data: todos = [] } = useTodos({ status: 'open', to: todayKey() })
  const { data: notes = [] } = useNotes()

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Panel title="Today's events" link={`/apps/calendar?date=${todayKey()}`}>
        {events.length === 0 && <Empty>No events today</Empty>}
        {events.map((ev) => (
          <Link
            key={ev.id}
            to={`/apps/calendar?date=${todayKey()}`}
            className={`mb-1.5 block rounded-lg border px-3 py-1.5 text-sm ${eventColorClasses[ev.color].chip}`}
          >
            <span className="font-medium">{ev.title}</span>
            <span className="ml-2 text-xs opacity-80">{ev.allDay ? 'All day' : formatTime(ev.startsAt)}</span>
          </Link>
        ))}
      </Panel>
      <Panel title="Due today & overdue" link="/apps/todos">
        {todos.length === 0 && <Empty>You're all caught up</Empty>}
        {todos.map((t) => <TodoItem key={t.id} todo={t} />)}
      </Panel>
      <Panel title="Recent notes" link="/apps/notes">
        {notes.length === 0 && <Empty>No notes yet</Empty>}
        {notes.slice(0, 5).map((n) => (
          <Link key={n.id} to={`/apps/notes/${n.id}`} className="flex justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
            <span className="truncate">{n.title || 'Untitled note'}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatRelativeTime(n.updatedAt)}</span>
          </Link>
        ))}
      </Panel>
    </div>
  )
}

function Panel({ title, link, children }: { title: string; link: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
        <Link to={link} className="text-xs text-indigo-600">Open →</Link>
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1.5 text-sm text-slate-400">{children}</p>
}
