export interface LoginResponse {
  token: string
  role: string
  tenantId: string
  branchId?: string
  permissions: string[]
  permissionsConfigured: boolean
}

export interface AuthUser {
  username: string
  role: string
  tenantId: string
  tenantSlug: string
  scope: 'tenant' | 'platform'
  permissions: string[]
  permissionsConfigured: boolean
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ProductListItem {
  id: string
  branchId?: string
  sku?: string
  barcode?: string
  nameAr?: string
  nameEn?: string
  unit?: string
  sellPrice?: number
  currencyCode?: string
  isActive: boolean
  trackInventory: boolean
  createdAt: string
}

export interface ServiceListItem {
  id: string
  nameAr?: string
  nameEn?: string
  durationMin?: number
  isActive: boolean
  createdAt: string
  priceCents: number
  price: number
  currencyCode: string
}

export interface InvoiceListItem {
  id: string
  invoiceCode: string
  status: string
  subtotal: number
  total: number
  createdAt: string
  customerName?: string
}

export interface InvoiceLine {
  id: string
  itemType: string
  name?: string
  nameSnapshot?: string
  qty: number
  unitPrice?: number
  unitPriceCents?: number
  lineTotal?: number
  lineTotalCents?: number
  currencyCode?: string
}

export interface InvoicePayment {
  id: string
  method: number | string
  amount?: number
  amountCents?: number
  reference?: string
  paidAt: string
}

export interface InvoiceDetail {
  id: string
  invoiceCode: string
  status: string
  createdAt: string
  customerId?: string
  customerName?: string
  subtotal?: number
  total?: number
  totalPaid?: number
  remaining?: number
  lines?: InvoiceLine[]
  items?: InvoiceLine[]
  payments?: InvoicePayment[]
}

export interface Customer {
  id: string
  fullName: string
  phone?: string
  email?: string
  notes?: string
  isActive: boolean
  createdAt: string
}

export interface CashierSession {
  id: string
  openedAt: string
  closedAt?: string
  openingCashCents: number
  totalCashCents: number
  totalCardCents: number
  totalTransferCents: number
  totalRefundCents: number
  expectedCashCents: number
  actualCashCents?: number
  differenceCents?: number
  salesInvoiceCount?: number
  grossSalesCents?: number
  collectedCents?: number
  isClosed: boolean
}

export interface DailySummary {
  businessDateUtc?: string
  invoiceCount?: number
  postedInvoiceCount?: number
  paidInvoiceCount?: number
  activeCustomerCount?: number
  grossSalesCents?: number
  collectedCents?: number
  remainingCents?: number
  topProducts?: Array<{ itemType: string; name: string; quantity: number; totalCents: number; currencyCode: string }>
  topServices?: Array<{ itemType: string; name: string; quantity: number; totalCents: number; currencyCode: string }>
  recentPayments?: Array<{ paymentId: string; invoiceCode: string; method: string; amountCents: number; reference?: string; paidAt: string }>
  totalInvoices?: number
  totalSalesCents?: number
  totalCashCents?: number
  totalCardCents?: number
  totalTransferCents?: number
  topItems?: Array<{ name: string; qty: number; totalCents: number }>
}

export interface Branch {
  id: string
  tenantId?: string
  name: string
  code: string
  currencyCode: string
  isActive: boolean
  assignedUsers?: number
  createdAt: string
}

export interface TenantUser {
  id: string
  username: string
  role: string
  isActive: boolean
  licensePlan?: string
  licenseStatus?: string
  licenseStartedAt?: string
  licenseExpiresAt?: string
  createdAt: string
}

export interface Tenant {
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
  createdAt: string
}

export interface PlatformOwner {
  id: string
  username: string
  isActive: boolean
  createdAt: string
}

export interface CartItem {
  itemId: string
  itemType: 'Product' | 'Service'
  nameAr: string
  nameEn: string
  qty: number
  unitPriceCents: number
}

export const PAYMENT_METHOD_LABELS: Record<number, string> = {
  0: 'نقداً',
  1: 'بطاقة',
  2: 'تحويل بنكي',
}

export const STATUS_LABELS: Record<string, string> = {
  Draft: 'مسودة',
  Posted: 'مؤكدة',
  PartiallyPaid: 'مدفوعة جزئياً',
  Paid: 'مدفوعة',
  Cancelled: 'ملغاة',
}

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'مالك',
  TENANT: 'مستأجر',
  ADMIN: 'مسؤول',
  CASHIER: 'كاشير',
  HR: 'موارد بشرية',
  BRANCH_MANAGER: 'مدير فرع',
}
