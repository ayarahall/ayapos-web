import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useLangStore } from './store/langStore'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Categories from './pages/Categories'
import Branches from './pages/Branches'
import Users from './pages/Users'
import Customers from './pages/Customers'
import POS from './pages/POS'
import Invoices from './pages/Invoices'
import Services from './pages/Services'
import Appointments from './pages/Appointments'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import TenantAdmin from './pages/TenantAdmin'
import Inbox from './pages/Inbox'

const ADMIN_ROLES = new Set(['OWNER', 'ADMIN', 'TENANT'])

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * PermissionGuard — wraps sensitive routes.
 *
 * Rules:
 * - OWNER / ADMIN / TENANT are always allowed.
 * - If permissionsConfigured = false, allow everything.
 * - If adminOnly = true, only OWNER / ADMIN / TENANT are allowed.
 * - Otherwise checks that permissionKey is present in user.permissions.
 * - Redirects to /dashboard when denied.
 */
function PermissionGuard({
  children,
  permissionKey,
  adminOnly = false,
}: {
  children: React.ReactNode
  permissionKey?: string
  adminOnly?: boolean
}) {
  const user = useAuthStore((s) => s.user)

  if (!user) return <Navigate to="/login" replace />

  // Admin roles are always allowed
  if (ADMIN_ROLES.has(user.role)) return <>{children}</>

  // Admin-only routes — non-admin roles are blocked
  if (adminOnly) return <Navigate to="/dashboard" replace />

  // If permissions haven't been configured yet, allow everything
  if (!user.permissionsConfigured) return <>{children}</>

  // Check the specific permission key
  if (permissionKey && user.permissions.includes(permissionKey)) {
    return <>{children}</>
  }

  return <Navigate to="/dashboard" replace />
}

export default function App() {
  const lang = useLangStore((s) => s.lang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route
            path="pos"
            element={
              <PermissionGuard permissionKey="pos">
                <POS />
              </PermissionGuard>
            }
          />
          <Route
            path="invoices"
            element={
              <PermissionGuard permissionKey="invoices">
                <Invoices />
              </PermissionGuard>
            }
          />
          <Route
            path="products"
            element={
              <PermissionGuard permissionKey="products">
                <Products />
              </PermissionGuard>
            }
          />
          <Route
            path="services"
            element={
              <PermissionGuard permissionKey="services">
                <Services />
              </PermissionGuard>
            }
          />
          <Route
            path="appointments"
            element={
              <PermissionGuard permissionKey="appointments">
                <Appointments />
              </PermissionGuard>
            }
          />
          <Route
            path="expenses"
            element={
              <PermissionGuard permissionKey="expenses">
                <Expenses />
              </PermissionGuard>
            }
          />
          <Route
            path="customers"
            element={
              <PermissionGuard permissionKey="customers">
                <Customers />
              </PermissionGuard>
            }
          />
          <Route
            path="reports"
            element={
              <PermissionGuard permissionKey="reports">
                <Reports />
              </PermissionGuard>
            }
          />
          <Route
            path="users"
            element={
              <PermissionGuard permissionKey="users">
                <Users />
              </PermissionGuard>
            }
          />
          <Route
            path="branches"
            element={
              <PermissionGuard permissionKey="branches">
                <Branches />
              </PermissionGuard>
            }
          />
          <Route
            path="settings"
            element={
              <PermissionGuard adminOnly>
                <Settings />
              </PermissionGuard>
            }
          />
          <Route path="categories" element={<Categories />} />
          <Route path="tenant-admin" element={<TenantAdmin />} />
          <Route path="inbox" element={<Inbox />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
