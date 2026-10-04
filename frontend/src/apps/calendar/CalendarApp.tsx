import { CalendarPlus, ChevronLeft, ChevronRight, ListPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import EventDialog from '../../components/EventDialog'
import { NoteChip } from '../../components/linked'
import { eventColorClasses } from '../../lib/eventColors'
import TodoDialog from '../../components/TodoDialog'
import TodoItem from '../../components/TodoItem'
import { Button, ErrorText } from '../../components/ui'
import {
  addDays,
  eventOnDay,
  formatDay,
  formatMonth,
  formatTime,
  monthGridStart,
  parseDateKey,
  todayKey,
  toDateKey,
} from '../../lib/dates'
import { useEvents, useTodos } from '../../lib/queries'
import type { CalendarEvent } from '../../lib/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_ITEMS_PER_CELL = 3

export default function CalendarApp() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('date') ?? todayKey()
  const selectedDate = parseDateKey(selected)
  const [month, setMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const [eventDialog, setEventDialog] = useState<CalendarEvent | 'new' | null>(null)
  const [todoDialog, setTodoDialog] = useState(false)

  const days = useMemo(() => {
    const start = monthGridStart(month)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [month])
  const rangeStart = days[0]
  const rangeEnd = addDays(days[41], 1)

  const events = useEvents({ from: rangeStart.toISOString(), to: rangeEnd.toISOString() })
  const todos = useTodos({ from: toDateKey(rangeStart), to: toDateKey(days[41]) })

  const select = (key: string) => setParams({ date: key }, { replace: true })
  const shiftMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  function goToday() {
    const now = new Date()
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    select(todayKey())
  }

  const dayEvents = (day: Date) => (events.data ?? []).filter((ev) => eventOnDay(ev, day))
  const dayTodos = (key: string) => (todos.data ?? []).filter((t) => t.dueDate === key)

  const selectedEvents = dayEvents(selectedDate)
  const selectedTodos = dayTodos(selected)

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-semibold">{formatMonth(month)}</h1>
          <Button variant="secondary" onClick={goToday}>Today</Button>
          <Button variant="ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={18} />
          </Button>
          <Button variant="ghost" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight size={18} />
          </Button>
          <Button onClick={() => setEventDialog('new')}>
            <CalendarPlus size={16} /> New event
          </Button>
        </div>
        <ErrorText error={events.error ?? todos.error} />

        <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-medium text-slate-500">
          {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        <div className="grid min-h-[30rem] flex-1 grid-cols-7 grid-rows-6 border-l border-slate-200">
          {days.map((day) => {
            const key = toDateKey(day)
            const evs = dayEvents(day)
            const tds = dayTodos(key)
            const items = evs.length + tds.length
            const inMonth = day.getMonth() === month.getMonth()
            return (
              <button
                key={key}
                type="button"
                onClick={() => select(key)}
                onDoubleClick={() => setEventDialog('new')}
                className={`flex min-h-0 flex-col gap-0.5 overflow-hidden border-r border-b border-slate-200 p-1 text-left ${
                  key === selected ? 'bg-indigo-50' : inMonth ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 text-slate-400'
                }`}
              >
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${
                    key === todayKey() ? 'bg-indigo-600 font-semibold text-white' : ''
                  }`}
                >
                  {day.getDate()}
                </span>
                {evs.slice(0, MAX_ITEMS_PER_CELL).map((ev) => (
                  <span key={ev.id} className={`truncate rounded border px-1 text-[11px] ${eventColorClasses[ev.color].chip}`}>
                    {!ev.allDay && <span className="opacity-70">{formatTime(ev.startsAt)} </span>}
                    {ev.title}
                  </span>
                ))}
                {tds.slice(0, Math.max(0, MAX_ITEMS_PER_CELL - evs.length)).map((t) => (
                  <span key={t.id} className={`truncate px-1 text-[11px] ${t.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {t.done ? '☑' : '☐'} {t.title}
                  </span>
                ))}
                {items > MAX_ITEMS_PER_CELL && (
                  <span className="px-1 text-[11px] text-slate-500">+{items - MAX_ITEMS_PER_CELL} more</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <aside className="shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 lg:w-80 lg:border-t-0 lg:border-l">
        <h2 className="mb-4 font-semibold">{formatDay(selected, { weekday: 'long', month: 'long' })}</h2>

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Events</h3>
            <Button variant="ghost" onClick={() => setEventDialog('new')}>
              <CalendarPlus size={15} /> Add
            </Button>
          </div>
          {selectedEvents.length === 0 && <p className="text-sm text-slate-400">No events</p>}
          {selectedEvents.map((ev) => (
            <div
              key={ev.id}
              role="button"
              tabIndex={0}
              onClick={() => setEventDialog(ev)}
              onKeyDown={(e) => e.key === 'Enter' && setEventDialog(ev)}
              className={`mb-1.5 cursor-pointer rounded-lg border px-3 py-2 text-sm ${eventColorClasses[ev.color].chip}`}
            >
              <span className="block font-medium">{ev.title}</span>
              <span className="block text-xs opacity-80">
                {ev.allDay ? 'All day' : `${formatTime(ev.startsAt)} – ${formatTime(ev.endsAt)}`}
              </span>
              {ev.noteId && <span className="mt-1 block"><NoteChip id={ev.noteId} title={ev.noteTitle} /></span>}
            </div>
          ))}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Due</h3>
            <Button variant="ghost" onClick={() => setTodoDialog(true)}>
              <ListPlus size={15} /> Add
            </Button>
          </div>
          {selectedTodos.length === 0 && <p className="text-sm text-slate-400">Nothing due</p>}
          {selectedTodos.map((t) => <TodoItem key={t.id} todo={t} />)}
        </section>
      </aside>

      {eventDialog && (
        <EventDialog
          event={eventDialog === 'new' ? undefined : eventDialog}
          defaults={{ date: selected }}
          onClose={() => setEventDialog(null)}
        />
      )}
      {todoDialog && <TodoDialog defaults={{ dueDate: selected }} onClose={() => setTodoDialog(false)} />}
    </div>
  )
}
