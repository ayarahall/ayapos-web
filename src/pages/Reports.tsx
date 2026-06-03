import { useState, useMemo, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3, TrendingUp, DollarSign, CreditCard, ShoppingBag,
  Building2, CalendarCheck, ChevronLeft, ChevronRight,
  Users, Receipt, GripVertical, X, Plus, Eye, Wrench,
} from 'lucide-react'
import { getDailySummary, getSessions } from '../api/cashier'
import { getInvoices, getInvoice } from '../api/invoices'
import { getAppointments } from '../api/appointments'
import { getExpenses } from '../api/expenses'
import { listEmployees, getAttendanceHistory, getLeaves } from '../api/employees'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { formatDateTime, formatShortDate, todayInDubaiISO } from '../utils/date'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  new Intl.NumberFormat('ar-AE', { minimumFractionDigits: 2 }).format(cents / 100)

const fmtN = (n: number) => new Intl.NumberFormat('ar-AE').format(n)

type RangePreset = 'today' | 'week' | 'month' | 'custom'
type ReportTab = 'sales' | 'appointments' | 'expenses' | 'employees' | 'revenue' | 'services' | 'custom'

function startOfWeek(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  return d.toISOString().slice(0, 10)
}
function startOfMonth(iso: string) { return iso.slice(0, 7) + '-01' }

// Backend appointments uses StartAt < dateTo (exclusive), so add 1 day to include dateTo
function addOneDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

const payMethodLabel = (method: number | string) => {
  if (method === 1 || method === 'Cash') return 'نقدا'
  if (method === 2 || method === 'Card') return 'بطاقة'
  if (method === 3 || method === 'Transfer' || method === 'BankTransfer') return 'تحويل'
  return String(method)
}

// generate array of ISO dates between from and to
function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to + 'T00:00:00')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// ─── Mini bar chart (CSS flex — no SVG scaling issues) ───────────────────────

interface SalesBar { label: string; cents: number }

