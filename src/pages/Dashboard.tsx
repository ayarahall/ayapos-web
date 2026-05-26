import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck, CheckCircle2, Clock, ShoppingCart, DollarSign,
  TrendingUp, AlertCircle, Package, Settings, ChevronUp, ChevronDown,
  ArrowRight,
} from 'lucide-react'
import { getDailySummary, getCurrentSession } from '../api/cashier'
import { getInvoices } from '../api/invoices'
import { getAppointments, type AppointmentListItem } from '../api/appointments'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { STATUS_LABELS } from '../types'
import { dateRangeForDubaiDay, formatDate, formatShortDate, formatTime, todayInDubaiISO } from '../utils/date'
import { readPosDraftTabs, type PosDraftTab } from '../utils/posDrafts'

// ─── Formatting helpers ──────────────────────────────────────────────────────

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(cents / 100)

const statusVariant = (s: string): 'green' | 'yellow' | 'blue' | 'gray' | 'red' => {
  if (s === 'Paid') return 'green'
  if (s === 'PartiallyPaid') return 'yellow'
  if (s === 'Posted') return 'blue'
  if (s === 'Draft') return 'gray'
  return 'red'
}

const isCheckedIn = (status: string) => status === 'checked_in' || status === 'confirmed'
const isPastAppointment = (endAt: string) => new Date(endAt).getTime() < Date.now()

// ─── Widget config (localStorage) ────────────────────────────────────────────

type WidgetId = 'stats' | 'appt-chart' | 'appt-live' | 'invoices-recent' | 'open-pos' | 'top-items' | 'daily-tasks'

interface WidgetConfig {
  id: WidgetId
  visible: boolean
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'stats', visible: true },
  { id: 'appt-chart', visible: true },
  { id: 'appt-live', visible: true },
  { id: 'invoices-recent', visible: true },
  { id: 'open-pos', visible: true },
  { id: 'top-items', visible: true },
  { id: 'daily-tasks', visible: true },
]

const WIDGET_LABELS: Record<WidgetId, string> = {
  stats: 'الإحصائيات',
  'appt-chart': 'مواعيد اليوم — رسم بياني',
  'appt-live': 'مواعيد اليوم — الحالة الحية',
  'invoices-recent': 'الفواتير الأخيرة',
  'open-pos': 'فواتير مفتوحة',
  'top-items': 'الأكثر مبيعاً',
  'daily-tasks': 'مهام اليوم',
}

const STORAGE_KEY = 'ayapos.dashboardWidgets'

function loadWidgets(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WIDGETS
    const saved = JSON.parse(raw) as WidgetConfig[]
    // Merge: keep saved order/visibility but ensure all default widgets exist
    const savedIds = new Set(saved.map((w) => w.id))
    const merged = [...saved]
    for (const def of DEFAULT_WIDGETS) {
      if (!savedIds.has(def.id)) merged.push(def)
    }
    return merged
  } catch {
    return DEFAULT_WIDGETS
  }
}

function saveWidgets(widgets: WidgetConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets))
}

// ─── Customize panel ─────────────────────────────────────────────────────────

