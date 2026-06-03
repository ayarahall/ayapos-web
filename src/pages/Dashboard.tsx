import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck, CheckCircle2, Clock, ShoppingCart, DollarSign,
  TrendingUp, AlertCircle, Package, Settings, ChevronUp, ChevronDown,
  ArrowRight, Receipt,
} from 'lucide-react'
import { getDailySummary, getCurrentSession } from '../api/cashier'
import { getInvoices } from '../api/invoices'
import { getAppointments, type AppointmentListItem } from '../api/appointments'
import { getExpenses } from '../api/expenses'
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

type WidgetId = 'stats' | 'appt-chart' | 'staff-productivity' | 'appt-live' | 'invoices-recent' | 'open-pos' | 'top-items' | 'daily-tasks' | 'expenses-pending' | 'sales-chart'

interface WidgetConfig {
  id: WidgetId
  visible: boolean
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'stats', visible: true },
  { id: 'sales-chart', visible: true },
  { id: 'appt-chart', visible: true },
  { id: 'staff-productivity', visible: true },
  { id: 'invoices-recent', visible: true },
  { id: 'appt-live', visible: true },
  { id: 'expenses-pending', visible: true },
  { id: 'open-pos', visible: true },
  { id: 'top-items', visible: true },
  { id: 'daily-tasks', visible: true },
]

