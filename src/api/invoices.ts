import client from './client'
import type { PagedResult, InvoiceListItem, InvoiceDetail } from '../types'

export async function getInvoices(
  tenantSlug: string,
  params: { page?: number; pageSize?: number; status?: string; search?: string } = {}
): Promise<PagedResult<InvoiceListItem>> {
  const res = await client.get<PagedResult<InvoiceListItem>>(
    `/t/${tenantSlug}/invoices`,
    { params: { page: 1, pageSize: 20, ...params } }
  )
  return res.data
}

export async function getInvoice(tenantSlug: string, id: string): Promise<InvoiceDetail> {
  const res = await client.get<InvoiceDetail>(`/t/${tenantSlug}/invoices/${id}`)
  return res.data
}

export async function createInvoice(
  tenantSlug: string,
  payload: { customerId?: string } = {}
): Promise<string> {
  const res = await client.post<string>(`/t/${tenantSlug}/invoices`, payload)
  return res.data
}

export async function addInvoiceLine(
  tenantSlug: string,
  invoiceId: string,
  payload: {
    itemType: string
    itemId: string
    qty: number
    priceOverrideCents?: number
    priceOverrideReason?: string
  }
): Promise<string> {
  const res = await client.post<string>(
    `/t/${tenantSlug}/invoices/${invoiceId}/items`,
    payload
  )
  return res.data
}

export async function removeInvoiceLine(
  tenantSlug: string,
  invoiceId: string,
  lineId: string
): Promise<void> {
  await client.delete(`/t/${tenantSlug}/invoices/${invoiceId}/items/${lineId}`)
}

export async function finalizeInvoice(tenantSlug: string, invoiceId: string): Promise<void> {
  await client.post(`/t/${tenantSlug}/invoices/${invoiceId}/finalize`)
}

export async function addPayment(
  tenantSlug: string,
  invoiceId: string,
  payload: { method: number; amountCents: number; reference?: string }
): Promise<void> {
  const methodMap: Record<number, number> = {
    0: 1,
    1: 2,
    2: 3,
  }
  await client.post(`/t/${tenantSlug}/invoices/${invoiceId}/payments`, {
    ...payload,
    method: methodMap[payload.method] ?? payload.method,
  })
}

export async function requestRefund(
  tenantSlug: string,
  invoiceId: string,
  amountCents: number
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(
    `/t/${tenantSlug}/invoices/${invoiceId}/refunds`,
    { amountCents }
  )
  return res.data
}

export async function setInvoiceCustomer(
  tenantSlug: string,
  invoiceId: string,
  customerId: string | null
): Promise<void> {
  await client.post(`/t/${tenantSlug}/invoices/${invoiceId}/customer`, { customerId })
}
