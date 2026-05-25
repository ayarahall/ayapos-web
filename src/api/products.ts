import client from './client'
import type { PagedResult, ProductListItem } from '../types'

export async function getProducts(
  tenantSlug: string,
  params: { page?: number; pageSize?: number; search?: string } = {}
): Promise<PagedResult<ProductListItem>> {
  const res = await client.get<PagedResult<ProductListItem>>(
    `/t/${tenantSlug}/products`,
    { params: { page: 1, pageSize: 20, ...params } }
  )
  return res.data
}

export async function getProduct(tenantSlug: string, id: string): Promise<ProductListItem> {
  const res = await client.get<ProductListItem>(`/t/${tenantSlug}/products/${id}`)
  return res.data
}

export async function createProduct(
  tenantSlug: string,
  payload: {
    sku?: string
    barcode?: string
    nameAr: string
    nameEn?: string
    unit?: string
    sellPrice: number
    currencyCode?: string
    trackInventory?: boolean
  }
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(`/t/${tenantSlug}/products`, payload)
  return res.data
}

export async function updateProduct(
  tenantSlug: string,
  id: string,
  payload: {
    sku?: string
    barcode?: string
    nameAr?: string
    nameEn?: string
    unit?: string
    sellPrice?: number
    isActive?: boolean
  }
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(`/t/${tenantSlug}/products/${id}`, payload)
  return res.data
}

export async function deleteProduct(tenantSlug: string, id: string): Promise<void> {
  await client.delete(`/t/${tenantSlug}/products/${id}`)
}
