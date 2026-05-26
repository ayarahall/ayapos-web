import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, CheckCircle2, Clock, ShoppingCart, DollarSign, TrendingUp, AlertCircle, Package } from 'lucide-react'
import { getDailySummary, getCurrentSession } from '../api/cashier'
import { getInvoices } from '../api/invoices'
import { getAppointments } from '../api/appointments'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { STATUS_LABELS } from '../types'
import { formatDate, formatShortDate, formatTime, todayInDubaiISO } from '../utils/date'
import { readPosDraftTabs, type PosDraftTab } from '../utils/posDrafts'

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(cents / 100)

const isOpenAppointment = (status: string) =>
  !['completed', 'cancelled', 'no_show', 'noshow'].includes(status.toLowerCase())

const statusVariant = (s: string): 'green' | 'yellow' | 'blue' | 'gray' | 'red' => {
  if (s === 'Paid') return 'green'
  if (s === 'PartiallyPaid') return 'yellow'
  if (s === 'Posted') return 'blue'
  if (s === 'Draft') return 'gray'
  return 'red'
}

const nextDayISO = (date: string) => {
  const value = new Date(`${date}T00:00:00`)
  value.setDate(value.getDate() + 1)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function Dashboard() {
  const { user, branchId } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const t = useT()
  const slug = user?.tenantSlug ?? ''
  const isPlatform = user?.scope === 'platform'
  const [openPosDrafts, setOpenPosDrafts] = useState<PosDraftTab[]>(() => readPosDraftTabs())

  useEffect(() => {
    const refreshDrafts = () => setOpenPosDrafts(readPosDraftTabs())
    window.addEventListener('ayapos:pos-drafts-changed', refreshDrafts)
    window.addEventListener('storage', refreshDrafts)
    return () => {
      window.removeEventListener('ayapos:pos-drafts-changed', refreshDrafts)
      window.removeEventListener('storage', refreshDrafts)
    }
  }, [])

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['daily-summary', slug, branchId ?? 'login-branch'],
    queryFn: () => getDailySummary(slug),
    enabled: !!slug,
  })

  const { data: session } = useQuery({
    queryKey: ['cashier-session', slug, branchId ?? 'login-branch'],
    queryFn: () => getCurrentSession(slug),
    enabled: !!slug,
  })

  const { data: invoicesPage, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices', slug, branchId ?? 'login-branch', 'recent'],
    queryFn: () => getInvoices(slug, { page: 1, pageSize: 6 }),
    enabled: !!slug,
  })

  const today = todayInDubaiISO()
  const tomorrow = nextDayISO(today)

  const { data: todayAppointments, isLoading: appointmentsLoading } = useQuery({
    queryKey: ['appointments', slug, branchId ?? 'login-branch', 'dashboard-today', today, tomorrow],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 25, dateFrom: today, dateTo: tomorrow }),
    enabled: !!slug,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t.dashboard.goodMorning : hour < 17 ? t.dashboard.goodAfternoon : t.dashboard.goodEvening

  if (isPlatform) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-l from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
          <h2 className="text-2xl font-bold">{greeting}, {user?.username} 👋</h2>
          <p className="text-blue-200 mt-1">AyaPOS Platform</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <p className="text-gray-500 text-sm">{t.nav.branches}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{t.nav.users}</p>
          </Card>
        </div>
      </div>
    )
  }

  const appointmentItems = todayAppointments?.items ?? []
  const upcomingAppointments = appointmentItems.filter((item) => ['scheduled', 'confirmed'].includes(item.status))
  const noShowAppointments = appointmentItems.filter((item) => item.status === 'no_show')
  const completedAppointments = appointmentItems.filter((item) => item.status === 'completed')
  const pendingAppointmentItems = upcomingAppointments
  const pendingAppointments = pendingAppointmentItems.length
  const invoiceCount = summary?.invoiceCount ?? summary?.totalInvoices ?? 0
  const grossSalesCents = summary?.grossSalesCents ?? summary?.totalSalesCents ?? 0
  const cashCents = session?.totalCashCents || summary?.totalCashCents || summary?.collectedCents || 0
  const paidInvoices = summary?.paidInvoiceCount ?? (invoicesPage?.items ?? []).filter((invoice) => invoice.status === 'Paid').length
  const topItems = [
    ...(summary?.topProducts ?? []).map((item) => ({ name: item.name, qty: item.quantity, totalCents: item.totalCents })),
    ...(summary?.topServices ?? []).map((item) => ({ name: item.name, qty: item.quantity, totalCents: item.totalCents })),
    ...(summary?.topItems ?? []),
  ].sort((a, b) => b.totalCents - a.totalCents)

  const stats = [
    { label: t.dashboard.invoicesCount, value: invoiceCount, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: t.dashboard.dailySales, value: `${fmt(grossSalesCents)} AED`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: t.reports.cash, value: `${fmt(cashCents)} AED`, icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: lang === 'ar' ? 'مواعيد بانتظار الحضور' : 'Pending Appointments', value: pendingAppointments, icon: CalendarCheck, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  const dailyTasks = [
    {
      label: session
        ? (lang === 'ar' ? 'جلسة الكاشير مفتوحة' : 'Cashier Session Open')
        : (lang === 'ar' ? 'فتح جلسة الكاشير' : 'Open Cashier Session'),
      detail: session
        ? (lang === 'ar' ? `بدأت ${formatTime(session.openedAt, lang)}` : `Started at ${formatTime(session.openedAt, lang)}`)
        : (lang === 'ar' ? 'افتح الجلسة قبل استقبال المدفوعات' : 'Open session before accepting payments'),
      done: !!session,
      icon: Clock,
    },
    {
      label: lang === 'ar' ? 'متابعة مواعيد اليوم' : "Today's Appointments",
      detail: lang === 'ar'
        ? `${pendingAppointments} موعد بحاجة متابعة من أصل ${appointmentItems.length}`
        : `${pendingAppointments} pending out of ${appointmentItems.length}`,
      done: pendingAppointmentItems.length > 0 && pendingAppointments === 0,
      icon: CalendarCheck,
    },
    {
      label: lang === 'ar' ? 'مراجعة فواتير اليوم' : "Today's Invoices",
      detail: lang === 'ar'
        ? `${invoiceCount} فاتورة، ${paidInvoices} مدفوعة ضمن آخر النشاط`
        : `${invoiceCount} invoices, ${paidInvoices} paid`,
      done: invoiceCount > 0,
      icon: ShoppingCart,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-l from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold">{greeting}, {user?.username} 👋</h2>
        <p className="text-blue-200 mt-1">
          {formatDate(new Date(), lang)}
        </p>
      </div>

      {!session && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800">
          <AlertCircle size={18} className="flex-shrink-0" />
          <p className="text-sm font-medium">{t.dashboard.sessionAlert}</p>
        </div>
      )}
      {session && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <p className="text-sm font-medium">
            {formatTime(session.openedAt, lang)}
          </p>
        </div>
      )}

      {summaryLoading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" className="text-blue-600" /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="p-5">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
                <Icon size={20} className={color} />
              </div>
              <p className="text-gray-500 text-xs mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title={t.dashboard.recentInvoices}>
          {invoicesLoading ? (
            <div className="flex justify-center py-8"><Spinner size="md" className="text-blue-600" /></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(invoicesPage?.items ?? []).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{inv.invoiceCode}</p>
                    <p className="text-xs text-gray-500">{formatShortDate(inv.createdAt, lang)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={statusVariant(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Badge>
                    <span className="text-sm font-semibold text-gray-900">{inv.total.toFixed(2)} AED</span>
                  </div>
                </div>
              ))}
              {(invoicesPage?.items ?? []).length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">
                  {lang === 'ar' ? 'لا توجد فواتير' : 'No invoices'}
                </p>
              )}
            </div>
          )}
        </Card>

        <Card title={lang === 'ar' ? 'مواعيد اليوم' : "Today's Appointments"} className="lg:col-span-3">
          {appointmentsLoading ? (
            <div className="flex justify-center py-8"><Spinner size="md" className="text-blue-600" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-gray-100">
              {/* Upcoming */}
              <div>
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <p className="text-xs font-bold text-blue-700">{lang === 'ar' ? 'القادمة' : 'Upcoming'} ({upcomingAppointments.length})</p>
                </div>
                {upcomingAppointments.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {upcomingAppointments.slice(0, 5).map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{a.customerName || '—'}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{a.serviceName}</p>
                        </div>
                        <div className="text-left flex-shrink-0">
                          <p className="text-xs font-bold text-gray-900">{formatTime(a.startAt, lang)}</p>
                          <Badge variant={a.status === 'confirmed' ? 'green' : 'blue'}>
                            {a.status === 'confirmed' ? (lang === 'ar' ? 'في الكاشير' : 'In POS') : (lang === 'ar' ? 'مجدول' : 'Scheduled')}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-400 py-6 text-xs">{lang === 'ar' ? 'لا توجد مواعيد قادمة' : 'No upcoming'}</p>
                )}
              </div>

              {/* No-shows */}
              <div>
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <p className="text-xs font-bold text-red-700">{lang === 'ar' ? 'لم يحضر' : 'No-shows'} ({noShowAppointments.length})</p>
                </div>
                {noShowAppointments.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {noShowAppointments.slice(0, 5).map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{a.customerName || '—'}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{a.serviceName}</p>
                        </div>
                        <p className="text-xs font-bold text-gray-500 flex-shrink-0">{formatTime(a.startAt, lang)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-400 py-6 text-xs">{lang === 'ar' ? 'لا يوجد غياب' : 'None'}</p>
                )}
              </div>

              {/* Completed */}
              <div>
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <p className="text-xs font-bold text-green-700">{lang === 'ar' ? 'مكتملة' : 'Done'} ({completedAppointments.length})</p>
                </div>
                {completedAppointments.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {completedAppointments.slice(0, 5).map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-500 truncate">{a.customerName || '—'}</p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{a.serviceName}</p>
                        </div>
                        <Badge variant="gray">{lang === 'ar' ? 'مكتمل' : 'Done'}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-400 py-6 text-xs">{lang === 'ar' ? 'لا توجد مكتملة بعد' : 'None yet'}</p>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card title={lang === 'ar' ? 'فواتير مفتوحة' : 'Open Invoices'}>
          {openPosDrafts.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {openPosDrafts.map((draft) => {
                const totalCents = draft.items.reduce((sum, item) => sum + item.qty * item.unitPriceCents, 0)
                return (
                  <div key={draft.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{draft.customerName || draft.label}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {draft.items.length} {lang === 'ar' ? 'بند - لم يتم الدفع بعد' : 'items - unpaid'}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-gray-900">{fmt(totalCents)} AED</p>
                      <Badge variant="yellow">{lang === 'ar' ? 'مفتوحة' : 'Open'}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              {lang === 'ar' ? 'لا توجد فواتير مفتوحة' : 'No open invoices'}
            </p>
          )}
        </Card>

        <Card title={t.dashboard.topProducts}>
          <div className="divide-y divide-gray-50">
            {topItems.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Package size={14} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.qty}</p>
                </div>
                <span className="text-sm font-semibold text-gray-900">{fmt(item.totalCents)}</span>
              </div>
            ))}
            {topItems.length === 0 && (
              <p className="text-center text-gray-400 py-8 text-sm">
                {lang === 'ar' ? 'لا توجد مبيعات اليوم' : 'No sales today'}
              </p>
            )}
          </div>
        </Card>

        <Card title={lang === 'ar' ? 'مهام اليوم' : "Today's Tasks"} className="lg:col-span-3">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-gray-50">
            {dailyTasks.map(({ label, detail, done, icon: Icon }) => (
              <div key={label} className="flex items-start gap-3 px-5 py-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${done ? 'bg-green-50' : 'bg-amber-50'}`}>
                  {done ? <CheckCircle2 size={16} className="text-green-600" /> : <Icon size={16} className="text-amber-600" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
