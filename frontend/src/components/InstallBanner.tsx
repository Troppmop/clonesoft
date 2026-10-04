import { Download, Share, X } from 'lucide-react'
import { useState } from 'react'
import { isIOS, isStandalone, useInstallPrompt } from '../lib/install'
import { Button } from './ui'

const DISMISS_KEY = 'install.dismissedAt'
const DISMISS_DAYS = 14

function recentlyDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY))
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch {
    return false
  }
}

/** Invites the user to install the site as an app, until they install it or dismiss the invitation. */
export default function InstallBanner() {
  const { canPrompt, install } = useInstallPrompt()
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed())
  const ios = isIOS()

  if (hidden || (!canPrompt && !ios)) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // Without storage the banner just comes back next visit
    }
    setHidden(true)
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white">
        {ios ? <Share size={18} /> : <Download size={18} />}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-indigo-950">Install Clonesoft as an app</p>
        {ios ? (
          <p className="mt-0.5 text-indigo-900/80">
            Tap <Share size={13} className="inline align-text-bottom" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            On iPhone and iPad, reading reminders only work from the installed app.
          </p>
        ) : (
          <p className="mt-0.5 text-indigo-900/80">
            Open your reading from your home screen or desktop in its own window, and get reminders even when the browser is closed.
          </p>
        )}
        {canPrompt && (
          <Button className="mt-3" onClick={() => install().then((ok) => ok && setHidden(true))}>
            <Download size={15} /> Install
          </Button>
        )}
      </div>
      <button type="button" onClick={dismiss} className="rounded p-1 text-indigo-400 hover:text-indigo-700" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  )
}