function SalesBarChart({ bars }: { bars: SalesBar[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const maxCents = Math.max(...bars.map(b => b.cents), 1)
  const CHART_H = 90
  const LABEL_H = 20

  return (
    <div style={{ height: CHART_H + LABEL_H }} className="relative w-full">
      {/* Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ bottom: LABEL_H }}>
        {[1, 0.75, 0.5, 0.25, 0].map(r => (
          <div key={r} className={`border-t w-full ${r === 0 ? 'border-gray-200' : 'border-gray-100'}`} />
        ))}
      </div>

      {/* Bars */}
      <div className="absolute inset-0 flex items-end gap-0.5" style={{ paddingBottom: LABEL_H }}>
        {bars.map((bar, i) => {
          const pct = (bar.cents / maxCents) * 100
          const isHovered = hoveredIdx === i
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end relative h-full"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}>
              {/* Tooltip */}
              {isHovered && bar.cents > 0 && (
                <div className="absolute bottom-full mb-1 z-10 bg-gray-900 text-white rounded px-1.5 py-0.5 whitespace-nowrap pointer-events-none"
                  style={{ fontSize: 10 }}>
                  {bar.label}: {fmt(bar.cents)}
                </div>
              )}
              {/* Bar */}
              <div className="w-full rounded-t-md transition-all duration-150"
                style={{
                  height: bar.cents > 0 ? `${Math.max(3, pct)}%` : '2px',
                  backgroundColor: bar.cents > 0 ? (isHovered ? '#be0038' : '#e40046') : '#e5e7eb',
                  opacity: bar.cents > 0 ? (isHovered ? 1 : 0.82) : 1,
                }} />
              {/* Label */}
              <div className="absolute w-full text-center truncate px-0.5"
                style={{ bottom: -LABEL_H, fontSize: 8, color: '#9ca3af', lineHeight: `${LABEL_H}px` }}>
                {bar.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Range picker (shared) ────────────────────────────────────────────────────

interface RangePickerProps {
  preset: RangePreset
  customFrom: string
  customTo: string
  today: string
  onPreset: (p: RangePreset) => void
  onFrom: (v: string) => void
  onTo: (v: string) => void
}

function RangePicker({ preset, customFrom, customTo, today, onPreset, onFrom, onTo }: RangePickerProps) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
      {([
        { value: 'today', label: 'اليوم' },
        { value: 'week', label: 'هذا الأسبوع' },
        { value: 'month', label: 'هذا الشهر' },
        { value: 'custom', label: 'مخصص' },
      ] as { value: RangePreset; label: string }[]).map(({ value, label }) => (
        <button key={value} onClick={() => onPreset(value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${preset === value ? 'bg-rose-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          {label}
        </button>
      ))}
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} max={customTo}
            onChange={e => onFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
          <span className="text-gray-400">—</span>
          <input type="date" value={customTo} min={customFrom} max={today}
            onChange={e => onTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
        </div>
      )}
    </div>
  )
}

// ─── Stats card ───────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string
}) {
  const colors: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
    green: { bg: 'bg-green-50', text: 'text-green-600' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
  }
  const c = colors[color] ?? colors.blue
  return (
    <Card className="p-5">
      <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center mb-3`}>
        <Icon size={20} className={c.text} />
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Card>
  )
}

// ─── Sales tab ────────────────────────────────────────────────────────────────

function SalesTab({ slug, branchId }: { slug: string; branchId: string | null }) {
  const lang = useLangStore(s => s.lang)
  const today = todayInDubaiISO()
  const [preset, setPreset] = useState<RangePreset>('week')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const [sessionPage, setSessionPage] = useState(1)

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'today') return { dateFrom: today, dateTo: today }
    if (preset === 'week') return { dateFrom: startOfWeek(today), dateTo: today }
    if (preset === 'month') return { dateFrom: startOfMonth(today), dateTo: today }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [preset, customFrom, customTo, today])

  const isToday = preset === 'today'

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['daily-summary', slug, branchId ?? 'lb'],
    queryFn: () => getDailySummary(slug),
    enabled: !!slug && isToday,
  })

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-report', slug, branchId ?? 'lb', dateFrom, dateTo],
    queryFn: () => getInvoices(slug, { page: 1, pageSize: 300, dateFrom, dateTo }),
    enabled: !!slug && !isToday,
  })

  // All today's sessions — for cash/card/transfer breakdown
  const { data: todaySessionsData } = useQuery({
    queryKey: ['cashier-sessions-today', slug, branchId ?? 'lb'],
    queryFn: () => getSessions(slug, { page: 1, pageSize: 20 }),
    enabled: !!slug && isToday,
  })

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['cashier-sessions', slug, branchId ?? 'lb', sessionPage],
    queryFn: () => getSessions(slug, { page: sessionPage, pageSize: 10 }),
    enabled: !!slug,
  })

  const invoiceItems = invoicesData?.items ?? []

  // Aggregate payment methods from today's sessions
  const todayPayments = useMemo(() => {
    const sessions = todaySessionsData?.items ?? []
    return {
      cashCents: sessions.reduce((s, sess) => s + sess.totalCashCents, 0),
      cardCents: sessions.reduce((s, sess) => s + sess.totalCardCents, 0),
      transferCents: sessions.reduce((s, sess) => s + sess.totalTransferCents, 0),
    }
  }, [todaySessionsData])

  const stats = useMemo(() => {
    if (isToday && summary) {
      const totalSalesCents = summary.grossSalesCents ?? summary.totalSalesCents ?? 0
      return {
        totalInvoices: summary.invoiceCount ?? summary.totalInvoices ?? 0,
        paidInvoices: summary.paidInvoiceCount ?? 0,
        totalSalesCents,
        // getDailySummary doesn't return payment method breakdown — use sessions
        cashCents: todayPayments.cashCents,
        cardCents: todayPayments.cardCents,
        transferCents: todayPayments.transferCents,
        topItems: [
          ...(summary.topProducts ?? []).map(i => ({ name: i.name, qty: i.quantity, totalCents: i.totalCents })),
          ...(summary.topServices ?? []).map(i => ({ name: i.name, qty: i.quantity, totalCents: i.totalCents })),
          ...(summary.topItems ?? []),
        ].sort((a, b) => b.totalCents - a.totalCents),
        recentPayments: summary.recentPayments ?? [],
      }
    }
    const paid = invoiceItems.filter(i => i.status === 'Paid')
    const totalSalesCents = Math.round(paid.reduce((s, i) => s + i.total * 100, 0))
    return {
      totalInvoices: invoiceItems.length,
      paidInvoices: paid.length,
      totalSalesCents,
      cashCents: 0, cardCents: 0, transferCents: 0,
      topItems: [], recentPayments: [],
    }
  }, [isToday, summary, invoiceItems, todayPayments])

  // Build bar chart
  const salesBars = useMemo<SalesBar[]>(() => {
    if (isToday) {
      return [
        { label: 'نقدا', cents: todayPayments.cashCents },
        { label: 'بطاقة', cents: todayPayments.cardCents },
        { label: 'تحويل', cents: todayPayments.transferCents },
      ]
    }
    const days = dateRange(dateFrom, dateTo)
    const byDay: Record<string, number> = {}
    invoiceItems.filter(i => i.status === 'Paid').forEach(inv => {
      const day = inv.createdAt.slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + Math.round(inv.total * 100)
    })
    return days.map(d => ({
      label: formatShortDate(d + 'T00:00:00', lang).slice(0, 5),
      cents: byDay[d] ?? 0,
    }))
  }, [isToday, todayPayments, dateFrom, dateTo, invoiceItems, lang])

  const totalSales = stats.totalSalesCents
  const cashPct = totalSales > 0 ? ((stats.cashCents / totalSales) * 100).toFixed(0) : '0'
  const cardPct = totalSales > 0 ? ((stats.cardCents / totalSales) * 100).toFixed(0) : '0'
  const transferPct = totalSales > 0 ? ((stats.transferCents / totalSales) * 100).toFixed(0) : '0'

  const isLoading = isToday ? summaryLoading : invoicesLoading

  return (
    <div className="space-y-5">
      <RangePicker preset={preset} customFrom={customFrom} customTo={customTo} today={today}
        onPreset={setPreset} onFrom={setCustomFrom} onTo={setCustomTo} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-rose-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={ShoppingBag} label="عدد الفواتير" value={fmtN(stats.totalInvoices)} sub={`${fmtN(stats.paidInvoices)} مدفوعة`} color="blue" />
            <StatCard icon={TrendingUp} label="إجمالي المبيعات" value={fmt(totalSales)} sub="AED" color="green" />
            <StatCard icon={DollarSign} label="نقداً" value={fmt(stats.cashCents)} sub={`${cashPct}%`} color="amber" />
            <StatCard icon={CreditCard} label="بطاقة" value={fmt(stats.cardCents)} sub={`${cardPct}%`} color="purple" />
          </div>

          {/* Bar chart */}
          <Card title={isToday ? 'توزيع طرق الدفع اليوم' : `مبيعات الفترة (${salesBars.length} يوم)`}>
            <div className="px-5 py-4">
              {salesBars.every(b => b.cents === 0) ? (
                <p className="text-center text-gray-400 py-8 text-sm">لا توجد مبيعات في هذه الفترة</p>
              ) : (
                <SalesBarChart bars={salesBars} />
              )}
            </div>
          </Card>

          {/* Payment breakdown (today) */}
          {isToday && (
            <Card title="توزيع طرق الدفع">
              <div className="px-5 py-4 space-y-4">
                {[
                  { label: 'نقداً', cents: stats.cashCents, pct: cashPct, color: 'bg-amber-500' },
                  { label: 'بطاقة', cents: stats.cardCents, pct: cardPct, color: 'bg-purple-500' },
                  { label: 'تحويل', cents: stats.transferCents, pct: transferPct, color: 'bg-blue-500' },
                ].map(({ label, cents, pct, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-gray-700">{label}</span>
                      <span className="font-semibold text-gray-900">{fmt(cents)} <span className="text-xs text-gray-400">({pct}%)</span></span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
                {stats.transferCents > 0 && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                    <Building2 size={15} className="text-blue-600" />
                    <span className="text-sm text-gray-600">تحويل بنكي: <strong>{fmt(stats.transferCents)}</strong></span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Recent payments today */}
          {isToday && (stats.recentPayments ?? []).length > 0 && (
            <Card title="آخر المدفوعات">
              <div className="divide-y divide-gray-50">
                {(stats.recentPayments ?? []).slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-2.5">
                    <div>
                      <p className="text-sm font-mono font-semibold text-gray-900">{p.invoiceCode}</p>
                      <p className="text-xs text-gray-500">{payMethodLabel(p.method)}{p.reference ? ` — ${p.reference}` : ''}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-bold text-green-700">{fmt(p.amountCents)} د.إ</p>
                      <p className="text-xs text-gray-400">{formatDateTime(p.paidAt, lang)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Cashier sessions */}
          <Card title="سجل جلسات الكاشير">
            {sessionsLoading ? (
              <div className="flex justify-center py-6"><Spinner size="md" className="text-rose-600" /></div>
            ) : (
              <>
                <div className="divide-y divide-gray-50">
                  {(sessionsData?.items ?? []).map(s => (
                    <div key={s.id} className="flex items-center justify-between px-5 py-3 flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant={s.isClosed ? 'gray' : 'green'}>{s.isClosed ? 'مغلقة' : 'مفتوحة'}</Badge>
                          <p className="text-sm font-medium text-gray-900">{formatDateTime(s.openedAt, lang)}</p>
                        </div>
                        {s.closedAt && <p className="text-xs text-gray-400 mt-0.5">أُغلقت: {formatDateTime(s.closedAt, lang)}</p>}
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <p className="text-xs text-gray-500">نقدا</p>
                          <p className="font-semibold text-amber-700">{fmt(s.totalCashCents)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">بطاقة</p>
                          <p className="font-semibold text-purple-700">{fmt(s.totalCardCents)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">تحويل</p>
                          <p className="font-semibold text-blue-700">{fmt(s.totalTransferCents)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">الإجمالي</p>
                          <p className="font-bold text-gray-900">{fmt(s.totalCashCents + s.totalCardCents + s.totalTransferCents)}</p>
                        </div>
                        {s.differenceCents != null && s.differenceCents !== 0 && (
                          <div className="text-center">
                            <p className="text-xs text-gray-500">فرق</p>
                            <p className={`font-semibold ${s.differenceCents > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {s.differenceCents > 0 ? '+' : ''}{fmt(s.differenceCents)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {(sessionsData?.items ?? []).length === 0 && (
                    <p className="text-center text-gray-400 py-8 text-sm">لا توجد جلسات</p>
                  )}
                </div>
                {(sessionsData?.total ?? 0) > 10 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500">{sessionsData?.total} جلسة</p>
                    <div className="flex gap-2">
                      <button disabled={sessionPage === 1} onClick={() => setSessionPage(p => p - 1)}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={16} /></button>
                      <button disabled={(sessionPage * 10) >= (sessionsData?.total ?? 0)} onClick={() => setSessionPage(p => p + 1)}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Appointments tab ─────────────────────────────────────────────────────────

const STATUS_AR: Record<string, string> = {
  scheduled: 'محجوز', checked_in: 'تم تسجيل الحضور', confirmed: 'تم تسجيل الحضور',
  attended: 'تمت الخدمة', completed: 'مكتمل', cancelled: 'ملغي', no_show: 'لم يحضر',
}

function AppointmentsTab({ slug, branchId }: { slug: string; branchId: string | null }) {
  const today = todayInDubaiISO()
  const [preset, setPreset] = useState<RangePreset>('today')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'today') return { dateFrom: today, dateTo: today }
    if (preset === 'week') return { dateFrom: startOfWeek(today), dateTo: today }
    if (preset === 'month') return { dateFrom: startOfMonth(today), dateTo: today }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [preset, customFrom, customTo, today])

  const { data, isLoading } = useQuery({
    queryKey: ['appointments-report', slug, branchId ?? 'lb', dateFrom, dateTo],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 300, dateFrom, dateTo: addOneDay(dateTo) }),
    enabled: !!slug,
  })

  const items = data?.items ?? []

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {}
    const byEmployee: Record<string, number> = {}
    items.forEach(a => {
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1
      const emp = a.resourceName || 'غير محدد'
      byEmployee[emp] = (byEmployee[emp] ?? 0) + 1
    })
    return { byStatus, byEmployee }
  }, [items])

  const apptBars: SalesBar[] = Object.entries(stats.byEmployee)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ label: name.slice(0, 6), cents: count * 100 }))

  const statusColors: Record<string, 'blue' | 'green' | 'gray' | 'red' | 'yellow' | 'purple'> = {
    scheduled: 'blue', checked_in: 'green', confirmed: 'green',
    completed: 'gray', cancelled: 'red', no_show: 'yellow', attended: 'purple',
  }

  return (
    <div className="space-y-5">
      <RangePicker preset={preset} customFrom={customFrom} customTo={customTo} today={today}
        onPreset={setPreset} onFrom={setCustomFrom} onTo={setCustomTo} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-rose-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={CalendarCheck} label="إجمالي المواعيد" value={fmtN(items.length)} color="blue" />
            <StatCard icon={CalendarCheck} label="مكتملة" value={fmtN(stats.byStatus['completed'] ?? 0)}
              sub={items.length > 0 ? `${Math.round(((stats.byStatus['completed'] ?? 0) / items.length) * 100)}%` : '0%'} color="green" />
            <StatCard icon={CalendarCheck} label="لم يحضر" value={fmtN(stats.byStatus['no_show'] ?? 0)} color="amber" />
            <StatCard icon={CalendarCheck} label="ملغي" value={fmtN(stats.byStatus['cancelled'] ?? 0)} color="rose" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Status breakdown */}
            <Card title="توزيع الحالات">
              <div className="px-5 py-4 space-y-3">
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <Badge variant={statusColors[status] ?? 'gray'}>{STATUS_AR[status] ?? status}</Badge>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-rose-400 transition-all"
                        style={{ width: items.length > 0 ? `${(count / items.length) * 100}%` : '0%' }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-end">{count}</span>
                    <span className="text-xs text-gray-400 w-8 text-end">
                      {items.length > 0 ? `${Math.round((count / items.length) * 100)}%` : '0%'}
                    </span>
                  </div>
                ))}
                {items.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">لا توجد مواعيد</p>}
              </div>
            </Card>

            {/* Per employee */}
            <Card title="مواعيد حسب الموظف">
              {apptBars.length === 0 ? (
                <p className="text-center text-gray-400 py-12 text-sm">لا توجد بيانات</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {Object.entries(stats.byEmployee).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => (
                    <div key={name} className="flex items-center gap-3 px-5 py-2.5">
                      <div className="w-8 h-8 bg-rose-100 rounded-full flex items-center justify-center text-rose-700 text-xs font-bold flex-shrink-0">
                        {name[0]}
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-rose-500"
                          style={{ width: `${(count / items.length) * 100}%` }} />
                      </div>
                      <span className="text-sm font-bold text-gray-900 w-6 text-end">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Expenses tab ─────────────────────────────────────────────────────────────

function ExpensesTab({ slug }: { slug: string }) {
  const today = todayInDubaiISO()
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'today') return { dateFrom: today, dateTo: today }
    if (preset === 'week') return { dateFrom: startOfWeek(today), dateTo: today }
    if (preset === 'month') return { dateFrom: startOfMonth(today), dateTo: today }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [preset, customFrom, customTo, today])

  const { data, isLoading } = useQuery({
    queryKey: ['expenses-report', slug, dateFrom, dateTo],
    queryFn: () => getExpenses(slug, { page: 1, pageSize: 300 }),
    enabled: !!slug,
  })

  const allItems = data?.items ?? []
  const items = allItems.filter(e => e.expenseDate >= dateFrom && e.expenseDate <= dateTo)

  const stats = useMemo(() => {
    const byCategory: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    let totalAmount = 0
    items.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1
      totalAmount += e.amount
    })
    return { byCategory, byStatus, totalAmount }
  }, [items])

  const statusLabel: Record<string, string> = {
    draft: 'مسودة', submitted: 'بانتظار الاعتماد', approved: 'معتمد', rejected: 'مرفوض', paid: 'مدفوع', cancelled: 'ملغي',
  }
  const statusVariant: Record<string, 'blue' | 'green' | 'gray' | 'red' | 'yellow'> = {
    draft: 'gray', submitted: 'yellow', approved: 'green', rejected: 'red', paid: 'blue', cancelled: 'gray',
  }

  const expBars: SalesBar[] = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, amt]) => ({ label: cat.slice(0, 6), cents: Math.round(amt * 100) }))

  return (
    <div className="space-y-5">
      <RangePicker preset={preset} customFrom={customFrom} customTo={customTo} today={today}
        onPreset={setPreset} onFrom={setCustomFrom} onTo={setCustomTo} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-rose-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Receipt} label="إجمالي المصاريف" value={`${stats.totalAmount.toFixed(2)} AED`} color="rose" />
            <StatCard icon={Receipt} label="عدد المصاريف" value={fmtN(items.length)} color="blue" />
            <StatCard icon={Receipt} label="بانتظار الاعتماد" value={fmtN(stats.byStatus['submitted'] ?? 0)} color="amber" />
            <StatCard icon={Receipt} label="معتمدة" value={fmtN(stats.byStatus['approved'] ?? 0)} color="green" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="المصاريف حسب الفئة">
              <div className="px-5 py-4">
                {expBars.length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">لا توجد مصاريف</p>
                ) : (
                  <SalesBarChart bars={expBars} />
                )}
              </div>
            </Card>

            <Card title="توزيع الحالات">
              <div className="px-5 py-4 space-y-3">
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <Badge variant={statusVariant[status] ?? 'gray'}>{statusLabel[status] ?? status}</Badge>
                    <span className="flex-1 text-sm font-medium text-gray-700">{count} مصروف</span>
                  </div>
                ))}
                {items.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">لا توجد مصاريف</p>}
              </div>
            </Card>
          </div>

          {/* Top categories table */}
          <Card title="تفاصيل الفئات">
            <div className="divide-y divide-gray-50">
              {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                <div key={cat} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex-1 text-sm font-medium text-gray-800">{cat}</span>
                  <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-rose-400"
                      style={{ width: `${stats.totalAmount > 0 ? (amt / stats.totalAmount) * 100 : 0}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-28 text-end">{amt.toFixed(2)} AED</span>
                </div>
              ))}
              {Object.keys(stats.byCategory).length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">لا توجد بيانات</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Employees tab ────────────────────────────────────────────────────────────

const ATTENDANCE_STATUS_AR: Record<string, string> = {
  present: 'حاضر', late: 'متأخر', absent: 'غائب', leave: 'إجازة', holiday: 'عطلة',
}
const ATTENDANCE_COLOR: Record<string, string> = {
  present: 'text-green-700 bg-green-50', late: 'text-amber-700 bg-amber-50',
  absent: 'text-red-700 bg-red-50', leave: 'text-blue-700 bg-blue-50',
  holiday: 'text-gray-700 bg-gray-100',
}
const LEAVE_TYPE_AR: Record<string, string> = {
  annual: 'سنوية', sick: 'مرضية', emergency: 'طارئة', unpaid: 'بدون راتب',
  maternity: 'أمومة', other: 'أخرى',
}

function EmployeesTab({ slug, branchId }: { slug: string; branchId: string | null }) {
  const today = todayInDubaiISO()
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'attendance' | 'leaves'>('attendance')

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'today') return { dateFrom: today, dateTo: today }
    if (preset === 'week') return { dateFrom: startOfWeek(today), dateTo: today }
    if (preset === 'month') return { dateFrom: startOfMonth(today), dateTo: today }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [preset, customFrom, customTo, today])

  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ['appts-employees-report', slug, branchId ?? 'lb', dateFrom, dateTo],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 300, dateFrom, dateTo: addOneDay(dateTo) }),
    enabled: !!slug,
  })

  const { data: employees, isLoading: empLoading } = useQuery({
    queryKey: ['employees-report', branchId],
    queryFn: () => listEmployees(branchId!),
    enabled: !!branchId,
  })

  // Backend uses x.AttendanceDate < endDate (exclusive), so add 1 day to include today
  const attendanceDateTo = useMemo(() => {
    const d = new Date(dateTo + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [dateTo])

  // Attendance history for selected employee
  const { data: attendanceHistory, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance-history', branchId, selectedEmpId, dateFrom, attendanceDateTo],
    queryFn: () => getAttendanceHistory(branchId!, selectedEmpId!, dateFrom, attendanceDateTo),
    enabled: !!branchId && !!selectedEmpId,
  })

  // Leave records for selected employee
  const { data: leaveRecords, isLoading: leavesLoading } = useQuery({
    queryKey: ['leaves', branchId, selectedEmpId],
    queryFn: () => getLeaves(branchId!, selectedEmpId!),
    enabled: !!branchId && !!selectedEmpId,
  })

  const apptItems = apptData?.items ?? []
  const selectedEmp = (employees ?? []).find(e => e.id === selectedEmpId)

  const empStats = useMemo(() => {
    const byName: Record<string, {
      total: number; completed: number; noShow: number; cancelled: number
      revenueAED: number   // sum of servicePrice for completed appointments
    }> = {}
    apptItems.forEach(a => {
      const name = a.resourceName || 'غير محدد'
      if (!byName[name]) byName[name] = { total: 0, completed: 0, noShow: 0, cancelled: 0, revenueAED: 0 }
      byName[name].total++
      if (a.status === 'completed') {
        byName[name].completed++
        byName[name].revenueAED += a.servicePrice ?? 0
      }
      if (a.status === 'no_show') byName[name].noShow++
      if (a.status === 'cancelled') byName[name].cancelled++
    })
    return byName
  }, [apptItems])

  const totalRevenue = Object.values(empStats).reduce((s, e) => s + e.revenueAED, 0)

  // Attendance summary for selected employee
  const attendanceSummary = useMemo(() => {
    const records = attendanceHistory ?? []
    return {
      present: records.filter(r => r.status === 'present').length,
      late: records.filter(r => r.status === 'late').length,
      absent: records.filter(r => r.status === 'absent').length,
      leave: records.filter(r => r.status === 'leave').length,
      totalWorkedMin: records.reduce((s, r) => s + (r.workedMinutes ?? 0), 0),
      totalDeductions: records.reduce((s, r) => s + (r.deductionAmount ?? 0), 0),
      totalLateMin: records.reduce((s, r) => s + (r.lateMinutes ?? 0), 0),
    }
  }, [attendanceHistory])

  const isLoading = apptLoading || empLoading

  const fmtTime = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('ar-AE', { hour: '2-digit', minute: '2-digit' }) : '—'
  const fmtMinutes = (min: number) => `${Math.floor(min / 60)}س ${min % 60}د`

  return (
    <div className="space-y-5">
      <RangePicker preset={preset} customFrom={customFrom} customTo={customTo} today={today}
        onPreset={setPreset} onFrom={setCustomFrom} onTo={setCustomTo} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-rose-600" /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users} label="إجمالي الموظفين" value={fmtN(employees?.length ?? 0)} color="blue" />
            <StatCard icon={Users} label="نشطون" value={fmtN((employees ?? []).filter(e => e.isActive).length)} color="green" />
            <StatCard icon={CalendarCheck} label="مواعيد الفترة" value={fmtN(apptItems.length)} color="rose" />
            <StatCard icon={Users} label="قابلون للحجز" value={fmtN((employees ?? []).filter(e => e.isBookableForAppointments).length)} color="purple" />
          </div>

          {/* Revenue per employee — main table */}
          <Card title="إيرادات الموظفين — المواعيد المكتملة">
            <div className="px-4 py-2 border-b border-gray-100 bg-rose-50 flex items-center justify-between">
              <p className="text-xs text-gray-500">المبلغ = مجموع سعر الخدمة للمواعيد المكتملة (تم الدفع عبر نقطة البيع)</p>
              <p className="text-sm font-bold text-rose-700">{totalRevenue.toFixed(2)} AED إجمالي</p>
            </div>
            {Object.keys(empStats).length === 0 ? (
              <p className="text-center text-gray-400 py-10 text-sm">لا توجد بيانات في هذه الفترة</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-right">
                      <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">الموظف</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">مواعيد</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">مكتملة</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">لم يحضر</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">ملغي</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-center">معدل الإتمام</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-rose-600 text-center">الإيراد (AED)</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-gray-400 text-center">% من الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {Object.entries(empStats)
                      .sort((a, b) => b[1].revenueAED - a[1].revenueAED)
                      .map(([name, s]) => {
                        const revPct = totalRevenue > 0 ? (s.revenueAED / totalRevenue) * 100 : 0
                        const emp = (employees ?? []).find(e => e.fullName === name || e.linkedUsername === name)
                        return (
                          <tr key={name} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{ backgroundColor: emp?.appointmentColor ?? '#e40046' }}>
                                  {name[0]}
                                </div>
                                <span className="font-medium text-gray-900 text-sm">{name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center font-semibold text-gray-700 text-sm">{s.total}</td>
                            <td className="px-3 py-2.5 text-center text-green-700 font-semibold text-sm">{s.completed}</td>
                            <td className="px-3 py-2.5 text-center text-red-500 font-semibold text-sm">{s.noShow}</td>
                            <td className="px-3 py-2.5 text-center text-gray-400 font-semibold text-sm">{s.cancelled}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`font-bold text-sm ${s.total > 0 && (s.completed / s.total) >= 0.7 ? 'text-green-600' : 'text-amber-600'}`}>
                                {s.total > 0 ? `${Math.round((s.completed / s.total) * 100)}%` : '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="font-bold text-rose-700 text-sm">{s.revenueAED.toFixed(2)}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center gap-1.5">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-rose-400" style={{ width: `${revPct}%` }} />
                                </div>
                                <span className="text-xs text-gray-500 w-8 text-end">{revPct.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-rose-50 font-bold">
                      <td className="px-4 py-2.5 text-sm text-gray-700">الإجمالي</td>
                      <td className="px-3 py-2.5 text-center text-sm">{apptItems.length}</td>
                      <td className="px-3 py-2.5 text-center text-green-700 text-sm">{Object.values(empStats).reduce((s, e) => s + e.completed, 0)}</td>
                      <td className="px-3 py-2.5 text-center text-red-500 text-sm">{Object.values(empStats).reduce((s, e) => s + e.noShow, 0)}</td>
                      <td className="px-3 py-2.5 text-center text-gray-400 text-sm">{Object.values(empStats).reduce((s, e) => s + e.cancelled, 0)}</td>
                      <td className="px-3 py-2.5 text-center text-sm">
                        {apptItems.length > 0 ? `${Math.round((Object.values(empStats).reduce((s, e) => s + e.completed, 0) / apptItems.length) * 100)}%` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-center text-rose-700 text-sm font-bold">{totalRevenue.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-center text-sm text-gray-500">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {/* Employee list with select for detail */}
          <Card title="تفاصيل الموظف — الدوام والإجازات">
            <div className="px-5 py-4 border-b border-gray-100">
              <label className="block text-xs text-gray-500 mb-1.5">اختر موظفاً لعرض تفاصيل دوامه</label>
              <select
                value={selectedEmpId ?? ''}
                onChange={e => { setSelectedEmpId(e.target.value || null); setDetailTab('attendance') }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="">-- اختر موظفاً --</option>
                {(employees ?? []).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.fullName}{emp.jobTitle ? ` — ${emp.jobTitle}` : ''}</option>
                ))}
              </select>
            </div>

            {selectedEmp && (
              <>
                {/* Employee header */}
                <div className="px-5 py-4 flex items-center gap-3 border-b border-gray-100 bg-rose-50">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: selectedEmp.appointmentColor ?? '#e40046' }}>
                    {selectedEmp.fullName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{selectedEmp.fullName}</p>
                    <p className="text-xs text-gray-500">{selectedEmp.jobTitle ?? selectedEmp.employmentType ?? '—'} · {selectedEmp.employeeCode ?? ''}</p>
                  </div>
                  <div className="flex gap-4 text-center text-xs">
                    <div>
                      <p className="text-gray-400">الراتب الأساسي</p>
                      <p className="font-bold text-gray-800">{selectedEmp.baseSalary?.toFixed(0) ?? '—'} AED</p>
                    </div>
                    <div>
                      <p className="text-gray-400">تاريخ التوظيف</p>
                      <p className="font-bold text-gray-800">{selectedEmp.hireDate?.slice(0, 10) ?? '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex border-b border-gray-100">
                  {(['attendance', 'leaves'] as const).map(tab => (
                    <button key={tab} onClick={() => setDetailTab(tab)}
                      className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
                        ${detailTab === tab ? 'border-rose-600 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                      {tab === 'attendance' ? 'سجل الدوام' : 'الإجازات والغياب'}
                    </button>
                  ))}
                </div>

                {detailTab === 'attendance' && (
                  <>
                    {/* Attendance summary */}
                    {attendanceLoading ? (
                      <div className="flex justify-center py-8"><Spinner size="md" className="text-rose-600" /></div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-x-reverse divide-gray-100 border-b border-gray-100">
                          {[
                            { label: 'حاضر', value: attendanceSummary.present, cls: 'text-green-700' },
                            { label: 'متأخر', value: attendanceSummary.late, cls: 'text-amber-600' },
                            { label: 'غائب', value: attendanceSummary.absent, cls: 'text-red-600' },
                            { label: 'إجازة', value: attendanceSummary.leave, cls: 'text-blue-600' },
                            { label: 'ساعات العمل', value: fmtMinutes(attendanceSummary.totalWorkedMin), cls: 'text-gray-800' },
                            { label: 'الخصومات', value: `${attendanceSummary.totalDeductions.toFixed(2)} AED`, cls: 'text-red-600' },
                          ].map(({ label, value, cls }) => (
                            <div key={label} className="px-4 py-3 text-center">
                              <p className="text-xs text-gray-400">{label}</p>
                              <p className={`font-bold text-sm mt-0.5 ${cls}`}>{value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                          {(attendanceHistory ?? []).length === 0 ? (
                            <p className="text-center text-gray-400 py-8 text-sm">لا يوجد سجل دوام في هذه الفترة</p>
                          ) : (
                            [...(attendanceHistory ?? [])].sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate)).map(rec => (
                              <div key={rec.id} className="flex items-center gap-3 px-5 py-2.5">
                                <span className="text-xs text-gray-500 w-24 flex-shrink-0">{rec.attendanceDate}</span>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ATTENDANCE_COLOR[rec.status ?? ''] ?? 'text-gray-600 bg-gray-100'}`}>
                                  {ATTENDANCE_STATUS_AR[rec.status ?? ''] ?? rec.status ?? '—'}
                                </span>
                                <span className="text-xs text-gray-600 flex-shrink-0">
                                  دخول: {fmtTime(rec.checkInAt)}
                                </span>
                                <span className="text-xs text-gray-600 flex-shrink-0">
                                  خروج: {fmtTime(rec.checkOutAt)}
                                </span>
                                {(rec.workedMinutes ?? 0) > 0 && (
                                  <span className="text-xs text-green-600 flex-shrink-0">{fmtMinutes(rec.workedMinutes!)}</span>
                                )}
                                {(rec.lateMinutes ?? 0) > 0 && (
                                  <span className="text-xs text-amber-600 flex-shrink-0">تأخر {rec.lateMinutes} د</span>
                                )}
                                {(rec.deductionAmount ?? 0) > 0 && (
                                  <span className="text-xs text-red-500 flex-shrink-0">خصم {rec.deductionAmount?.toFixed(2)}</span>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {detailTab === 'leaves' && (
                  <>
                    {leavesLoading ? (
                      <div className="flex justify-center py-8"><Spinner size="md" className="text-rose-600" /></div>
                    ) : (leaveRecords ?? []).length === 0 ? (
                      <p className="text-center text-gray-400 py-10 text-sm">لا توجد سجلات إجازات</p>
                    ) : (
                      <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                        {[...(leaveRecords ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(leave => {
                          const days = Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / 86400000) + 1
                          return (
                            <div key={leave.id} className="flex items-center gap-3 px-5 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                                    {LEAVE_TYPE_AR[leave.leaveType ?? ''] ?? leave.leaveType ?? 'إجازة'}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${leave.isPaid ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {leave.isPaid ? 'مدفوعة' : 'بدون راتب'}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    leave.status === 'approved' ? 'bg-green-50 text-green-700' :
                                    leave.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                                  }`}>
                                    {leave.status === 'approved' ? 'معتمدة' : leave.status === 'rejected' ? 'مرفوضة' : 'بانتظار'}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{leave.startDate} — {leave.endDate}</p>
                                {leave.notes && <p className="text-xs text-gray-400 mt-0.5">{leave.notes}</p>}
                              </div>
                              <div className="text-end flex-shrink-0">
                                <p className="text-sm font-bold text-gray-800">{days}</p>
                                <p className="text-xs text-gray-400">يوم</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {!selectedEmpId && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                <Users size={36} className="mb-2" />
                <p className="text-sm">اختر موظفاً من القائمة أعلاه</p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Custom Report Builder (drag & drop) ─────────────────────────────────────

interface ReportField {
  id: string
  label: string
  key: string
  group: 'invoice' | 'appointment' | 'expense'
}

const ALL_FIELDS: ReportField[] = [
  { id: 'inv-code', label: 'رقم الفاتورة', key: 'invoiceCode', group: 'invoice' },
  { id: 'inv-status', label: 'حالة الفاتورة', key: 'status', group: 'invoice' },
  { id: 'inv-total', label: 'إجمالي الفاتورة', key: 'total', group: 'invoice' },
  { id: 'inv-customer', label: 'اسم العميل', key: 'customerName', group: 'invoice' },
  { id: 'inv-date', label: 'تاريخ الفاتورة', key: 'createdAt', group: 'invoice' },
  { id: 'appt-customer', label: 'عميل الموعد', key: 'customerName', group: 'appointment' },
  { id: 'appt-service', label: 'الخدمة', key: 'serviceName', group: 'appointment' },
  { id: 'appt-employee', label: 'الموظف', key: 'resourceName', group: 'appointment' },
  { id: 'appt-status', label: 'حالة الموعد', key: 'status', group: 'appointment' },
  { id: 'appt-date', label: 'تاريخ الموعد', key: 'startAt', group: 'appointment' },
  { id: 'appt-price', label: 'سعر الخدمة', key: 'servicePrice', group: 'appointment' },
  { id: 'exp-title', label: 'عنوان المصروف', key: 'title', group: 'expense' },
  { id: 'exp-category', label: 'فئة المصروف', key: 'category', group: 'expense' },
  { id: 'exp-amount', label: 'مبلغ المصروف', key: 'amount', group: 'expense' },
  { id: 'exp-status', label: 'حالة المصروف', key: 'status', group: 'expense' },
  { id: 'exp-date', label: 'تاريخ المصروف', key: 'expenseDate', group: 'expense' },
]

const GROUP_LABELS: Record<string, string> = {
  invoice: 'فواتير',
  appointment: 'مواعيد',
  expense: 'مصاريف',
}

type ReportMode = 'flat' | 'pivot'

function CustomReportBuilder({ slug, branchId }: { slug: string; branchId: string | null }) {
  const today = todayInDubaiISO()
  const [selectedFields, setSelectedFields] = useState<ReportField[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingSelected, setDraggingSelected] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [reportMode, setReportMode] = useState<ReportMode>('flat')
  const [pivotRow, setPivotRow] = useState<string>('')
  const [pivotCol, setPivotCol] = useState<string>('')
  const [pivotVal, setPivotVal] = useState<string>('')
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'today') return { dateFrom: today, dateTo: today }
    if (preset === 'week') return { dateFrom: startOfWeek(today), dateTo: today }
    if (preset === 'month') return { dateFrom: startOfMonth(today), dateTo: today }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [preset, customFrom, customTo, today])

  // determine which groups are needed
  const neededGroups = useMemo(() => {
    const groups = new Set(selectedFields.map(f => f.group))
    return groups
  }, [selectedFields])

  const { data: invoicesData } = useQuery({
    queryKey: ['custom-report-invoices', slug, dateFrom, dateTo],
    queryFn: () => getInvoices(slug, { page: 1, pageSize: 100, dateFrom, dateTo }),
    enabled: !!slug && showPreview && neededGroups.has('invoice'),
  })

  const { data: apptData } = useQuery({
    queryKey: ['custom-report-appts', slug, branchId ?? 'lb', dateFrom, dateTo],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 100, dateFrom, dateTo: addOneDay(dateTo) }),
    enabled: !!slug && showPreview && neededGroups.has('appointment'),
  })

  const { data: expData } = useQuery({
    queryKey: ['custom-report-expenses', slug, dateFrom, dateTo],
    queryFn: () => getExpenses(slug, { page: 1, pageSize: 100 }),
    enabled: !!slug && showPreview && neededGroups.has('expense'),
  })

  // Build preview rows
  const previewRows = useMemo(() => {
    if (!showPreview || selectedFields.length === 0) return []
    const rows: Record<string, unknown>[] = []

    if (neededGroups.has('invoice')) {
      ;(invoicesData?.items ?? []).forEach(inv => {
        const row: Record<string, unknown> = { _group: 'invoice' }
        selectedFields.filter(f => f.group === 'invoice').forEach(f => { row[f.id] = inv[f.key as keyof typeof inv] })
        rows.push(row)
      })
    }
    if (neededGroups.has('appointment')) {
      ;(apptData?.items ?? []).forEach(appt => {
        const row: Record<string, unknown> = { _group: 'appointment' }
        selectedFields.filter(f => f.group === 'appointment').forEach(f => { row[f.id] = appt[f.key as keyof typeof appt] })
        rows.push(row)
      })
    }
    if (neededGroups.has('expense')) {
      const expItems = (expData?.items ?? []).filter(e => e.expenseDate >= dateFrom && e.expenseDate <= dateTo)
      expItems.forEach(exp => {
        const row: Record<string, unknown> = { _group: 'expense' }
        selectedFields.filter(f => f.group === 'expense').forEach(f => { row[f.id] = exp[f.key as keyof typeof exp] })
        rows.push(row)
      })
    }
    return rows
  }, [showPreview, selectedFields, neededGroups, invoicesData, apptData, expData, dateFrom, dateTo])

  // ── DnD handlers ──

  const onDragStartField = useCallback((id: string, fromSelected: boolean) => {
    setDraggingId(id)
    setDraggingSelected(fromSelected)
  }, [])

  const onDropOnZone = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!draggingId) return
    if (draggingSelected) return // reordering — handled separately
    const field = ALL_FIELDS.find(f => f.id === draggingId)
    if (!field) return
    if (selectedFields.find(f => f.id === draggingId)) return // already added
    setSelectedFields(prev => [...prev, field])
    setDraggingId(null)
  }, [draggingId, draggingSelected, selectedFields])

  const onDropOnSelected = useCallback((targetId: string) => {
    if (!draggingId || !draggingSelected) return
    setSelectedFields(prev => {
      const copy = [...prev]
      const fromIdx = copy.findIndex(f => f.id === draggingId)
      const toIdx = copy.findIndex(f => f.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const [item] = copy.splice(fromIdx, 1)
      copy.splice(toIdx, 0, item)
      return copy
    })
    setDraggingId(null)
  }, [draggingId, draggingSelected])

  const removeField = useCallback((id: string) => {
    setSelectedFields(prev => prev.filter(f => f.id !== id))
  }, [])

  const groupedFields = useMemo(() => {
    const groups: Record<string, ReportField[]> = {}
    ALL_FIELDS.forEach(f => {
      if (!groups[f.group]) groups[f.group] = []
      groups[f.group].push(f)
    })
    return groups
  }, [])

  const formatCellValue = (value: unknown, field: ReportField): string => {
    if (value == null) return '—'
    if (field.key === 'total' || field.key === 'amount' || field.key === 'servicePrice') {
      const n = typeof value === 'number' ? value : parseFloat(String(value))
      return isNaN(n) ? '—' : n.toFixed(2)
    }
    if (field.key === 'createdAt' || field.key === 'startAt' || field.key === 'expenseDate') {
      return String(value).slice(0, 10)
    }
    return String(value)
  }

  // Quick report presets
  const QUICK_REPORTS = [
    {
      label: '📊 إيرادات الموظفين',
      desc: 'موظف × حالة الموعد × سعر الخدمة',
      fields: ['appt-employee', 'appt-date', 'appt-service', 'appt-status', 'appt-price'],
      mode: 'pivot' as ReportMode,
      row: 'appt-employee', col: 'appt-status', val: 'appt-price',
    },
    {
      label: '📋 قائمة المواعيد',
      desc: 'عميل، موظف، خدمة، تاريخ، حالة',
      fields: ['appt-date', 'appt-customer', 'appt-employee', 'appt-service', 'appt-status', 'appt-price'],
      mode: 'flat' as ReportMode,
      row: '', col: '', val: '',
    },
    {
      label: '💰 قائمة الفواتير',
      desc: 'رقم الفاتورة، العميل، المبلغ، الحالة',
      fields: ['inv-date', 'inv-code', 'inv-customer', 'inv-total', 'inv-status'],
      mode: 'flat' as ReportMode,
      row: '', col: '', val: '',
    },
    {
      label: '🧾 المصاريف',
      desc: 'الفئة × الحالة × المبلغ',
      fields: ['exp-date', 'exp-title', 'exp-category', 'exp-amount', 'exp-status'],
      mode: 'pivot' as ReportMode,
      row: 'exp-category', col: 'exp-status', val: 'exp-amount',
    },
  ]

  const applyQuickReport = (qr: typeof QUICK_REPORTS[0]) => {
    const fields = qr.fields.map(id => ALL_FIELDS.find(f => f.id === id)!).filter(Boolean)
    setSelectedFields(fields)
    setReportMode(qr.mode)
    setPivotRow(qr.row)
    setPivotCol(qr.col)
    setPivotVal(qr.val)
    setShowPreview(false)
  }

  return (
    <div className="space-y-5">
      <RangePicker preset={preset} customFrom={customFrom} customTo={customTo} today={today}
        onPreset={setPreset} onFrom={setCustomFrom} onTo={setCustomTo} />

      {/* Quick report buttons */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">تقارير جاهزة — اضغط لتطبيق مباشرة</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_REPORTS.map(qr => (
            <button key={qr.label} onClick={() => applyQuickReport(qr)}
              className="flex flex-col items-start px-3 py-2 border border-gray-200 rounded-lg hover:border-rose-300 hover:bg-rose-50 transition-colors text-start">
              <span className="text-sm font-semibold text-gray-800">{qr.label}</span>
              <span className="text-xs text-gray-400 mt-0.5">{qr.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Available fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <GripVertical size={15} className="text-gray-400" />
            الحقول المتاحة — اسحب إلى المنطقة اليمنى
          </p>
          <div className="space-y-4">
            {Object.entries(groupedFields).map(([group, fields]) => (
              <div key={group}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{GROUP_LABELS[group]}</p>
                <div className="flex flex-wrap gap-2">
                  {fields.map(field => {
                    const already = !!selectedFields.find(f => f.id === field.id)
                    return (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={() => onDragStartField(field.id, false)}
                        onClick={() => { if (!already) setSelectedFields(prev => [...prev, field]) }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border cursor-grab transition-all select-none
                          ${already
                            ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                            : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                      >
                        <GripVertical size={12} className="text-rose-400 flex-shrink-0" />
                        {field.label}
                        {!already && <Plus size={11} className="text-rose-400" />}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-4 flex flex-col"
          ref={dropZoneRef}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDropOnZone}
          style={{ borderColor: dragOver ? '#e40046' : undefined, backgroundColor: dragOver ? '#fff1f2' : undefined }}
        >
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Eye size={15} className="text-gray-400" />
            أعمدة تقريرك — رتّب بالسحب
          </p>

          {selectedFields.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-gray-300">
              <GripVertical size={32} className="mb-2" />
              <p className="text-sm">اسحب الحقول هنا أو اضغط عليها</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedFields.map(field => (
                <div
                  key={field.id}
                  draggable
                  onDragStart={() => onDragStartField(field.id, true)}
                  onDragOver={e => { e.preventDefault() }}
                  onDrop={() => onDropOnSelected(field.id)}
                  className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg cursor-grab select-none"
                >
                  <GripVertical size={14} className="text-rose-300 flex-shrink-0" />
                  <span className="flex-1 text-sm font-medium text-rose-700">{field.label}</span>
                  <span className="text-xs text-rose-400 bg-rose-100 px-2 py-0.5 rounded-full">{GROUP_LABELS[field.group]}</span>
                  <button onClick={() => removeField(field.id)}
                    className="text-rose-300 hover:text-rose-600 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedFields.length > 0 && (
            <div className="mt-4 space-y-2">
              {/* Mode toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {(['flat', 'pivot'] as ReportMode[]).map(m => (
                  <button key={m} onClick={() => setReportMode(m)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors
                      ${reportMode === m ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500'}`}>
                    {m === 'flat' ? '☰ جدول عادي' : '⊞ جدول محوري (Pivot)'}
                  </button>
                ))}
              </div>

              {/* Pivot config */}
              {reportMode === 'pivot' && (
                <div className="grid grid-cols-3 gap-2 bg-rose-50 border border-rose-100 rounded-lg p-3">
                  {[
                    { label: 'الصفوف (Row)', val: pivotRow, set: setPivotRow },
                    { label: 'الأعمدة (Col)', val: pivotCol, set: setPivotCol },
                    { label: 'القيمة (Value)', val: pivotVal, set: setPivotVal },
                  ].map(({ label, val, set }) => (
                    <div key={label}>
                      <p className="text-xs text-rose-600 mb-1 font-medium">{label}</p>
                      <select value={val} onChange={e => set(e.target.value)}
                        className="w-full text-xs border border-rose-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-rose-400">
                        <option value="">-- اختر --</option>
                        {selectedFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowPreview(true)}
                className="w-full flex items-center justify-center gap-2 bg-rose-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors"
              >
                <Eye size={15} />
                {reportMode === 'pivot' ? 'عرض Pivot Table' : `عرض التقرير (${selectedFields.length} أعمدة)`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preview — Flat Table */}
      {showPreview && reportMode === 'flat' && selectedFields.length > 0 && (
        <Card title={`جدول عادي — ${previewRows.length} صف`}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <p className="text-xs text-gray-500">الفترة: {dateFrom} — {dateTo}</p>
            <button onClick={() => setShowPreview(false)} className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1">
              <X size={13} /> إغلاق
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-right">
                  {selectedFields.map(f => (
                    <th key={f.id} className="px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                      {f.label}
                      <span className="ms-1 text-gray-300 text-xs">({GROUP_LABELS[f.group]})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {previewRows.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {selectedFields.map(f => (
                      <td key={f.id} className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs">
                        {formatCellValue(row[f.id], f)}
                      </td>
                    ))}
                  </tr>
                ))}
                {previewRows.length === 0 && (
                  <tr><td colSpan={selectedFields.length} className="text-center py-10 text-gray-400 text-sm">لا توجد بيانات</td></tr>
                )}
              </tbody>
            </table>
            {previewRows.length > 50 && (
              <p className="text-center text-xs text-gray-400 py-2 border-t border-gray-100">يُعرض أول 50 من {previewRows.length}</p>
            )}
          </div>
        </Card>
      )}

      {/* Preview — Pivot Table */}
      {showPreview && reportMode === 'pivot' && selectedFields.length > 0 && pivotRow && pivotCol && pivotVal && (() => {
        const rowField = selectedFields.find(f => f.id === pivotRow)
        const colField = selectedFields.find(f => f.id === pivotCol)
        const valField = selectedFields.find(f => f.id === pivotVal)
        if (!rowField || !colField || !valField) return null

        const rowValues = [...new Set(previewRows.map(r => String(r[pivotRow] ?? '—')))].sort()
        const colValues = [...new Set(previewRows.map(r => String(r[pivotCol] ?? '—')))].sort()

        const cell = (row: string, col: string) => {
          const matching = previewRows.filter(r => String(r[pivotRow] ?? '—') === row && String(r[pivotCol] ?? '—') === col)
          if (matching.length === 0) return '—'
          const vals = matching.map(r => parseFloat(String(r[pivotVal] ?? '0')) || 0)
          const isNumeric = valField.key === 'total' || valField.key === 'amount' || valField.key === 'servicePrice'
          if (isNumeric) return vals.reduce((a, b) => a + b, 0).toFixed(2)
          return String(matching.length)
        }

        const rowTotal = (row: string) => {
          const matching = previewRows.filter(r => String(r[pivotRow] ?? '—') === row)
          const isNumeric = valField.key === 'total' || valField.key === 'amount' || valField.key === 'servicePrice'
          if (isNumeric) return matching.reduce((s, r) => s + (parseFloat(String(r[pivotVal] ?? '0')) || 0), 0).toFixed(2)
          return String(matching.length)
        }

        return (
          <Card title={`Pivot Table — ${rowField.label} × ${colField.label}`}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <p className="text-xs text-gray-500">القيمة: {valField.label} · {previewRows.length} صف</p>
              <button onClick={() => setShowPreview(false)} className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1">
                <X size={13} /> إغلاق
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">{rowField.label} \ {colField.label}</th>
                    {colValues.map(col => (
                      <th key={col} className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">{col}</th>
                    ))}
                    <th className="px-3 py-2 text-center font-bold text-rose-600 whitespace-nowrap bg-rose-50">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rowValues.map(row => (
                    <tr key={row} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{row}</td>
                      {colValues.map(col => (
                        <td key={col} className="px-3 py-2 text-center text-gray-700">{cell(row, col)}</td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold text-rose-600 bg-rose-50">{rowTotal(row)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                    <td className="px-3 py-2 text-gray-700">الإجمالي</td>
                    {colValues.map(col => {
                      const matching = previewRows.filter(r => String(r[pivotCol] ?? '—') === col)
                      const isNumeric = valField.key === 'total' || valField.key === 'amount' || valField.key === 'servicePrice'
                      const total = isNumeric
                        ? matching.reduce((s, r) => s + (parseFloat(String(r[pivotVal] ?? '0')) || 0), 0).toFixed(2)
                        : String(matching.length)
                      return <td key={col} className="px-3 py-2 text-center text-gray-800">{total}</td>
                    })}
                    <td className="px-3 py-2 text-center text-rose-700 bg-rose-50">
                      {(() => {
                        const isNumeric = valField.key === 'total' || valField.key === 'amount' || valField.key === 'servicePrice'
                        return isNumeric
                          ? previewRows.reduce((s, r) => s + (parseFloat(String(r[pivotVal] ?? '0')) || 0), 0).toFixed(2)
                          : String(previewRows.length)
                      })()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )
      })()}
    </div>
  )
}

// ─── Revenue / P&L tab ───────────────────────────────────────────────────────

function RevenueTab({ slug, branchId }: { slug: string; branchId: string | null }) {
  const today = todayInDubaiISO()
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'today') return { dateFrom: today, dateTo: today }
    if (preset === 'week') return { dateFrom: startOfWeek(today), dateTo: today }
    if (preset === 'month') return { dateFrom: startOfMonth(today), dateTo: today }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [preset, customFrom, customTo, today])

  // Invoices — source of truth for sales
  const { data: invoicesData, isLoading: invLoading } = useQuery({
    queryKey: ['pl-invoices', slug, branchId ?? 'lb'],
    queryFn: () => getInvoices(slug, { page: 1, pageSize: 500 }),
    enabled: !!slug,
  })

  // Expenses
  const { data: expData, isLoading: expLoading } = useQuery({
    queryKey: ['pl-expenses', slug],
    queryFn: () => getExpenses(slug, { page: 1, pageSize: 500 }),
    enabled: !!slug,
  })

  // Sessions — for cash/card/transfer breakdown
  const { data: sessionsData, isLoading: sessLoading } = useQuery({
    queryKey: ['pl-sessions', slug, branchId ?? 'lb'],
    queryFn: () => getSessions(slug, { page: 1, pageSize: 100 }),
    enabled: !!slug,
  })

  const isLoading = invLoading || expLoading || sessLoading

  // Filter by date range (client-side)
  const paidInvoices = useMemo(() =>
    (invoicesData?.items ?? []).filter(inv => {
      const d = inv.createdAt.slice(0, 10)
      return (inv.status === 'Paid' || inv.status === 'PartiallyPaid') && d >= dateFrom && d <= dateTo
    }), [invoicesData, dateFrom, dateTo])

  const periodExpenses = useMemo(() =>
    (expData?.items ?? []).filter(exp => {
      const d = exp.expenseDate?.slice(0, 10) ?? exp.createdAt.slice(0, 10)
      return exp.status !== 'cancelled' && d >= dateFrom && d <= dateTo
    }), [expData, dateFrom, dateTo])

  const periodSessions = useMemo(() =>
    (sessionsData?.items ?? []).filter(s => {
      const d = s.openedAt.slice(0, 10)
      return d >= dateFrom && d <= dateTo
    }), [sessionsData, dateFrom, dateTo])

  // Totals
  const grossSales = paidInvoices.reduce((s, i) => s + i.total, 0)
  const totalExpenses = periodExpenses.reduce((s, e) => s + e.amount, 0)
  const netRevenue = grossSales - totalExpenses
  const cashCents = periodSessions.reduce((s, sess) => s + sess.totalCashCents, 0)
  const cardCents = periodSessions.reduce((s, sess) => s + sess.totalCardCents, 0)
  const transferCents = periodSessions.reduce((s, sess) => s + sess.totalTransferCents, 0)

  // Expenses by category
  const expByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    periodExpenses.forEach(e => {
      map[e.category] = (map[e.category] ?? 0) + e.amount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [periodExpenses])

  // Daily P&L
  const dailyPL = useMemo(() => {
    const days = dateRange(dateFrom, dateTo)
    const salesByDay: Record<string, number> = {}
    const expByDay: Record<string, number> = {}
    paidInvoices.forEach(inv => {
      const d = inv.createdAt.slice(0, 10)
      salesByDay[d] = (salesByDay[d] ?? 0) + inv.total
    })
    periodExpenses.forEach(exp => {
      const d = exp.expenseDate?.slice(0, 10) ?? exp.createdAt.slice(0, 10)
      expByDay[d] = (expByDay[d] ?? 0) + exp.amount
    })
    return days.map(d => ({
      day: d,
      label: d.slice(5),
      sales: salesByDay[d] ?? 0,
      expenses: expByDay[d] ?? 0,
      net: (salesByDay[d] ?? 0) - (expByDay[d] ?? 0),
    }))
  }, [dateFrom, dateTo, paidInvoices, periodExpenses])

  const maxBar = Math.max(...dailyPL.map(d => Math.max(d.sales, d.expenses)), 1)

  return (
    <div className="space-y-5">
      <RangePicker preset={preset} customFrom={customFrom} customTo={customTo} today={today}
        onPreset={setPreset} onFrom={setCustomFrom} onTo={setCustomTo} />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-rose-600" /></div>
      ) : (
        <>
          {/* Main P&L summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">+ إجمالي المبيعات</p>
              <p className="text-2xl font-bold text-green-700">{grossSales.toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-0.5">AED · {paidInvoices.length} فاتورة</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">- إجمالي المصاريف</p>
              <p className="text-2xl font-bold text-red-600">{totalExpenses.toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-0.5">AED · {periodExpenses.length} مصروف</p>
            </div>
            <div className={`rounded-xl border p-4 ${netRevenue >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-gray-500 mb-1">= صافي الإيراد</p>
              <p className={`text-2xl font-bold ${netRevenue >= 0 ? 'text-green-800' : 'text-red-700'}`}>
                {netRevenue >= 0 ? '+' : ''}{netRevenue.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">AED</p>
            </div>
          </div>

          {/* Sales breakdown (payment methods) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="تفاصيل المبيعات — طرق الدفع">
              <div className="px-4 py-3 space-y-3">
                {[
                  { label: 'نقداً', cents: cashCents, color: 'bg-amber-500' },
                  { label: 'بطاقة', cents: cardCents, color: 'bg-purple-500' },
                  { label: 'تحويل', cents: transferCents, color: 'bg-blue-500' },
                ].map(({ label, cents, color }) => {
                  const total = cashCents + cardCents + transferCents
                  const pct = total > 0 ? ((cents / total) * 100).toFixed(0) : '0'
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{label}</span>
                        <span className="font-semibold text-gray-900">{(cents / 100).toFixed(2)} <span className="text-xs text-gray-400">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
                <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">مجموع الجلسات في الفترة</p>
              </div>
            </Card>

            <Card title="تفاصيل المصاريف — حسب الفئة">
              {expByCategory.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">لا توجد مصاريف</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {expByCategory.map(([cat, amt]) => (
                    <div key={cat} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex-1 text-sm text-gray-800">{cat}</span>
                      <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-red-400"
                          style={{ width: `${totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-red-600 w-20 text-end">{amt.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 font-bold">
                    <span className="flex-1 text-sm text-gray-700">الإجمالي</span>
                    <span className="text-sm text-red-700">{totalExpenses.toFixed(2)} AED</span>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Daily bar chart — sales vs expenses */}
          {dailyPL.length > 1 && (
            <Card title="مبيعات يومية مقابل مصاريف">
              <div className="px-4 py-4">
                <div className="flex items-center gap-4 mb-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" /> مبيعات</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> مصاريف</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> صافي</span>
                </div>
                <div style={{ height: 110 }} className="relative w-full">
                  <div className="absolute inset-0 flex items-end gap-0.5" style={{ paddingBottom: 20 }}>
                    {dailyPL.map((d, i) => (
                      <div key={i} className="flex-1 flex items-end gap-px h-full group relative">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 z-10 hidden group-hover:flex flex-col bg-gray-900 text-white rounded-lg px-2 py-1.5 text-xs whitespace-nowrap pointer-events-none shadow-lg gap-0.5">
                          <span className="font-bold">{d.day}</span>
                          <span className="text-green-400">مبيعات: {d.sales.toFixed(0)} AED</span>
                          <span className="text-red-400">مصاريف: {d.expenses.toFixed(0)} AED</span>
                          <span className={d.net >= 0 ? 'text-emerald-400' : 'text-orange-400'}>
                            صافي: {d.net >= 0 ? '+' : ''}{d.net.toFixed(0)} AED
                          </span>
                        </div>
                        {/* Sales bar */}
                        <div className="flex-1 rounded-t-sm transition-all"
                          style={{ height: `${Math.max(d.sales > 0 ? 2 : 0, (d.sales / maxBar) * 100)}%`, backgroundColor: '#e40046', opacity: 0.85 }} />
                        {/* Expenses bar */}
                        <div className="flex-1 rounded-t-sm transition-all"
                          style={{ height: `${Math.max(d.expenses > 0 ? 2 : 0, (d.expenses / maxBar) * 100)}%`, backgroundColor: '#fca5a5' }} />
                        {/* Day label */}
                        <div className="absolute w-full text-center"
                          style={{ bottom: -20, fontSize: 7, color: '#9ca3af', lineHeight: '20px' }}>
                          {d.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Daily P&L table */}
          <Card title="تقرير يومي — مبيعات / مصاريف / صافي">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right bg-gray-50">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">التاريخ</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-green-700 text-center">مبيعات (AED)</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-red-600 text-center">مصاريف (AED)</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-center">صافي (AED)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dailyPL.filter(d => d.sales > 0 || d.expenses > 0).map(d => (
                    <tr key={d.day} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{d.day}</td>
                      <td className="px-4 py-2.5 text-center text-green-700 font-semibold">{d.sales > 0 ? d.sales.toFixed(2) : '—'}</td>
                      <td className="px-4 py-2.5 text-center text-red-600 font-semibold">{d.expenses > 0 ? d.expenses.toFixed(2) : '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-bold ${d.net >= 0 ? 'text-emerald-700' : 'text-orange-600'}`}>
                          {d.net >= 0 ? '+' : ''}{d.net.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {dailyPL.filter(d => d.sales > 0 || d.expenses > 0).length === 0 && (
                    <tr><td colSpan={4} className="text-center py-10 text-gray-400">لا توجد بيانات في هذه الفترة</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-bold">
                    <td className="px-4 py-2.5 text-gray-700">الإجمالي</td>
                    <td className="px-4 py-2.5 text-center text-green-700">{grossSales.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-center text-red-600">{totalExpenses.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`font-bold text-base ${netRevenue >= 0 ? 'text-emerald-700' : 'text-orange-600'}`}>
                        {netRevenue >= 0 ? '+' : ''}{netRevenue.toFixed(2)} AED
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Services discount/actual tab ────────────────────────────────────────────

function ServiceDiscountTab({ slug, branchId }: { slug: string; branchId: string | null }) {
  const today = todayInDubaiISO()
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const [loadDetails, setLoadDetails] = useState(false)

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'today') return { dateFrom: today, dateTo: today }
    if (preset === 'week') return { dateFrom: startOfWeek(today), dateTo: today }
    if (preset === 'month') return { dateFrom: startOfMonth(today), dateTo: today }
    return { dateFrom: customFrom, dateTo: customTo }
  }, [preset, customFrom, customTo, today])

  // Appointments — for catalog price per service
  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ['svc-appts', slug, branchId ?? 'lb', dateFrom, dateTo],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 500, dateFrom, dateTo: addOneDay(dateTo) }),
    enabled: !!slug,
  })

  // Invoices list — to identify which invoices to detail
  const { data: invoicesData, isLoading: invLoading } = useQuery({
    queryKey: ['svc-invoices', slug],
    queryFn: () => getInvoices(slug, { page: 1, pageSize: 200 }),
    enabled: !!slug && loadDetails,
  })

  // Filter invoices in range
  const paidInvoicesInRange = useMemo(() =>
    (invoicesData?.items ?? []).filter(inv => {
      const d = inv.createdAt.slice(0, 10)
      return (inv.status === 'Paid' || inv.status === 'PartiallyPaid') && d >= dateFrom && d <= dateTo
    }).slice(0, 30), // limit to 30 invoices
    [invoicesData, dateFrom, dateTo])

  // Fetch details for each invoice (parallel, max 30)
  const invoiceDetailsQueries = paidInvoicesInRange.map(inv =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['invoice-detail', slug, inv.id],
      queryFn: () => getInvoice(slug, inv.id),
      enabled: loadDetails && paidInvoicesInRange.length > 0,
      staleTime: 10 * 60 * 1000,
    })
  )

  const detailsLoading = invoiceDetailsQueries.some(q => q.isLoading)
  const allDetails = invoiceDetailsQueries.map(q => q.data).filter(Boolean)

  // Aggregate actual price per service from invoice lines
  const actualByService = useMemo(() => {
    const map: Record<string, { qty: number; totalPaid: number }> = {}
    allDetails.forEach(detail => {
      if (!detail) return
      const lines = detail.lines ?? detail.items ?? []
      lines.filter(l => l.itemType === 'Service').forEach(line => {
        const name = line.nameSnapshot ?? line.name ?? 'غير محدد'
        if (!map[name]) map[name] = { qty: 0, totalPaid: 0 }
        map[name].qty += line.qty ?? 1
        const paid = line.lineTotal ?? (line.lineTotalCents ? line.lineTotalCents / 100 : 0)
        map[name].totalPaid += paid
      })
    })
    return map
  }, [allDetails])

  // Catalog price per service from appointments
  const catalogByService = useMemo(() => {
    const map: Record<string, { count: number; totalCatalog: number; unitPrice: number }> = {}
    const appts = (apptData?.items ?? []).filter(a =>
      a.status === 'completed' || a.status === 'checked_in' || a.status === 'confirmed'
    )
    appts.forEach(a => {
      const name = a.serviceName || 'غير محدد'
      if (!map[name]) map[name] = { count: 0, totalCatalog: 0, unitPrice: a.servicePrice ?? 0 }
      map[name].count++
      map[name].totalCatalog += a.servicePrice ?? 0
      map[name].unitPrice = a.servicePrice ?? map[name].unitPrice
    })
    return map
  }, [apptData])

  // Merge: services from appointments + actual from invoices
  const services = useMemo(() => {
    const names = new Set([...Object.keys(catalogByService), ...Object.keys(actualByService)])
    return [...names].map(name => {
      const cat = catalogByService[name] ?? { count: 0, totalCatalog: 0, unitPrice: 0 }
      const act = actualByService[name] ?? { qty: 0, totalPaid: 0 }
      const actualPerUnit = act.qty > 0 ? act.totalPaid / act.qty : null
      const diff = actualPerUnit !== null ? actualPerUnit - cat.unitPrice : null
      return { name, cat, act, actualPerUnit, diff }
    }).sort((a, b) => b.cat.totalCatalog - a.cat.totalCatalog)
  }, [catalogByService, actualByService])

  const totalCatalog = services.reduce((s, svc) => s + svc.cat.totalCatalog, 0)
  const totalActual = services.reduce((s, svc) => s + svc.act.totalPaid, 0)
  const totalDiff = totalActual - totalCatalog

  const isLoading = apptLoading || (loadDetails && invLoading) || (loadDetails && detailsLoading)

  return (
    <div className="space-y-5">
      <RangePicker preset={preset} customFrom={customFrom} customTo={customTo} today={today}
        onPreset={setPreset} onFrom={setCustomFrom} onTo={setCustomTo} />

      {/* Explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
        <p className="font-semibold">كيف يعمل هذا التقرير:</p>
        <p>• <strong>سعر الكتالوج</strong>: سعر الخدمة من المواعيد (ما تم تسعيره عند الحجز)</p>
        <p>• <strong>السعر المحصّل</strong>: المبلغ الفعلي المدفوع من بنود الفاتورة في نقطة البيع</p>
        <p>• <strong>الفرق</strong>: سالب = خصم أُعطي للعميل، موجب = سعر أعلى من الكتالوج</p>
      </div>

      {/* Load details button */}
      {!loadDetails && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-600 mb-3">لجلب السعر الفعلي من نقطة البيع، اضغط زر التحميل</p>
          <button onClick={() => setLoadDetails(true)}
            className="bg-rose-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors">
            تحميل بيانات الفواتير (آخر 30 فاتورة)
          </button>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Spinner size="lg" className="text-rose-600" />
          <p className="text-sm text-gray-500">
            {detailsLoading ? `جاري تحميل ${paidInvoicesInRange.length} فاتورة...` : 'جاري التحميل...'}
          </p>
        </div>
      )}

      {!isLoading && (loadDetails || Object.keys(catalogByService).length > 0) && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">إجمالي سعر الكتالوج</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{totalCatalog.toFixed(2)} AED</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">إجمالي المحصّل فعلياً</p>
              <p className="text-xl font-bold text-rose-700 mt-1">
                {loadDetails ? totalActual.toFixed(2) : '—'} AED
              </p>
            </div>
            <div className={`rounded-xl border p-4 ${totalDiff < 0 ? 'bg-red-50 border-red-200' : totalDiff > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className="text-xs text-gray-500">إجمالي الفرق (خصومات)</p>
              <p className={`text-xl font-bold mt-1 ${totalDiff < 0 ? 'text-red-700' : totalDiff > 0 ? 'text-green-700' : 'text-gray-600'}`}>
                {loadDetails ? `${totalDiff >= 0 ? '+' : ''}${totalDiff.toFixed(2)}` : '—'} AED
              </p>
            </div>
          </div>

          {/* Services table */}
          <Card title={`تحليل الخدمات — سعر الكتالوج مقابل المحصّل (${services.length} خدمة)`}>
            {loadDetails && paidInvoicesInRange.length > 0 && (
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-600">
                تم تحليل {paidInvoicesInRange.length} فاتورة — السعر الفعلي مشتق من بنود الفواتير
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right bg-gray-50">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">الخدمة</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-center">مرات</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-center">سعر الكتالوج</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-center">إجمالي الكتالوج</th>
                    {loadDetails && <>
                      <th className="px-4 py-2.5 text-xs font-semibold text-rose-600 text-center">السعر المحصّل</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-rose-600 text-center">إجمالي المحصّل</th>
                      <th className="px-4 py-2.5 text-xs font-semibold text-amber-600 text-center">الفرق/وحدة</th>
                    </>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {services.map(({ name, cat, act, actualPerUnit, diff }) => (
                    <tr key={name} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 text-xs font-bold flex-shrink-0">{name[0]}</div>
                          <span className="font-medium text-gray-900 text-sm">{name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-700 font-semibold">{cat.count || act.qty}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600">{cat.unitPrice.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-700 font-semibold">{cat.totalCatalog.toFixed(2)}</td>
                      {loadDetails && <>
                        <td className="px-4 py-2.5 text-center">
                          {actualPerUnit !== null
                            ? <span className="font-semibold text-rose-700">{actualPerUnit.toFixed(2)}</span>
                            : <span className="text-gray-300 text-xs">لم يُحلَّل</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {act.totalPaid > 0
                            ? <span className="font-semibold text-rose-700">{act.totalPaid.toFixed(2)}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {diff !== null && cat.unitPrice > 0 ? (
                            <span className={`font-bold text-sm px-2 py-0.5 rounded-full ${diff < -0.01 ? 'bg-red-100 text-red-700' : diff > 0.01 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                      </>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-rose-50 font-bold">
                    <td className="px-4 py-2.5 text-sm text-gray-700" colSpan={2}>الإجمالي</td>
                    <td className="px-4 py-2.5 text-center text-gray-500 text-xs">—</td>
                    <td className="px-4 py-2.5 text-center text-gray-800">{totalCatalog.toFixed(2)}</td>
                    {loadDetails && <>
                      <td className="px-4 py-2.5 text-center text-gray-500 text-xs">—</td>
                      <td className="px-4 py-2.5 text-center text-rose-700">{totalActual.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`font-bold ${totalDiff < 0 ? 'text-red-700' : 'text-green-700'}`}>
                          {totalDiff >= 0 ? '+' : ''}{totalDiff.toFixed(2)}
                        </span>
                      </td>
                    </>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Main Reports page ────────────────────────────────────────────────────────

const TABS: { key: ReportTab; label: string; icon: React.ElementType }[] = [
  { key: 'sales', label: 'المبيعات', icon: TrendingUp },
  { key: 'revenue', label: 'الإيرادات', icon: DollarSign },
  { key: 'services', label: 'الخدمات', icon: Wrench },
  { key: 'appointments', label: 'المواعيد', icon: CalendarCheck },
  { key: 'expenses', label: 'المصاريف', icon: Receipt },
  { key: 'employees', label: 'الموظفون', icon: Users },
  { key: 'custom', label: 'تقرير مخصص', icon: BarChart3 },
]

export default function Reports() {
  const { user, branchId } = useAuthStore()
  const slug = user?.tenantSlug ?? ''
  const [activeTab, setActiveTab] = useState<ReportTab>('sales')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
          <BarChart3 size={22} className="text-rose-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">التقارير والإحصائيات</h2>
          <p className="text-sm text-gray-500">{user?.tenantSlug}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0
              ${activeTab === key ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'sales' && <SalesTab slug={slug} branchId={branchId} />}
      {activeTab === 'revenue' && <RevenueTab slug={slug} branchId={branchId} />}
      {activeTab === 'services' && <ServiceDiscountTab slug={slug} branchId={branchId} />}
      {activeTab === 'appointments' && <AppointmentsTab slug={slug} branchId={branchId} />}
      {activeTab === 'expenses' && <ExpensesTab slug={slug} />}
      {activeTab === 'employees' && <EmployeesTab slug={slug} branchId={branchId} />}
      {activeTab === 'custom' && <CustomReportBuilder slug={slug} branchId={branchId} />}
    </div>
  )
}
