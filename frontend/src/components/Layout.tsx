import { useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, LogOut } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { apps } from '../apps/registry'
import { api } from '../lib/api'
import { disablePush } from '../lib/push'
import { keys, useMe } from '../lib/queries'
import { Button } from './ui'

export default function Layout() {
  const { data: user } = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()

  async function logout() {
    // Stop this device getting the account's reminders once nobody is signed in on it
    await disablePush().catch(() => {})
    await api.auth.logout().catch(() => {})
    qc.clear()
    qc.setQueryData(keys.me, null)
    navigate('/login')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
        <NavLink to="/" className="mr-2 flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-white">
            <LayoutGrid size={16} />
          </span>
          <span className="hidden sm:inline">Clonesoft</span>
        </NavLink>
        <nav className="flex items-center gap-1">
          {apps.map((app) => (
            <NavLink
              key={app.id}
              to={app.path}
              title={app.name}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium ${
                  isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'
                }`
              }
            >
              <app.icon size={16} />
              <span className="hidden md:inline">{app.name}</span>
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-slate-500 sm:inline">{user?.displayName}</span>
          <Button variant="ghost" onClick={logout} title="Log out">
            <LogOut size={16} />
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
