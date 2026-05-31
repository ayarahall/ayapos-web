import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { loginTenant, loginPlatform, getTenantBranches } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import type { Branch } from '../types'

function getBranchIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as Record<string, unknown>
    const claim =
      payload.branchId ??
      payload.branch_id ??
      payload.BranchId ??
      payload.branch ??
      payload['http://schemas.ayapos.com/branchId']

    return typeof claim === 'string' && claim ? claim : null
  } catch {
    return null
  }
}

export default function Login() {
  const navigate = useNavigate()
  const { setAuth, setBranchId, token } = useAuthStore()
  const { lang, toggle } = useLangStore()
  const t = useT()

  const [tab, setTab] = useState<'tenant' | 'platform'>('tenant')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [slugError, setSlugError] = useState('')
  const [slugChecked, setSlugChecked] = useState(false)

  const [form, setForm] = useState({ tenantSlug: '', branchId: '', username: '', password: '' })

  useEffect(() => {
    if (token) navigate('/dashboard', { replace: true })
  }, [token, navigate])

  const fetchBranches = async (slug: string) => {
    if (!slug.trim()) {
      setBranches([]); setSlugError(''); setSlugChecked(false); return
    }
    setBranchesLoading(true); setSlugError(''); setSlugChecked(false)
    try {
      const data = await getTenantBranches(slug.trim())
      setBranches(data); setSlugChecked(true)
      if (data.length === 1) setForm((f) => ({ ...f, branchId: data[0].id }))
    } catch (err: unknown) {
      setBranches([]); setSlugChecked(false)
      const status = (err as { response?: { status?: number } })?.response?.status
      setSlugError(status === 404 ? t.login.tenantNotFound : t.login.serverError)
    } finally {
      setBranchesLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      if (tab === 'platform') {
        const res = await loginPlatform({ username: form.username, password: form.password })
        setAuth(res.token, { username: form.username, role: res.role, tenantId: res.tenantId, tenantSlug: '', scope: 'platform', permissions: [], permissionsConfigured: false })
        setBranchId(null)
      } else {
        const res = await loginTenant({ tenantSlug: form.tenantSlug.trim(), branchId: form.branchId || undefined, username: form.username, password: form.password })
        setAuth(res.token, { username: form.username, role: res.role, tenantId: res.tenantId, tenantSlug: form.tenantSlug.trim(), scope: 'tenant', permissions: res.permissions ?? [], permissionsConfigured: res.permissionsConfigured ?? false })
        setBranchId(form.branchId || res.branchId || getBranchIdFromToken(res.token))
      }
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || t.login.wrongCredentials)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fff1f4_0%,#fff7f8_38%,#ffffff_100%)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={toggle}
            className="px-4 py-1.5 rounded-lg bg-white text-slate-700 border border-rose-100 text-sm font-bold hover:bg-rose-50 transition-colors shadow-sm"
          >
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/ayapos-logo.png?v=5" alt="AyaPOS" className="h-44 w-44 object-contain drop-shadow-xl" />
          </div>
          <h1 className="text-3xl font-bold text-slate-950">AyaPOS</h1>
          <p className="text-slate-500 mt-1">{t.login.title}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl shadow-rose-100/70 overflow-hidden border border-rose-100">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button onClick={() => { setTab('tenant'); setError('') }}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors
                ${tab === 'tenant' ? 'text-rose-600 border-b-2 border-rose-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.login.tenantTab}
            </button>
            <button onClick={() => { setTab('platform'); setError('') }}
              className={`flex-1 py-3.5 text-sm font-semibold transition-colors
                ${tab === 'platform' ? 'text-rose-600 border-b-2 border-rose-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.login.platformTab}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {tab === 'tenant' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.login.tenantCode}</label>
                  <div className="relative">
                    <input
                      type="text" required placeholder="my-store"
                      value={form.tenantSlug}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, tenantSlug: e.target.value, branchId: '' }))
                        setSlugError(''); setSlugChecked(false); setBranches([])
                      }}
                      onBlur={(e) => fetchBranches(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fetchBranches(form.tenantSlug) } }}
                      className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 pe-9
                        ${slugError ? 'border-red-400 focus:ring-red-400' : slugChecked ? 'border-green-400 focus:ring-green-500' : 'border-gray-300 focus:ring-rose-500 focus:border-rose-400'}`}
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2">
                      {branchesLoading && <Loader2 size={16} className="animate-spin text-gray-400" />}
                      {!branchesLoading && slugChecked && <span className="text-green-500 text-base">✓</span>}
                      {!branchesLoading && slugError && <span className="text-red-500 text-base">✗</span>}
                    </span>
                  </div>
                  {slugError && <p className="mt-1.5 text-xs text-red-600">{slugError}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.login.branch}</label>
                  <select
                    value={form.branchId}
                    onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                    disabled={branches.length === 0}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">{t.login.selectBranch}</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {slugChecked && branches.length === 0 && (
                    <p className="mt-1.5 text-xs text-yellow-600">{t.login.noBranches}</p>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.login.username}</label>
              <input type="text" required autoComplete="username" value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.login.password}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} required autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 pe-10" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-rose-600 text-white font-semibold py-2.5 rounded-lg hover:bg-rose-700
                disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? t.login.loggingIn : t.login.login}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          AyaPOS &copy; {new Date().getFullYear()} — {t.login.rights}
        </p>
      </div>
    </div>
  )
}
