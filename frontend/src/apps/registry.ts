import { BookOpen, CalendarDays, ListChecks, NotebookPen, type LucideIcon } from 'lucide-react'

// Every app on the home screen is registered here. To add an app: create its folder under
// src/apps/, add an entry below, and add its route in App.tsx.
export type AppDef = {
  id: string
  name: string
  description: string
  path: string
  icon: LucideIcon
  accent: string // Tailwind classes for the icon tile
  keywords: string[]
}

export const apps: AppDef[] = [
  {
    id: 'notes',
    name: 'Notes',
    description: 'Write notes that save as you type. Link todos and events to them.',
    path: '/apps/notes',
    icon: NotebookPen,
    accent: 'bg-amber-100 text-amber-700',
    keywords: ['notepad', 'text', 'write', 'memo', 'document'],
  },
  {
    id: 'todos',
    name: 'Todo',
    description: 'Track tasks with due dates and priorities. Due tasks show on your calendar.',
    path: '/apps/todos',
    icon: ListChecks,
    accent: 'bg-emerald-100 text-emerald-700',
    keywords: ['tasks', 'checklist', 'reminders', 'list'],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Plan events by month, and see what is due each day.',
    path: '/apps/calendar',
    icon: CalendarDays,
    accent: 'bg-sky-100 text-sky-700',
    keywords: ['events', 'schedule', 'agenda', 'dates', 'planner'],
  },
  {
    id: 'learning',
    name: 'Learning',
    description: 'Read Tanach, Mishna and Talmud in Hebrew, divided into daily portions, with reminders.',
    path: '/apps/learning',
    icon: BookOpen,
    accent: 'bg-violet-100 text-violet-700',
    keywords: ['torah', 'tanach', 'tanakh', 'bible', 'mishna', 'mishnah', 'talmud', 'gemara', 'shas', 'daf yomi', 'hebrew', 'study', 'reading'],
  },
]

export function searchApps(q: string): AppDef[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return apps
  return apps.filter((a) =>
    [a.name, a.description, ...a.keywords].some((s) => s.toLowerCase().includes(needle)),
  )
}
