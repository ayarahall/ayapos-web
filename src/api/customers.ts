import client from './client'
import type { PagedResult, Customer } from '../types'

export async function getCustomers(
  tenantSlug: string,
  params: { page?: number; pageSize?: number; q?: string } = {}
): Promise<PagedResult<Customer>> {
  const res = await client.get<PagedResult<Customer>>(
    `/t/${tenantSlug}/customers`,
    { params: { page: 1, pageSize: 20, ...params } }
  )
  return res.data
}

export async function createCustomer(
  tenantSlug: string,
  payload: { fullName: string; phone?: string; email?: string; notes?: string }
): Promise<string> {
  const res = await client.post<string>(`/t/${tenantSlug}/customers`, payload)
  return res.data
}

export async function updateCustomer(
  tenantSlug: string,
  id: string,
  payload: { fullName?: string; phone?: string; email?: string; notes?: string }
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(`/t/${tenantSlug}/customers/${id}`, payload)
  return res.data
}
