import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '../types'

interface AuthState {
  token: string | null
  user: AuthUser | null
  branchId: string | null
  setAuth: (token: string, user: AuthUser) => void
  setBranchId: (branchId: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      branchId: null,
      setAuth: (token, user) => set({ token, user }),
      setBranchId: (branchId) => set({ branchId }),
      logout: () => set({ token: null, user: null, branchId: null }),
    }),
    {
      name: 'ayapos-auth',
    }
  )
)
