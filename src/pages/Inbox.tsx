import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarDays, Receipt, Check, X, Clock, CheckCircle2 } from 'lucide-react'
import { getAppointments, updateAppointmentStatus } from '../api/appointments'
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
  const isAdminRole = user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'TENANT'

  const [activeTab, setActiveTab] = useState<Tab>('appointments')
  const [actingId, setActingId] = useState<string | null>(null)

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

  /* Filter appointments: non-admin sees only their own */
  const myAppointments = (apptPage?.items ?? [])
    .filter((a) => isAdminRole || !a.resourceName || a.resourceName === user?.username)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())

  const pendingApptCount = myAppointments.filter((a) => a.status === 'scheduled').length
  const pendingExpCount = submittedExpenses?.length ?? 0
  const totalPending = pendingApptCount + pendingExpCount

  /* ── Mutations ── */
  const apptMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateAppointmentStatus(slug, id, status),
    onMutate: ({ id }) => setActingId(id),
    onSettled: () => setActingId(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments', slug] }),
  })

  const approveMut = useMutation({
    mutationFn: (expenseId: string) => updateExpenseStatus(slug, expenseId, 'approved'),
    onMutate: (id) => setActingId(id),
    onSettled: () => setActingId(null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', slug] }),
  })

  /* ── Render ── */
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Bell size={20} className="text-blue-600" />
          {totalPending > 0 && (
            <span className="absolute -top-1 -end-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {totalPending > 9 ? '9+' : totalPending}
            </span>
          )}
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">الصندوق الوارد</h1>
          <p className="text-sm text-gray-500">
            {totalPending > 0
              ? `${totalPending} ${totalPending === 1 ? 'بند يحتاج إلى إجراء' : 'بنود تحتاج إلى إجراء'}`
              : 'لا يوجد إجراءات معلقة — كل شيء على ما يرام'}
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
          مواعيدي اليوم
          {pendingApptCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-bold">
              {pendingApptCount}
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

      {/* ── My Appointments tab ── */}
      {activeTab === 'appointments' && (
        <Card>
          {apptLoading ? (
            <div className="flex justify-center py-14"><Spinner size="lg" className="text-blue-600" /></div>
          ) : myAppointments.length === 0 ? (
            <div className="text-center py-16">
              <CalendarDays size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="text-gray-500 font-medium">لا توجد مواعيد مسجلة لك اليوم</p>
              <p className="text-gray-400 text-sm mt-1">ستظهر هنا المواعيد المحجوزة باسمك</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {myAppointments.map((appt) => {
                const isPending = appt.status === 'scheduled'
                const isActing = actingId === appt.id

                return (
                  <div
                    key={appt.id}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors ${isPending ? 'hover:bg-blue-50/40' : ''}`}
                  >
                    {/* Time + icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                      ${appt.status === 'completed' ? 'bg-gray-100' : appt.status === 'cancelled' || appt.status === 'no_show' ? 'bg-red-50' : 'bg-blue-50'}`}
                    >
                      {appt.status === 'completed'
                        ? <CheckCircle2 size={16} className="text-gray-400" />
                        : <Clock size={16} className={appt.status === 'cancelled' || appt.status === 'no_show' ? 'text-red-400' : 'text-blue-500'} />
                      }
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold truncate ${appt.status === 'completed' || appt.status === 'cancelled' ? 'text-gray-400' : 'text-gray-900'}`}>
                          {appt.customerName || '—'}
                        </p>
                        {appt.customerPhone && (
                          <span className="text-xs text-gray-400 font-mono">{appt.customerPhone}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {appt.serviceName}
                        <span className="mx-1.5 text-gray-300">·</span>
                        {formatTime(appt.startAt, lang)} — {formatTime(appt.endAt, lang)}
                        {isAdminRole && appt.resourceName && (
                          <span className="ms-2 text-blue-500 font-medium">({appt.resourceName})</span>
                        )}
                      </p>
                    </div>

                    {/* Status + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={APPT_STATUS_VARIANT[appt.status] ?? 'gray'}>
                        {APPT_STATUS_LABEL[appt.status] ?? appt.status}
                      </Badge>

                      {isPending && (
                        <>
                          <button
                            onClick={() => apptMut.mutate({ id: appt.id, status: 'confirmed' })}
                            disabled={isActing}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                              bg-green-50 text-green-700 border border-green-200 hover:bg-green-100
                              disabled:opacity-50 transition-colors"
                          >
                            <Check size={12} />
                            قبول
                          </button>
                          <button
                            onClick={() => apptMut.mutate({ id: appt.id, status: 'cancelled' })}
                            disabled={isActing}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                              bg-red-50 text-red-700 border border-red-200 hover:bg-red-100
                              disabled:opacity-50 transition-colors"
                          >
                            <X size={12} />
                            رفض
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Today summary footer */}
          {myAppointments.length > 0 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                {myAppointments.filter((a) => a.status === 'scheduled').length} محجوز
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                {myAppointments.filter((a) => a.status === 'confirmed').length} مؤكد
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                {myAppointments.filter((a) => a.status === 'checked_in').length} تسجيل حضور
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                {myAppointments.filter((a) => a.status === 'completed').length} مكتمل
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                {myAppointments.filter((a) => a.status === 'no_show' || a.status === 'cancelled').length} غياب/إلغاء
              </span>
            </div>
          )}
        </Card>
      )}

      {/* ── Expense Approvals tab ── */}
      {activeTab === 'expenses' && canApproveExpenses && (
        <Card>
          {expLoading ? (
            <div className="flex justify-center py-14"><Spinner size="lg" className="text-blue-600" /></div>
          ) : (submittedExpenses?.length ?? 0) === 0 ? (
            <div className="text-center py-16">
              <Receipt size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="text-gray-500 font-medium">لا توجد مصاريف بانتظار الاعتماد</p>
              <p className="text-gray-400 text-sm mt-1">ستظهر هنا المصاريف التي تحتاج موافقتك</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {submittedExpenses!.map((exp) => {
                const isActing = actingId === exp.id
                return (
                  <div key={exp.id} className="flex items-center gap-4 px-5 py-4 hover:bg-orange-50/30 transition-colors">
                    {/* Icon */}
                    <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Receipt size={16} className="text-orange-500" />
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 truncate">{exp.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{exp.category}</p>
                    </div>

                    {/* Amount + action */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-end">
                        <p className="text-sm font-bold text-gray-900">
                          {exp.amount.toFixed(2)} {exp.currencyCode}
                        </p>
                        <p className="text-xs text-blue-600 font-medium">مقدمة للاعتماد</p>
                      </div>
                      <button
                        onClick={() => approveMut.mutate(exp.id)}
                        disabled={isActing}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold
                          bg-green-50 text-green-700 border border-green-200 hover:bg-green-100
                          disabled:opacity-50 transition-colors"
                      >
                        <Check size={12} />
                        اعتماد
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Total footer */}
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {submittedExpenses!.length} مصروف بانتظار الاعتماد
                </span>
                <span className="text-sm font-bold text-gray-800">
                  {submittedExpenses!.reduce((s, e) => s + e.amount, 0).toFixed(2)}{' '}
                  <span className="text-xs text-gray-400 font-normal">
                    {submittedExpenses![0]?.currencyCode}
                  </span>
                </span>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
