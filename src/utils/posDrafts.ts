import type { CartItem } from '../types'

export interface PosDraftTab {
  id: string
  appointmentId?: string
  customerId?: string
  customerName?: string
  label: string
  items: CartItem[]
}

const STORAGE_KEY = 'ayapos.posDraftTabs.v1'

export const readPosDraftTabs = (): PosDraftTab[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const writePosDraftTabs = (tabs: PosDraftTab[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  window.dispatchEvent(new Event('ayapos:pos-drafts-changed'))
}

export const upsertPosDraftTab = (draft: PosDraftTab) => {
  const tabs = readPosDraftTabs()
  const next = [draft, ...tabs.filter((tab) => tab.id !== draft.id)]
  writePosDraftTabs(next)
  return next
}

export const removePosDraftTab = (draftId: string) => {
  const next = readPosDraftTabs().filter((tab) => tab.id !== draftId)
  writePosDraftTabs(next)
  return next
}
