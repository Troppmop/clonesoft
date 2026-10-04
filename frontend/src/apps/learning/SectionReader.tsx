import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { adjacentSection, findBook, sectionHeading, sectionIndex, sectionPath, sectionRef } from './catalog'
import ReaderSettingsButton from './ReaderSettingsButton'
import TextView from './TextView'

/** Reads any single chapter or amud, opened from the library or a bookmark. */
export default function SectionReader() {
  const { book: bookId = '', section = '' } = useParams()
  const [params] = useSearchParams()
  const book = findBook(bookId)
  const index = book ? sectionIndex(book, section) : -1
  const top = useRef<HTMLDivElement>(null)

  const seg = Number(params.get('seg'))
  const ref = book && index >= 0 ? sectionRef(book, index) : ''
  const focus = useMemo(() => (seg > 0 && ref ? { ref, segment: seg } : undefined), [ref, seg])
  const pieces = useMemo(
    () => (book && index >= 0 ? [{ book, section: index, from: 1, to: book.lengths[index] }] : []),
    [book, index],
  )

  useEffect(() => {
    if (!focus) top.current?.scrollIntoView({ block: 'start' })
  }, [ref, focus])

  if (!book || index < 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 text-sm">
        <p className="mb-2 text-red-600">That text was not found.</p>
        <Link to="/apps/learning/library" className="text-indigo-600">← Library</Link>
      </div>
    )
  }

  const prev = adjacentSection(book, index, -1)
  const next = adjacentSection(book, index, 1)

  return (
    <div ref={top}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <Link to="/apps/learning/library" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Library">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate font-hebrew font-medium" lang="he" dir="rtl">{sectionHeading(book, index)}</p>
            <p className="text-xs text-slate-500">{sectionRef(book, index)}</p>
          </div>
          <NavButton to={prev && sectionPath(prev.book, prev.index)} label="Previous">
            <ChevronLeft size={18} />
          </NavButton>
          <NavButton to={next && sectionPath(next.book, next.index)} label="Next">
            <ChevronRight size={18} />
          </NavButton>
          <ReaderSettingsButton showCantillation={book.corpus === 'tanakh'} />
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 pt-6 pb-28">
        <TextView key={ref} pieces={pieces} focus={focus} />
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-6 text-sm">
          {prev ? (
            <Link to={sectionPath(prev.book, prev.index)} className="text-indigo-600 hover:underline">
              ← <span className="font-hebrew" lang="he">{sectionHeading(prev.book, prev.index)}</span>
            </Link>
          ) : <span />}
          {next && (
            <Link to={sectionPath(next.book, next.index)} className="text-indigo-600 hover:underline">
              <span className="font-hebrew" lang="he">{sectionHeading(next.book, next.index)}</span> →
            </Link>
          )}
        </div>
      </article>
    </div>
  )
}

function NavButton({ to, label, children }: { to: string | undefined; label: string; children: ReactNode }) {
  if (!to) return <span className="rounded-lg p-1.5 text-slate-200">{children}</span>
  return (
    <Link to={to} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={label}>
      {children}
    </Link>
  )
}
