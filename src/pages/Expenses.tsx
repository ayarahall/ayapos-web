import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Receipt, ScanLine, ChevronLeft, ChevronRight,
  Sparkles, AlertCircle, CheckCircle, Upload, Tag, Check
} from 'lucide-react'
import {
  getExpenses, getAiStatus, createExpense, analyzeReceipt,
  updateExpenseStatus, type Expense,
} from '../api/expenses'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { formatDate, todayInDubaiISO } from '../utils/date'

/* ── constants ── */

const STATUS_AR: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مقدمة',
  approved: 'معتمدة',
  paid: 'مدفوعة',
  cancelled: 'ملغاة',
}

const STATUS_VARIANT: Record<string, 'gray' | 'blue' | 'green' | 'yellow' | 'red'> = {
  draft: 'gray',
  submitted: 'blue',
  approved: 'green',
  paid: 'yellow',
  cancelled: 'red',
}

const ALL_STATUSES = ['draft', 'submitted', 'approved', 'paid', 'cancelled']

const COMMON_CATEGORIES = [
  'إيجار', 'مرافق', 'رواتب', 'تسويق', 'صيانة',
  'مستلزمات', 'نقل', 'ضرائب', 'أخرى',
]

/* ── helpers ── */

const toDateInput = (iso: string) => iso.slice(0, 10)

interface ExpenseForm {
  title: string
  category: string
  customCategory: string
  amount: string
  currencyCode: string
  expenseDate: string
  notes: string
}

const emptyForm = (): ExpenseForm => ({
  title: '', category: '', customCategory: '',
  amount: '', currencyCode: 'AED',
  expenseDate: todayInDubaiISO(),
  notes: '',
})

