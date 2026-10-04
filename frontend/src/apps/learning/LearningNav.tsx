import type { ReactNode } from 'react'
import { NavLink } from 'react-router'

const tabs = [
  { to: '/apps/learning', label: 'Plans', end: true },
  { to: '/apps/learning/library', label: 'Library', end: false },
  { to: '/apps/learning/bookmarks', label: 'Bookmarks', end: false },
]

/** Page header for the Learning app's top-level pages, with tabs between them. */
export default function LearningNav({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {action}
      </div>
      <nav className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                isActive ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-900'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
