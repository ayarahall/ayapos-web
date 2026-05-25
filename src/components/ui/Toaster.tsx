import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useToastStore } from '../../store/toastStore'

const styles = {
  success: 'bg-green-600',
  error:   'bg-red-600',
  info:    'bg-blue-600',
}

const Icons = {
  success: CheckCircle2,
  error:   XCircle,
  info:    Info,
}

export default function Toaster() {
  const { toasts, remove } = useToastStore()

  return (
    <div className="fixed top-4 end-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const Icon = Icons[t.type]
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl
              text-white text-sm font-medium min-w-[240px] max-w-sm
              animate-in slide-in-from-right-4 fade-in duration-200
              ${styles[t.type]}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
