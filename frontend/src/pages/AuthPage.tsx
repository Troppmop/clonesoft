import { useQueryClient } from '@tanstack/react-query'
import { LayoutGrid } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button, ErrorText, Field, inputClass } from '../components/ui'
import { api } from '../lib/api'
import { keys } from '../lib/queries'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const isLogin = mode === 'login'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = isLogin
        ? await api.auth.login(email, password)
        : await api.auth.register(displayName, email, password)
      qc.setQueryData(keys.me, user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-indigo-600 text-white">
            <LayoutGrid size={22} />
          </span>
          <h1 className="text-xl font-semibold">{isLogin ? 'Sign in to Clonesoft' : 'Create your account'}</h1>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {!isLogin && (
            <Field label="Name">
              <input
                className={inputClass}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
                maxLength={60}
              />
            </Field>
          )}
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={isLogin ? undefined : 8}
              maxLength={72}
              required
            />
          </Field>
          <ErrorText error={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {isLogin ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <Link to={isLogin ? '/register' : '/login'} state={{ from }} className="font-medium text-indigo-600">
            {isLogin ? 'Create one' : 'Sign in'}
          </Link>
        </p>
      </div>
    </div>
  )
}
