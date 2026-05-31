import { create, type StateCreator } from 'zustand'

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
const lastToastAt = new Map<string, number>()
const DUPLICATE_WINDOW_MS = 4000
const DURATIONS: Record<ToastItem['type'], number> = { success: 3000, error: 4500, info: 3500 }
type ToastSet = Parameters<StateCreator<ToastState>>[0]

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  success: (message) => pushToast(set, 'success', message),
  error: (message) => pushToast(set, 'error', message),
  info: (message) => pushToast(set, 'info', message),
  remove: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

function pushToast(set: ToastSet, type: ToastItem['type'], message: string) {
  const key = type + ':' + message
  const now = Date.now()
  const last = lastToastAt.get(key) ?? 0
  if (now - last < DUPLICATE_WINDOW_MS) return
  lastToastAt.set(key, now)
  const id = ++_id
  set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
  setTimeout(() => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  }, DURATIONS[type])
}
