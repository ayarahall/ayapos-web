import client from './client'
import type { PagedResult } from '../types'

export interface Expense {
  id: string
  title: string
  category: string
  amount: number
  currencyCode: string
  expenseDate: string
  status: string
  notes: string
  createdAt: string
}

export interface AiReceiptResult {
  title: string
  category: string
  amount: number
  currencyCode: string
  expenseDate: string
  notes: string
  vendorName: string
  confidence: number
  rawSummary: string
}

export interface AiStatus {
  enabled: boolean
  message: string
}

export async function getExpenses(
  tenantSlug: string,
  params: { page?: number; pageSize?: number; category?: string; q?: string } = {}
): Promise<PagedResult<Expense>> {
  const res = await client.get<PagedResult<Expense>>(
    `/t/${tenantSlug}/expenses`,
    { params: { page: 1, pageSize: 20, ...params } }
  )
  return res.data
}

export async function getAiStatus(tenantSlug: string): Promise<AiStatus> {
  const res = await client.get<AiStatus>(`/t/${tenantSlug}/expenses/ai-status`)
  return res.data
}

export async function createExpense(
  tenantSlug: string,
  payload: {
    title: string
    category: string
    amount: number
    currencyCode?: string
    expenseDate: string
    notes?: string
  }
): Promise<string> {
  const res = await client.post<string>(`/t/${tenantSlug}/expenses`, payload)
  return res.data
}

export async function analyzeReceipt(
  tenantSlug: string,
  file: File
): Promise<AiReceiptResult> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await client.post<AiReceiptResult>(
    `/t/${tenantSlug}/expenses/analyze-receipt`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return res.data
}

export async function updateExpenseStatus(
  tenantSlug: string,
  expenseId: string,
  status: string
): Promise<Expense> {
  const res = await client.post<Expense>(
    `/t/${tenantSlug}/expenses/${expenseId}/status`,
    { status }
  )
  return res.data
}
