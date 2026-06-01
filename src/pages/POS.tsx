import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, Search, Plus, Minus, CreditCard, DollarSign,
  Building2, ChevronRight, X, Package, Wrench, Pencil, UserPlus, Printer,
} from 'lucide-react'
import { getProducts } from '../api/products'
import { getServices } from '../api/services'
import { createCustomer, getCustomers } from '../api/customers'
import { getTenantBranches } from '../api/auth'
import { getCurrentSession, openSession, closeSession } from '../api/cashier'
import { createInvoice, addInvoiceLine, finalizeInvoice, addPayment, getInvoices, getInvoice } from '../api/invoices'
import { updateAppointmentStatus, createAppointment, getResources } from '../api/appointments'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/authStore'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import type { Branch, CartItem, Customer, InvoiceDetail, ProductListItem, ServiceListItem } from '../types'
import { getBranchFeatureSettings, defaultFeatureSettings } from '../api/tenantAdmin'
import { addMinutesToDateTimeValue, formatDateTime, toApiLocalDateTime, toDubaiDateTimeValue } from '../utils/date'
import { readPosDraftTabs, removePosDraftTab, writePosDraftTabs, upsertPosDraftTab, type PosDraftTab } from '../utils/posDrafts'

interface SaleCartItem extends CartItem {
  originalUnitPriceCents: number
  priceOverrideReason?: string
}

interface CartEditForm {
  qty: string
  unitPrice: string
  reason: string
}

interface CustomerForm {
  fullName: string
  phone: string
  email: string
}

type PadTarget = 'qty' | 'price' | 'paid'

const fmt = (cents: number) =>
  new Intl.NumberFormat('ar-AE', { minimumFractionDigits: 2 }).format(cents / 100)

const toCents = (value: string) => Math.max(0, Math.round(parseFloat(value || '0') * 100))
const toMoney = (cents: number) => (cents / 100).toFixed(2)

const fmtAmount = (amount: number | undefined) =>
  new Intl.NumberFormat('ar-AE', { minimumFractionDigits: 2 }).format(amount ?? 0)

const paymentMethodLabel = (method: number | string) => {
  if (method === 0 || method === 1 || method === 'Cash') return 'نقدا'
  if (method === 2 || method === 'Card') return 'بطاقة'
  if (method === 3 || method === 'BankTransfer' || method === 'Transfer') return 'تحويل'
  return String(method)
}

const escapeHtml = (value: string | undefined | null) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))

const getNextInvoiceCode = (latestCode?: string) => {
  const match = latestCode?.match(/^(.*?)(\d+)$/)
  if (!match) return 'INV-000001'

  const [, prefix, numberPart] = match
  const nextNumber = Number(numberPart) + 1
  return `${prefix}${String(nextNumber).padStart(numberPart.length, '0')}`
}

const toSaleCartItems = (items: CartItem[]): SaleCartItem[] =>
  items.map((item) => ({
    ...item,
    originalUnitPriceCents: (item as SaleCartItem).originalUnitPriceCents ?? item.unitPriceCents,
  }))
const getLinkedAppointmentFromDraft = (draft?: PosDraftTab | null) => {
  if (!draft) return null
  const appointmentId = draft.appointmentId
    ?? (draft.id.startsWith('appointment:') ? draft.id.slice('appointment:'.length) : undefined)
  return appointmentId ? { appointmentId, branchId: draft.branchId } : null
}

