import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import Toaster from '../ui/Toaster'
import { useT } from '../../i18n/useT'

export default function AppLayout() {
  const location = useLocation()
  const t = useT()

  const PAGE_TITLES: Record<string, string> = {
    '/dashboard': t.nav.dashboard,
    '/pos': t.nav.pos,
    '/invoices': t.nav.invoices,
    '/products': t.nav.products,
    '/services': t.nav.services,
    '/appointments': t.nav.appointments,
    '/expenses': t.nav.expenses,
    '/categories': t.nav.categories,
    '/customers': t.nav.customers,
    '/users': t.nav.users,
    '/branches': t.nav.branches,
    '/tenant-admin': t.nav.tenantAdmin,
    '/reports': t.nav.reports,
    '/settings': t.nav.settings,
  }

  const title = PAGE_TITLES[location.pathname] ?? 'AyaPOS'

  return (
    <div className="flex min-h-screen bg-[#fff7f8]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title={title} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
