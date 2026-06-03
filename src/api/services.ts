import client from './client'
import type { PagedResult, ServiceListItem } from '../types'

export async function getServices(
  tenantSlug: string,
  params: { page?: number; pageSize?: number } = {}
): Promise<PagedResult<ServiceListItem>> {
  const res = await client.get<PagedResult<ServiceListItem>>(
    `/t/${tenantSlug}/services`,
    { params: { page: 1, pageSize: 50, ...params } }
  )
  return res.data
}

export async function createService(
  tenantSlug: string,
  payload: {
    nameAr: string
    nameEn?: string
    durationMin?: number
    price: number        // decimal AED e.g. 50.00
    currencyCode?: string
    isActive?: boolean
  }
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(`/t/${tenantSlug}/services`, payload)
  return res.data
}

export async function updateService(
  tenantSlug: string,
  id: string,
  payload: {
    nameAr?: string
    nameEn?: string
    durationMin?: number
    price?: number       // decimal AED e.g. 50.00
    isActive?: boolean
    currencyCode?: string
  }
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(`/t/${tenantSlug}/services/${id}`, payload)
  return res.data
}

export async function deleteService(tenantSlug: string, id: string): Promise<void> {
  await client.delete(`/t/${tenantSlug}/services/${id}`)
}
