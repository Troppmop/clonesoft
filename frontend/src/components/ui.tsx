import { X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
  danger: 'text-red-600 hover:bg-red-50 disabled:text-red-300',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <Button variant="ghost" className="px-1.5!" onClick={onClose} aria-label="Close">
            <X size={18} />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`size-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 ${className}`}
      aria-label="Loading"
    />
  )
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return <p className="text-sm text-red-600">{error instanceof Error ? error.message : String(error)}</p>
}
