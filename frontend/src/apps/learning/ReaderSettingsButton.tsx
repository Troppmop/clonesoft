import { Minus, Plus, Type } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { FONT_SIZES, setReaderSettings, useReaderSettings } from './readerSettings'

export default function ReaderSettingsButton({ showCantillation }: { showCantillation: boolean }) {
  const settings = useReaderSettings()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current?.contains(e.target as Node) || setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const size = (step: number) =>
    setReaderSettings({
      fontSize: Math.min(FONT_SIZES.max, Math.max(FONT_SIZES.min, settings.fontSize + step * FONT_SIZES.step)),
    })

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" onClick={() => setOpen(!open)} aria-label="Text settings" aria-expanded={open}>
        <Type size={17} />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="mb-2 text-xs font-medium text-slate-500">Text size</p>
          <div className="mb-4 flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => size(-1)} disabled={settings.fontSize <= FONT_SIZES.min} aria-label="Smaller text">
              <Minus size={15} />
            </Button>
            <span className="font-hebrew text-slate-700" style={{ fontSize: Math.min(settings.fontSize, 30) }} lang="he">
              אבג
            </span>
            <Button variant="secondary" onClick={() => size(1)} disabled={settings.fontSize >= FONT_SIZES.max} aria-label="Larger text">
              <Plus size={15} />
            </Button>
          </div>
          <Toggle label="Vowels (nikud)" checked={settings.vowels} onChange={(vowels) => setReaderSettings({ vowels })} />
          {showCantillation && (
            <Toggle
              label="Cantillation (te'amim)"
              checked={settings.cantillation}
              onChange={(cantillation) => setReaderSettings({ cantillation })}
            />
          )}
        </div>
      )}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5 text-sm text-slate-700">
      {label}
      <input type="checkbox" className="size-4 accent-indigo-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