export default function POS() {
  const qc = useQueryClient()
  const { user, branchId, setBranchId } = useAuthStore()
  const slug = user?.tenantSlug ?? ''

  const [tab, setTab] = useState<'products' | 'services'>('products')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<SaleCartItem[]>(() => toSaleCartItems(readPosDraftTabs()[0]?.items ?? []))
  const [openSessionModal, setOpenSessionModal] = useState(false)
  const [openingCash, setOpeningCash] = useState('')
  const [closeSessionModal, setCloseSessionModal] = useState(false)
  const [actualCash, setActualCash] = useState('')
  const [discrepancyReason, setDiscrepancyReason] = useState('')
  const [payModal, setPayModal] = useState(false)
  const [payMethod, setPayMethod] = useState<0 | 1 | 2>(0)
  const [payAmount, setPayAmount] = useState('')
  const [payRef, setPayRef] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<SaleCartItem | null>(null)
  const [editForm, setEditForm] = useState<CartEditForm>({ qty: '1', unitPrice: '0.00', reason: '' })
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => readPosDraftTabs()[0]?.customerId ?? '')
  const [customerSearch, setCustomerSearch] = useState(() => readPosDraftTabs()[0]?.customerName ?? '')
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [customerForm, setCustomerForm] = useState<CustomerForm>({ fullName: '', phone: '', email: '' })
  const [padTarget, setPadTarget] = useState<PadTarget>('qty')
  const [padBuffer, setPadBuffer] = useState('')
  const [completedInvoice, setCompletedInvoice] = useState<InvoiceDetail | null>(null)
  const [appointmentUpdateFailed, setAppointmentUpdateFailed] = useState(false)
  const [completedInvoiceLinkedAppointment, setCompletedInvoiceLinkedAppointment] = useState<{ id: string; branchId?: string } | null>(null)
  const [appointmentDrafts, setAppointmentDrafts] = useState<PosDraftTab[]>(() => readPosDraftTabs())
  const [activeAppointmentDraftId, setActiveAppointmentDraftId] = useState(() => readPosDraftTabs()[0]?.id ?? '')

  // Ref so handleCheckout always reads fresh appointment data regardless of closure age
  const linkedAppointmentRef = useRef<{ appointmentId: string; branchId?: string } | null>(null)
  // Ref so the storage event handler can read the latest activeAppointmentDraftId without stale closure
  const activeAppointmentDraftIdRef = useRef(activeAppointmentDraftId)

  /* walk-in state */
  const [walkinModalOpen, setWalkinModalOpen] = useState(false)
  const [walkinForm, setWalkinForm] = useState({ customerId: '', serviceId: '', resourceName: '' })
  const [walkinCustomerMode, setWalkinCustomerMode] = useState<'existing' | 'new'>('existing')
  const [walkinNewCustomer, setWalkinNewCustomer] = useState({ fullName: '', phone: '' })
  const [walkinLoading, setWalkinLoading] = useState(false)
  const [walkinError, setWalkinError] = useState('')

  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['tenant-login-branches', slug],
    queryFn: () => getTenantBranches(slug),
    enabled: !!slug,
    retry: false,
  })

  const { data: featureSettings = defaultFeatureSettings } = useQuery({
    queryKey: ['feature-settings', slug, branchId],
    queryFn: () => getBranchFeatureSettings(slug),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })

  const activeBranches = useMemo(
    () => branches.filter((branch: Branch) => branch.isActive),
    [branches]
  )

  const selectedBranch = activeBranches.find((branch) => branch.id === branchId) ?? null

  const persistActiveAppointmentDraft = useCallback(() => {
    if (!activeAppointmentDraftId) return appointmentDrafts
    const next = appointmentDrafts.map((draft) =>
      draft.id === activeAppointmentDraftId
        ? { ...draft, customerId: selectedCustomerId || draft.customerId, items: cart }
        : draft
    )
    writePosDraftTabs(next)
    setAppointmentDrafts(next)
    return next
  }, [activeAppointmentDraftId, appointmentDrafts, cart, selectedCustomerId])

  const openAppointmentDraft = useCallback((draft: PosDraftTab) => {
    persistActiveAppointmentDraft()
    setActiveAppointmentDraftId(draft.id)
    setCart(toSaleCartItems(draft.items))
    setSelectedCustomerId(draft.customerId ?? '')
    setCustomerSearch(draft.customerName ?? '')
    setSelectedItemId(draft.items[0]?.itemId ?? null)
    setPadBuffer('')
  }, [persistActiveAppointmentDraft])

  // Keep ref in sync so storage handler avoids stale closure
  useEffect(() => { activeAppointmentDraftIdRef.current = activeAppointmentDraftId }, [activeAppointmentDraftId])

  // Keep linkedAppointmentRef in sync for reliable access inside handleCheckout
  useEffect(() => {
    if (!activeAppointmentDraftId) { linkedAppointmentRef.current = null; return }
    const draft = readPosDraftTabs().find(d => d.id === activeAppointmentDraftId)
    linkedAppointmentRef.current = getLinkedAppointmentFromDraft(draft)
  }, [activeAppointmentDraftId])

  useEffect(() => {
    const refreshDrafts = () => {
      const drafts = readPosDraftTabs()
      setAppointmentDrafts(drafts)
      // If POS is already mounted and no draft is active, auto-activate the first new draft
      if (!activeAppointmentDraftIdRef.current && drafts.length > 0) {
        const first = drafts[0]
        setActiveAppointmentDraftId(first.id)
        setCart(toSaleCartItems(first.items))
        setSelectedCustomerId(first.customerId ?? '')
        setCustomerSearch(first.customerName ?? '')
      }
    }
    window.addEventListener('ayapos:pos-drafts-changed', refreshDrafts)
    window.addEventListener('storage', refreshDrafts)
    return () => {
      window.removeEventListener('ayapos:pos-drafts-changed', refreshDrafts)
      window.removeEventListener('storage', refreshDrafts)
    }
  }, [])

  useEffect(() => {
    if (!slug || branchesLoading || activeBranches.length === 0) return
    if (!branchId || !activeBranches.some((branch) => branch.id === branchId)) {
      setBranchId(activeBranches[0].id)
    }
  }, [activeBranches, branchId, branchesLoading, setBranchId, slug])

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['cashier-session', slug, branchId ?? 'login-branch'],
    queryFn: () => getCurrentSession(slug),
    enabled: !!slug,
  })

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', slug, branchId ?? 'login-branch', 1, search],
    queryFn: () => getProducts(slug, { page: 1, pageSize: 60, search }),
    enabled: !!slug && tab === 'products',
  })

  const { data: servicesData, isLoading: servicesLoading } = useQuery({
    queryKey: ['services', slug, branchId ?? 'login-branch'],
    queryFn: () => getServices(slug, { page: 1, pageSize: 60 }),
    enabled: !!slug && tab === 'services',
  })

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers', slug, branchId ?? 'login-branch', 'pos', customerSearch],
    queryFn: () => getCustomers(slug, { page: 1, pageSize: 20, search: customerSearch }),
    enabled: !!slug,
  })

  const { data: latestInvoicesData } = useQuery({
    queryKey: ['invoices', slug, branchId ?? 'login-branch', 'pos-next-code'],
    queryFn: () => getInvoices(slug, { page: 1, pageSize: 1 }),
    enabled: !!slug,
  })

  const { data: walkinServicesData } = useQuery({
    queryKey: ['services', slug, branchId ?? 'login-branch', 'walkin'],
    queryFn: () => getServices(slug, { page: 1, pageSize: 200 }),
    enabled: !!slug && walkinModalOpen,
  })

  const { data: walkinResourcesData } = useQuery({
    queryKey: ['appointment-resources', slug, branchId ?? 'login-branch'],
    queryFn: () => getResources(slug),
    enabled: !!slug && walkinModalOpen,
  })

  const draftInvoiceNo = useMemo(
    () => getNextInvoiceCode(latestInvoicesData?.items[0]?.invoiceCode),
    [latestInvoicesData?.items]
  )

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase()
    const items = servicesData?.items ?? []
    if (!q) return items.filter((s) => s.isActive)
    return items.filter((s) =>
      s.isActive && `${s.nameAr ?? ''} ${s.nameEn ?? ''}`.toLowerCase().includes(q)
    )
  }, [servicesData?.items, search])

  const openSessionMut = useMutation({
    mutationFn: () => openSession(slug, toCents(openingCash)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-session', slug, branchId] })
      setOpenSessionModal(false)
      setOpeningCash('')
    },
  })

  const closeSessionMut = useMutation({
    mutationFn: () => closeSession(slug, session!.id, toCents(actualCash), discrepancyReason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashier-session', slug, branchId] })
      setCloseSessionModal(false)
      setActualCash('')
      setDiscrepancyReason('')
    },
  })

  const createCustomerMut = useMutation({
    mutationFn: () => createCustomer(slug, {
      fullName: customerForm.fullName,
      phone: customerForm.phone || undefined,
      email: customerForm.email || undefined,
    }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['customers', slug, branchId ?? 'login-branch'] })
      setSelectedCustomerId(created)
      setCustomerSearch('')
      setCustomerForm({ fullName: '', phone: '', email: '' })
      setCustomerModalOpen(false)
    },
  })

  const addProduct = (p: ProductListItem) => {
    const unitPriceCents = Math.round((p.sellPrice ?? 0) * 100)
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.itemId === p.id)
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c)
      setSelectedItemId(p.id)
      return [...prev, {
        itemId: p.id,
        itemType: 'Product',
        nameAr: p.nameAr ?? p.nameEn ?? 'منتج',
        nameEn: p.nameEn ?? '',
        qty: 1,
        unitPriceCents,
        originalUnitPriceCents: unitPriceCents,
      }]
    })
  }

  const addService = (s: ServiceListItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.itemId === s.id)
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c)
      setSelectedItemId(s.id)
      return [...prev, {
        itemId: s.id,
        itemType: 'Service',
        nameAr: s.nameAr ?? s.nameEn ?? 'خدمة',
        nameEn: s.nameEn ?? '',
        qty: 1,
        unitPriceCents: s.priceCents,
        originalUnitPriceCents: s.priceCents,
      }]
    })
  }

  const updateQty = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev.map((c) => c.itemId === itemId ? { ...c, qty: Math.max(1, c.qty + delta) } : c)
    )
  }

  const removeItem = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.itemId !== itemId))
    if (selectedItemId === itemId) setSelectedItemId(null)
  }

  const openEditItem = (item: SaleCartItem) => {
    setEditingItem(item)
    setEditForm({
      qty: item.qty.toString(),
      unitPrice: toMoney(item.unitPriceCents),
      reason: item.priceOverrideReason ?? '',
    })
  }

  const saveEditItem = () => {
    if (!editingItem) return
    const qty = Math.max(1, Math.floor(parseFloat(editForm.qty || '1')))
    const unitPriceCents = toCents(editForm.unitPrice)
    setCart((prev) => prev.map((item) => item.itemId === editingItem.itemId
      ? {
          ...item,
          qty,
          unitPriceCents,
          priceOverrideReason: unitPriceCents !== item.originalUnitPriceCents
            ? editForm.reason || 'Manual POS price adjustment'
            : undefined,
        }
      : item
    ))
    setEditingItem(null)
  }

  const total = cart.reduce((s, c) => s + c.qty * c.unitPriceCents, 0)
  const paidCents = toCents(payAmount)
  const changeCents = Math.max(0, paidCents - total)
  const selectedItem = cart.find((item) => item.itemId === selectedItemId) ?? cart[0] ?? null
  const selectedCustomer = (customersData?.items ?? []).find((customer) => customer.id === selectedCustomerId)

  const updateSelectedQty = (qty: string) => {
    if (!selectedItem) return
    const nextQty = Math.max(1, Math.floor(parseFloat(qty || '1')))
    setCart((prev) => prev.map((item) =>
      item.itemId === selectedItem.itemId ? { ...item, qty: nextQty } : item
    ))
  }

  const updateSelectedPrice = (price: string) => {
    if (!selectedItem) return
    const unitPriceCents = toCents(price)
    setCart((prev) => prev.map((item) =>
      item.itemId === selectedItem.itemId
        ? {
            ...item,
            unitPriceCents,
            priceOverrideReason: unitPriceCents !== item.originalUnitPriceCents
              ? item.priceOverrideReason || 'Manual POS price adjustment'
              : undefined,
          }
        : item
    ))
  }

  const getPadValue = () => {
    if (padTarget === 'qty') return String(selectedItem?.qty ?? 1)
    if (padTarget === 'price') return selectedItem ? toMoney(selectedItem.unitPriceCents) : '0.00'
    return payAmount
  }

  const applyPadValue = (value: string) => {
    if (padTarget === 'qty') updateSelectedQty(value || '1')
    else if (padTarget === 'price') updateSelectedPrice(value || '0')
    else setPayAmount(value)
  }

  const handleManualQtyChange = (value: string) => {
    setPadBuffer('')
    updateSelectedQty(value)
  }

  const handleManualPriceChange = (value: string) => {
    setPadBuffer('')
    updateSelectedPrice(value)
  }

  const selectPadTarget = (target: PadTarget) => {
    setPadTarget(target)
    setPadBuffer('')
  }

  const pressPadKey = (key: string) => {
    if (key === 'C') {
      setPadBuffer('')
      return applyPadValue(padTarget === 'qty' ? '1' : '')
    }

    if (key === 'Del') {
      const next = padBuffer.slice(0, -1)
      setPadBuffer(next)
      return applyPadValue(next)
    }
    if (key === '.' && (padTarget === 'qty' || padBuffer.includes('.'))) return

    const next = padBuffer === '0' && key !== '.' ? key : `${padBuffer}${key}`
    setPadBuffer(next)
    applyPadValue(next)
  }

  const printInvoice = (invoice: InvoiceDetail) => {
    const lines = invoice.items ?? invoice.lines ?? []
    const payments = invoice.payments ?? []
    const rows = lines.map((line) => {
      const unitPrice = line.unitPriceCents !== undefined ? line.unitPriceCents / 100 : line.unitPrice ?? 0
      const lineTotal = line.lineTotalCents !== undefined ? line.lineTotalCents / 100 : line.lineTotal ?? 0
      return `
        <tr>
          <td>${escapeHtml(line.name ?? line.nameSnapshot)}</td>
          <td>${line.qty}</td>
          <td>${fmtAmount(unitPrice)}</td>
          <td>${fmtAmount(lineTotal)}</td>
        </tr>
      `
    }).join('')
    const paymentRows = payments.map((payment) => {
      const amount = payment.amountCents !== undefined ? payment.amountCents / 100 : payment.amount ?? 0
      return `
        <tr>
          <td>${escapeHtml(paymentMethodLabel(payment.method))}</td>
          <td>${fmtAmount(amount)}</td>
          <td>${escapeHtml(payment.reference)}</td>
        </tr>
      `
    }).join('')
    const paid = payments.reduce((sum, payment) => sum + (payment.amountCents !== undefined ? payment.amountCents / 100 : payment.amount ?? 0), 0)
    const totalAmount = invoice.total ?? 0
    const receipt = window.open('', '_blank', 'width=420,height=720')
    if (!receipt) return
    receipt.document.write(`
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(invoice.invoiceCode)}</title>
          <style>
            body { font-family: Arial, Tahoma, sans-serif; margin: 0; padding: 18px; color: #111827; }
            .receipt { max-width: 360px; margin: 0 auto; }
            .center { text-align: center; }
            h1 { font-size: 18px; margin: 0 0 4px; }
            .muted { color: #6b7280; font-size: 12px; }
            .code { font-family: monospace; font-size: 16px; font-weight: 700; margin-top: 8px; }
            .block { border-top: 1px dashed #d1d5db; margin-top: 12px; padding-top: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 6px 0; border-bottom: 1px solid #f3f4f6; text-align: right; }
            th:last-child, td:last-child { text-align: left; }
            .total-row { display: flex; justify-content: space-between; margin-top: 7px; font-size: 13px; }
            .grand { font-size: 18px; font-weight: 800; }
            .footer { margin-top: 18px; text-align: center; font-size: 12px; color: #6b7280; }
            @media print {
              body { padding: 0; }
              .receipt { max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              <h1>AyaPOS</h1>
              <div class="muted">فاتورة بيع</div>
              <div class="code">${escapeHtml(invoice.invoiceCode)}</div>
              <div class="muted">${formatDateTime(invoice.createdAt, 'ar')}</div>
            </div>
            <div class="block">
              <div class="total-row"><span>العميل</span><strong>${escapeHtml(invoice.customerName || 'عميل نقدي')}</strong></div>
              <div class="total-row"><span>الحالة</span><strong>${escapeHtml(invoice.status)}</strong></div>
            </div>
            <div class="block">
              <table>
                <thead>
                  <tr><th>البند</th><th>كمية</th><th>السعر</th><th>الإجمالي</th></tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="block">
              <div class="total-row"><span>المجموع الفرعي</span><strong>${fmtAmount(invoice.subtotal)} د.إ</strong></div>
              <div class="total-row grand"><span>الإجمالي</span><strong>${fmtAmount(totalAmount)} د.إ</strong></div>
              <div class="total-row"><span>المدفوع</span><strong>${fmtAmount(invoice.totalPaid ?? paid)} د.إ</strong></div>
              <div class="total-row"><span>المتبقي</span><strong>${fmtAmount(invoice.remaining ?? Math.max(0, totalAmount - paid))} د.إ</strong></div>
            </div>
            ${paymentRows ? `
              <div class="block">
                <table>
                  <thead><tr><th>طريقة الدفع</th><th>المبلغ</th><th>المرجع</th></tr></thead>
                  <tbody>${paymentRows}</tbody>
                </table>
              </div>
            ` : ''}
            <div class="footer">شكرا لزيارتكم</div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `)
    receipt.document.close()
  }

  const openWalkin = () => {
    setWalkinForm({ customerId: '', serviceId: '', resourceName: '' })
    setWalkinCustomerMode('existing')
    setWalkinNewCustomer({ fullName: '', phone: '' })
    setWalkinError('')
    setWalkinModalOpen(true)
  }

  const handleWalkinCheckin = async () => {
    const svc = (walkinServicesData?.items ?? []).find((s) => s.id === walkinForm.serviceId)
    if (!svc) { setWalkinError('الرجاء اختيار الخدمة'); return }

    let customerId = walkinForm.customerId
    if (walkinCustomerMode === 'new') {
      if (!walkinNewCustomer.fullName.trim()) { setWalkinError('اسم العميل مطلوب'); return }
      try {
        customerId = await createCustomer(slug, {
          fullName: walkinNewCustomer.fullName,
          phone: walkinNewCustomer.phone || undefined,
        })
        qc.invalidateQueries({ queryKey: ['customers', slug, branchId ?? 'login-branch'] })
      } catch { return }
    }
    if (!customerId) { setWalkinError('الرجاء اختيار العميل'); return }

    setWalkinLoading(true)
    setWalkinError('')
    try {
      const startAt = toDubaiDateTimeValue()
      const endAt = addMinutesToDateTimeValue(startAt, svc.durationMin ?? 60)
      const appointmentId = await createAppointment(slug, {
        customerId,
        serviceId: walkinForm.serviceId,
        startAt: toApiLocalDateTime(startAt),
        endAt: toApiLocalDateTime(endAt),
        resourceName: walkinForm.resourceName || undefined,
      })
      await updateAppointmentStatus(slug, appointmentId, 'checked_in')

      const customerName =
        walkinCustomerMode === 'new'
          ? walkinNewCustomer.fullName
          : (customersData?.items ?? []).find((c) => c.id === customerId)?.fullName ?? 'عميل'
      const draftId = `appointment:${appointmentId}`
      const priceCents = svc.priceCents
      const serviceItem: CartItem = {
        itemId: svc.id,
        itemType: 'Service',
        nameAr: svc.nameAr ?? svc.nameEn ?? 'خدمة',
        nameEn: svc.nameEn ?? '',
        qty: 1,
        unitPriceCents: priceCents,
      }
      persistActiveAppointmentDraft()
      upsertPosDraftTab({
        id: draftId,
        appointmentId,
        branchId: branchId ?? undefined,
        customerId,
        customerName,
        label: customerName,
        items: [serviceItem],
      })
      setAppointmentDrafts(readPosDraftTabs())
      setActiveAppointmentDraftId(draftId)
      setCart(toSaleCartItems([serviceItem]))
      setSelectedCustomerId(customerId)
      setCustomerSearch(customerName)
      qc.invalidateQueries({ queryKey: ['appointments', slug] })
      qc.invalidateQueries({ queryKey: ['appointments-schedule', slug] })
      setWalkinModalOpen(false)
    } catch {
      setWalkinError('حدث خطأ، يرجى المحاولة مرة أخرى')
    } finally {
      setWalkinLoading(false)
    }
  }

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || paidCents <= 0) return
    if (featureSettings.posRequirePaymentReference && (payMethod === 1 || payMethod === 2) && !payRef.trim()) {
      setCheckoutError('رقم المرجع مطلوب عند الدفع بالبطاقة أو التحويل')
      return
    }
    setCheckoutError('')
    setCheckoutLoading(true)
    try {
      const invoiceId = await createInvoice(slug, {
        customerId: selectedCustomerId || undefined,
      })
      for (const item of cart) {
        await addInvoiceLine(slug, invoiceId, {
          itemType: item.itemType,
          itemId: item.itemId,
          qty: item.qty,
          priceOverrideCents: item.unitPriceCents !== item.originalUnitPriceCents ? item.unitPriceCents : undefined,
          priceOverrideReason: item.priceOverrideReason,
        })
      }
      await finalizeInvoice(slug, invoiceId)

      const linkedBeforePayment = linkedAppointmentRef.current
        ?? (activeAppointmentDraftId
          ? (() => {
              const d = readPosDraftTabs().find(d => d.id === activeAppointmentDraftId)
              return getLinkedAppointmentFromDraft(d)
            })()
          : null)

      await addPayment(slug, invoiceId, {
        method: payMethod,
        amountCents: paidCents,
        reference: payRef || undefined,
        appointmentId: linkedBeforePayment?.appointmentId,
      })

      // Mark linked appointment completed AFTER payment is recorded.
      let apptFailed = false
      const linked = linkedBeforePayment ?? linkedAppointmentRef.current
        ?? (activeAppointmentDraftId
          ? (() => {
              const d = readPosDraftTabs().find(d => d.id === activeAppointmentDraftId)
              return getLinkedAppointmentFromDraft(d)
            })()
          : null)
      if (linked?.appointmentId) {
        setCompletedInvoiceLinkedAppointment({ id: linked.appointmentId, branchId: linked.branchId })
        try {
          await updateAppointmentStatus(slug, linked.appointmentId, 'completed', linked.branchId)
        } catch {
          apptFailed = true
        }
      } else {
        setCompletedInvoiceLinkedAppointment(null)
      }
      setAppointmentUpdateFailed(apptFailed)
      const invoice = await getInvoice(slug, invoiceId)
      setCompletedInvoice(invoice)
      if (activeAppointmentDraftId) {
        const nextDrafts = removePosDraftTab(activeAppointmentDraftId)
        setAppointmentDrafts(nextDrafts)
        setActiveAppointmentDraftId('')
      }
      qc.invalidateQueries({ queryKey: ['appointments', slug] })
      qc.invalidateQueries({ queryKey: ['appointments-schedule', slug] })
      setCart([])
      setPayModal(false)
      setPayAmount('')
      setPayRef('')
      setSelectedCustomerId('')
      setCustomerSearch('')
      setSuccessMsg('تم إصدار الفاتورة بنجاح')
      qc.invalidateQueries({ queryKey: ['invoices', slug, branchId ?? 'login-branch'] })
      qc.invalidateQueries({ queryKey: ['daily-summary', slug, branchId ?? 'login-branch'] })
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (error) {
      setCheckoutError(getApiErrorMessage(error, 'حدث خطأ أثناء معالجة الدفع'))
    } finally {
      setCheckoutLoading(false)
    }
  }, [activeAppointmentDraftId, cart, slug, branchId, selectedCustomerId, payMethod, paidCents, payRef, qc, featureSettings.posRequirePaymentReference])

  if (!branchId && branchesLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" className="text-blue-600" /></div>
  }

  if (sessionLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" className="text-blue-600" /></div>
  }

  return (
    <div className="flex flex-col xl:flex-row gap-4 min-h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500">الفرع الحالي</p>
              <p className="text-sm font-semibold text-gray-900">
                {selectedBranch?.name ?? branchId ?? 'فرع تسجيل الدخول'}
              </p>
            </div>
            {activeBranches.length > 0 && (
              <select
                value={branchId ?? activeBranches[0].id}
                onChange={(e) => {
                  setBranchId(e.target.value)
                  setCart([])
                  setSearch('')
                }}
                className="w-full md:w-64 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} - {branch.code}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="relative">
            <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="ابحث عن منتج أو خدمة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 pe-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('products')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === 'products' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <Package size={16} /> المنتجات
            </button>
            <button
              onClick={() => setTab('services')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${tab === 'services' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <Wrench size={16} /> الخدمات
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {(tab === 'products' ? productsLoading : servicesLoading) ? (
            <div className="flex justify-center py-12"><Spinner size="lg" className="text-blue-600" /></div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3">
              {tab === 'products' && (productsData?.items ?? []).filter((p) => p.isActive).map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300
                    rounded-xl p-3 text-right transition-all group min-h-32"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-blue-200">
                    <Package size={20} className="text-blue-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{p.nameAr ?? p.nameEn}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{p.barcode || p.sku || p.nameEn}</p>
                  <p className="text-sm font-bold text-blue-600 mt-2">
                    {p.sellPrice?.toFixed(2)} {p.currencyCode}
                  </p>
                </button>
              ))}
              {tab === 'services' && filteredServices.map((s) => (
                <button
                  key={s.id}
                  onClick={() => addService(s)}
                  className="bg-gray-50 hover:bg-purple-50 border border-gray-200 hover:border-purple-300
                    rounded-xl p-3 text-right transition-all group min-h-32"
                >
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-2 group-hover:bg-purple-200">
                    <Wrench size={20} className="text-purple-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{s.nameAr ?? s.nameEn}</p>
                  <p className="text-xs text-gray-500">{s.durationMin ? `${s.durationMin} دقيقة` : s.nameEn}</p>
                  <p className="text-sm font-bold text-purple-600 mt-2">
                    {s.price.toFixed(2)} {s.currencyCode}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full xl:w-[26rem] flex flex-col bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="border-b border-blue-100 bg-blue-50/70 px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-blue-700">المواعيد الحاضرة</p>
            <button
              type="button"
              onClick={openWalkin}
              className="flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Plus size={12} />
              حضور مباشر
            </button>
          </div>
          {appointmentDrafts.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {appointmentDrafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => openAppointmentDraft(draft)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    activeAppointmentDraftId === draft.id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {draft.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-blue-500">لا توجد مواعيد حاضرة — سجّل حضور مباشر أو انتقل إلى المواعيد</p>
          )}
          {featureSettings.posRequireAppointment && !activeAppointmentDraftId && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 font-medium">
              لا يمكن إصدار فاتورة بدون موعد مفتوح — سجّل حضور مباشر أولاً
            </div>
          )}
        </div>

        {!session ? (
          <div className="p-4 bg-amber-50 border-b border-amber-200">
            <p className="text-xs text-amber-700 mb-2 font-medium">لا توجد جلسة كاشير مفتوحة</p>
            <button
              onClick={() => setOpenSessionModal(true)}
              className="w-full bg-amber-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-amber-600"
            >
              فتح جلسة جديدة
            </button>
          </div>
        ) : (
          <div className="px-4 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-700 font-medium flex-1">جلسة مفتوحة</span>
            <button
              onClick={() => { setActualCash(''); setDiscrepancyReason(''); setCloseSessionModal(true) }}
              className="text-xs text-red-600 hover:text-red-800 font-medium border border-red-200 bg-red-50 px-2 py-0.5 rounded-md hover:bg-red-100 transition-colors"
            >
              إغلاق الجلسة
            </button>
          </div>
        )}

        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-xs text-gray-500">رقم الفاتورة</span>
            <span className="font-mono text-xs font-bold text-gray-900">{draftInvoiceNo}</span>
          </div>
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-blue-600" />
            <span className="font-semibold text-gray-800">السلة</span>
          </div>
          {cart.length > 0 && (
            <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700">
              مسح الكل
            </button>
          )}
          </div>
        </div>

        {successMsg && (
          <div className="mx-3 mt-3 bg-green-100 border border-green-300 rounded-lg px-3 py-2 text-green-700 text-sm font-medium">
            {successMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 py-12">
              <ShoppingCart size={40} />
              <p className="text-sm mt-3">السلة فارغة</p>
              <p className="text-xs mt-1">أضف منتجات أو خدمات من القائمة</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {cart.map((item) => (
                <div
                  key={item.itemId}
                  onClick={() => setSelectedItemId(item.itemId)}
                  className={`px-4 py-3 cursor-pointer transition-colors ${
                    selectedItem?.itemId === item.itemId ? 'bg-blue-50/60' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                      ${item.itemType === 'Product' ? 'bg-blue-100' : 'bg-purple-100'}`}>
                      {item.itemType === 'Product'
                        ? <Package size={15} className="text-blue-600" />
                        : <Wrench size={15} className="text-purple-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.nameAr}</p>
                      <p className="text-xs text-gray-500">
                        {fmt(item.unitPriceCents)} × {item.qty}
                        {item.unitPriceCents !== item.originalUnitPriceCents && (
                          <span className="ms-1 text-amber-600">معدل</span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{fmt(item.qty * item.unitPriceCents)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQty(item.itemId, -1)}
                        className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                        <Minus size={13} />
                      </button>
                      <span className="w-7 text-center text-sm font-medium">{item.qty}</span>
                      <button onClick={() => updateQty(item.itemId, 1)}
                        className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                        <Plus size={13} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditItem(item)}
                        className="w-8 h-8 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => removeItem(item.itemId)}
                        className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center">
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <div className="m-4 space-y-3">
              <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">تعديل الفاتورة</p>
                  <p className="text-xs text-gray-500 truncate max-w-40">{selectedItem?.nameAr}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="الكمية"
                    type="number"
                    min="1"
                    step="1"
                    value={selectedItem?.qty ?? 1}
                    onChange={(e) => handleManualQtyChange(e.target.value)}
                  />
                  <Input
                    label="سعر الوحدة"
                    type="number"
                    min="0"
                    step="0.01"
                    value={selectedItem ? toMoney(selectedItem.unitPriceCents) : '0.00'}
                    onChange={(e) => handleManualPriceChange(e.target.value)}
                  />
                </div>

                {selectedItem && selectedItem.unitPriceCents !== selectedItem.originalUnitPriceCents && (
                  <Input
                    label="سبب تعديل السعر"
                    value={selectedItem.priceOverrideReason ?? ''}
                    onChange={(e) => {
                      const reason = e.target.value
                      setCart((prev) => prev.map((item) =>
                        item.itemId === selectedItem.itemId ? { ...item, priceOverrideReason: reason } : item
                      ))
                    }}
                    placeholder="خصم، عرض، تعديل يدوي..."
                  />
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">العميل</label>
                    <button
                      type="button"
                      onClick={() => setCustomerModalOpen(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      <UserPlus size={14} />
                      إضافة عميل
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="بحث عن عميل..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">بدون عميل</option>
                      {(customersData?.items ?? []).filter((customer: Customer) => customer.isActive).map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.fullName}{customer.phone ? ` - ${customer.phone}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {customersLoading && <p className="text-xs text-gray-400">جاري تحميل العملاء...</p>}
                  {selectedCustomer && <p className="text-xs text-green-700">العميل المحدد: {selectedCustomer.fullName}</p>}
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">طريقة الدفع</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { method: 0 as const, label: 'نقدا', icon: DollarSign, color: 'green' },
                      { method: 1 as const, label: 'بطاقة', icon: CreditCard, color: 'blue' },
                      { method: 2 as const, label: 'تحويل', icon: Building2, color: 'purple' },
                    ].map(({ method, label, icon: Icon, color }) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPayMethod(method)}
                        className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors
                          ${payMethod === method
                            ? color === 'green' ? 'border-green-500 bg-green-50 text-green-700'
                              : color === 'blue' ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'qty' as const, label: 'كمية' },
                      { value: 'price' as const, label: 'سعر' },
                      { value: 'paid' as const, label: 'مدفوع' },
                    ].map((target) => (
                      <button
                        key={target.value}
                        type="button"
                        onClick={() => selectPadTarget(target.value)}
                        className={`rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors ${
                          padTarget === target.value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {target.label}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-2">
                    <div dir="ltr" className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-left font-mono text-sm font-bold text-gray-900">
                      {padBuffer || getPadValue() || '0'}
                    </div>
                    <div dir="ltr" className="grid grid-cols-3 gap-2">
                      {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', 'Del'].map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => pressPadKey(key)}
                          className="h-9 rounded-lg border border-gray-200 bg-gray-50 text-sm font-bold text-gray-800 hover:border-blue-200 hover:bg-blue-50"
                        >
                          {key}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => pressPadKey('C')}
                        className="col-span-3 h-9 rounded-lg border border-red-100 bg-red-50 text-sm font-bold text-red-600 hover:bg-red-100"
                      >
                        مسح
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">الإجمالي</span>
                  <span className="text-xl font-bold text-gray-900">{fmt(total)} <span className="text-sm">د.إ</span></span>
                </div>
                <button
                  disabled={cart.length === 0 || !session || (featureSettings.posRequireAppointment && !activeAppointmentDraftId)}
                  onClick={() => { setPayAmount(toMoney(total)); setPayModal(true) }}
                  className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700
                    disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  <ChevronRight size={18} />
                  الدفع
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={openSessionModal} onClose={() => setOpenSessionModal(false)} title="فتح جلسة كاشير"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpenSessionModal(false)}>إلغاء</Button>
            <Button onClick={() => openSessionMut.mutate()} loading={openSessionMut.isPending}>
              فتح الجلسة
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">أدخل مبلغ النقد الافتتاحي في الدرج</p>
          <Input
            label="النقد الافتتاحي (د.إ)"
            type="number"
            step="0.01"
            min="0"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </Modal>

      <Modal open={closeSessionModal} onClose={() => setCloseSessionModal(false)} title="إغلاق جلسة الكاشير"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseSessionModal(false)}>إلغاء</Button>
            <Button
              onClick={() => closeSessionMut.mutate()}
              loading={closeSessionMut.isPending}
              variant="danger"
              disabled={!!session && !!actualCash && Math.abs(toCents(actualCash) - session.expectedCashCents) > 0 && !discrepancyReason}
            >
              إغلاق الجلسة
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Session summary */}
          {session && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">نقد (مبيعات)</span>
                <span className="font-medium">{(session.totalCashCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">بطاقة</span>
                <span className="font-medium">{(session.totalCardCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تحويل</span>
                <span className="font-medium">{(session.totalTransferCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500">النقد المتوقع في الدرج</span>
                <span className="font-semibold text-blue-700">{(session.expectedCashCents / 100).toFixed(2)}</span>
              </div>
            </div>
          )}

          <Input
            label="النقد الفعلي في الدرج (د.إ)"
            type="number"
            step="0.01"
            min="0"
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            placeholder="0.00"
          />

          {/* Real-time discrepancy */}
          {session && actualCash && (() => {
            const diff = toCents(actualCash) - session.expectedCashCents
            if (diff === 0) return <p className="text-sm text-green-600 font-medium">✓ لا يوجد فرق</p>
            return (
              <div className="space-y-2">
                <p className={`text-sm font-medium ${diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {diff > 0 ? '▲ زيادة' : '▼ عجز'}: {Math.abs(diff / 100).toFixed(2)} د.إ
                </p>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">سبب الفرق (مطلوب)</label>
                  <textarea
                    rows={2}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                    placeholder="اذكر سبب الفرق..."
                    value={discrepancyReason}
                    onChange={e => setDiscrepancyReason(e.target.value)}
                  />
                </div>
              </div>
            )
          })()}

          {closeSessionMut.isError && (
            <p className="text-sm text-red-600">حدث خطأ أثناء إغلاق الجلسة</p>
          )}
        </div>
      </Modal>

      <Modal open={!!editingItem} onClose={() => setEditingItem(null)} title="تعديل بند السلة" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingItem(null)}>إلغاء</Button>
            <Button onClick={saveEditItem}>حفظ التعديل</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="font-semibold text-gray-900">{editingItem?.nameAr}</p>
            <p className="mt-1 text-xs text-gray-500">السعر الأصلي: {fmt(editingItem?.originalUnitPriceCents ?? 0)}</p>
          </div>
          <Input
            label="الكمية"
            type="number"
            min="1"
            step="1"
            value={editForm.qty}
            onChange={(e) => setEditForm((p) => ({ ...p, qty: e.target.value }))}
          />
          <Input
            label="سعر الوحدة"
            type="number"
            min="0"
            step="0.01"
            value={editForm.unitPrice}
            onChange={(e) => setEditForm((p) => ({ ...p, unitPrice: e.target.value }))}
          />
          {toCents(editForm.unitPrice) !== (editingItem?.originalUnitPriceCents ?? 0) && (
            <Input
              label="سبب تعديل السعر"
              value={editForm.reason}
              onChange={(e) => setEditForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="خصم، عرض، تصحيح سعر..."
            />
          )}
        </div>
      </Modal>

      <Modal open={customerModalOpen} onClose={() => setCustomerModalOpen(false)} title="إضافة عميل" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustomerModalOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => createCustomerMut.mutate()}
              loading={createCustomerMut.isPending}
              disabled={!customerForm.fullName.trim()}
            >
              إضافة العميل
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="اسم العميل"
            value={customerForm.fullName}
            onChange={(e) => setCustomerForm((prev) => ({ ...prev, fullName: e.target.value }))}
            required
          />
          <Input
            label="الهاتف"
            type="tel"
            value={customerForm.phone}
            onChange={(e) => setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <Input
            label="البريد الإلكتروني"
            type="email"
            value={customerForm.email}
            onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          {createCustomerMut.isError && <p className="text-sm text-red-600">تعذر إضافة العميل</p>}
        </div>
      </Modal>

      <Modal
        open={walkinModalOpen}
        onClose={() => setWalkinModalOpen(false)}
        title="تسجيل حضور مباشر"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setWalkinModalOpen(false)}>إلغاء</Button>
            <Button
              onClick={handleWalkinCheckin}
              loading={walkinLoading}
              disabled={!walkinForm.serviceId || (walkinCustomerMode === 'existing' ? !walkinForm.customerId : !walkinNewCustomer.fullName.trim())}
            >
              تسجيل الحضور وفتح تاب
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Customer */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">العميل <span className="text-red-500">*</span></label>
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                <button type="button" onClick={() => setWalkinCustomerMode('existing')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors
                    ${walkinCustomerMode === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  اختر من القائمة
                </button>
                <button type="button" onClick={() => setWalkinCustomerMode('new')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors
                    ${walkinCustomerMode === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  + عميل جديد
                </button>
              </div>
            </div>
            {walkinCustomerMode === 'existing' ? (
              <select
                value={walkinForm.customerId}
                onChange={(e) => setWalkinForm((p) => ({ ...p, customerId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- اختر العميل --</option>
                {(customersData?.items ?? []).filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}{c.phone ? ` - ${c.phone}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2 border border-blue-200 bg-blue-50 rounded-lg p-3">
                <input
                  type="text"
                  placeholder="الاسم الكامل *"
                  value={walkinNewCustomer.fullName}
                  onChange={(e) => setWalkinNewCustomer((p) => ({ ...p, fullName: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="tel"
                  placeholder="رقم الجوال (اختياري)"
                  value={walkinNewCustomer.phone}
                  onChange={(e) => setWalkinNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Service */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الخدمة <span className="text-red-500">*</span></label>
            <select
              value={walkinForm.serviceId}
              onChange={(e) => setWalkinForm((p) => ({ ...p, serviceId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- اختر الخدمة --</option>
              {(walkinServicesData?.items ?? []).filter((s) => s.isActive).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr ?? s.nameEn}{s.durationMin ? ` (${s.durationMin} دقيقة)` : ''} - {s.price.toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          {/* Resource */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الموظف المسؤول (اختياري)</label>
            <select
              value={walkinForm.resourceName}
              onChange={(e) => setWalkinForm((p) => ({ ...p, resourceName: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- غير محدد --</option>
              {(walkinResourcesData ?? []).map((r) => (
                <option key={r.userId} value={r.username}>
                  {r.username}{r.role ? ` - ${r.role}` : ''}
                </option>
              ))}
            </select>
          </div>

          {walkinError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {walkinError}
            </div>
          )}
        </div>
      </Modal>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="إتمام الدفع" size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayModal(false)}>إلغاء</Button>
            <Button onClick={handleCheckout} loading={checkoutLoading} disabled={paidCents <= 0}>
              تأكيد الدفع
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-gray-500 text-sm">الإجمالي المستحق</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{fmt(total)} <span className="text-lg">د.إ</span></p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">طريقة الدفع</p>
            <p className="mt-1 text-sm font-bold text-gray-900">
              {payMethod === 0 ? 'نقدا' : payMethod === 1 ? 'بطاقة' : 'تحويل'}
            </p>
          </div>

          <Input
            label="المبلغ المدفوع (د.إ)"
            type="number"
            step="0.01"
            min="0"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />

          {(payMethod === 1 || payMethod === 2) && (
            <Input
              label="رقم المرجع"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="رقم العملية أو الإيصال"
            />
          )}

          {checkoutError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {checkoutError}
            </div>
          )}

          {payMethod === 0 && paidCents > total && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <p className="text-sm text-green-700">
                الباقي: <strong>{fmt(changeCents)} د.إ</strong>
              </p>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!completedInvoice}
        onClose={() => {
          setCompletedInvoice(null)
          setAppointmentUpdateFailed(false)
          setCompletedInvoiceLinkedAppointment(null)
        }}
        title="ملخص الدفع"
        size="lg"
        footer={
          completedInvoice && (
            <>
              <Button variant="secondary" onClick={() => {
                setCompletedInvoice(null)
                setAppointmentUpdateFailed(false)
                setCompletedInvoiceLinkedAppointment(null)
              }}>إغلاق</Button>
              {appointmentUpdateFailed && completedInvoiceLinkedAppointment && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await updateAppointmentStatus(
                        slug,
                        completedInvoiceLinkedAppointment.id,
                        'completed',
                        completedInvoiceLinkedAppointment.branchId
                      )
                      setAppointmentUpdateFailed(false)
                      qc.invalidateQueries({ queryKey: ['appointments', slug] })
                      qc.invalidateQueries({ queryKey: ['appointments-schedule', slug] })
                    } catch { /* toast shown by client interceptor */ }
                  }}
                >
                  إغلاق الموعد يدوياً
                </Button>
              )}
              <Button onClick={() => printInvoice(completedInvoice)}>
                <Printer size={16} />
                طباعة الفاتورة
              </Button>
            </>
          )
        }
      >
        {completedInvoice && (
          <div className="space-y-4">
            {appointmentUpdateFailed && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                تم إصدار الفاتورة، لكن تعذر تحديث حالة الموعد تلقائياً — يرجى تحديثه يدوياً من صفحة المواعيد
              </div>
            )}
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
              <p className="text-sm font-semibold text-green-800">تم الدفع بنجاح</p>
              <p className="mt-1 font-mono text-lg font-bold text-gray-900">{completedInvoice.invoiceCode}</p>
              <p className="text-xs text-gray-500">{formatDateTime(completedInvoice.createdAt, 'ar')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">العميل</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{completedInvoice.customerName || 'عميل نقدي'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-xs text-gray-500">الحالة</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{completedInvoice.status}</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-right">البند</th>
                    <th className="px-3 py-2 text-center">الكمية</th>
                    <th className="px-3 py-2 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(completedInvoice.items ?? completedInvoice.lines ?? []).map((line) => {
                    const lineTotal = line.lineTotalCents !== undefined ? line.lineTotalCents / 100 : line.lineTotal ?? 0
                    return (
                      <tr key={line.id}>
                        <td className="px-3 py-2 font-medium text-gray-900">{line.name ?? line.nameSnapshot}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{line.qty}</td>
                        <td className="px-3 py-2 text-left font-semibold text-gray-900">{fmtAmount(lineTotal)} د.إ</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl bg-gray-50 px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">الإجمالي</span>
                <span className="font-bold text-gray-900">{fmtAmount(completedInvoice.total)} د.إ</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">المدفوع</span>
                <span className="font-bold text-green-700">
                  {fmtAmount(completedInvoice.totalPaid ?? (completedInvoice.payments ?? []).reduce((sum, payment) =>
                    sum + (payment.amountCents !== undefined ? payment.amountCents / 100 : payment.amount ?? 0), 0
                  ))} د.إ
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">المتبقي</span>
                <span className="font-bold text-gray-900">{fmtAmount(completedInvoice.remaining ?? 0)} د.إ</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
