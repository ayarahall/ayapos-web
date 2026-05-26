import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, DollarSign, CreditCard, ShoppingBag, Building2, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { getDailySummary, getSessions } from '../api/cashier'
import { getInvoices } from '../api/invoices'
import { getAppointments } from '../api/appointments'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { formatDateTime, formatShortDate, todayInDubaiISO } from '../utils/date'

const fmt = (cents: number) =>
  new Intl.NumberFormat('ar-AE', { minimumFractionDigits: 2 }).format(cents / 100)

const fmtN = (n: number) => new Intl.NumberFormat('ar-AE').format(n)

type RangePreset = 'today' | 'week' | 'month' | 'custom'

function startOfWeek(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - ((day + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function startOfMonth(iso: string) {
  return iso.slice(0, 7) + '-01'
}

const payMethodLabel = (method: number | string) => {
  if (method === 1 || method === 'Cash') return 'نقدا'
  if (method === 2 || method === 'Card') return 'بطاقة'
  if (method === 3 || method === 'Transfer' || method === 'BankTransfer') return 'تحويل'
  return String(method)
}

export default function Reports() {
  const { user, branchId } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const slug = user?.tenantSlug ?? ''

  const today = todayInDubaiISO()
  const [preset, setPreset] = useState<RangePreset>('today')
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
    queryKey: ['daily-summary', slug, branchId ?? 'login-branch'],
    queryFn: () => getDailySummary(slug),
    enabled: !!slug && isToday,
  })

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-report', slug, branchId ?? 'login-branch', dateFrom, dateTo],
    queryFn: () => getInvoices(slug, { page: 1, pageSize: 200, dateFrom, dateTo }),
    enabled: !!slug && !isToday,
  })

  const { data: appointmentsData, isLoading: apptLoading } = useQuery({
    queryKey: ['appointments-report', slug, branchId ?? 'login-branch', dateFrom, dateTo],
    queryFn: () => getAppointments(slug, { page: 1, pageSize: 200, dateFrom, dateTo }),
    enabled: !!slug,
  })

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['cashier-sessions', slug, branchId ?? 'login-branch', sessionPage],
    queryFn: () => getSessions(slug, { page: sessionPage, pageSize: 10 }),
    enabled: !!slug,
  })

  const invoiceItems = invoicesData?.items ?? []
  const apptItems = appointmentsData?.items ?? []

  const computedStats = useMemo(() => {
    if (isToday && summary) {
      return {
        totalInvoices: summary.invoiceCount ?? summary.totalInvoices ?? 0,
        paidInvoices: summary.paidInvoiceCount ?? 0,
        totalSalesCents: summary.grossSalesCents ?? summary.totalSalesCents ?? 0,
        cashCents: summary.totalCashCents ?? 0,
        cardCents: summary.totalCardCents ?? 0,
        transferCents: summary.totalTransferCents ?? 0,
        topItems: [
          ...(summary.topProducts ?? []).map(i => ({ name: i.name, qty: i.quantity, totalCents: i.totalCents })),
          ...(summary.topServices ?? []).map(i => ({ name: i.name, qty: i.quantity, totalCents: i.totalCents })),
          ...(summary.topItems ?? []),
        ].sort((a, b) => b.totalCents - a.totalCents),
        recentPayments: summary.recentPayments ?? [],
      }
    }
    const paidInvoices = invoiceItems.filter(i => i.status === 'Paid')
    const totalSalesCents = Math.round(paidInvoices.reduce((s, i) => s + i.total * 100, 0))
    return {
      totalInvoices: invoiceItems.length,
      paidInvoices: paidInvoices.length,
      totalSalesCents,
      cashCents: 0,
      cardCents: 0,
      transferCents: 0,
      topItems: [],
      recentPayments: [],
    }
  }, [isToday, summary, invoiceItems])

  const apptStats = useMemo(() => ({
    total: apptItems.length,
    booked: apptItems.filter(a => a.status === 'scheduled').length,
    checkedIn: apptItems.filter(a => a.status === 'confirmed').length,
    completed: apptItems.filter(a => a.status === 'completed').length,
    noShow: apptItems.filter(a => a.status === 'no_show').length,
    cancelled: apptItems.filter(a => a.status === 'cancelled').length,
    completionRate: apptItems.length > 0
      ? Math.round(apptItems.filter(a => a.status === 'completed').length / apptItems.length * 100)
      : 0,
  }), [apptItems])

  const isLoading = isToday ? summaryLoading : invoicesLoading
  const totalSales = computedStats.totalSalesCents
  const cashPct = totalSales > 0 ? ((computedStats.cashCents) / totalSales * 100).toFixed(0) : '0'
  const cardPct = totalSales > 0 ? ((computedStats.cardCents) / totalSales * 100).toFixed(0) : '0'
  const transferPct = totalSales > 0 ? ((computedStats.transferCents) / totalSales * 100).toFixed(0) : '0'

  const rangeLabel = dateFrom === dateTo
    ? formatShortDate(dateFrom + 'T00:00:00', lang)
    : `${formatShortDate(dateFrom + 'T00:00:00', lang)} — ${formatShortDate(dateTo + 'T00:00:00', lang)}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <BarChart3 size={22} className="text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{lang === 'ar' ? 'التقارير' : 'Reports'}</h2>
            <p className="text-sm text-gray-500">{rangeLabel}</p>
          </div>
        </div>

        {/* Range presets */}
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'today', label: lang === 'ar' ? 'اليوم' : 'Today' },
            { value: 'week', label: lang === 'ar' ? 'هذا الأسبوع' : 'This Week' },
            { value: 'month', label: lang === 'ar' ? 'هذا الشهر' : 'This Month' },
            { value: 'custom', label: lang === 'ar' ? 'مخصص' : 'Custom' },
          ] as { value: RangePreset; label: string }[]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPreset(value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${preset === value ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              {label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={customTo}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-400">—</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom} max={today}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-blue-600" /></div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-3"><ShoppingBag size={20} className="text-blue-600" /></div>
              <p className="text-xs text-gray-500">{lang === 'ar' ? 'عدد الفواتير' : 'Invoices'}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmtN(computedStats.totalInvoices)}</p>
              <p className="text-xs text-gray-400 mt-1">{fmtN(computedStats.paidInvoices)} {lang === 'ar' ? 'مدفوعة' : 'paid'}</p>
            </Card>
            <Card className="p-5">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center mb-3"><TrendingUp size={20} className="text-green-600" /></div>
              <p className="text-xs text-gray-500">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalSales)}</p>
              <p className="text-xs text-gray-400 mt-1">AED</p>
            </Card>
            <Card className="p-5">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-3"><DollarSign size={20} className="text-amber-600" /></div>
              <p className="text-xs text-gray-500">{lang === 'ar' ? 'نقدا' : 'Cash'}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmt(computedStats.cashCents)}</p>
              <p className="text-xs text-gray-400 mt-1">{cashPct}%</p>
            </Card>
            <Card className="p-5">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center mb-3"><CreditCard size={20} className="text-purple-600" /></div>
              <p className="text-xs text-gray-500">{lang === 'ar' ? 'بطاقة' : 'Card'}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmt(computedStats.cardCents)}</p>
              <p className="text-xs text-gray-400 mt-1">{cardPct}%</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Payment breakdown */}
            {isToday && (
              <Card title={lang === 'ar' ? 'توزيع طرق الدفع' : 'Payment Breakdown'}>
                <div className="px-5 py-4 space-y-4">
                  {[
                    { label: lang === 'ar' ? 'نقدا' : 'Cash', cents: computedStats.cashCents, pct: cashPct, color: 'bg-amber-500' },
                    { label: lang === 'ar' ? 'بطاقة' : 'Card', cents: computedStats.cardCents, pct: cardPct, color: 'bg-purple-500' },
                    { label: lang === 'ar' ? 'تحويل' : 'Transfer', cents: computedStats.transferCents, pct: transferPct, color: 'bg-blue-500' },
                  ].map(({ label, cents, pct, color }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-gray-700">{label}</span>
                        <span className="font-semibold text-gray-900">{fmt(cents)} <span className="text-xs text-gray-400 font-normal">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                  {(computedStats.transferCents ?? 0) > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <Building2 size={15} className="text-blue-600" />
                      <span className="text-sm text-gray-600">{lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}: <strong>{fmt(computedStats.transferCents)}</strong></span>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Appointment stats */}
            <Card title={lang === 'ar' ? 'إحصاءات المواعيد' : 'Appointment Stats'} className={isToday ? '' : 'lg:col-span-2'}>
              {apptLoading ? (
                <div className="flex justify-center py-6"><Spinner size="md" className="text-blue-600" /></div>
              ) : (
                <div className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center bg-blue-50 rounded-xl py-3">
                      <p className="text-2xl font-bold text-blue-700">{apptStats.total}</p>
                      <p className="text-xs text-blue-600 mt-1">{lang === 'ar' ? 'إجمالي' : 'Total'}</p>
                    </div>
                    <div className="text-center bg-green-50 rounded-xl py-3">
                      <p className="text-2xl font-bold text-green-700">{apptStats.completed}</p>
                      <p className="text-xs text-green-600 mt-1">{lang === 'ar' ? 'مكتمل' : 'Done'}</p>
                    </div>
                    <div className="text-center bg-red-50 rounded-xl py-3">
                      <p className="text-2xl font-bold text-red-700">{apptStats.noShow}</p>
                      <p className="text-xs text-red-600 mt-1">{lang === 'ar' ? 'لم يحضر' : 'No-show'}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: lang === 'ar' ? 'محجوز' : 'Booked', value: apptStats.booked, color: 'bg-blue-400' },
                      { label: lang === 'ar' ? 'تم تسجيل الحضور' : 'Checked In', value: apptStats.checkedIn, color: 'bg-emerald-500' },
                      { label: lang === 'ar' ? 'مكتمل' : 'Completed', value: apptStats.completed, color: 'bg-gray-400' },
                      { label: lang === 'ar' ? 'لم يحضر' : 'No-show', value: apptStats.noShow, color: 'bg-red-500' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />
                        <span className="text-sm text-gray-600 flex-1">{label}</span>
                        <span className="font-semibold text-gray-900">{value}</span>
                        {apptStats.total > 0 && (
                          <span className="text-xs text-gray-400 w-8 text-left">{Math.round(value / apptStats.total * 100)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {apptStats.total > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <CalendarCheck size={14} className="text-green-600" />
                        <span className="text-xs text-gray-600">{lang === 'ar' ? 'معدل الإتمام' : 'Completion rate'}</span>
                      </div>
                      <span className="text-sm font-bold text-green-700">{apptStats.completionRate}%</span>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Top selling items (today only) */}
            {isToday && computedStats.topItems.length > 0 && (
              <Card title={lang === 'ar' ? 'الأكثر مبيعاً' : 'Top Sellers'}>
                <div className="divide-y divide-gray-50">
                  {computedStats.topItems.slice(0, 6).map((item, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-500">{lang === 'ar' ? `الكمية: ${item.qty}` : `Qty: ${item.qty}`}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{fmt(item.totalCents)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Recent payments (today only) */}
            {isToday && (computedStats.recentPayments ?? []).length > 0 && (
              <Card title={lang === 'ar' ? 'آخر المدفوعات' : 'Recent Payments'} className="lg:col-span-2">
                <div className="divide-y divide-gray-50">
                  {(computedStats.recentPayments ?? []).slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-5 py-2.5">
                      <div>
                        <p className="text-sm font-mono font-semibold text-gray-900">{p.invoiceCode}</p>
                        <p className="text-xs text-gray-500">{payMethodLabel(p.method)}{p.reference ? ` — ${p.reference}` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-700">{fmt(p.amountCents)} د.إ</p>
                        <p className="text-xs text-gray-400">{formatDateTime(p.paidAt, lang)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Cashier sessions */}
            <Card title={lang === 'ar' ? 'سجل جلسات الكاشير' : 'Cashier Session History'} className="lg:col-span-3">
              {sessionsLoading ? (
                <div className="flex justify-center py-6"><Spinner size="md" className="text-blue-600" /></div>
              ) : (
                <>
                  <div className="divide-y divide-gray-50">
                    {(sessionsData?.items ?? []).map((s) => (
                      <div key={s.id} className="flex items-center justify-between px-5 py-3 flex-wrap gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={s.isClosed ? 'gray' : 'green'}>{s.isClosed ? (lang === 'ar' ? 'مغلقة' : 'Closed') : (lang === 'ar' ? 'مفتوحة' : 'Open')}</Badge>
                            <p className="text-sm font-medium text-gray-900">{formatDateTime(s.openedAt, lang)}</p>
                          </div>
                          {s.closedAt && (
                            <p className="text-xs text-gray-400 mt-0.5">{lang === 'ar' ? 'أُغلقت' : 'Closed'}: {formatDateTime(s.closedAt, lang)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-center">
                            <p className="text-xs text-gray-500">{lang === 'ar' ? 'نقدا' : 'Cash'}</p>
                            <p className="font-semibold text-amber-700">{fmt(s.totalCashCents)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">{lang === 'ar' ? 'بطاقة' : 'Card'}</p>
                            <p className="font-semibold text-purple-700">{fmt(s.totalCardCents)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">{lang === 'ar' ? 'تحويل' : 'Transfer'}</p>
                            <p className="font-semibold text-blue-700">{fmt(s.totalTransferCents)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500">{lang === 'ar' ? 'الإجمالي' : 'Total'}</p>
                            <p className="font-bold text-gray-900">{fmt(s.totalCashCents + s.totalCardCents + s.totalTransferCents)}</p>
                          </div>
                          {s.differenceCents != null && s.differenceCents !== 0 && (
                            <div className="text-center">
                              <p className="text-xs text-gray-500">{lang === 'ar' ? 'فرق' : 'Diff'}</p>
                              <p className={`font-semibold ${s.differenceCents > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {s.differenceCents > 0 ? '+' : ''}{fmt(s.differenceCents)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {(sessionsData?.items ?? []).length === 0 && (
                      <p className="text-center text-gray-400 py-8 text-sm">{lang === 'ar' ? 'لا توجد جلسات' : 'No sessions'}</p>
                    )}
                  </div>
                  {(sessionsData?.total ?? 0) > 10 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                      <p className="text-sm text-gray-500">{sessionsData?.total} {lang === 'ar' ? 'جلسة' : 'sessions'}</p>
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
          </div>
        </>
      )}
    </div>
  )
}
