import { useEffect, useState } from 'react'

type Health = { status: string; database: string }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold">Clonesoft</h1>
        {error && <p className="text-red-400">Backend unreachable: {error}</p>}
        {!error && !health && <p className="text-slate-400">Checking backend…</p>}
        {health && (
          <ul className="space-y-1">
            <li>
              API: <span className="text-emerald-400">{health.status}</span>
            </li>
            <li>
              Database:{' '}
              <span className={health.database === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
                {health.database}
              </span>
            </li>
          </ul>
        )}
      </div>
    </main>
  )
}

export default App
