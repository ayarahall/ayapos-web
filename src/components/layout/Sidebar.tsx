import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, FileText, Package, Wrench,
  CalendarDays, Receipt, Tag, Users, UserCog, Building2,
  BarChart3, Settings, LogOut, Bell, LayoutPanelTop, FolderOpen,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { useT } from '../../i18n/useT'
import { getTenantBranches } from '../../api/tenantAdmin'
import { getExpenses } from '../../api/expenses'

const ADMIN_ROLES = ['OWNER', 'ADMIN', 'TENANT']

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { to: '/tenant-admin', icon: LayoutPanelTop, key: 'tenantAdmin', tenantAdminOnly: true },
  { to: '/pos', icon: ShoppingCart, key: 'pos', tenantOnly: true, permissionKey: 'pos' },
  { to: '/invoices', icon: FileText, key: 'invoices', tenantOnly: true, permissionKey: 'invoices' },
  { to: '/products', icon: Package, key: 'products', tenantOnly: true, tenantAdminHide: true, permissionKey: 'products' },
  { to: '/services', icon: Wrench, key: 'services', tenantOnly: true, tenantAdminHide: true, permissionKey: 'services' },
  { to: '/appointments', icon: CalendarDays, key: 'appointments', tenantOnly: true, permissionKey: 'appointments' },
  { to: '/expenses', icon: Receipt, key: 'expenses', tenantOnly: true, permissionKey: 'expenses' },
  { to: '/documents', icon: FolderOpen, key: 'documents', tenantOnly: true, permissionKey: 'documents' },
  { to: '/categories', icon: Tag, key: 'categories', tenantOnly: true },
  { to: '/customers', icon: Users, key: 'customers', tenantOnly: true, permissionKey: 'customers' },
  { to: '/users', icon: UserCog, key: 'users', permissionKey: 'users' },
  { to: '/branches', icon: Building2, key: 'branches', platformOnly: true, permissionKey: 'branches' },
  { to: '/reports', icon: BarChart3, key: 'reports', tenantOnly: true, permissionKey: 'reports' },
  { to: '/inbox', icon: Bell, key: 'inbox', tenantOnly: true },
  { to: '/settings', icon: Settings, key: 'settings' },
]

const CAN_APPROVE_EXPENSES = new Set(['OWNER', 'ADMIN', 'TENANT', 'BRANCH_MANAGER', 'HR'])

export default function Sidebar() {
  const { user, branchId, setBranchId, logout } = useAuthStore()
  const t = useT()

  const slug = user?.tenantSlug ?? ''
  const canManageTenant = user?.scope === 'tenant' && ADMIN_ROLES.includes(user?.role ?? '')

  const branchesQuery = useQuery({
    queryKey: ['tenant-admin-branches', slug],
    queryFn: getTenantBranches,
    enabled: canManageTenant && !!slug,
  })

  const canApproveExpenses = user?.permissionsConfigured
    ? (user.permissions ?? []).includes('expenses.approve')
    : CAN_APPROVE_EXPENSES.has(user?.role ?? '')

  const { data: submittedExpenses } = useQuery({
    queryKey: ['expenses', slug, branchId ?? 'login-branch', 'inbox-submitted'],
    queryFn: () => getExpenses(slug, { page: 1, pageSize: 50, status: 'submitted' }),
    enabled: !!slug && canApproveExpenses,
    staleTime: 30_000,
    select: (d) => d.items,
  })

  const inboxBadge = submittedExpenses?.length ?? 0

  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '')
  const userPermissions = user?.permissions ?? []
  const permissionsConfigured = user?.permissionsConfigured ?? false

  const visibleItems = navItems.filter((item) => {
    if (item.tenantOnly && user?.scope !== 'tenant') return false
    if (item.platformOnly && user?.scope !== 'platform') return false
    if (item.tenantAdminOnly && (user?.scope !== 'tenant' || !isAdmin)) return false
    if (item.tenantAdminHide && user?.role === 'TENANT') return false
    if (item.permissionKey && permissionsConfigured && !isAdmin) {
      if (!userPermissions.includes(item.permissionKey)) return false
    }
    return true
  })

  const roleLabel =
    user?.role === 'OWNER' ? t.users.roles.OWNER :
    user?.role === 'ADMIN' ? t.users.roles.ADMIN :
    user?.role === 'CASHIER' ? t.users.roles.CASHIER :
    user?.role === 'TENANT' ? t.users.roles.TENANT :
    user?.role === 'HR' ? t.users.roles.HR :
    user?.role === 'BRANCH_MANAGER' ? t.users.roles.BRANCH_MANAGER :
    user?.role ?? ''

  return (
    <aside className="w-64 min-h-screen bg-white border-e border-rose-100 flex flex-col shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-rose-100">
        <div className="w-12 h-12 flex items-center justify-center">
          <img src="/ayapos-logo.png?v=5" alt="AyaPOS" className="h-12 w-12 object-contain" />
        </div>
        <div>
          <p className="text-slate-950 font-bold text-base leading-none">AyaPOS</p>
          <p className="text-slate-500 text-xs mt-0.5">{t.nav.pos}</p>
        </div>
      </div>

      {/* Branch info / switcher */}
      {user?.scope === 'tenant' && (
        <div className="px-4 py-3 mx-3 mt-3 bg-rose-50 rounded-lg space-y-2 border border-rose-100">
          <div>
            <p className="text-slate-500 text-xs">{t.nav.tenant}</p>
            <p className="text-slate-900 text-sm font-medium">{user.tenantSlug}</p>
          </div>
          {canManageTenant && branchesQuery.data && (
            <div>
              <p className="text-slate-500 text-xs mb-1">{t.nav.activeBranch}</p>
              <select
                value={branchId ?? ''}
                onChange={e => setBranchId(e.target.value || null)}
                className="w-full bg-white text-slate-800 text-xs rounded-lg px-2 py-1.5 border border-rose-200 focus:outline-none focus:border-rose-500"
              >
                <option value="">{t.nav.noBranchSelected}</option>
                {branchesQuery.data.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map(({ to, icon: Icon, key }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isActive
                ? 'bg-rose-600 text-white'
                : 'text-slate-700 hover:bg-rose-50 hover:text-rose-700'
              }`
            }
          >
            <Icon size={18} />
            <span className="flex-1">{t.nav[key as keyof typeof t.nav]}</span>
            {key === 'inbox' && inboxBadge > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-bold">
                {inboxBadge > 9 ? '9+' : inboxBadge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-rose-100">
        <div className="px-3 py-2 mb-2">
          <p className="text-slate-900 text-sm font-medium">{user?.username}</p>
          <p className="text-slate-500 text-xs">{roleLabel}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium
            text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
        >
          <LogOut size={18} />
          {t.nav.logout}
        </button>
      </div>
    </aside>
  )
}
