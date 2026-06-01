import client from './client'
import { useAuthStore } from '../store/authStore'
import { getTenantBranches as getPublicTenantBranches } from './auth'

export interface TenantSummary {
  id: string
  name: string
  slug: string
  status: string
  licensePlan: string
  licenseStatus: string
  maxUsers: number
  assignedUsers: number
  licenseStartedAt?: string
  licenseExpiresAt?: string
}

export interface ServiceImportIssue {
  rowNumber: number
  message: string
}

export interface ServiceImportResult {
  totalRows: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  issues: ServiceImportIssue[]
}

export interface BranchUser {
  id: string
  branchId: string
  username: string
  role: string
  isActive: boolean
  licensePlan: string
  licenseStatus: string
  licenseStartedAt: string
  licenseExpiresAt: string
  createdAt: string
  permissions: string[]
  permissionsConfigured: boolean
}

export interface PrintSettings {
  companyName: string | null
  companyLogoUrl: string | null
  companyPhone: string | null
  companyAddress: string | null
  companyTaxNumber: string | null
  receiptTitle: string
  receiptHeaderLine1: string | null
  receiptHeaderLine2: string | null
  receiptFooterNote: string | null
  showBranchNameOnReceipt: boolean
  showCustomerNameOnReceipt: boolean
  showPaymentHistoryOnReceipt: boolean
  autoPrintReceiptAfterPayment: boolean
}

export interface TenantBranch {
  id: string
  tenantId: string
  name: string
  code: string
  currencyCode: string
  isActive: boolean
  assignedUsers: number
  hasPosWorkspace?: boolean
  hasPrintSettings?: boolean
  nextInvoiceNumber?: number
  createdAt?: string
}

export async function getTenantSummary(): Promise<TenantSummary> {
  const res = await client.get<TenantSummary>('/tenant-admin/tenant')
  return res.data
}

export async function getTenantBranches(): Promise<TenantBranch[]> {
  const tenantSlug = useAuthStore.getState().user?.tenantSlug?.trim()

  try {
    const res = await client.get<TenantBranch[]>('/tenant-admin/branches')
    if (res.data.length > 0 || !tenantSlug) return res.data
  } catch (error) {
    if (!tenantSlug) throw error
  }

  const publicBranches = await getPublicTenantBranches(tenantSlug)
  const tenantId = useAuthStore.getState().user?.tenantId ?? ''
  return publicBranches.map((branch) => ({
    ...branch,
    tenantId: branch.tenantId ?? tenantId,
    isActive: branch.isActive ?? true,
    assignedUsers: branch.assignedUsers ?? 0,
  }))
}

export async function createTenantAdminBranch(payload: {
  name: string
  code: string
  currencyCode?: string
}): Promise<TenantBranch> {
  const res = await client.post<TenantBranch>('/tenant-admin/branches', payload)
  return res.data
}

export async function getBranchUsers(branchId: string): Promise<BranchUser[]> {
  const res = await client.get<BranchUser[]>(`/tenant-admin/branches/${branchId}/users`)
  return res.data
}

export async function createBranchUser(branchId: string, payload: {
  username: string
  role: string
  password?: string
  pin: string
  licensePlan?: string
}): Promise<BranchUser> {
  const res = await client.post<BranchUser>(`/tenant-admin/branches/${branchId}/users`, {
    licensePlan: 'MONTHLY',
    ...payload,
  })
  return res.data
}

export async function setBranchUserPassword(branchId: string, userId: string, newPassword: string): Promise<void> {
  await client.post(`/tenant-admin/branches/${branchId}/users/${userId}/password`, { newPassword })
}

export async function updateBranchUserPermissions(
  branchId: string,
  userId: string,
  permissions: string[]
): Promise<BranchUser> {
  const res = await client.post<BranchUser>(
    `/tenant-admin/branches/${branchId}/users/${userId}/permissions`,
    { permissions }
  )
  return res.data
}

export async function getPrintSettings(branchId: string): Promise<PrintSettings> {
  const res = await client.get<PrintSettings>(`/tenant-admin/branches/${branchId}/print-settings`)
  return res.data
}

export async function updatePrintSettings(branchId: string, payload: PrintSettings): Promise<PrintSettings> {
  const res = await client.post<PrintSettings>(`/tenant-admin/branches/${branchId}/print-settings`, payload)
  return res.data
}

export async function updateBranch(branchId: string, payload: {
  name: string
  code: string
  currencyCode: string
  isActive: boolean
}): Promise<TenantBranch> {
  const res = await client.post<TenantBranch>(`/tenant-admin/branches/${branchId}`, payload)
  return res.data
}

export async function updateBranchUserLicense(
  branchId: string,
  userId: string,
  payload: { licensePlan: string; isActive: boolean; licenseStartedAt?: string }
): Promise<BranchUser> {
  const res = await client.post<BranchUser>(
    `/tenant-admin/branches/${branchId}/users/${userId}/license`,
    payload
  )
  return res.data
}

export async function importBranchServices(branchId: string, file: File): Promise<ServiceImportResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post<ServiceImportResult>(
    `/tenant-admin/branches/${branchId}/services/import`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return res.data
}

export interface FeatureSettings {
  appointmentsRequireCustomer: boolean
  appointmentsPreventOverlap: boolean
  appointmentsAutoNoShow: boolean
  appointmentsCheckInCreatesInvoice: boolean
  appointmentsAllowNoShow: boolean
  appointmentsAllowCancel: boolean
  expensesRequireApproval: boolean
  expensesDeductCash: boolean
  expensesNotifyApprovers: boolean
  expensesAllowAiAssist: boolean
  posRequirePaymentReference: boolean
  posRequireAppointment: boolean
  posAutoPrintReceipt: boolean
  posAllowMultipleInvoiceTabs: boolean
}

export const defaultFeatureSettings: FeatureSettings = {
  appointmentsRequireCustomer: true,
  appointmentsPreventOverlap: true,
  appointmentsAutoNoShow: true,
  appointmentsCheckInCreatesInvoice: true,
  appointmentsAllowNoShow: true,
  appointmentsAllowCancel: true,
  expensesRequireApproval: true,
  expensesDeductCash: true,
  expensesNotifyApprovers: true,
  expensesAllowAiAssist: false,
  posRequirePaymentReference: false,
  posRequireAppointment: false,
  posAutoPrintReceipt: false,
  posAllowMultipleInvoiceTabs: true,
}

export async function getAdminFeatureSettings(branchId: string): Promise<FeatureSettings> {
  const res = await client.get<FeatureSettings>(`/tenant-admin/branches/${branchId}/feature-settings`)
  return res.data
}

export async function updateAdminFeatureSettings(branchId: string, settings: FeatureSettings): Promise<FeatureSettings> {
  const res = await client.post<FeatureSettings>(`/tenant-admin/branches/${branchId}/feature-settings`, settings)
  return res.data
}

export async function getBranchFeatureSettings(tenantSlug: string): Promise<FeatureSettings> {
  const res = await client.get<FeatureSettings>(`/t/${tenantSlug}/branch-settings/features`)
  return res.data
}

export async function importBranchProducts(branchId: string, file: File): Promise<ServiceImportResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post<ServiceImportResult>(
    `/tenant-admin/branches/${branchId}/products/import`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return res.data
}
