import { useState, type FormEvent } from 'react'
import { useDeleteTodo, useSaveTodo } from '../lib/queries'
import type { Priority, Todo } from '../lib/types'
import { NoteSelect } from './linked'
import { Button, ErrorText, Field, inputClass, Modal } from './ui'

type Props = {
  todo?: Todo // edit this todo; omit to create one
  defaults?: { dueDate?: string; noteId?: string }
  onClose: () => void
}

export default function TodoDialog({ todo, defaults, onClose }: Props) {
  const [title, setTitle] = useState(todo?.title ?? '')
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? defaults?.dueDate ?? '')
  const [priority, setPriority] = useState<Priority>(todo?.priority ?? 0)
  const [noteId, setNoteId] = useState(todo?.noteId ?? defaults?.noteId ?? null)
  const save = useSaveTodo()
  const remove = useDeleteTodo()

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate({ id: todo?.id, title, dueDate: dueDate || null, priority, noteId }, { onSuccess: onClose })
  }

  return (
    <Modal title={todo ? 'Edit todo' : 'New todo'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <input className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Priority">
            <select
              className={inputClass}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as Priority)}
            >
              <option value={0}>None</option>
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High</option>
            </select>
          </Field>
        </div>
        <Field label="Linked note">
          <NoteSelect value={noteId} onChange={setNoteId} />
        </Field>
        <ErrorText error={save.error ?? remove.error} />
        <div className="flex items-center gap-2 pt-1">
          {todo && (
            <Button variant="danger" onClick={() => remove.mutate(todo.id, { onSuccess: onClose })}>
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
