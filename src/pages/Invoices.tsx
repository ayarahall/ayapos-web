import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { getInvoices, getInvoice } from '../api/invoices'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import Modal from '../components/ui/Modal'
import { STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../types'
import type { InvoiceDetail } from '../types'
import { formatDateTime } from '../utils/date'

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
  if (method === 'Transfer') return 'تحويل بنكي'
  return method
}

export default function Invoices() {
  const { user, branchId } = useAuthStore()
  const slug = user?.tenantSlug ?? ''

  const [activeStatus, setActiveStatus] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', slug, branchId ?? 'login-branch', page, activeStatus],
    queryFn: () => getInvoices(slug, { page, pageSize: 15, status: activeStatus || undefined }),
    enabled: !!slug,
  })

  const { data: detail, isLoading: detailLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-detail', slug, branchId ?? 'login-branch', detailId],
    queryFn: () => getInvoice(slug, detailId!),
    enabled: !!detailId && detailOpen,
  })

  const openDetail = (id: string) => { setDetailId(id); setDetailOpen(true) }
  const closeDetail = () => setDetailOpen(false)

  const total = data?.total ?? 0
  const pageSize = 15
  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-5">
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
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {inv.total.toFixed(2)} د.إ
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(inv.status)}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDateTime(inv.createdAt, 'ar')}
                    </td>
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
                      لا توجد فواتير
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {total > pageSize && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  {total} فاتورة — صفحة {page} من {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Invoice Detail Modal */}
      <Modal open={detailOpen} onClose={closeDetail} title="تفاصيل الفاتورة" size="xl">
        {detailLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" className="text-blue-600" /></div>
        ) : detail ? (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold font-mono text-gray-900">{detail.invoiceCode}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {formatDateTime(detail.createdAt, 'ar')}
                </p>
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

            {/* Lines */}
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

            {/* Totals */}
            <div className="border-t border-gray-200 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">المجموع الفرعي</span>
                <span className="font-medium">{fmtAmount(detail.subtotal)} د.إ</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>الإجمالي</span>
                <span className="text-blue-600">{fmtAmount(detail.total)} د.إ</span>
              </div>
            </div>

            {/* Payments */}
            {(detail.payments ?? []).length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">المدفوعات</h4>
                <div className="space-y-2">
                  {(detail.payments ?? []).map((p) => (
                    <div key={p.id} className="flex justify-between items-center bg-green-50 rounded-lg px-4 py-2">
                      <span className="text-sm text-green-800">
                        {paymentMethodLabel(p.method)}
                        {p.reference ? ` - ${p.reference}` : ''}
                        {' - '}
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
