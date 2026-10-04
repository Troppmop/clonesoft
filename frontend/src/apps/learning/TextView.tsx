import { Bookmark as BookmarkIcon, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, ErrorText, Spinner } from '../../components/ui'
import { useBookmarks, useDeleteBookmark, useSaveBookmark, useTexts } from '../../lib/queries'
import { isTalmud, placeLabelHe, sectionHeading, sectionRef, textSources, type Book } from './catalog'
import { hebrewNumeral, stripMarks } from './hebrew'
import { useReaderSettings } from './readerSettings'

/** Segments `from` to `to` (1-based, inclusive) of one section. */
export type TextPiece = { book: Book; section: number; from: number; to: number }

type Place = { book: Book; section: number; ref: string; segment: number }

const segmentId = (ref: string, segment: number) => `seg-${ref.replace(/\W/g, '_')}-${segment}`

/**
 * Renders Hebrew text for one or more sections. Tapping a verse selects it and offers to bookmark it.
 * `focus` scrolls to and highlights a segment once the text loads. Give each portion its own `key`
 * so the selection doesn't carry over to the next one.
 */
export default function TextView({ pieces, focus }: { pieces: TextPiece[]; focus?: { ref: string; segment: number } }) {
  const refs = useMemo(() => [...new Set(pieces.map((p) => sectionRef(p.book, p.section)))], [pieces])
  const { texts, error, isLoading } = useTexts(refs)
  const settings = useReaderSettings()
  const { data: bookmarks = [] } = useBookmarks()
  const [selected, setSelected] = useState<Place | null>(null)

  const bookmarked = useMemo(
    () => new Map(bookmarks.filter((b) => b.segment).map((b) => [`${b.ref}#${b.segment}`, b])),
    [bookmarks],
  )

  const focusId = texts && focus ? segmentId(focus.ref, focus.segment) : null
  useEffect(() => {
    if (focusId) document.getElementById(focusId)?.scrollIntoView({ block: 'center' })
  }, [focusId])

  if (error) return <ErrorText error={error} />
  if (isLoading || !texts) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">
        <Spinner />
        Loading text…
      </div>
    )
  }

  return (
    <div dir="rtl" lang="he" className="font-hebrew text-slate-900" style={{ fontSize: settings.fontSize, lineHeight: 1.9 }}>
      {pieces.map((piece) => {
        const ref = sectionRef(piece.book, piece.section)
        const segments = texts.get(ref)?.segments ?? []
        const talmud = isTalmud(piece.book)
        const mishnah = piece.book.corpus === 'mishnah'
        // A piece that runs to the end of its section also shows any segments Sefaria has beyond the catalog's count
        const toEnd = piece.to >= piece.book.lengths[piece.section]
        const visible = segments
          .map((text, i) => ({ text, n: i + 1 }))
          .filter(({ text, n }) => text && n >= piece.from && (toEnd || n <= piece.to))

        const renderSegment = ({ text, n }: { text: string; n: number }) => {
          const isSelected = selected?.ref === ref && selected.segment === n
          const isFocus = focus?.ref === ref && focus.segment === n
          const mark = bookmarked.has(`${ref}#${n}`)
          const content = (
            <>
              {mark && <BookmarkIcon className="ml-1 inline size-[0.6em] align-baseline text-amber-500" fill="currentColor" aria-label="Bookmarked" />}
              {stripMarks(text, settings)}
            </>
          )
          const className = `cursor-pointer rounded-sm transition-colors ${
            isSelected ? 'bg-indigo-100' : isFocus ? 'bg-amber-100' : 'hover:bg-slate-100'
          }`
          const select = () => setSelected(isSelected ? null : { book: piece.book, section: piece.section, ref, segment: n })

          if (mishnah) {
            return (
              <p key={n} id={segmentId(ref, n)} onClick={select} className={`mb-4 ${className}`}>
                <span className="ml-2 font-bold text-indigo-600 select-none">{hebrewNumeral(n)}</span>
                {content}
              </p>
            )
          }
          return (
            <span key={n}>
              <span id={segmentId(ref, n)} onClick={select} className={className}>
                {!talmud && (
                  <sup className="ml-1 font-sans text-[0.5em] font-semibold text-indigo-500 select-none">{hebrewNumeral(n)}</sup>
                )}
                {content}
              </span>{' '}
            </span>
          )
        }

        return (
          <section key={`${ref}:${piece.from}`} className="mb-10">
            <h2 className="mb-4 border-b border-slate-200 pb-2 text-center text-[0.8em] font-semibold text-slate-600">
              {sectionHeading(piece.book, piece.section)}
            </h2>
            {visible.length === 0 && <p className="text-center font-sans text-sm text-slate-400" dir="ltr">No text available for this section.</p>}
            {mishnah ? visible.map(renderSegment) : <p className="text-justify">{visible.map(renderSegment)}</p>}
          </section>
        )
      })}

      {pieces[0] && (
        <p dir="ltr" className="mb-6 text-center font-sans text-xs text-slate-400">
          Text: {textSources[pieces[0].book.corpus]}
        </p>
      )}

      {selected && <SelectionBar place={selected} text={texts.get(selected.ref)?.segments[selected.segment - 1] ?? ''} onClose={() => setSelected(null)} bookmarkId={bookmarked.get(`${selected.ref}#${selected.segment}`)?.id} />}
    </div>
  )
}

function SelectionBar({ place, text, bookmarkId, onClose }: { place: Place; text: string; bookmarkId?: string; onClose: () => void }) {
  const save = useSaveBookmark()
  const remove = useDeleteBookmark()
  const talmud = isTalmud(place.book)
  const where = placeLabelHe(place.book, place.section, talmud ? null : place.segment)

  function toggle() {
    if (bookmarkId) {
      remove.mutate(bookmarkId, { onSuccess: onClose })
      return
    }
    const words = stripMarks(text, { vowels: false, cantillation: false }).split(' ').slice(0, 6).join(' ')
    save.mutate({ ref: place.ref, segment: place.segment, label: `${where} — ${words}…`.slice(0, 200) }, { onSuccess: onClose })
  }

  return (
    <div
      dir="ltr"
      className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl bg-slate-900 py-2 pr-2 pl-4 font-sans text-sm text-white shadow-xl"
    >
      <span dir="rtl" lang="he" className="truncate font-hebrew text-base">
        {placeLabelHe(place.book, place.section, place.segment)}
      </span>
      <Button onClick={toggle} disabled={save.isPending || remove.isPending} className={bookmarkId ? 'bg-amber-500! hover:bg-amber-400!' : ''}>
        <BookmarkIcon size={15} fill={bookmarkId ? 'currentColor' : 'none'} />
        {bookmarkId ? 'Remove bookmark' : 'Bookmark'}
      </Button>
      <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:text-white" aria-label="Clear selection">
        <X size={16} />
      </button>
    </div>
  )
}