/* ════════════════════════════════════════════ */
export default function Expenses() {
  const qc = useQueryClient()
  const { user, branchId } = useAuthStore()
  const slug = user?.tenantSlug ?? ''
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* list state */
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)

  /* modal state */
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ExpenseForm>(emptyForm())
  const [aiLoading, setAiLoading] = useState(false)
  const [aiConfidence, setAiConfidence] = useState<number | null>(null)
  const [aiVendor, setAiVendor] = useState('')

  /* status modal */
  const [statusModalItem, setStatusModalItem] = useState<Expense | null>(null)
  const [newStatus, setNewStatus] = useState('')

  /* ── queries ── */
  const { data, isLoading } = useQuery({
    queryKey: ['expenses', slug, branchId ?? 'login-branch', page, categoryFilter, search],
    queryFn: () => getExpenses(slug, {
      page, pageSize: 15,
      category: categoryFilter || undefined,
      q: search || undefined,
    }),
    enabled: !!slug,
  })

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status', slug, branchId ?? 'login-branch'],
    queryFn: () => getAiStatus(slug),
    enabled: !!slug,
  })

  /* ── mutations ── */
  const createMut = useMutation({
    mutationFn: (f: ExpenseForm) => {
      const cat = f.category === '__custom__' ? f.customCategory : f.category
      return createExpense(slug, {
        title: f.title,
        category: cat,
        amount: parseFloat(f.amount),
        currencyCode: f.currencyCode,
        expenseDate: new Date(f.expenseDate).toISOString(),
        notes: f.notes || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', slug, branchId ?? 'login-branch'] })
      setModalOpen(false)
    },
  })

  const statusMut = useMutation({
    mutationFn: () => updateExpenseStatus(slug, statusModalItem!.id, newStatus),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', slug, branchId ?? 'login-branch'] })
      setStatusModalItem(null)
    },
  })

  const approveMut = useMutation({
    mutationFn: (expenseId: string) => updateExpenseStatus(slug, expenseId, 'approved'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', slug, branchId ?? 'login-branch'] })
    },
  })

  /* ── AI receipt scan ── */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAiLoading(true)
    setAiConfidence(null)
    setAiVendor('')
    try {
      const result = await analyzeReceipt(slug, file)
      setForm(p => ({
        ...p,
        title: result.title || p.title,
        category: COMMON_CATEGORIES.includes(result.category) ? result.category : '__custom__',
        customCategory: COMMON_CATEGORIES.includes(result.category) ? '' : result.category,
        amount: result.amount > 0 ? result.amount.toString() : p.amount,
        currencyCode: result.currencyCode || p.currencyCode,
        expenseDate: result.expenseDate ? toDateInput(result.expenseDate) : p.expenseDate,
        notes: result.notes || p.notes,
      }))
      setAiConfidence(result.confidence)
      setAiVendor(result.vendorName)
    } catch {
      alert('فشل تحليل الفاتورة. يرجى التحقق من الصورة والمحاولة مرة أخرى.')
    } finally {
      setAiLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /* ── handlers ── */
  const openCreate = () => { setForm(emptyForm()); setAiConfidence(null); setAiVendor(''); setModalOpen(true) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMut.mutate(form)
  }

  const f = (k: keyof ExpenseForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }))

  const effectiveCategory = form.category === '__custom__' ? form.customCategory : form.category

  /* totals by status */
  const items = data?.items ?? []
  const totalAmount = items.reduce((s, i) => s + i.amount, 0)

  /* ════════════════════════════════════════════ */
  return (
    <div className="space-y-5">

      {/* ── summary row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {ALL_STATUSES.map((s) => {
          const count = items.filter(i => i.status === s).length
          return (
            <button
              key={s}
              onClick={() => { setCategoryFilter(''); setPage(1) }}
              className={`bg-white rounded-xl border px-4 py-3 text-right hover:shadow-sm transition-shadow
                ${categoryFilter === '' && search === '' ? 'border-gray-200' : 'border-gray-100'}`}
            >
              <Badge variant={STATUS_VARIANT[s]} className="mb-2">{STATUS_AR[s]}</Badge>
              <p className="text-xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-400 mt-0.5">سجل</p>
            </button>
          )
        })}
      </div>

      {/* ── toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category pills */}
          <button
            onClick={() => { setCategoryFilter(''); setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${categoryFilter === '' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
          >
            الكل
          </button>
          {COMMON_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setCategoryFilter(cat); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${categoryFilter === cat ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="بحث..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full border border-gray-300 rounded-lg px-3 pe-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={openCreate}>
            <Plus size={16} />
            مصروف جديد
          </Button>
        </div>
      </div>

      {/* ── table ── */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" className="text-blue-600" />
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-right">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">العنوان</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">التصنيف</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">المبلغ</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">التاريخ</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">الحالة</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">ملاحظات</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Receipt size={15} className="text-orange-500" />
                        </div>
                        <p className="font-medium text-gray-900">{exp.title}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-gray-600 text-xs bg-gray-100 px-2 py-1 rounded-full">
                        <Tag size={11} />
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {exp.amount.toFixed(2)}
                      <span className="text-xs text-gray-400 font-normal ms-1">{exp.currencyCode}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {formatDate(exp.expenseDate, 'ar')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setStatusModalItem(exp); setNewStatus(exp.status) }}
                        title="تغيير الحالة"
                      >
                        <Badge variant={STATUS_VARIANT[exp.status] ?? 'gray'}>
                          {STATUS_AR[exp.status] ?? exp.status}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate">
                      {exp.notes || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {exp.status === 'submitted' && (
                        <button
                          onClick={() => approveMut.mutate(exp.id)}
                          disabled={approveMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors"
                        >
                          <Check size={12} />
                          اعتماد
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-14 text-gray-400">
                      <Receipt size={36} className="mx-auto mb-2 text-gray-200" />
                      لا توجد مصاريف
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* total row */}
            {items.length > 0 && (
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  إجمالي الصفحة الحالية
                </span>
                <span className="text-sm font-bold text-gray-900">
                  {totalAmount.toFixed(2)} {items[0]?.currencyCode}
                </span>
              </div>
            )}

            {/* pagination */}
            {(data?.total ?? 0) > 15 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">{data?.total} مصروف — صفحة {page}</p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    disabled={(page * 15) >= (data?.total ?? 0)}
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

      {/* ════ CREATE MODAL ════ */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="إضافة مصروف جديد"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>إلغاء</Button>
            <Button form="expense-form" type="submit" loading={createMut.isPending}>
              حفظ المصروف
            </Button>
          </>
        }
      >
        {/* AI scan bar */}
        <div className={`mb-4 rounded-xl border px-4 py-3 flex items-center gap-3
          ${aiStatus?.enabled ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
          <Sparkles size={18} className={aiStatus?.enabled ? 'text-purple-500' : 'text-gray-400'} />
          <div className="flex-1">
            <p className={`text-sm font-medium ${aiStatus?.enabled ? 'text-purple-800' : 'text-gray-500'}`}>
              {aiStatus?.enabled ? 'تحليل الفاتورة بالذكاء الاصطناعي' : 'الذكاء الاصطناعي غير مفعّل'}
            </p>
            {!aiStatus?.enabled && (
              <p className="text-xs text-gray-400 mt-0.5">أضف OpenAI API Key لتفعيل هذه الميزة</p>
            )}
          </div>
          {aiStatus?.enabled && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                loading={aiLoading}
                disabled={aiLoading}
              >
                {aiLoading ? 'جاري التحليل...' : <><Upload size={14} /> رفع فاتورة</>}
              </Button>
            </>
          )}
        </div>

        {/* AI result banner */}
        {aiConfidence !== null && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-800">
              <p className="font-medium">
                تم ملء البيانات تلقائياً
                {aiVendor && <span> — المورد: <strong>{aiVendor}</strong></span>}
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                دقة التحليل: {Math.round(aiConfidence * 100)}% — راجع البيانات قبل الحفظ
              </p>
            </div>
          </div>
        )}

        <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              العنوان <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.title}
              onChange={f('title')}
              placeholder="مثال: فاتورة الكهرباء"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              التصنيف <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.category}
              onChange={f('category')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- اختر التصنيف --</option>
              {COMMON_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="__custom__">تصنيف مخصص...</option>
            </select>
          </div>

          {form.category === '__custom__' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                التصنيف المخصص <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={form.customCategory}
                onChange={f('customCategory')}
                placeholder="أدخل التصنيف"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Amount + Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                المبلغ <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={f('amount')}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">العملة</label>
              <select
                value={form.currencyCode}
                onChange={f('currencyCode')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="AED">AED</option>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              تاريخ المصروف <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="date"
              value={form.expenseDate}
              onChange={f('expenseDate')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={f('notes')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Preview */}
          {form.title && effectiveCategory && form.amount && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-3">
              <ScanLine size={16} className="text-blue-500 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                <strong>{form.title}</strong> — {effectiveCategory} —{' '}
                <strong>{parseFloat(form.amount || '0').toFixed(2)} {form.currencyCode}</strong>
              </p>
            </div>
          )}

          {createMut.isError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <AlertCircle size={15} />
              حدث خطأ أثناء الحفظ. يرجى المحاولة مرة أخرى.
            </div>
          )}
        </form>
      </Modal>

      {/* ════ STATUS MODAL ════ */}
      <Modal
        open={!!statusModalItem}
        onClose={() => setStatusModalItem(null)}
        title="تغيير حالة المصروف"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusModalItem(null)}>إلغاء</Button>
            <Button onClick={() => statusMut.mutate()} loading={statusMut.isPending}>
              حفظ الحالة
            </Button>
          </>
        }
      >
        {statusModalItem && (
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 mb-2">
              <p className="font-medium">{statusModalItem.title}</p>
              <p className="text-gray-500 mt-0.5">
                {statusModalItem.amount.toFixed(2)} {statusModalItem.currencyCode} — {statusModalItem.category}
              </p>
            </div>
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setNewStatus(s)}
                className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border-2 transition-all
                  ${newStatus === s ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
              >
                <span className="text-sm font-medium text-gray-800">{STATUS_AR[s]}</span>
                <Badge variant={STATUS_VARIANT[s] ?? 'gray'}>{STATUS_AR[s]}</Badge>
              </button>
            ))}
            {statusMut.isError && (
              <p className="text-sm text-red-600">حدث خطأ أثناء التحديث</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
