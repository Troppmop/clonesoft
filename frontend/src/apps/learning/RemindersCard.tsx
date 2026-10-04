import { Bell, BellOff, BellRing } from 'lucide-react'
import { useState } from 'react'
import { Button, ErrorText } from '../../components/ui'
import { api } from '../../lib/api'
import { disablePush, enablePush, usePush } from '../../lib/push'

/** Shows whether this device gets reading reminders, and turns them on or off. */
export default function RemindersCard({ compact = false }: { compact?: boolean }) {
  const { state, refresh } = usePush()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [tested, setTested] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
      refresh()
    }
  }

  if (state === 'loading') return null
  if (compact && state === 'on') return null

  const messages = {
    on: 'Reminders are on for this device.',
    off: 'Turn on notifications to get your daily reading reminders on this device.',
    denied: "Notifications are blocked for this site. Allow them in your browser's site settings to get reminders.",
    'needs-install': 'On iPhone and iPad, reminders work once Clonesoft is added to your Home Screen. Open it from there to turn them on.',
    unsupported: "This browser doesn't support notifications, so reminders can't be shown here.",
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${state === 'on' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {state === 'on' ? <BellRing size={18} /> : state === 'off' ? <Bell size={18} /> : <BellOff size={18} />}
        </span>
        <p className="min-w-0 flex-1 text-sm text-slate-700">{messages[state]}</p>
        {state === 'off' && (
          <Button disabled={busy} onClick={() => run(enablePush)}>
            Turn on
          </Button>
        )}
        {state === 'on' && (
          <div className="flex gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => run(async () => { await api.push.test(); setTested(true) })}>
              {tested ? 'Sent' : 'Send a test'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => run(disablePush)}>
              Turn off
            </Button>
          </div>
        )}
      </div>
      {error ? <div className="mt-2"><ErrorText error={error} /></div> : null}
    </div>
  )
}