function CustomizePanel({
  widgets,
  onClose,
  onChange,
}: {
  widgets: WidgetConfig[]
  onClose: () => void
  onChange: (w: WidgetConfig[]) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const toggle = (id: WidgetId) => {
    const updated = widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    onChange(updated)
    saveWidgets(updated)
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...widgets]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    saveWidgets(next)
  }

  return (
    <div
      ref={panelRef}
      className="absolute top-12 end-0 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="font-semibold text-gray-800 text-sm">تخصيص لوحة التحكم</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
        {widgets.map((w, i) => (
          <div key={w.id} className="flex items-center gap-2 px-4 py-2.5">
            {/* Up/Down */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronUp size={13} />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === widgets.length - 1}
                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronDown size={13} />
              </button>
            </div>
            {/* Label */}
            <span className="flex-1 text-sm text-gray-700">{WIDGET_LABELS[w.id]}</span>
            {/* Toggle */}
            <button
              onClick={() => toggle(w.id)}
              className={`relative w-9 h-5 rounded-full transition-colors ${w.visible ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${w.visible ? 'translate-x-4' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SVG bar chart widget ─────────────────────────────────────────────────────

interface ChartBar {
  label: string
  count: number
  fill: string
  badgeClass: string
}

function ApptBarChart({ bars }: { bars: ChartBar[] }) {
  const [tooltip, setTooltip] = useState<{ bar: ChartBar; x: number; y: number } | null>(null)

  const maxCount = Math.max(...bars.map((b) => b.count), 1)
  const chartH = 120
  const barW = 40
  const gap = 20
  const paddingLeft = 10
  const svgW = bars.length * (barW + gap) + paddingLeft * 2 - gap

  return (
    <div className="relative">
      <svg
        width="100%"
        viewBox={`0 0 ${svgW} ${chartH + 30}`}
        className="overflow-visible"
      >
        {bars.map((bar, i) => {
          const barH = maxCount === 0 ? 0 : Math.max(4, (bar.count / maxCount) * chartH)
          const x = paddingLeft + i * (barW + gap)
          const y = chartH - barH

          return (
            <g key={bar.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={6}
                fill={bar.fill}
                opacity={0.85}
                className="cursor-pointer transition-opacity hover:opacity-100"
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect()
                  setTooltip({ bar, x: rect.left + rect.width / 2, y: rect.top })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {/* Count above bar */}
              <text
                x={x + barW / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={12}
                fontWeight="bold"
                fill="#374151"
              >
                {bar.count}
              </text>
              {/* Label below */}
              <text
                x={x + barW / 2}
                y={chartH + 16}
                textAnchor="middle"
                fontSize={10}
                fill="#6b7280"
              >
                {bar.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip (portal-like, fixed position) */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y - 36, transform: 'translateX(-50%)' }}
        >
          {tooltip.bar.label}: {tooltip.bar.count}
        </div>
      )}

      {/* Badge row */}
      <div className="flex flex-wrap gap-2 mt-3 px-1">
        {bars.map((bar) => (
          <span
            key={bar.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${bar.badgeClass}`}
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: bar.fill }}
            />
            {bar.label} ({bar.count})
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Appointment column (live widget) ────────────────────────────────────────

function AppointmentColumn({
  title,
  count,
  items,
  colorClass,
  dotClass,
  badge,
  emptyText,
  lang,
}: {
  title: string
  count: number
  items: AppointmentListItem[]
  colorClass: string
  dotClass: string
  badge?: { label: string; variant: 'green' | 'yellow' | 'blue' | 'gray' | 'red' | 'purple' }
  emptyText: string
  lang: string
}) {
  const navigate = useNavigate()
  const isCompleted = badge?.variant === 'gray'

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
        <div className={`w-2 h-2 rounded-full ${dotClass}`} />
        <p className={`text-xs font-bold ${colorClass}`}>{title} ({count})</p>
      </div>
      {items.length > 0 ? (
        <div className="divide-y divide-gray-50">
          {items.slice(0, 5).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate('/appointments')}
              className={`w-full text-start flex items-start justify-between gap-2 px-4 py-3 group transition-colors
                ${isCompleted ? 'opacity-60' : 'hover:bg-blue-50 cursor-pointer'}`}
            >
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold truncate ${isCompleted ? 'text-gray-500' : 'text-gray-900'}`}>
                  {a.customerName || '-'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{a.serviceName}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {badge ? (
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                ) : (
                  <p className="text-xs font-bold text-blue-600">{formatTime(a.startAt, lang)}</p>
                )}
                {!isCompleted && (
                  <ArrowRight
                    size={13}
                    className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-400 py-6 text-xs">{emptyText}</p>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, branchId } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const t = useT()
  const slug = user?.tenantSlug ?? ''
  const isPlatform = user?.scope === 'platform'
  const [openPosDrafts, setOpenPosDrafts] = useState<PosDraftTab[]>(() => readPosDraftTabs())

  // Widget customization state
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => loadWidgets())
  const [customizeOpen, setCustomizeOpen] = useState(false)

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
  const { dateFrom, dateTo } = dateRangeForDubaiDay(today)

  const { data: todayAppointments, isLoading: appointmentsLoading } = useQuery({
    queryKey: ['appointments', slug, branchId ?? 'login-branch', 'dashboard-today', dateFrom, dateTo],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 50, dateFrom, dateTo }),
    enabled: !!slug,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t.dashboard.goodMorning : hour < 17 ? t.dashboard.goodAfternoon : t.dashboard.goodEvening

  if (isPlatform) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-l from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
          <h2 className="text-2xl font-bold">{greeting}, {user?.username}</h2>
          <p className="text-blue-200 mt-1">AyaPOS Platform</p>
        </div>
      </div>
    )
  }

  const appointmentItems = todayAppointments?.items ?? []
  const openDraftAppointmentIds = new Set(
    openPosDrafts
      .map((draft) => draft.appointmentId ?? (draft.id.startsWith('appointment:') ? draft.id.slice('appointment:'.length) : undefined))
      .filter((id): id is string => Boolean(id))
  )
  const noShowAppointments = appointmentItems.filter((item) => item.status === 'no_show' || (item.status === 'scheduled' && !openDraftAppointmentIds.has(item.id) && isPastAppointment(item.endAt)))
  const scheduledAppointments = appointmentItems.filter((item) => item.status === 'scheduled' && !openDraftAppointmentIds.has(item.id) && !isPastAppointment(item.endAt))
  const checkedInAppointments = appointmentItems.filter((item) => isCheckedIn(item.status) || (item.status === 'scheduled' && openDraftAppointmentIds.has(item.id)))
  const completedAppointments = appointmentItems.filter((item) => item.status === 'completed')
  const pendingAppointments = scheduledAppointments.length
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
    { label: lang === 'ar' ? 'مواعيد بانتظار الحضور' : 'Waiting Check-In', value: pendingAppointments, icon: CalendarCheck, color: 'text-purple-600', bg: 'bg-purple-50' },
  ]

  const dailyTasks = [
    {
      label: session ? (lang === 'ar' ? 'جلسة الكاشير مفتوحة' : 'Cashier Session Open') : (lang === 'ar' ? 'فتح جلسة الكاشير' : 'Open Cashier Session'),
      detail: session ? (lang === 'ar' ? `بدأت ${formatTime(session.openedAt, lang)}` : `Started at ${formatTime(session.openedAt, lang)}`) : (lang === 'ar' ? 'افتح الجلسة قبل استقبال المدفوعات' : 'Open session before accepting payments'),
      done: !!session,
      icon: Clock,
    },
    {
      label: lang === 'ar' ? 'متابعة مواعيد اليوم' : "Today's Appointments",
      detail: lang === 'ar'
        ? `${checkedInAppointments.length} تم تسجيل حضورهم، ${completedAppointments.length} مكتملة، ${noShowAppointments.length} لم يحضروا من أصل ${appointmentItems.length}`
        : `${checkedInAppointments.length} checked in, ${completedAppointments.length} completed, ${noShowAppointments.length} no-show of ${appointmentItems.length}`,
      done: appointmentItems.length > 0 && pendingAppointments === 0,
      icon: CalendarCheck,
    },
    {
      label: lang === 'ar' ? 'مراجعة فواتير اليوم' : "Today's Invoices",
      detail: lang === 'ar' ? `${invoiceCount} فاتورة، ${paidInvoices} مدفوعة` : `${invoiceCount} invoices, ${paidInvoices} paid`,
      done: invoiceCount > 0,
      icon: ShoppingCart,
    },
  ]

  // Chart bars data
  const chartBars: ChartBar[] = [
    { label: 'محجوز', count: scheduledAppointments.length, fill: '#3b82f6', badgeClass: 'bg-blue-100 text-blue-700' },
    { label: 'حضر', count: checkedInAppointments.length, fill: '#10b981', badgeClass: 'bg-emerald-100 text-emerald-700' },
    { label: 'لم يحضر', count: noShowAppointments.length, fill: '#ef4444', badgeClass: 'bg-red-100 text-red-700' },
    { label: 'مكتمل', count: completedAppointments.length, fill: '#9ca3af', badgeClass: 'bg-gray-100 text-gray-700' },
  ]

  // Helper to check widget visibility
  const isVisible = (id: WidgetId) => widgets.find((w) => w.id === id)?.visible !== false

  return (
    <div className="space-y-6">
      {/* Header with customize button */}
      <div className="relative flex items-center justify-between bg-gradient-to-l from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <div>
          <h2 className="text-2xl font-bold">{greeting}, {user?.username}</h2>
          <p className="text-blue-200 mt-1">{formatDate(new Date(), lang)}</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setCustomizeOpen((v) => !v)}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors rounded-xl px-3 py-2 text-sm font-medium"
          >
            <Settings size={16} />
            تخصيص
          </button>
          {customizeOpen && (
            <CustomizePanel
              widgets={widgets}
              onClose={() => setCustomizeOpen(false)}
              onChange={setWidgets}
            />
          )}
        </div>
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
          <p className="text-sm font-medium">{formatTime(session.openedAt, lang)}</p>
        </div>
      )}

      {/* Stats widget */}
      {isVisible('stats') && (
        summaryLoading ? (
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
        )
      )}

      {/* SVG bar chart widget */}
      {isVisible('appt-chart') && (
        <Card title="مواعيد اليوم — رسم بياني">
          {appointmentsLoading ? (
            <div className="flex justify-center py-8"><Spinner size="md" className="text-blue-600" /></div>
          ) : (
            <div className="px-5 py-4">
              <ApptBarChart bars={chartBars} />
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent invoices widget */}
        {isVisible('invoices-recent') && (
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
                  <p className="text-center text-gray-400 py-8 text-sm">{lang === 'ar' ? 'لا توجد فواتير' : 'No invoices'}</p>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Live appointments widget */}
        {isVisible('appt-live') && (
          <Card title={lang === 'ar' ? 'مواعيد اليوم - الحالة الحية' : "Today's Appointments - Live Status"} className="lg:col-span-3">
            {appointmentsLoading ? (
              <div className="flex justify-center py-8"><Spinner size="md" className="text-blue-600" /></div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 divide-y-2 md:divide-y-0 md:divide-x md:divide-x-reverse divide-gray-100">
                <AppointmentColumn title={lang === 'ar' ? 'محجوز' : 'Booked'} count={scheduledAppointments.length} items={scheduledAppointments} colorClass="text-blue-700" dotClass="bg-blue-400" emptyText={lang === 'ar' ? 'لا يوجد' : 'None'} lang={lang} />
                <AppointmentColumn title={lang === 'ar' ? 'تم تسجيل الحضور' : 'Checked In'} count={checkedInAppointments.length} items={checkedInAppointments} colorClass="text-emerald-700" dotClass="bg-emerald-500" badge={{ label: lang === 'ar' ? 'في الكاشير' : 'POS', variant: 'green' }} emptyText={lang === 'ar' ? 'لا يوجد بعد' : 'None yet'} lang={lang} />
                <AppointmentColumn title={lang === 'ar' ? 'لم يحضر' : 'No-show'} count={noShowAppointments.length} items={noShowAppointments} colorClass="text-red-700" dotClass="bg-red-500" badge={{ label: lang === 'ar' ? 'لم يحضر' : 'No-show', variant: 'red' }} emptyText={lang === 'ar' ? 'لا يوجد' : 'None'} lang={lang} />
                <AppointmentColumn title={lang === 'ar' ? 'مكتمل - تم الدفع' : 'Completed'} count={completedAppointments.length} items={completedAppointments} colorClass="text-gray-600" dotClass="bg-gray-400" badge={{ label: lang === 'ar' ? 'مكتمل' : 'Done', variant: 'gray' }} emptyText={lang === 'ar' ? 'لا يوجد بعد' : 'None yet'} lang={lang} />
              </div>
            )}
          </Card>
        )}

        {/* Open POS drafts widget */}
        {isVisible('open-pos') && (
          <Card title={lang === 'ar' ? 'فواتير مفتوحة' : 'Open Invoices'}>
            {openPosDrafts.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {openPosDrafts.map((draft) => {
                  const totalCents = draft.items.reduce((sum, item) => sum + item.qty * item.unitPriceCents, 0)
                  return (
                    <div key={draft.id} className="flex items-start justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{draft.customerName || draft.label}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{draft.items.length} {lang === 'ar' ? 'بند - لم يتم الدفع بعد' : 'items - unpaid'}</p>
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
              <p className="py-8 text-center text-sm text-gray-400">{lang === 'ar' ? 'لا توجد فواتير مفتوحة' : 'No open invoices'}</p>
            )}
          </Card>
        )}

        {/* Top items widget */}
        {isVisible('top-items') && (
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
                <p className="text-center text-gray-400 py-8 text-sm">{lang === 'ar' ? 'لا توجد مبيعات اليوم' : 'No sales today'}</p>
              )}
            </div>
          </Card>
        )}

        {/* Daily tasks widget */}
        {isVisible('daily-tasks') && (
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
        )}
      </div>
    </div>
  )
}
