import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Lang = 'ar' | 'en'

interface LangState {
  lang: Lang
  setLang: (l: Lang) => void
  toggle: () => void
}

export const useLangStore = create<LangState>()(
  persist(
    (set, get) => ({
      lang: 'ar',
      setLang: (lang) => set({ lang }),
      toggle: () => set({ lang: get().lang === 'ar' ? 'en' : 'ar' }),
    }),
    { name: 'ayapos-lang' }
  )
)
