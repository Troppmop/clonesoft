import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import CalendarApp from './apps/calendar/CalendarApp'
import Bookmarks from './apps/learning/Bookmarks'
import LearningDashboard from './apps/learning/Dashboard'
import Library from './apps/learning/Library'
import PlanPage from './apps/learning/PlanPage'
import PortionReader from './apps/learning/PortionReader'
import SectionReader from './apps/learning/SectionReader'
import NoteEditor from './apps/notes/NoteEditor'
import NotesApp, { NoNoteSelected } from './apps/notes/NotesApp'
import TodosApp from './apps/todos/TodosApp'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import { useMe } from './lib/queries'
import AuthPage from './pages/AuthPage'
import Home from './pages/Home'

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe()
  const location = useLocation()
  if (isLoading) return <Spinner className="m-auto mt-24" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useMe()
  if (isLoading) return <Spinner className="m-auto mt-24" />
  if (user) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="apps/notes" element={<NotesApp />}>
          <Route index element={<NoNoteSelected />} />
          <Route path=":noteId" element={<NoteEditor />} />
        </Route>
        <Route path="apps/todos" element={<TodosApp />} />
        <Route path="apps/calendar" element={<CalendarApp />} />
        <Route path="apps/learning">
          <Route index element={<LearningDashboard />} />
          <Route path="library" element={<Library />} />
          <Route path="bookmarks" element={<Bookmarks />} />
          <Route path="plans/:planId" element={<PlanPage />} />
          <Route path="plans/:planId/day/:day" element={<PortionReader />} />
          <Route path="read/:book/:section" element={<SectionReader />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
