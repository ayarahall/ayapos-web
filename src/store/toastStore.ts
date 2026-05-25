import { create } from 'zustand'

interface ToastItem {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

interface ToastState {
  toasts: ToastItem[]
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  remove: (id: number) => void
}

let _id = 0
const DURATIONS = { success: 3000, error: 4500, info: 3500 }

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  success: (message) => _push(set, 'success', message),
  error:   (message) => _push(set, 'error',   message),
  info:    (message) => _push(set, 'info',    message),
  remove:  (id)      => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

function _push(
  set: Parameters<typeof create<ToastState>>[0] extends (set: infer S) => unknown ? S : never,
  type: ToastItem['type'],
  message: string,
) {
  const id = ++_id
  set(s => ({ toasts: [...s.toasts, { id, type, message }] }))
  setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), DURATIONS[type])
}
