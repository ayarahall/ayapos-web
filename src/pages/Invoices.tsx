import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Eye, ChevronLeft, ChevronRight, Printer, Search, X } from 'lucide-react'
import { getInvoices, getInvoice } from '../api/invoices'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../types'
import type { InvoiceDetail } from '../types'
import { formatDateTime, todayInDubaiISO } from '../utils/date'

const statusTabs = [
  { label: 'الكل', value: '' },
  { label: 'مسودة', value: 'Draft' },
  { label: 'مؤكدة', value: 'Posted' },
  { label: 'مدفوعة جزئياً', value: 'PartiallyPaid' },
  { label: 'مدفوعة', value: 'Paid' },
]

const statusVariant = (s: string): 'green' | 'yellow' | 'blue' | 'gray' | 'red' => {
  if (s === 'Paid') return 'green'
  if (s === 'PartiallyPaid') return 'yellow'
  if (s === 'Posted') return 'blue'
  if (s === 'Draft') return 'gray'
  return 'red'
}

const fmt = (cents: number) =>
  new Intl.NumberFormat('ar-AE', { minimumFractionDigits: 2 }).format(cents / 100)

const fmtAmount = (amount: number | undefined) =>
  new Intl.NumberFormat('ar-AE', { minimumFractionDigits: 2 }).format(amount ?? 0)

const paymentMethodLabel = (method: number | string) => {
  if (typeof method === 'number') return PAYMENT_METHOD_LABELS[method] ?? 'غير معروف'
  if (method === 'Cash') return 'نقدا'
  if (method === 'Card') return 'بطاقة'
  if (method === 'Transfer' || method === 'BankTransfer') return 'تحويل بنكي'
  return String(method)
}

const escapeHtml = (value: string | undefined | null) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char))

