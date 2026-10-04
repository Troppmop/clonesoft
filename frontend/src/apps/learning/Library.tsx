import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { Corpus } from '../../lib/types'
import { corpora, corpusList, isTalmud, sectionPath, type Book } from './catalog'
import { hebrewNumeral } from './hebrew'
import LearningNav from './LearningNav'

/** Browse every book and open any chapter or daf, outside of a reading plan. */
export default function Library() {
  const [params, setParams] = useSearchParams()
  const corpus = (corpora[params.get('c') as Corpus] ?? corpora.tanakh).id
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <LearningNav title="Library" />
      <div className="mb-6 grid grid-cols-3 gap-2 sm:w-fit">
        {corpusList.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setParams({ c: c.id }, { replace: true })}
            className={`rounded-lg border px-4 py-2 text-center ${
              corpus === c.id ? 'border-indigo-500 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <span className="block font-hebrew text-lg leading-tight" lang="he">{c.he}</span>
            <span className="block text-xs text-slate-500">{c.en}</span>
          </button>
        ))}
      </div>

      {corpora[corpus].groups.map((group) => (
        <section key={group.en} className="mb-6">
          <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-slate-600">
            <span>{group.en}</span>
            <span className="font-hebrew text-base" lang="he">{group.he}</span>
          </h2>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {group.books.map((book) => (
              <BookRow key={book.id} book={book} open={open === book.id} onToggle={() => setOpen(open === book.id ? null : book.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BookRow({ book, open, onToggle }: { book: Book; open: boolean; onToggle: () => void }) {
  const talmud = isTalmud(book)
  // The Talmud is listed by daf; each daf opens at its first amud that has text
  const entries = talmud
    ? book.lengths.flatMap((_, i) => {
        const amud = book.start + i
        const first = amud % 2 === 0 || i === 0
        return first ? [{ index: i, label: hebrewNumeral(Math.floor(amud / 2) + 1) }] : []
      })
    : book.lengths.map((_, i) => ({ index: i, label: hebrewNumeral(book.start + i) }))

  return (
    <div>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50" aria-expanded={open}>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span className="flex-1 text-sm text-slate-700">{book.en}</span>
        <span className="text-xs text-slate-400">
          {entries.length} {talmud ? 'dapim' : 'chapters'}
        </span>
        <span className="w-28 text-right font-hebrew text-lg text-slate-900" lang="he">{book.he}</span>
      </button>
      {open && (
        <div dir="rtl" className="flex flex-wrap gap-1.5 px-4 pt-1 pb-4">
          {entries.map((e) => (
            <Link
              key={e.index}
              to={sectionPath(book, e.index)}
              className="grid h-9 min-w-9 place-items-center rounded-lg border border-slate-200 px-2 font-hebrew text-slate-800 hover:border-indigo-400 hover:bg-indigo-50"
              lang="he"
            >
              {e.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
