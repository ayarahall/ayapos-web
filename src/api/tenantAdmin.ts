import client from './client'

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
  const res = await client.get<TenantBranch[]>('/tenant-admin/branches')
  return res.data
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
