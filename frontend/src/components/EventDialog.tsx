import { NotebookPen } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { addDays, combine, formatDay, parseDateKey, todayKey, toDateKey, toTimeInput } from '../lib/dates'
import { useCreateNote, useDeleteEvent, useSaveEvent } from '../lib/queries'
import { EVENT_COLORS, type CalendarEvent, type EventColor } from '../lib/types'
import { eventColorClasses } from '../lib/eventColors'
import { NoteSelect } from './linked'
import { Button, ErrorText, Field, inputClass, Modal } from './ui'

type Props = {
  event?: CalendarEvent // edit this event; omit to create one
  defaults?: { date?: string; noteId?: string }
  onClose: () => void
}

function initialTimes(event: CalendarEvent | undefined, date: string) {
  if (event) {
    const start = new Date(event.startsAt)
    const end = new Date(event.endsAt)
    // All-day events are stored with an exclusive end (midnight after the last day)
    const lastDay = event.allDay && end > start ? addDays(end, -1) : end
    return {
      startDate: toDateKey(start),
      startTime: toTimeInput(start),
      endDate: toDateKey(lastDay),
      endTime: toTimeInput(end),
    }
  }
  const hour = date === todayKey() ? Math.min(new Date().getHours() + 1, 22) : 9
  const pad = (n: number) => String(n).padStart(2, '0')
  return { startDate: date, startTime: `${pad(hour)}:00`, endDate: date, endTime: `${pad(hour + 1)}:00` }
}

export default function EventDialog({ event, defaults, onClose }: Props) {
  const init = initialTimes(event, defaults?.date ?? todayKey())
  const [title, setTitle] = useState(event?.title ?? '')
  const [allDay, setAllDay] = useState(event?.allDay ?? false)
  const [startDate, setStartDate] = useState(init.startDate)
  const [startTime, setStartTime] = useState(init.startTime)
  const [endDate, setEndDate] = useState(init.endDate)
  const [endTime, setEndTime] = useState(init.endTime)
  const [color, setColor] = useState<EventColor>(event?.color ?? 'blue')
  const [description, setDescription] = useState(event?.description ?? '')
  const [noteId, setNoteId] = useState(event?.noteId ?? defaults?.noteId ?? null)
  const [error, setError] = useState<string | null>(null)
  const save = useSaveEvent()
  const remove = useDeleteEvent()
  const createNote = useCreateNote()
  const navigate = useNavigate()

  function buildPayload() {
    const startsAt = allDay ? parseDateKey(startDate) : combine(startDate, startTime)
    const endsAt = allDay ? addDays(parseDateKey(endDate), 1) : combine(endDate, endTime)
    if (endsAt < startsAt) return null
    const payload = {
      title,
      description,
      allDay,
      color,
      noteId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    }
    return event ? { ...payload, id: event.id } : payload
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const payload = buildPayload()
    if (!payload) return setError('The event must end after it starts.')
    setError(null)
    save.mutate(payload, { onSuccess: onClose })
  }

  // Saves the event, creates a note linked to it, and opens that note
  async function createLinkedNote() {
    const payload = buildPayload()
    if (!payload || !title.trim()) return setError('Give the event a title and valid times first.')
    const note = await createNote.mutateAsync({ title: `${title.trim()} (${formatDay(startDate)})` })
    await save.mutateAsync({ ...payload, noteId: note.id })
    onClose()
    navigate(`/apps/notes/${note.id}`)
  }

  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input
              className={inputClass}
              type="date"
              value={startDate}
              required
              onChange={(e) => {
                setStartDate(e.target.value)
                if (endDate < e.target.value) setEndDate(e.target.value)
              }}
            />
          </Field>
          {!allDay && (
            <Field label="Start time">
              <input className={inputClass} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </Field>
          )}
          <Field label="Ends">
            <input className={inputClass} type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
          </Field>
          {!allDay && (
            <Field label="End time">
              <input className={inputClass} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </Field>
          )}
        </div>

        <Field label="Color">
          <div className="flex gap-2">
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-6 rounded-full ${eventColorClasses[c].dot} ${color === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
                aria-label={c}
              />
            ))}
          </div>
        </Field>

        <Field label="Description">
          <textarea className={`${inputClass} h-20 resize-none`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <Field label="Linked note">
          <div className="space-y-2">
            <NoteSelect value={noteId} onChange={setNoteId} />
            {noteId ? (
              <Link to={`/apps/notes/${noteId}`} onClick={onClose} className="inline-flex items-center gap-1 text-sm text-indigo-600">
                <NotebookPen size={14} /> Open note
              </Link>
            ) : (
              <Button variant="secondary" onClick={createLinkedNote} disabled={createNote.isPending || save.isPending}>
                <NotebookPen size={14} /> Create meeting note
              </Button>
            )}
          </div>
        </Field>

        <ErrorText error={error ?? save.error ?? remove.error ?? createNote.error} />
        <div className="flex items-center gap-2 pt-1">
          {event && (
            <Button variant="danger" onClick={() => remove.mutate(event.id, { onSuccess: onClose })}>
              Delete
            </Button>
          )}
          <Button variant="secondary" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