function printInvoiceDetail(detail: InvoiceDetail) {
  const lines = detail.items ?? detail.lines ?? []
  const payments = detail.payments ?? []
  const rows = lines.map((line) => {
    const unitPrice = line.unitPriceCents !== undefined ? line.unitPriceCents / 100 : line.unitPrice ?? 0
    const lineTotal = line.lineTotalCents !== undefined ? line.lineTotalCents / 100 : line.lineTotal ?? 0
    return `<tr>
      <td>${escapeHtml(line.name ?? line.nameSnapshot)}</td>
      <td>${line.qty}</td>
      <td>${fmtAmount(unitPrice)}</td>
      <td>${fmtAmount(lineTotal)}</td>
    </tr>`
  }).join('')
  const paymentRows = payments.map((p) => {
    const amount = p.amountCents !== undefined ? p.amountCents / 100 : p.amount ?? 0
    return `<tr>
      <td>${escapeHtml(paymentMethodLabel(p.method))}</td>
      <td>${fmtAmount(amount)}</td>
      <td>${escapeHtml(p.reference)}</td>
    </tr>`
  }).join('')
  const paid = payments.reduce((s, p) => s + (p.amountCents !== undefined ? p.amountCents / 100 : p.amount ?? 0), 0)
  const win = window.open('', '_blank', 'width=420,height=720')
  if (!win) return
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
    <title>${escapeHtml(detail.invoiceCode)}</title>
    <style>body{font-family:Arial,Tahoma,sans-serif;margin:0;padding:18px;color:#111827}.receipt{max-width:360px;margin:0 auto}.center{text-align:center}h1{font-size:18px;margin:0 0 4px}.muted{color:#6b7280;font-size:12px}.code{font-family:monospace;font-size:16px;font-weight:700;margin-top:8px}.block{border-top:1px dashed #d1d5db;margin-top:12px;padding-top:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 0;border-bottom:1px solid #f3f4f6;text-align:right}th:last-child,td:last-child{text-align:left}.total-row{display:flex;justify-content:space-between;margin-top:7px;font-size:13px}.grand{font-size:18px;font-weight:800}.footer{margin-top:18px;text-align:center;font-size:12px;color:#6b7280}</style>
    </head><body><div class="receipt">
    <div class="center"><h1>AyaPOS</h1><div class="muted">فاتورة بيع</div><div class="code">${escapeHtml(detail.invoiceCode)}</div><div class="muted">${formatDateTime(detail.createdAt, 'ar')}</div></div>
    <div class="block"><div class="total-row"><span>العميل</span><strong>${escapeHtml(detail.customerName || 'عميل نقدي')}</strong></div></div>
    <div class="block"><table><thead><tr><th>البند</th><th>كمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="block">
      <div class="total-row grand"><span>الإجمالي</span><strong>${fmtAmount(detail.total)} د.إ</strong></div>
      <div class="total-row"><span>المدفوع</span><strong>${fmtAmount(detail.totalPaid ?? paid)} د.إ</strong></div>
      <div class="total-row"><span>المتبقي</span><strong>${fmtAmount(detail.remaining ?? Math.max(0, (detail.total ?? 0) - paid))} د.إ</strong></div>
    </div>
    ${paymentRows ? `<div class="block"><table><thead><tr><th>طريقة الدفع</th><th>المبلغ</th><th>المرجع</th></tr></thead><tbody>${paymentRows}</tbody></table></div>` : ''}
    <div class="footer">شكرا لزيارتكم</div>
    </div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`)
  win.document.close()
}

export default function Invoices() {
  const { user, branchId } = useAuthStore()
  const slug = user?.tenantSlug ?? ''

  const today = todayInDubaiISO()
  const [activeStatus, setActiveStatus] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', slug, branchId ?? 'login-branch', page, activeStatus, search, dateFrom, dateTo],
    queryFn: () => getInvoices(slug, {
      page, pageSize: 15,
      status: activeStatus || undefined,
      search: search || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    enabled: !!slug,
  })

  const { data: detail, isLoading: detailLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-detail', slug, branchId ?? 'login-branch', detailId],
    queryFn: () => getInvoice(slug, detailId!),
    enabled: !!detailId && detailOpen,
  })

  const openDetail = (id: string) => { setDetailId(id); setDetailOpen(true) }
  const closeDetail = () => setDetailOpen(false)

  const applySearch = () => { setSearch(searchInput); setPage(1) }
  const clearFilters = () => {
    setSearch(''); setSearchInput(''); setDateFrom(''); setDateTo(''); setActiveStatus(''); setPage(1)
  }
  const hasFilters = search || dateFrom || dateTo || activeStatus

  const total = data?.total ?? 0
  const pageSize = 15
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-5">

      {/* Search + date row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="بحث برقم الفاتورة أو اسم العميل..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            className="w-full border border-gray-200 rounded-lg px-3 pe-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-sm">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            max={today}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button onClick={applySearch}>بحث</Button>
        {hasFilters && (
          <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg px-3 py-2">
            <X size={14} /> مسح الفلاتر
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {statusTabs.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => { setActiveStatus(value); setPage(1) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeStatus === value
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-blue-600" /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-right">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">رقم الفاتورة</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">العميل</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">الإجمالي</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">الحالة</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">التاريخ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.items ?? []).map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-blue-500" />
                        <span className="font-mono font-semibold text-gray-900">{inv.invoiceCode}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{inv.customerName ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{inv.total.toFixed(2)} د.إ</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatDateTime(inv.createdAt, 'ar')}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openDetail(inv.id)}
                        className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50"
                        title="عرض التفاصيل"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(data?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-400 py-12">
                      <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                      {hasFilters ? 'لا توجد فواتير بهذه الفلاتر' : 'لا توجد فواتير'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {total > pageSize && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">{total} فاتورة — صفحة {page} من {totalPages}</p>
                <div className="flex gap-2">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                    <ChevronRight size={16} />
                  </button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                    <ChevronLeft size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Invoice Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={closeDetail}
        title="تفاصيل الفاتورة"
        size="xl"
        footer={
          detail ? (
            <>
              <Button variant="secondary" onClick={closeDetail}>إغلاق</Button>
              <Button onClick={() => printInvoiceDetail(detail)}>
                <Printer size={16} />
                طباعة الفاتورة
              </Button>
            </>
          ) : undefined
        }
      >
        {detailLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" className="text-blue-600" /></div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">{detail.invoiceCode}</p>
                <p className="text-sm text-gray-500 mt-1">{formatDateTime(detail.createdAt, 'ar')}</p>
              </div>
              <Badge variant={statusVariant(detail.status)} className="text-sm px-3 py-1">
                {STATUS_LABELS[detail.status] ?? detail.status}
              </Badge>
            </div>

            {detail.customerName && (
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500">العميل</p>
                <p className="font-medium text-gray-900">{detail.customerName}</p>
              </div>
            )}

            <div>
              <h4 className="font-semibold text-gray-700 mb-2">بنود الفاتورة</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-right text-xs text-gray-500">
                    <th className="pb-2">المنتج / الخدمة</th>
                    <th className="pb-2 text-center">الكمية</th>
                    <th className="pb-2 text-center">سعر الوحدة</th>
                    <th className="pb-2 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(detail.items ?? detail.lines ?? []).map((line) => (
                    <tr key={line.id}>
                      <td className="py-2 font-medium text-gray-900">{line.name ?? line.nameSnapshot}</td>
                      <td className="py-2 text-center text-gray-600">{line.qty}</td>
                      <td className="py-2 text-center text-gray-600">
                        {line.unitPriceCents !== undefined ? fmt(line.unitPriceCents) : fmtAmount(line.unitPrice)}
                      </td>
                      <td className="py-2 text-left font-semibold">
                        {line.lineTotalCents !== undefined ? fmt(line.lineTotalCents) : fmtAmount(line.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">المجموع الفرعي</span>
                <span className="font-medium">{fmtAmount(detail.subtotal)} د.إ</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>الإجمالي</span>
                <span className="text-blue-600">{fmtAmount(detail.total)} د.إ</span>
              </div>
              {(detail.totalPaid ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">المدفوع</span>
                  <span className="font-semibold text-green-700">{fmtAmount(detail.totalPaid)} د.إ</span>
                </div>
              )}
              {(detail.remaining ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">المتبقي</span>
                  <span className="font-semibold text-red-600">{fmtAmount(detail.remaining)} د.إ</span>
                </div>
              )}
            </div>

            {(detail.payments ?? []).length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">المدفوعات</h4>
                <div className="space-y-2">
                  {(detail.payments ?? []).map((p) => (
                    <div key={p.id} className="flex justify-between items-center bg-green-50 rounded-lg px-4 py-2">
                      <span className="text-sm text-green-800">
                        {paymentMethodLabel(p.method)}
                        {p.reference ? ` — ${p.reference}` : ''}
                        {' — '}
                        {formatDateTime(p.paidAt, 'ar')}
                      </span>
                      <span className="font-semibold text-green-700">
                        {p.amountCents !== undefined ? fmt(p.amountCents) : fmtAmount(p.amount)} د.إ
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
