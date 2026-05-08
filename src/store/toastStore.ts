import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  description?: string
  duration: number
}

interface ToastStore {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string
  dismiss: (id: string) => void
  clear: () => void
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3000,
  info: 3500,
  warning: 5000,
  error: 6000,
}

let nextId = 0
const newId = () => `t-${Date.now()}-${++nextId}`

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: ({ kind, title, description, duration }) => {
    const id = newId()
    const finalDuration = duration ?? DEFAULT_DURATION[kind]
    set((s) => ({ toasts: [...s.toasts, { id, kind, title, description, duration: finalDuration }] }))
    if (finalDuration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, finalDuration)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

// Imperative helpers usable from non-component code (services, utils, hooks).
// Internally calls into the same store the <ToastContainer/> subscribes to.
type ToastInput = string | { title: string; description?: string; duration?: number }

function normalize(input: ToastInput): { title: string; description?: string; duration?: number } {
  return typeof input === 'string' ? { title: input } : input
}

export const toast = {
  success: (input: ToastInput) =>
    useToastStore.getState().push({ kind: 'success', ...normalize(input) }),
  error: (input: ToastInput) =>
    useToastStore.getState().push({ kind: 'error', ...normalize(input) }),
  warning: (input: ToastInput) =>
    useToastStore.getState().push({ kind: 'warning', ...normalize(input) }),
  info: (input: ToastInput) =>
    useToastStore.getState().push({ kind: 'info', ...normalize(input) }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
}
