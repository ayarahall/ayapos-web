import { useEffect, useRef, useState } from 'react'
import { Bell, CalendarDays, Receipt, UserCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getAppointments } from '../../api/appointments'
import { getExpenses } from '../../api/expenses'
import { useAuthStore } from '../../store/authStore'
import { useLangStore } from '../../store/langStore'
import { dateRangeForDubaiDay, formatDate, formatTime, todayInDubaiISO } from '../../utils/date'

interface HeaderProps {
  title: string
}

type NotificationItem = {
  id: string
  title: string
  detail: string
  type: 'appointment' | 'expense' | 'checkin'
  to: string
}

const CAN_APPROVE_EXPENSES = new Set(['OWNER', 'ADMIN', 'TENANT', 'BRANCH_MANAGER', 'HR'])

export default function Header({ title }: HeaderProps) {
  const { user, branchId } = useAuthStore()
  const { lang, toggle } = useLangStore()
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const slug = user?.tenantSlug ?? ''
  const dateStr = formatDate(new Date(), lang)
  const today = todayInDubaiISO()
  const { dateFrom, dateTo } = dateRangeForDubaiDay(today)
  const canApproveExpenses = user?.permissionsConfigured
    ? (user.permissions ?? []).includes('expenses.approve')
    : CAN_APPROVE_EXPENSES.has(user?.role ?? '')

  const { data: appointmentsPage } = useQuery({
    queryKey: ['header-notifications-appointments', slug, branchId ?? 'login-branch', dateFrom, dateTo],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 80, dateFrom, dateTo }),
    enabled: !!slug && user?.scope === 'tenant',
    refetchInterval: 30_000,
  })

  const { data: submittedExpenses } = useQuery({
    queryKey: ['header-notifications-expenses', slug, branchId ?? 'login-branch'],
    queryFn: () => getExpenses(slug, { page: 1, pageSize: 20, status: 'submitted' }),
    enabled: !!slug && user?.scope === 'tenant' && canApproveExpenses,
    refetchInterval: 45_000,
    select: (d) => d.items,
  })

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const now = Date.now()
  const appointments = appointmentsPage?.items ?? []
  const upcomingAppointments = appointments
    .filter((item) => ['scheduled', 'confirmed'].includes(item.status))
    .filter((item) => {
      const startsAt = new Date(item.startAt).getTime()
      return startsAt >= now && startsAt <= now + 60 * 60 * 1000
    })
    .slice(0, 4)

  const checkedInAppointments = appointments
    .filter((item) => item.status === 'checked_in')
    .slice(0, 4)

  const notifications: NotificationItem[] = [
    ...upcomingAppointments.map((item) => ({
      id: `appt-${item.id}`,
      type: 'appointment' as const,
      to: '/appointments',
      title: lang === 'ar' ? 'موعد قريب' : 'Upcoming appointment',
      detail: `${item.customerName || '-'} - ${formatTime(item.startAt, lang)}`,
    })),
    ...checkedInAppointments.map((item) => ({
      id: `checkin-${item.id}`,
      type: 'checkin' as const,
      to: '/pos',
      title: lang === 'ar' ? 'عميل بانتظار الدفع' : 'Customer waiting in POS',
      detail: `${item.customerName || '-'} - ${item.serviceName || ''}`,
    })),
    ...(submittedExpenses ?? []).slice(0, 5).map((expense) => ({
      id: `expense-${expense.id}`,
      type: 'expense' as const,
      to: '/inbox',
      title: lang === 'ar' ? 'مصروف بانتظار الاعتماد' : 'Expense pending approval',
      detail: `${expense.title} - ${expense.amount.toFixed(2)} ${expense.currencyCode}`,
    })),
  ]

  const notificationCount = notifications.length
  const iconFor = (type: NotificationItem['type']) => {
    if (type === 'expense') return <Receipt size={14} className="text-orange-500" />
    if (type === 'checkin') return <UserCheck size={14} className="text-emerald-500" />
    return <CalendarDays size={14} className="text-rose-500" />
  }

  return (
    <header className="h-16 bg-white/95 border-b border-rose-100 px-6 flex items-center justify-between flex-shrink-0">
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>

      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500 hidden md:block">{dateStr}</span>

        <button
          onClick={toggle}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold
            text-gray-600 hover:bg-rose-50 hover:border-rose-200 transition-colors tracking-wide"
          title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
        >
          {lang === 'ar' ? 'EN' : 'عر'}
        </button>

        <div ref={menuRef} className="relative">
          <button
            onClick={() => setOpen((value) => !value)}
            className="relative p-2 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
            title={lang === 'ar' ? 'التنبيهات' : 'Notifications'}
          >
            <Bell size={20} />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute end-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-bold text-gray-900">{lang === 'ar' ? 'التنبيهات' : 'Notifications'}</p>
                {notificationCount > 0 && <span className="text-xs text-gray-400">{notificationCount}</span>}
              </div>

              {notificationCount === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  {lang === 'ar' ? 'لا توجد تنبيهات حالياً' : 'No notifications right now'}
                </p>
              ) : (
                <div className="max-h-96 divide-y divide-gray-50 overflow-y-auto">
                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { setOpen(false); navigate(item.to) }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-gray-50"
                    >
                      <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50">
                        {iconFor(item.type)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-gray-900">{item.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">{item.detail}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-rose-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
            {user?.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden md:block">
            {user?.username}
          </span>
        </div>
      </div>
    </header>
  )
}