const WIDGET_LABELS: Record<WidgetId, string> = {
  stats: 'الإحصائيات',
  'sales-chart': 'مبيعات الأسبوع — رسم بياني',
  'appt-chart': 'مواعيد اليوم — رسم بياني',
  'staff-productivity': 'إنتاجية الموظفين',
  'appt-live': 'مواعيد اليوم — الحالة الحية',
  'invoices-recent': 'الفواتير الأخيرة',
  'expenses-pending': 'المصاريف — بانتظار الاعتماد',
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
      className="absolute top-12 end-0 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-xl shadow-rose-100/60 overflow-hidden"
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
              className={`relative w-9 h-5 rounded-full transition-colors ${w.visible ? 'bg-rose-600' : 'bg-gray-300'}`}
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

// ─── Sales chart widget (bar + line) ─────────────────────────────────────────

type SalesPeriod = 'week' | 'month'
type ChartType = 'bar' | 'line'

interface SalesBarItem { label: string; cents: number }

function SalesBarChartWidget({ bars, period, onPeriod }: { bars: SalesBarItem[]; period: SalesPeriod; onPeriod: (p: SalesPeriod) => void }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [chartType, setChartType] = useState<ChartType>('bar')
  const maxCents = Math.max(...bars.map(b => b.cents), 1)
  const CHART_H = 80   // fixed chart area height px
  const LABEL_H = 18   // space for labels below
  const fmt = (cents: number) => new Intl.NumberFormat('ar-AE', { minimumFractionDigits: 0 }).format(cents / 100)
  const total = bars.reduce((s, b) => s + b.cents, 0)
  const n = bars.length || 1

  return (
    <div className="px-3 py-2">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">المبيعات المدفوعة</span>
          <span className="text-sm font-bold text-rose-600">{fmt(total)} AED</span>
          <span className="text-xs text-gray-400">({bars.filter(b => b.cents > 0).length}/{bars.length} يوم)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex bg-gray-100 rounded p-0.5">
            {(['bar', 'line'] as ChartType[]).map(t => (
              <button key={t} onClick={() => setChartType(t)}
                title={t === 'bar' ? 'أعمدة' : 'خط'}
                className={`px-2 py-0.5 rounded text-xs font-bold transition-colors
                  ${chartType === t ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-400'}`}>
                {t === 'bar' ? '▌▌' : '∿'}
              </button>
            ))}
          </div>
          <div className="flex bg-gray-100 rounded p-0.5">
            {(['week', 'month'] as SalesPeriod[]).map(p => (
              <button key={p} onClick={() => onPeriod(p)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors
                  ${period === p ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-400'}`}>
                {p === 'week' ? '7' : '30'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart — uses CSS flex so it naturally fits the container width */}
      <div style={{ height: CHART_H + LABEL_H }} className="relative w-full">
        {chartType === 'bar' && (
          <div className="absolute inset-0 flex items-end gap-px" style={{ paddingBottom: LABEL_H }}>
            {/* Y-axis grid lines (overlay) */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ bottom: LABEL_H }}>
              {[1, 0.75, 0.5, 0.25].map(r => (
                <div key={r} className="border-t border-gray-100 w-full" />
              ))}
              <div className="border-t border-gray-200 w-full" />
            </div>

            {bars.map((bar, i) => {
              const pct = maxCents > 0 ? (bar.cents / maxCents) * 100 : 0
              const isHovered = hoveredIdx === i
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end relative"
                  style={{ height: '100%' }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}>
                  {/* Value label on hover */}
                  {isHovered && bar.cents > 0 && (
                    <div className="absolute bottom-full mb-1 bg-gray-900 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap z-10"
                      style={{ fontSize: 10 }}>
                      {fmt(bar.cents)}
                    </div>
                  )}
                  {/* Bar */}
                  <div
                    className="w-full rounded-t transition-all duration-150"
                    style={{
                      height: bar.cents > 0 ? `${Math.max(3, pct)}%` : '2px',
                      backgroundColor: bar.cents > 0
                        ? (isHovered ? '#be0038' : '#e40046')
                        : '#f3f4f6',
                      opacity: bar.cents > 0 ? (isHovered ? 1 : 0.85) : 1,
                    }}
                  />
                  {/* Day label */}
                  <div className="absolute w-full text-center"
                    style={{ bottom: -LABEL_H, fontSize: 8, color: '#9ca3af', lineHeight: `${LABEL_H}px` }}>
                    {bar.label}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {chartType === 'line' && (() => {
          const W = 100; const H = 100
          const pts = bars.map((b, i) => ({
            x: n > 1 ? (i / (n - 1)) * W : W / 2,
            y: H - Math.max(b.cents > 0 ? 8 : 2, (b.cents / maxCents) * (H - 10)),
            bar: b, i,
          }))
          const path = pts.length > 1 ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') : ''
          const area = pts.length > 1 ? `M ${pts[0].x} ${H} ${path.slice(1)} L ${pts[pts.length - 1].x} ${H} Z` : ''
          return (
            <svg viewBox={`0 ${-5} ${W} ${H + LABEL_H / 2 + 5}`} preserveAspectRatio="none"
              className="absolute inset-0 w-full" style={{ height: CHART_H + LABEL_H }}>
              <defs>
                <linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e40046" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#e40046" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map(r => (
                <line key={r} x1={0} y1={H * (1 - r)} x2={W} y2={H * (1 - r)} stroke="#f3f4f6" strokeWidth={0.5} />
              ))}
              {area && <path d={area} fill="url(#lg2)" />}
              {path && <path d={path} fill="none" stroke="#e40046" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
              {pts.map(({ x, y, bar, i: idx }) => (
                <g key={idx}>
                  <circle cx={x} cy={y} r={2.5} fill="#e40046" vectorEffect="non-scaling-stroke"
                    onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)} />
                  {hoveredIdx === idx && (
                    <text x={x} y={y - 5} textAnchor="middle" fontSize={5} fill="#111" fontWeight="bold">
                      {fmt(bar.cents)}
                    </text>
                  )}
                  <text x={x} y={H + 10} textAnchor="middle" fontSize={5} fill="#9ca3af">{bar.label}</text>
                </g>
              ))}
            </svg>
          )
        })()}
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
  const chartH = 80
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


interface StaffProductivitySlice {
  name: string
  count: number
  color: string
}

function StaffProductivityPie({ slices, lang }: { slices: StaffProductivitySlice[]; lang: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  let offset = 0

  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        {lang === 'ar' ? 'لا توجد مواعيد مكتملة اليوم' : 'No completed appointments today'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-3 md:flex-row md:items-center">
      <div className="relative mx-auto h-40 w-40 flex-shrink-0">
        <svg viewBox="0 0 140 140" className="h-40 w-40 -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#f3f4f6" strokeWidth="22" />
          {slices.map((slice) => {
            const dash = (slice.count / total) * circumference
            const strokeDasharray = `${dash} ${circumference - dash}`
            const strokeDashoffset = -offset
            offset += dash
            return (
              <circle
                key={slice.name}
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="22"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="butt"
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-xs text-gray-500">{lang === 'ar' ? 'مكتملة' : 'completed'}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {slices.map((slice) => {
          const percent = Math.round((slice.count / total) * 100)
          return (
            <div key={slice.name} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{slice.name}</span>
              <span className="text-xs font-semibold text-gray-500">{slice.count}</span>
              <span className="text-xs text-gray-400">{percent}%</span>
            </div>
          )
        })}
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
                ${isCompleted ? 'opacity-60' : 'hover:bg-rose-50 cursor-pointer'}`}
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
                  <p className="text-xs font-bold text-rose-600">{formatTime(a.startAt, lang)}</p>
                )}
                {!isCompleted && (
                  <ArrowRight
                    size={13}
                    className="text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>('week')

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

  const { data: submittedExpenses } = useQuery({
    queryKey: ['expenses', slug, branchId ?? 'login-branch', 'submitted-dashboard'],
    queryFn: () => getExpenses(slug, { page: 1, pageSize: 10, status: 'submitted' }),
    enabled: !!slug,
    select: (d) => d.items,
  })

  const { data: todayExpenses } = useQuery({
    queryKey: ['expenses', slug, branchId ?? 'login-branch', 'dashboard-today', today],
    queryFn: () => getExpenses(slug, { page: 1, pageSize: 100 }),
    enabled: !!slug,
    select: (d) => d.items.filter((exp) => exp.expenseDate?.slice(0, 10) === today),
  })

  // Sales chart: last 7 days or last 30 days invoices
  const salesChartFrom = useMemo(() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() - (salesPeriod === 'week' ? 6 : 29))
    return d.toISOString().slice(0, 10)
  }, [today, salesPeriod])

  const { data: salesChartData } = useQuery({
    queryKey: ['invoices-sales-chart', slug, branchId ?? 'login-branch', salesChartFrom, today],
    queryFn: () => getInvoices(slug, { page: 1, pageSize: 300, dateFrom: salesChartFrom, dateTo: today }),
    enabled: !!slug,
  })

  const salesBars = useMemo<SalesBarItem[]>(() => {
    const days: string[] = []
    const cur = new Date(salesChartFrom + 'T00:00:00')
    const end = new Date(today + 'T00:00:00')
    while (cur <= end) { days.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1) }
    const byDay: Record<string, number> = {}
    ;(salesChartData?.items ?? [])
      .filter(inv => inv.status === 'Paid')
      .forEach(inv => {
        const day = inv.createdAt.slice(0, 10)
        byDay[day] = (byDay[day] ?? 0) + Math.round(inv.total * 100)
      })
    return days.map(d => {
      const parts = d.slice(5).split('-')
      return { label: `${parts[1]}/${parts[0]}`, cents: byDay[d] ?? 0 }
    })
  }, [salesChartFrom, today, salesChartData])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t.dashboard.goodMorning : hour < 17 ? t.dashboard.goodAfternoon : t.dashboard.goodEvening

  if (isPlatform) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-l from-rose-900 to-rose-600 rounded-2xl p-6 text-white">
          <h2 className="text-2xl font-bold">{greeting}, {user?.username}</h2>
          <p className="text-rose-100 mt-1">AyaPOS Platform</p>
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
  const cashCents = session?.expectedCashCents ?? summary?.totalCashCents ?? summary?.collectedCents ?? 0
  const paidInvoices = summary?.paidInvoiceCount ?? (invoicesPage?.items ?? []).filter((invoice) => invoice.status === 'Paid').length
  const expenseItems = todayExpenses ?? []
  const activeExpenses = expenseItems.filter((exp) => exp.status !== 'cancelled')
  const paidOrApprovedExpenses = expenseItems.filter((exp) => exp.status === 'approved' || exp.status === 'paid')
  const totalExpenseAmount = activeExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  const approvedExpenseAmount = paidOrApprovedExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  const cashExpenseAmount = paidOrApprovedExpenses
    .filter((exp) => exp.paymentMethod === 'cash')
    .reduce((sum, exp) => sum + exp.amount, 0)
  const pendingExpenseAmount = (submittedExpenses ?? []).reduce((sum, exp) => sum + exp.amount, 0)
  const topItems = [
    ...(summary?.topProducts ?? []).map((item) => ({ name: item.name, qty: item.quantity, totalCents: item.totalCents })),
    ...(summary?.topServices ?? []).map((item) => ({ name: item.name, qty: item.quantity, totalCents: item.totalCents })),
    ...(summary?.topItems ?? []),
  ].sort((a, b) => b.totalCents - a.totalCents)

  const productivityColors = ['#e5093f', '#be123c', '#f43f5e', '#fb7185', '#111827', '#6b7280', '#fda4af']
  const staffProductivity = Object.values(
    completedAppointments.reduce<Record<string, StaffProductivitySlice>>((acc, appointment) => {
      const name = appointment.resourceName?.trim() || (lang === 'ar' ? 'غير محدد' : 'Unassigned')
      if (!acc[name]) {
        acc[name] = { name, count: 0, color: productivityColors[Object.keys(acc).length % productivityColors.length] }
      }
      acc[name].count += 1
      return acc
    }, {})
  ).sort((a, b) => b.count - a.count)
  const stats = [
    { label: t.dashboard.invoicesCount, value: invoiceCount, icon: ShoppingCart, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: t.dashboard.dailySales, value: `${fmt(grossSalesCents)} AED`, icon: TrendingUp, color: 'text-rose-600', bg: 'bg-white' },
    { label: t.reports.cash, value: `${fmt(cashCents)} AED`, icon: DollarSign, color: 'text-slate-700', bg: 'bg-rose-50' },
    { label: lang === 'ar' ? 'مواعيد بانتظار الحضور' : 'Waiting Check-In', value: pendingAppointments, icon: CalendarCheck, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: lang === 'ar' ? 'مصاريف اليوم' : 'Today Expenses', value: `${totalExpenseAmount.toFixed(2)} AED`, icon: Receipt, color: 'text-rose-600', bg: 'bg-rose-50' },
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
    { label: 'محجوز', count: scheduledAppointments.length, fill: '#e5093f', badgeClass: 'bg-rose-100 text-rose-700' },
    { label: 'حضر', count: checkedInAppointments.length, fill: '#be123c', badgeClass: 'bg-rose-100 text-rose-700' },
    { label: 'لم يحضر', count: noShowAppointments.length, fill: '#111827', badgeClass: 'bg-slate-100 text-slate-700' },
    { label: 'مكتمل', count: completedAppointments.length, fill: '#9ca3af', badgeClass: 'bg-gray-100 text-gray-700' },
  ]

  // Helper to check widget visibility
  const isVisible = (id: WidgetId) => widgets.find((w) => w.id === id)?.visible !== false

  return (
    <div className="space-y-3">
      {/* Header with customize button */}
      <div className="relative flex items-center justify-between bg-gradient-to-l shadow-md shadow-rose-100 from-rose-900 to-rose-600 rounded-xl px-3 py-2 text-white">
        <div>
          <h2 className="text-base font-bold">{greeting}, {user?.username}</h2>
          <p className="text-rose-200 text-xs mt-0.5">{formatDate(new Date(), lang)}</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setCustomizeOpen((v) => !v)}
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 border border-white/20 transition-colors rounded-xl px-3 py-2 text-sm font-medium"
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
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-slate-800">
          <AlertCircle size={15} className="flex-shrink-0 text-rose-500" />
          <p className="text-xs font-medium">{t.dashboard.sessionAlert}</p>
        </div>
      )}
      {session && (
        <div className="flex items-center gap-2 bg-white border border-rose-100 rounded-lg px-3 py-2 text-slate-800">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
          <p className="text-xs font-medium text-rose-700">جلسة مفتوحة منذ {formatTime(session.openedAt, lang)}</p>
        </div>
      )}

      {/* Stats widget */}
      {isVisible('stats') && (
        summaryLoading ? (
          <div className="flex justify-center py-6"><Spinner size="md" className="text-rose-600" /></div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {stats.map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label} className="p-3">
                <div className={`w-7 h-7 ${bg} rounded-lg flex items-center justify-center mb-2`}>
                  <Icon size={15} className={color} />
                </div>
                <p className="text-gray-500 text-xs leading-tight">{label}</p>
                <p className="text-base font-bold text-gray-900 mt-0.5 leading-tight">{value}</p>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Sales chart widget */}
      {isVisible('sales-chart') && (
        <Card title={salesPeriod === 'week' ? 'مبيعات آخر 7 أيام' : 'مبيعات آخر 30 يوم'}>
          <SalesBarChartWidget bars={salesBars} period={salesPeriod} onPeriod={setSalesPeriod} />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart widget */}
        {isVisible('appt-chart') && (
          <Card title="مواعيد اليوم — رسم بياني">
            {appointmentsLoading ? (
              <div className="flex justify-center py-8"><Spinner size="md" className="text-rose-600" /></div>
            ) : (
              <div className="px-4 py-3">
                <ApptBarChart bars={chartBars} />
              </div>
            )}
          </Card>
        )}


        {/* Staff productivity pie widget */}
        {isVisible('staff-productivity') && (
          <Card title={lang === 'ar' ? 'إنتاجية الموظفين — المواعيد المكتملة' : 'Staff Productivity — Completed Appointments'}>
            {appointmentsLoading ? (
              <div className="flex justify-center py-8"><Spinner size="md" className="text-rose-600" /></div>
            ) : (
              <StaffProductivityPie slices={staffProductivity} lang={lang} />
            )}
          </Card>
        )}
        {/* Recent invoices widget */}
        {isVisible('invoices-recent') && (
          <Card className="lg:col-span-2" title={t.dashboard.recentInvoices}>
            {invoicesLoading ? (
              <div className="flex justify-center py-8"><Spinner size="md" className="text-rose-600" /></div>
            ) : (
              <div className="divide-y divide-gray-50">
                {(invoicesPage?.items ?? []).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between px-3 py-2">
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
                  <p className="text-center text-gray-400 py-5 text-xs">{lang === 'ar' ? 'لا توجد فواتير' : 'No invoices'}</p>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Live appointments widget */}
        {isVisible('appt-live') && (
          <Card title={lang === 'ar' ? 'مواعيد اليوم - الحالة الحية' : "Today's Appointments - Live Status"} className="lg:col-span-3">
            {appointmentsLoading ? (
              <div className="flex justify-center py-8"><Spinner size="md" className="text-rose-600" /></div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 divide-y-2 md:divide-y-0 md:divide-x md:divide-x-reverse divide-gray-100">
                <AppointmentColumn title={lang === 'ar' ? 'محجوز' : 'Booked'} count={scheduledAppointments.length} items={scheduledAppointments} colorClass="text-rose-700" dotClass="bg-blue-400" emptyText={lang === 'ar' ? 'لا يوجد' : 'None'} lang={lang} />
                <AppointmentColumn title={lang === 'ar' ? 'تم تسجيل الحضور' : 'Checked In'} count={checkedInAppointments.length} items={checkedInAppointments} colorClass="text-rose-700" dotClass="bg-rose-500" badge={{ label: lang === 'ar' ? 'في الكاشير' : 'POS', variant: 'green' }} emptyText={lang === 'ar' ? 'لا يوجد بعد' : 'None yet'} lang={lang} />
                <AppointmentColumn title={lang === 'ar' ? 'لم يحضر' : 'No-show'} count={noShowAppointments.length} items={noShowAppointments} colorClass="text-rose-700" dotClass="bg-rose-500" badge={{ label: lang === 'ar' ? 'لم يحضر' : 'No-show', variant: 'red' }} emptyText={lang === 'ar' ? 'لا يوجد' : 'None'} lang={lang} />
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
                    <div key={draft.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{draft.customerName || draft.label}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{draft.items.length} {lang === 'ar' ? 'بند - لم يتم الدفع بعد' : 'items - unpaid'}</p>
                      </div>
                      <div className="text-end">
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

        {/* Expenses summary widget */}
        {isVisible('expenses-pending') && (
          <Card title={lang === 'ar' ? 'المصاريف' : 'Expenses'}>
            <div className="grid grid-cols-3 divide-x divide-x-reverse divide-gray-100 border-b border-gray-100">
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-gray-500">{lang === 'ar' ? 'اليوم' : 'Today'}</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{totalExpenseAmount.toFixed(2)} AED</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-gray-500">{lang === 'ar' ? 'معتمد' : 'Approved'}</p>
                <p className="mt-1 text-sm font-bold text-rose-700">{approvedExpenseAmount.toFixed(2)} AED</p>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-gray-500">{lang === 'ar' ? 'نقدي مخصوم' : 'Cash Deducted'}</p>
                <p className="mt-1 text-sm font-bold text-slate-700">{cashExpenseAmount.toFixed(2)} AED</p>
              </div>
            </div>
            {(submittedExpenses?.length ?? 0) === 0 ? (
              <p className="py-7 text-center text-sm text-gray-400">
                {lang === 'ar' ? 'لا توجد مصاريف بانتظار الاعتماد' : 'No expenses pending approval'}
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                {submittedExpenses!.slice(0, 5).map((exp) => (
                  <div key={exp.id} className="flex items-center justify-between px-3 py-2 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{exp.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{exp.category} · {exp.paymentMethod === 'cash' ? (lang === 'ar' ? 'نقداً' : 'Cash') : exp.paymentMethod}</p>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <p className="text-sm font-bold text-gray-900">{exp.amount.toFixed(2)} {exp.currencyCode}</p>
                      <span className="text-xs font-medium text-rose-600">{lang === 'ar' ? 'بانتظار الاعتماد' : 'Pending approval'}</span>
                    </div>
                  </div>
                ))}
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-xs text-gray-600 font-medium">
                    <Receipt size={14} className="text-rose-500" />
                    {submittedExpenses!.length} {lang === 'ar' ? 'مصروف بانتظار الاعتماد' : 'pending expense(s)'}
                  </span>
                  <span className="text-xs font-bold text-gray-900">{pendingExpenseAmount.toFixed(2)} AED</span>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Top items widget */}
        {isVisible('top-items') && (
          <Card title={t.dashboard.topProducts}>
            <div className="divide-y divide-gray-50">
              {topItems.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-7 h-7 bg-rose-100 rounded-lg flex items-center justify-center">
                    <Package size={14} className="text-rose-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.qty}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{fmt(item.totalCents)}</span>
                </div>
              ))}
              {topItems.length === 0 && (
                <p className="text-center text-gray-400 py-5 text-xs">{lang === 'ar' ? 'لا توجد مبيعات اليوم' : 'No sales today'}</p>
              )}
            </div>
          </Card>
        )}

        {/* Daily tasks widget */}
        {isVisible('daily-tasks') && (
          <Card title={lang === 'ar' ? 'مهام اليوم' : "Today's Tasks"} className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-gray-50">
              {dailyTasks.map(({ label, detail, done, icon: Icon }) => (
                <div key={label} className="flex items-start gap-3 px-3 py-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${done ? 'bg-white' : 'bg-rose-50'}`}>
                    {done ? <CheckCircle2 size={16} className="text-rose-600" /> : <Icon size={16} className="text-slate-700" />}
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
