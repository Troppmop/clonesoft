import type { EventColor } from './types'

export const eventColorClasses: Record<EventColor, { dot: string; chip: string }> = {
  blue: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-800 border-blue-200' },
  green: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  red: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-800 border-red-200' },
  amber: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  purple: { dot: 'bg-purple-500', chip: 'bg-purple-50 text-purple-800 border-purple-200' },
  slate: { dot: 'bg-slate-500', chip: 'bg-slate-100 text-slate-700 border-slate-200' },
}
