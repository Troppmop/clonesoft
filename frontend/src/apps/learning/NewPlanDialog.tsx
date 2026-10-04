import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, ErrorText, Field, inputClass, Modal } from '../../components/ui'
import { addDays, formatDay, parseDateKey, toDateKey, todayKey } from '../../lib/dates'
import { enablePush, pushSupported } from '../../lib/push'
import { useCreatePlan } from '../../lib/queries'
import type { Corpus } from '../../lib/types'
import { corpora, corpusList } from './catalog'
import { averagePortionSize, buildPortions, daysForMonths, portionLabel } from './schedule'

type Length = { id: string; label: string; days: (start: string) => number }

const months = (n: number, label: string): Length => ({ id: `${n}m`, label, days: (start) => daysForMonths(start, n) })
const sectionCount = (c: Corpus) => corpora[c].books.reduce((n, b) => n + b.lengths.filter((l) => l > 0).length, 0)
const segmentCount = (c: Corpus) => corpora[c].books.reduce((n, b) => n + b.lengths.reduce((a, l) => a + l, 0), 0)

// The first option for each corpus is its default: Tanach and Mishna in a month, the Talmud in a year
const lengths: Record<Corpus, Length[]> = {
  tanakh: [months(1, '1 month'), months(3, '3 months'), months(12, '1 year')],
  mishnah: [
    months(1, '1 month'),
    months(12, '1 year'),
    { id: 'yomit', label: '2 mishnayot a day', days: () => Math.ceil(segmentCount('mishnah') / 2) },
  ],
  bavli: [
    months(12, '1 year'),
    months(24, '2 years'),
    { id: 'daf', label: '1 daf a day', days: () => Math.ceil(sectionCount('bavli') / 2) },
  ],
}

const defaultTitle = (corpus: Corpus, length: string) => `${corpora[corpus].en} — ${length}`

export default function NewPlanDialog({ initialCorpus = 'tanakh', onClose }: { initialCorpus?: Corpus; onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreatePlan()
  const [corpus, setCorpus] = useState<Corpus>(initialCorpus)
  const [lengthId, setLengthId] = useState(lengths[initialCorpus][0].id)
  const [startDate, setStartDate] = useState(todayKey())
  const [customEnd, setCustomEnd] = useState(() => toDateKey(addDays(new Date(), 89)))
  const [title, setTitle] = useState<string | null>(null) // null follows the default title
  const [remind, setRemind] = useState(true)
  const [reminderTime, setReminderTime] = useState('08:00')
  const [pushError, setPushError] = useState<unknown>(null)

  const length = lengths[corpus].find((l) => l.id === lengthId)
  const maxDays = segmentCount(corpus)
  const days = length
    ? length.days(startDate)
    : Math.round((parseDateKey(customEnd).getTime() - parseDateKey(startDate).getTime()) / 86_400_000) + 1
  const validDays = days >= 1 && days <= Math.min(maxDays, 10000)
  const lengthLabel = length?.label ?? `${days} days`
  const shownTitle = title ?? defaultTitle(corpus, lengthLabel)

  const preview = useMemo(() => {
    if (!validDays) return null
    const size = averagePortionSize(corpus, days)
    const first = buildPortions(corpus, days)[0]
    return { size, first }
  }, [corpus, days, validDays])

  function chooseCorpus(c: Corpus) {
    setCorpus(c)
    setLengthId(lengths[c][0].id)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!validDays || !shownTitle.trim()) return
    // Asking for notification permission inside the submit handler lets browsers show the prompt
    if (remind && pushSupported() && Notification.permission !== 'denied') {
      enablePush().catch(setPushError)
    }
    create.mutate(
      {
        corpus,
        title: shownTitle.trim(),
        startDate,
        days,
        reminderTime: remind ? reminderTime : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      },
      { onSuccess: (plan) => navigate(`/apps/learning/plans/${plan.id}`) },
    )
  }

  return (
    <Modal title="New reading plan" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {corpusList.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => chooseCorpus(c.id)}
              className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${
                corpus === c.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className="block font-hebrew text-lg leading-tight" lang="he">{c.he}</span>
              <span className="block text-xs text-slate-500">{c.en}</span>
            </button>
          ))}
        </div>

        <Field label="Finish in">
          <div className="flex flex-wrap gap-1.5">
            {[...lengths[corpus], { id: 'custom', label: 'Custom' }].map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLengthId(l.id)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  lengthId === l.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <input type="date" className={inputClass} value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} required />
          </Field>
          {lengthId === 'custom' ? (
            <Field label="Finish by">
              <input type="date" className={inputClass} value={customEnd} min={startDate} onChange={(e) => e.target.value && setCustomEnd(e.target.value)} required />
            </Field>
          ) : (
            <Field label="Finishes">
              <p className="py-1.5 text-sm text-slate-700">{validDays ? formatDay(toDateKey(addDays(parseDateKey(startDate), days - 1)), { year: 'numeric' }) : '—'}</p>
            </Field>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          {preview ? (
            <>
              <p>
                <strong className="text-slate-900">{days} daily portions</strong> of about{' '}
                {preview.size.count >= 10 ? Math.round(preview.size.count) : preview.size.count.toFixed(1)} {preview.size.unit}
              </p>
              <p className="mt-1">
                Day 1: <span className="font-hebrew text-base text-slate-900" lang="he" dir="rtl">{portionLabel(preview.first, 'he')}</span>
                <span className="text-slate-400"> · {portionLabel(preview.first, 'en')}</span>
              </p>
            </>
          ) : (
            <p className="text-red-600">Choose a finish date between 1 and {Math.min(maxDays, 10000)} days after the start.</p>
          )}
        </div>

        <Field label="Name">
          <input className={inputClass} value={shownTitle} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
        </Field>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4 accent-indigo-600" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
            Remind me every day at
          </label>
          <input
            type="time"
            className={`${inputClass} w-auto!`}
            value={reminderTime}
            disabled={!remind}
            onChange={(e) => e.target.value && setReminderTime(e.target.value)}
            aria-label="Reminder time"
          />
        </div>

        <ErrorText error={create.error ?? pushError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!validDays || create.isPending}>
            Start plan
          </Button>
        </div>
      </form>
    </Modal>
  )
}
