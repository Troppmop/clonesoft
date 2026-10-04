import { BookOpen, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import InstallBanner from '../../components/InstallBanner'
import { Button, ErrorText, Spinner } from '../../components/ui'
import { formatDay } from '../../lib/dates'
import { usePlans } from '../../lib/queries'
import type { Corpus, ReadingPlan } from '../../lib/types'
import { corpora } from './catalog'
import { RecentBookmarks } from './Bookmarks'
import LearningNav from './LearningNav'
import NewPlanDialog from './NewPlanDialog'
import RemindersCard from './RemindersCard'
import { buildPortions, planDate, planStatus, portionLabel } from './schedule'

const presets: { corpus: Corpus; title: string; detail: string }[] = [
  { corpus: 'tanakh', title: 'Tanach in a month', detail: 'All 24 books, about 31 chapters a day' },
  { corpus: 'mishnah', title: 'Mishna in a month', detail: 'All six orders, about 18 chapters a day' },
  { corpus: 'bavli', title: 'Talmud Bavli in a year', detail: 'All 37 tractates, about 7 dapim a day' },
]

export default function Dashboard() {
  const { data: plans = [], isLoading, error } = usePlans()
  const [creating, setCreating] = useState<Corpus | null>(null)
  const hasReminders = plans.some((p) => p.reminderTime)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <LearningNav
        title="Learning"
        action={
          plans.length > 0 && (
            <Button onClick={() => setCreating('tanakh')}>
              <Plus size={16} /> New plan
            </Button>
          )
        }
      />
      <InstallBanner />
      {hasReminders && <RemindersCard compact />}
      <ErrorText error={error} />
      {isLoading && <Spinner className="mx-auto my-12" />}

      {!isLoading && plans.length === 0 && (
        <section className="mb-8">
          <p className="mb-4 text-slate-600">
            Read Tanach, Mishna and Talmud in plain Hebrew, with no commentary. Pick a cycle and it is divided into daily portions for you.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {presets.map((p) => (
              <button
                key={p.corpus}
                type="button"
                onClick={() => setCreating(p.corpus)}
                className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                <span className="mb-2 block font-hebrew text-2xl text-slate-900" lang="he">{corpora[p.corpus].he}</span>
                <span className="block font-semibold">{p.title}</span>
                <span className="mt-1 block text-sm text-slate-500">{p.detail}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mb-10 grid gap-4 md:grid-cols-2">
        {plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
      </div>

      <RecentBookmarks />
      {creating && <NewPlanDialog initialCorpus={creating} onClose={() => setCreating(null)} />}
    </div>
  )
}

function PlanCard({ plan }: { plan: ReadingPlan }) {
  const status = planStatus(plan)
  const portion = buildPortions(plan.corpus, plan.days)[status.next]
  const percent = Math.round((status.completed / plan.days) * 100)

  let note: { text: string; tone: string }
  if (status.finished) note = { text: 'Cycle complete', tone: 'text-emerald-600' }
  else if (status.notStarted) note = { text: `Starts ${formatDay(plan.startDate)}`, tone: 'text-slate-500' }
  else if (status.behind > 1) note = { text: `${status.behind} portions to catch up`, tone: 'text-amber-600' }
  else if (status.behind === 1) note = { text: "Today's portion is waiting", tone: 'text-indigo-600' }
  else note = { text: 'Up to date', tone: 'text-emerald-600' }

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/apps/learning/plans/${plan.id}`} className="block truncate font-semibold hover:text-indigo-600">
            {plan.title}
          </Link>
          <p className={`text-sm ${note.tone}`}>{note.text}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 font-hebrew text-sm text-slate-700" lang="he">
          {corpora[plan.corpus].he}
        </span>
      </div>

      {!status.finished && portion && (
        <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="text-xs text-slate-500">
            Day {status.next + 1} of {plan.days} · {formatDay(planDate(plan, status.next))}
          </p>
          <p className="font-hebrew text-xl text-slate-900" lang="he" dir="rtl">{portionLabel(portion, 'he')}</p>
          <p className="text-xs text-slate-500">{portionLabel(portion, 'en')}</p>
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>{status.completed} of {plan.days} read</span>
          <span>{percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="mt-auto flex gap-2">
        {!status.finished && (
          <Link
            to={`/apps/learning/plans/${plan.id}/day/${status.next}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <BookOpen size={16} /> Read
          </Link>
        )}
        <Link
          to={`/apps/learning/plans/${plan.id}`}
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {status.finished ? 'Start the next cycle' : 'Schedule'}
        </Link>
      </div>
    </article>
  )
}
