import client from './client'
import type { CashierSession, DailySummary, PagedResult } from '../types'

export async function getCurrentSession(tenantSlug: string): Promise<CashierSession | null> {
  try {
    const res = await client.get<CashierSession>(`/t/${tenantSlug}/cashier/current`)
    return res.data
  } catch {
    return null
  }
}

export async function getSessions(
  tenantSlug: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<PagedResult<CashierSession>> {
  const res = await client.get<PagedResult<CashierSession>>(
    `/t/${tenantSlug}/cashier/sessions`,
    { params: { page: 1, pageSize: 20, ...params } }
  )
  return res.data
}

export async function getDailySummary(tenantSlug: string): Promise<DailySummary> {
  const res = await client.get<DailySummary>(`/t/${tenantSlug}/cashier/daily-summary`)
  return res.data
}

export async function openSession(
  tenantSlug: string,
  openingCashCents: number
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(`/t/${tenantSlug}/cashier/open`, {
    openingCashCents,
  })
  return res.data
}

export async function closeSession(
  tenantSlug: string,
  sessionId: string,
  actualCashCents: number,
  discrepancyReason?: string
): Promise<CashierSession> {
  const res = await client.post<CashierSession>(
    `/t/${tenantSlug}/cashier/${sessionId}/close`,
    { actualCashCents, discrepancyReason }
  )
  return res.data
}
