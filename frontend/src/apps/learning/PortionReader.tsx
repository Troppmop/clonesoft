import { ArrowLeft, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { Button, ErrorText, Spinner } from '../../components/ui'
import { formatDay } from '../../lib/dates'
import { usePlan, useSetDay } from '../../lib/queries'
import type { ReadingPlan } from '../../lib/types'
import ReaderSettingsButton from './ReaderSettingsButton'
import { buildPortions, planDate, planStatus, portionLabel } from './schedule'
import TextView from './TextView'

/** Reads one day's portion of a plan. The day can be a number, or "next" for the first unread one. */
export default function PortionReader() {
  const { planId = '', day = '' } = useParams()
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
  const index = Number(day)
  if (day === 'next' || day === 'today' || !Number.isInteger(index) || index < 0 || index >= plan.days) {
    const status = planStatus(plan)
    return <Navigate replace to={`/apps/learning/plans/${plan.id}/day/${day === 'today' ? status.today : status.next}`} />
  }
  return <Portion plan={plan} day={index} />
}

function Portion({ plan, day }: { plan: ReadingPlan; day: number }) {
  const portion = buildPortions(plan.corpus, plan.days)[day]
  const setDay = useSetDay()
  const top = useRef<HTMLDivElement>(null)
  const done = plan.completed.includes(day)
  const status = planStatus(plan)
  const base = `/apps/learning/plans/${plan.id}/day`

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' })
  }, [day])

  return (
    <div ref={top}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <Link to={`/apps/learning/plans/${plan.id}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Back to plan">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{plan.title}</p>
            <p className="text-xs text-slate-500">
              Day {day + 1} of {plan.days} · {formatDay(planDate(plan, day))}
              {done && <span className="ml-1.5 text-emerald-600">· Read</span>}
            </p>
          </div>
          <DayLink to={day > 0 ? `${base}/${day - 1}` : null} label="Previous day">
            <ChevronLeft size={18} />
          </DayLink>
          <DayLink to={day < plan.days - 1 ? `${base}/${day + 1}` : null} label="Next day">
            <ChevronRight size={18} />
          </DayLink>
          <ReaderSettingsButton showCantillation={plan.corpus === 'tanakh'} />
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 pt-6 pb-28">
        <div className="mb-8 text-center">
          <h1 className="font-hebrew text-3xl text-slate-900" lang="he" dir="rtl">{portionLabel(portion, 'he')}</h1>
          <p className="text-sm text-slate-500">{portionLabel(portion, 'en')}</p>
        </div>

        <TextView key={`${plan.id}:${day}`} pieces={portion.pieces} />

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-slate-200 pt-8">
          {done ? (
            <>
              <p className="flex items-center gap-1.5 font-medium text-emerald-700">
                <Check size={18} /> You read this portion
              </p>
              {status.finished ? (
                <p className="text-sm text-slate-600">That completes the cycle.</p>
              ) : status.behind > 0 ? (
                <Link to={`${base}/${status.next}`} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500">
                  Next portion: day {status.next + 1}
                </Link>
              ) : (
                <p className="text-sm text-slate-600">You're all caught up.</p>
              )}
              <button type="button" className="text-xs text-slate-400 hover:text-slate-700" onClick={() => setDay.mutate({ planId: plan.id, day, done: false })}>
                Mark as unread
              </button>
            </>
          ) : (
            <Button className="px-8! py-3! text-base!" onClick={() => setDay.mutate({ planId: plan.id, day, done: true })}>
              <Check size={18} /> Mark as read
            </Button>
          )}
          <ErrorText error={setDay.error} />
        </div>
      </article>
    </div>
  )
}

function DayLink({ to, label, children }: { to: string | null; label: string; children: ReactNode }) {
  if (!to) return <span className="rounded-lg p-1.5 text-slate-200">{children}</span>
  return (
    <Link to={to} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={label}>
      {children}
    </Link>
  )
}
