import { Bookmark as BookmarkIcon, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorText, Spinner } from '../../components/ui'
import { formatRelativeTime } from '../../lib/dates'
import { useBookmarks, useDeleteBookmark } from '../../lib/queries'
import type { Bookmark } from '../../lib/types'
import { corpora, parseRef, placeLabelEn, sectionPath } from './catalog'
import LearningNav from './LearningNav'

export default function Bookmarks() {
  const { data: bookmarks = [], isLoading, error } = useBookmarks()

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <LearningNav title="Bookmarks" />
      <ErrorText error={error} />
      {isLoading && <Spinner className="mx-auto my-12" />}
      {!isLoading && bookmarks.length === 0 && (
        <p className="py-12 text-center text-sm text-slate-500">
          No bookmarks yet. While reading, tap a verse and choose <strong>Bookmark</strong> to save your place.
        </p>
      )}
      {bookmarks.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {bookmarks.map((b) => <BookmarkRow key={b.id} bookmark={b} />)}
        </ul>
      )}
    </div>
  )
}

/** The latest few bookmarks, for the Learning dashboard. */
export function RecentBookmarks() {
  const { data: bookmarks = [] } = useBookmarks()
  if (bookmarks.length === 0) return null
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Recent bookmarks</h2>
        <Link to="/apps/learning/bookmarks" className="text-xs text-indigo-600">All bookmarks →</Link>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {bookmarks.slice(0, 4).map((b) => <BookmarkRow key={b.id} bookmark={b} />)}
      </ul>
    </section>
  )
}

function BookmarkRow({ bookmark }: { bookmark: Bookmark }) {
  const remove = useDeleteBookmark()
  const place = parseRef(bookmark.ref)
  if (!place) return null

  return (
    <li className="group flex items-center gap-3 px-4 py-2.5">
      <BookmarkIcon size={16} className="shrink-0 text-amber-500" fill="currentColor" />
      <Link to={sectionPath(place.book, place.index, bookmark.segment)} className="min-w-0 flex-1">
        <span className="block truncate font-hebrew text-lg text-slate-900" lang="he" dir="rtl">{bookmark.label}</span>
        <span className="block text-xs text-slate-500">
          {placeLabelEn(place.book, place.index, bookmark.segment)} · {corpora[place.book.corpus].en} · {formatRelativeTime(bookmark.createdAt)}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => remove.mutate(bookmark.id)}
        className="rounded p-1 text-slate-400 hover:text-red-600 sm:invisible sm:group-hover:visible sm:focus:visible"
        aria-label="Delete bookmark"
      >
        <Trash2 size={15} />
      </button>
    </li>
  )
}
