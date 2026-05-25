import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, DollarSign, CreditCard, ShoppingBag, Building2 } from 'lucide-react'
import { getDailySummary } from '../api/cashier'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'
import { formatDate } from '../utils/date'

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2 }).format(cents / 100)

export default function Reports() {
  const { user, branchId } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const t = useT()
  const slug = user?.tenantSlug ?? ''

  const { data: summary, isLoading } = useQuery({
    queryKey: ['daily-summary', slug, branchId ?? 'login-branch'],
    queryFn: () => getDailySummary(slug),
    enabled: !!slug,
  })

  const totalSales = summary?.totalSalesCents ?? 0
  const cashPct = totalSales > 0 ? ((summary?.totalCashCents ?? 0) / totalSales * 100).toFixed(0) : '0'
  const cardPct = totalSales > 0 ? ((summary?.totalCardCents ?? 0) / totalSales * 100).toFixed(0) : '0'
  const transferPct = totalSales > 0 ? ((summary?.totalTransferCents ?? 0) / totalSales * 100).toFixed(0) : '0'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <BarChart3 size={22} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{t.reports.title}</h2>
          <p className="text-sm text-gray-500">
            {formatDate(new Date(), lang)}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" className="text-blue-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-3"><ShoppingBag size={20} className="text-blue-600" /></div>
              <p className="text-xs text-gray-500">{t.reports.invoicesCount}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary?.totalInvoices ?? 0}</p>
            </Card>
            <Card className="p-5">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center mb-3"><TrendingUp size={20} className="text-green-600" /></div>
              <p className="text-xs text-gray-500">{t.reports.dailySales}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalSales)}</p>
            </Card>
            <Card className="p-5">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center mb-3"><DollarSign size={20} className="text-amber-600" /></div>
              <p className="text-xs text-gray-500">{t.reports.cash}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmt(summary?.totalCashCents ?? 0)}</p>
              <p className="text-xs text-gray-400 mt-1">{cashPct}%</p>
            </Card>
            <Card className="p-5">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center mb-3"><CreditCard size={20} className="text-purple-600" /></div>
              <p className="text-xs text-gray-500">{t.reports.card}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmt(summary?.totalCardCents ?? 0)}</p>
              <p className="text-xs text-gray-400 mt-1">{cardPct}%</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title={t.reports.paymentBreakdown}>
              <div className="px-5 py-4 space-y-4">
                {[
                  { label: t.reports.cash, cents: summary?.totalCashCents ?? 0, pct: cashPct, color: 'bg-amber-500' },
                  { label: t.reports.card, cents: summary?.totalCardCents ?? 0, pct: cardPct, color: 'bg-purple-500' },
                  { label: t.reports.transfer, cents: summary?.totalTransferCents ?? 0, pct: transferPct, color: 'bg-blue-500' },
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
              </div>
            </Card>

            <Card title={t.reports.topSellers}>
              <div className="divide-y divide-gray-50">
                {(summary?.topItems ?? []).length === 0 ? (
                  <p className="text-center text-gray-400 py-8 text-sm">{t.reports.noData}</p>
                ) : (
                  (summary?.topItems ?? []).slice(0, 8).map((item, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                        ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.qty}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{fmt(item.totalCents)}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          {(summary?.totalTransferCents ?? 0) > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Building2 size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t.reports.transfer}</p>
                  <p className="text-xl font-bold text-gray-900">{fmt(summary?.totalTransferCents ?? 0)} <span className="text-sm font-normal text-gray-500">({transferPct}%)</span></p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
