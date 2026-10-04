import { ArrowLeft, BookOpen, Check, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Button, ErrorText, Field, inputClass, Spinner } from '../../components/ui'
import { addDays, formatDay, parseDateKey, toDateKey, todayKey } from '../../lib/dates'
import { useCreatePlan, useDeletePlan, usePlan, useSetDay, useUpdatePlan } from '../../lib/queries'
import type { ReadingPlan } from '../../lib/types'
import { corpora } from './catalog'
import RemindersCard from './RemindersCard'
import { buildPortions, planDate, planEndDate, planStatus, portionLabel } from './schedule'

export default function PlanPage() {
  const { planId = '' } = useParams()
  const { data: plan, isLoading, error } = usePlan(planId)

  if (isLoading) return <Spinner className="m-auto mt-24" />
  if (!plan) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <ErrorText error={error ?? 'This plan was not found.'} />
        <Link to="/apps/learning" className="text-sm text-indigo-600">← Back to plans</Link>
      </div>
    )
  }
  return <PlanDetails plan={plan} />
}

function PlanDetails({ plan }: { plan: ReadingPlan }) {
  const status = planStatus(plan)
  const percent = Math.round((status.completed / plan.days) * 100)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/apps/learning" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft size={15} /> Plans
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{plan.title}</h1>
          <p className="text-sm text-slate-500">
            <span className="font-hebrew text-base text-slate-700" lang="he">{corpora[plan.corpus].he}</span> ·{' '}
            {formatDay(plan.startDate, { year: 'numeric' })} – {formatDay(planEndDate(plan), { year: 'numeric' })} · {plan.days} days
          </p>
        </div>
        {!status.finished && (
          <Link
            to={`/apps/learning/plans/${plan.id}/day/${status.next}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <BookOpen size={16} /> {status.behind > 0 ? 'Read next portion' : "Read today's portion"}
          </Link>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-slate-700">
            {status.completed} of {plan.days} portions read
          </span>
          <span className={status.behind > 1 ? 'text-amber-600' : 'text-slate-500'}>
            {status.finished ? 'Complete' : status.notStarted ? 'Not started yet' : status.behind > 1 ? `${status.behind} behind` : `${percent}%`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {(status.finished || status.ended) && <NextCycle plan={plan} />}
      {plan.reminderTime && <RemindersCard />}
      <Settings plan={plan} />
      <Schedule plan={plan} today={status.today} started={!status.notStarted} />
    </div>
  )
}

/** Starts the same cycle again, beginning the day after this one ends (or today, if that has passed). */
function NextCycle({ plan }: { plan: ReadingPlan }) {
  const create = useCreatePlan()
  const navigate = useNavigate()
  const afterEnd = toDateKey(addDays(parseDateKey(planEndDate(plan)), 1))
  const start = afterEnd > todayKey() ? afterEnd : todayKey()

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="min-w-0 flex-1 text-sm text-emerald-900">
        {planStatus(plan).finished ? 'You finished this cycle.' : 'This cycle has ended.'} Start the next one on {formatDay(start)}?
      </p>
      <Button
        disabled={create.isPending}
        onClick={() =>
          create.mutate(
            { corpus: plan.corpus, title: plan.title, startDate: start, days: plan.days, reminderTime: plan.reminderTime, timezone: plan.timezone },
            { onSuccess: (p) => navigate(`/apps/learning/plans/${p.id}`) },
          )
        }
      >
        <RotateCcw size={15} /> Start next cycle
      </Button>
      <ErrorText error={create.error} />
    </div>
  )
}

function Settings({ plan }: { plan: ReadingPlan }) {
  const update = useUpdatePlan()
  const remove = useDeletePlan()
  const navigate = useNavigate()
  const [title, setTitle] = useState(plan.title)
  const [time, setTime] = useState(plan.reminderTime ?? '08:00')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  const setReminder = (reminderTime: string | null) => update.mutate({ id: plan.id, reminderTime, timezone })

  return (
    <details className="group mb-6 rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-700 select-none">
        Plan settings <span className="text-slate-400 group-open:hidden">▸</span>
        <span className="hidden text-slate-400 group-open:inline">▾</span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-4 py-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() && title !== plan.title) update.mutate({ id: plan.id, title })
          }}
        >
          <div className="flex-1">
            <Field label="Name">
              <input className={inputClass} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={!title.trim() || title === plan.title}>
            Rename
          </Button>
        </form>

        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">Daily reminder</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="size-4 accent-indigo-600"
                checked={!!plan.reminderTime}
                onChange={(e) => setReminder(e.target.checked ? time : null)}
              />
              Remind me at
            </label>
            <input
              type="time"
              className={`${inputClass} w-auto!`}
              value={time}
              onChange={(e) => {
                setTime(e.target.value)
                if (plan.reminderTime && e.target.value) setReminder(e.target.value)
              }}
              aria-label="Reminder time"
            />
            <span className="text-xs text-slate-400">{plan.timezone}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">You're only reminded on days you still have portions to read.</p>
        </div>
        <ErrorText error={update.error ?? remove.error} />

        <Button
          variant="danger"
          onClick={() => {
            if (confirm(`Delete "${plan.title}" and its progress?`)) {
              remove.mutate(plan.id, { onSuccess: () => navigate('/apps/learning') })
            }
          }}
        >
          <Trash2 size={15} /> Delete plan
        </Button>
      </div>
    </details>
  )
}

function Schedule({ plan, today, started }: { plan: ReadingPlan; today: number; started: boolean }) {
  const portions = buildPortions(plan.corpus, plan.days)
  const setDay = useSetDay()
  const done = useMemo(() => new Set(plan.completed), [plan.completed])
  const todayRow = useRef<HTMLLIElement>(null)

  useEffect(() => {
    // 'nearest' brings today into view without scrolling the plan's header away when it's already visible
    todayRow.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  // Group days under month headings
  const months: { label: string; days: number[] }[] = []
  for (const p of portions) {
    const label = parseDateKey(planDate(plan, p.day)).toLocaleDateString([], { month: 'long', year: 'numeric' })
    if (months.at(-1)?.label !== label) months.push({ label, days: [] })
    months.at(-1)!.days.push(p.day)
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Schedule</h2>
      {months.map((m) => (
        <div key={m.label} className="mb-4">
          <h3 className="sticky top-0 z-10 bg-slate-50 py-1 text-sm font-medium text-slate-600">{m.label}</h3>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {m.days.map((day) => {
              const isDone = done.has(day)
              const isToday = started && day === today
              const missed = started && day < today && !isDone
              return (
                <li key={day} ref={isToday ? todayRow : undefined} className={`flex items-center gap-3 px-3 py-2 ${isToday ? 'bg-indigo-50' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setDay.mutate({ planId: plan.id, day, done: !isDone })}
                    className={`grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${
                      isDone ? 'border-emerald-500 bg-emerald-500 text-white' : missed ? 'border-amber-400' : 'border-slate-300 hover:border-emerald-500'
                    }`}
                    aria-label={isDone ? `Mark day ${day + 1} unread` : `Mark day ${day + 1} read`}
                  >
                    {isDone && <Check size={13} strokeWidth={3} />}
                  </button>
                  <Link to={`/apps/learning/plans/${plan.id}/day/${day}`} className="flex min-w-0 flex-1 items-baseline gap-3">
                    <span className={`w-24 shrink-0 text-xs ${isToday ? 'font-semibold text-indigo-700' : 'text-slate-500'}`}>
                      {isToday ? 'Today' : formatDay(planDate(plan, day))}
                    </span>
                    <span className={`min-w-0 flex-1 truncate font-hebrew ${isDone ? 'text-slate-400' : 'text-slate-900'}`} lang="he" dir="rtl">
                      {portionLabel(portions[day], 'he')}
                    </span>
                    <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{portionLabel(portions[day], 'en')}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
