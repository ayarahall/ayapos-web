import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarDays, Receipt, Check, Clock, CheckCircle2 } from 'lucide-react'
import { getAppointments } from '../api/appointments'
import { getExpenses, updateExpenseStatus } from '../api/expenses'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { formatTime, todayInDubaiISO, dateRangeForDubaiDay } from '../utils/date'

const CAN_APPROVE_EXPENSES = new Set(['OWNER', 'ADMIN', 'TENANT', 'BRANCH_MANAGER', 'HR'])

const APPT_STATUS_LABEL: Record<string, string> = {
  scheduled: 'محجوز',
  confirmed: 'مؤكد',
  checked_in: 'تسجيل الحضور',
  completed: 'مكتمل',
  no_show: 'لم يحضر',
  cancelled: 'ملغى',
}

const APPT_STATUS_VARIANT: Record<string, 'blue' | 'green' | 'yellow' | 'gray' | 'red' | 'purple'> = {
  scheduled: 'blue',
  confirmed: 'green',
  checked_in: 'yellow',
  completed: 'gray',
  no_show: 'red',
  cancelled: 'red',
}

type Tab = 'appointments' | 'expenses'

export default function Inbox() {
  const qc = useQueryClient()
  const { user, branchId } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const slug = user?.tenantSlug ?? ''
  const canApproveExpenses = CAN_APPROVE_EXPENSES.has(user?.role ?? '')

  const [activeTab, setActiveTab] = useState<Tab>('appointments')
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const today = todayInDubaiISO()
  const { dateFrom, dateTo } = dateRangeForDubaiDay(today)

  /* ── Queries ── */
  const { data: apptPage, isLoading: apptLoading } = useQuery({
    queryKey: ['appointments', slug, branchId ?? 'login-branch', 'inbox-today', dateFrom, dateTo],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 100, dateFrom, dateTo }),
    enabled: !!slug,
    refetchInterval: 30_000,
  })

  const { data: submittedExpenses, isLoading: expLoading } = useQuery({
    queryKey: ['expenses', slug, branchId ?? 'login-branch', 'inbox-submitted'],
    queryFn: () => getExpenses(slug, { page: 1, pageSize: 50 }),
    enabled: !!slug && canApproveExpenses,
    select: (d) => d.items.filter((e) => e.status === 'submitted'),
  })

  const isManager = CAN_APPROVE_EXPENSES.has(user?.role ?? '')
  const myUsername = user?.username?.trim().toLowerCase() ?? ''

  /* Managers/admins see all; everyone else sees only their own */
  const todayAppointments = (apptPage?.items ?? [])
    .filter((a) => isManager || !a.resourceName || a.resourceName.trim().toLowerCase() === myUsername)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())

  const pendingExpCount = submittedExpenses?.length ?? 0

  /* ── Expense approve mutation ── */
  const approveMut = useMutation({
    mutationFn: (expenseId: string) => updateExpenseStatus(slug, expenseId, 'approved'),
    onMutate: (id) => setApprovingId(id),
    onSettled: () => setApprovingId(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', slug] }),
  })

  /* ── Render ── */
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Bell size={20} className="text-blue-600" />
          {pendingExpCount > 0 && (
            <span className="absolute -top-1 -end-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {pendingExpCount > 9 ? '9+' : pendingExpCount}
            </span>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">الصندوق الوارد</h1>
          <p className="text-sm text-gray-500">
            {pendingExpCount > 0
              ? `${pendingExpCount} مصروف ${pendingExpCount === 1 ? 'يحتاج' : 'يحتاجون'} إلى اعتماد`
              : 'لا توجد إجراءات معلقة'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('appointments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
            ${activeTab === 'appointments' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <CalendarDays size={15} />
          مواعيد اليوم
          {todayAppointments.length > 0 && (
            <span className="bg-gray-400 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-bold">
              {todayAppointments.length}
            </span>
          )}
        </button>

        {canApproveExpenses && (
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === 'expenses' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Receipt size={15} />
            اعتماد المصاريف
            {pendingExpCount > 0 && (
              <span className="bg-orange-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-bold">
                {pendingExpCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── Appointments tab (notifications only) ── */}
      {activeTab === 'appointments' && (
        <Card>
          {apptLoading ? (
            <div className="flex justify-center py-14"><Spinner size="lg" className="text-blue-600" /></div>
          ) : todayAppointments.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="text-gray-500 font-medium">لا توجد مواعيد مسجلة باسمك اليوم</p>
              <p className="text-gray-400 text-sm mt-1">ستظهر هنا مواعيدك عندما يتم حجزها تحت اسم ({user?.username})</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todayAppointments.map((appt) => (
                <div key={appt.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                    ${appt.status === 'completed' ? 'bg-gray-100'
                      : appt.status === 'cancelled' || appt.status === 'no_show' ? 'bg-red-50'
                      : appt.status === 'checked_in' ? 'bg-yellow-50'
                      : 'bg-blue-50'}`}
                  >
                    {appt.status === 'completed'
                      ? <CheckCircle2 size={16} className="text-gray-400" />
                      : <Clock size={16} className={
                          appt.status === 'cancelled' || appt.status === 'no_show' ? 'text-red-400'
                          : appt.status === 'checked_in' ? 'text-yellow-500'
                          : 'text-blue-500'
                        } />
                    }
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-semibold truncate
                        ${appt.status === 'completed' || appt.status === 'cancelled' ? 'text-gray-400' : 'text-gray-900'}`}>
                        {appt.customerName || '—'}
                      </p>
                      {appt.customerPhone && (
                        <span className="text-xs text-gray-400 font-mono">{appt.customerPhone}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {appt.serviceName}
                      {appt.resourceName && (
                        <>
                          <span className="mx-1.5 text-gray-300">·</span>
                          <span className="text-blue-500">{appt.resourceName}</span>
                        </>
                      )}
                      <span className="mx-1.5 text-gray-300">·</span>
                      {formatTime(appt.startAt, lang)} — {formatTime(appt.endAt, lang)}
                    </p>
                  </div>

                  {/* Status badge only — no actions */}
                  <Badge variant={APPT_STATUS_VARIANT[appt.status] ?? 'gray'}>
                    {APPT_STATUS_LABEL[appt.status] ?? appt.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Summary footer */}
          {todayAppointments.length > 0 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
              {[
                { key: 'scheduled', label: 'محجوز', color: 'bg-blue-400' },
                { key: 'confirmed', label: 'مؤكد', color: 'bg-green-400' },
                { key: 'checked_in', label: 'حضر', color: 'bg-yellow-400' },
                { key: 'completed', label: 'مكتمل', color: 'bg-gray-400' },
                { key: 'no_show', label: 'غياب', color: 'bg-red-400' },
                { key: 'cancelled', label: 'ملغى', color: 'bg-red-300' },
              ].map(({ key, label, color }) => {
                const count = todayAppointments.filter((a) => a.status === key).length
                if (count === 0) return null
                return (
                  <span key={key} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
                    {count} {label}
                  </span>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── Expense Approvals tab ── */}
      {activeTab === 'expenses' && canApproveExpenses && (
        <Card>
          {expLoading ? (
            <div className="flex justify-center py-14"><Spinner size="lg" className="text-blue-600" /></div>
          ) : pendingExpCount === 0 ? (
            <div className="text-center py-16">
              <Receipt size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="text-gray-500 font-medium">لا توجد مصاريف بانتظار الاعتماد</p>
              <p className="text-gray-400 text-sm mt-1">ستظهر هنا المصاريف التي تحتاج موافقتك</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {submittedExpenses!.map((exp) => (
                <div key={exp.id} className="flex items-center gap-4 px-5 py-4 hover:bg-orange-50/30 transition-colors">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Receipt size={16} className="text-orange-500" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">{exp.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{exp.category}</p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-end">
                      <p className="text-sm font-bold text-gray-900">
                        {exp.amount.toFixed(2)} {exp.currencyCode}
                      </p>
                      <p className="text-xs text-blue-600 font-medium">بانتظار الاعتماد</p>
                    </div>
                    <button
                      onClick={() => approveMut.mutate(exp.id)}
                      disabled={approvingId === exp.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
                        bg-green-50 text-green-700 border border-green-200 hover:bg-green-100
                        disabled:opacity-50 transition-colors"
                    >
                      <Check size={12} />
                      اعتماد
                    </button>
                  </div>
                </div>
              ))}

              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {pendingExpCount} مصروف بانتظار الاعتماد
                </span>
                <span className="text-sm font-bold text-gray-800">
                  {submittedExpenses!.reduce((s, e) => s + e.amount, 0).toFixed(2)}{' '}
                  <span className="text-xs text-gray-400 font-normal">{submittedExpenses![0]?.currencyCode}</span>
                </span>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
