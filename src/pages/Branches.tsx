import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, Store, Pencil, Users, Calendar, RefreshCw,
  ChevronDown, ChevronRight, Key, ToggleLeft, ToggleRight,
  CheckCircle, XCircle, UserPlus, PowerOff, Power,
} from 'lucide-react'
import {
  getTenants, getTenantBranches, createBranch, createTenant,
  updateTenantLicense, updatePlatformBranch, updateTenantStatus,
  getPlatformBranchUsers, createPlatformBranchUser,
  setPlatformBranchUserPassword, updatePlatformBranchUserLicense,
  type PlatformBranchUser,
} from '../api/platform'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import type { Branch, Tenant } from '../types'
import { ROLE_LABELS } from '../types'

// ─── helpers ────────────────────────────────────────────────────────────────

const BRANCH_ROLES = ['BRANCH_MANAGER', 'HR', 'CASHIER']

const licenseVariant = (s: string): 'green' | 'red' | 'yellow' =>
  s === 'ACTIVE' ? 'green' : s === 'EXPIRED' ? 'red' : 'yellow'

const roleVariant = (r: string): 'blue' | 'green' | 'yellow' | 'gray' => {
  if (r === 'TENANT' || r === 'ADMIN') return 'blue'
  if (r === 'CASHIER') return 'green'
  if (r === 'BRANCH_MANAGER') return 'yellow'
  return 'gray'
}

// ─── BranchUserRow ───────────────────────────────────────────────────────────

function BranchUserRow({
  u, tenantId, branchId, locale,
}: { u: PlatformBranchUser; tenantId: string; branchId: string; locale: string }) {
  const t = useT()
  const qc = useQueryClient()
  const [pwdModal, setPwdModal] = useState(false)
  const [newPwd, setNewPwd] = useState('')

  const pwdMut = useMutation({
    mutationFn: () => setPlatformBranchUserPassword(tenantId, branchId, u.id, newPwd),
    onSuccess: () => { setPwdModal(false); setNewPwd('') },
  })

  const toggleMut = useMutation({
    mutationFn: () => updatePlatformBranchUserLicense(tenantId, branchId, u.id, {
      licensePlan: u.licensePlan,
      isActive: !u.isActive,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-branch-users', tenantId, branchId] }),
  })

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-50 last:border-0">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold
            ${u.isActive ? 'bg-blue-500' : 'bg-gray-400'}`}>
            {u.username[0].toUpperCase()}
          </div>
          <span className={`text-sm font-medium ${u.isActive ? 'text-gray-900' : 'text-gray-400'}`}>
            {u.username}
          </span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <Badge variant={roleVariant(u.role)}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
      </td>
      <td className="px-4 py-2.5">
        <Badge variant={licenseVariant(u.licenseStatus)}>
          {u.licenseStatus}
        </Badge>
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">
        {new Date(u.licenseExpiresAt).toLocaleDateString(locale)}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleMut.mutate()}
            disabled={toggleMut.isPending}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title={u.isActive ? 'تعطيل' : 'تفعيل'}
          >
            {u.isActive
              ? <ToggleRight size={18} className="text-green-500" />
              : <ToggleLeft size={18} className="text-gray-400" />}
          </button>
          <button
            onClick={() => setPwdModal(true)}
            className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
            title={t.users.changePassword}
          >
            <Key size={15} />
          </button>
        </div>
      </td>

      <Modal open={pwdModal} onClose={() => setPwdModal(false)} title={`${t.users.changePassword} — ${u.username}`} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwdModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => pwdMut.mutate()} loading={pwdMut.isPending}>{t.common.save}</Button>
          </>
        }
      >
        <Input label={t.users.newPassword} type="password" value={newPwd}
          onChange={e => setNewPwd(e.target.value)} />
        {pwdMut.isError && <p className="text-sm text-red-500 mt-2">{t.common.error}</p>}
      </Modal>
    </tr>
  )
}

// ─── BranchAccordion ─────────────────────────────────────────────────────────

function BranchAccordion({
  branch, tenantId, locale,
  onEdit,
}: {
  branch: Branch
  tenantId: string
  locale: string
  onEdit: (b: Branch) => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [addUserModal, setAddUserModal] = useState(false)
  const [userForm, setUserForm] = useState({ username: '', role: 'CASHIER', password: '', pin: '' })

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['platform-branch-users', tenantId, branch.id],
    queryFn: () => getPlatformBranchUsers(tenantId, branch.id),
    enabled: open,
  })

  const createUserMut = useMutation({
    mutationFn: () => createPlatformBranchUser(tenantId, branch.id, userForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-branch-users', tenantId, branch.id] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setAddUserModal(false)
      setUserForm({ username: '', role: 'CASHIER', password: '', pin: '' })
    },
  })

  return (
    <div className={`rounded-xl border transition-all ${open ? 'border-blue-200 shadow-sm' : 'border-gray-200'}`}>
      {/* Branch header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer rounded-xl transition-colors
          ${open ? 'bg-blue-50 rounded-b-none' : 'hover:bg-gray-50'}`}
        onClick={() => setOpen(v => !v)}
      >
        <div className="text-gray-400">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>

        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
          <Building2 size={16} className="text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{branch.name}</span>
            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {branch.code}
            </span>
            <span className="text-xs text-gray-500">{branch.currencyCode}</span>
            <Badge variant={branch.isActive ? 'green' : 'red'} >
              {branch.isActive
                ? <><CheckCircle size={10} className="inline me-1" />{t.common.active}</>
                : <><XCircle size={10} className="inline me-1" />{t.common.inactive}</>
              }
            </Badge>
          </div>
          {branch.assignedUsers !== undefined && (
            <p className="text-xs text-gray-500 mt-0.5">
              <Users size={11} className="inline me-1" />
              {branch.assignedUsers} {t.branches.assignedUsers}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setOpen(true); setAddUserModal(true) }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            <UserPlus size={13} />
            {t.users.addBranchUser}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEdit(branch) }}
            className="p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
            title={t.branches.editBranch}
          >
            <Pencil size={14} />
          </button>
        </div>
      </div>

      {/* Branch body — users table */}
      {open && (
        <div className="border-t border-blue-100">
          {usersLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="md" className="text-blue-600" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">{t.users.noUsers}</p>
              <button
                onClick={() => setAddUserModal(true)}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                {t.users.addBranchUser}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2 text-start text-xs font-semibold text-gray-500">{t.login.username}</th>
                    <th className="px-4 py-2 text-start text-xs font-semibold text-gray-500">{t.users.role}</th>
                    <th className="px-4 py-2 text-start text-xs font-semibold text-gray-500">{t.branches.licenseStatus}</th>
                    <th className="px-4 py-2 text-start text-xs font-semibold text-gray-500">{t.users.licenseExpires}</th>
                    <th className="px-4 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <BranchUserRow key={u.id} u={u} tenantId={tenantId} branchId={branch.id} locale={locale} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add user modal */}
      <Modal open={addUserModal} onClose={() => setAddUserModal(false)}
        title={`${t.users.addBranchUser} — ${branch.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddUserModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => createUserMut.mutate()} loading={createUserMut.isPending}>{t.common.add}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label={`${t.login.username} *`} value={userForm.username}
            onChange={e => setUserForm(p => ({ ...p, username: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.users.role}</label>
            <select value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {BRANCH_ROLES.map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
              ))}
            </select>
          </div>
          <Input label={`${t.login.password} *`} type="password" value={userForm.password}
            onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} />
          <Input label={`${t.users.pin} *`} placeholder="1234" value={userForm.pin}
            onChange={e => setUserForm(p => ({ ...p, pin: e.target.value }))} />
          {createUserMut.isError && <p className="text-sm text-red-500">{t.common.error}</p>}
        </div>
      </Modal>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Branches() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const lang = useLangStore(s => s.lang)
  const t = useT()
  const isPlatform = user?.scope === 'platform'
  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'

  // Tenant selection + filter
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'INACTIVE'>('ALL')

  // Modals state
  const [createTenantModal, setCreateTenantModal] = useState(false)
  const [licenseModal, setLicenseModal] = useState(false)
  const [createBranchModal, setCreateBranchModal] = useState(false)
  const [editBranchTarget, setEditBranchTarget] = useState<Branch | null>(null)

  // Forms
  const [tenantForm, setTenantForm] = useState({ name: '', slug: '', maxUsers: '5', licensePlan: 'MONTHLY' })
  const [licenseForm, setLicenseForm] = useState({ licensePlan: 'MONTHLY', maxUsers: '5', licenseStartedAt: '', licenseExpiresAt: '' })
  const [branchForm, setBranchForm] = useState({ name: '', code: '', currencyCode: 'AED' })
  const [editBranchForm, setEditBranchForm] = useState({ name: '', code: '', currencyCode: 'AED', isActive: true })

  // Data
  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: getTenants,
    enabled: isPlatform,
  })

  const filteredTenants = statusFilter === 'ALL'
    ? tenants
    : tenants.filter(t => {
        if (statusFilter === 'EXPIRED') return t.licenseStatus === 'EXPIRED'
        if (statusFilter === 'INACTIVE') return t.status === 'INACTIVE' || t.licenseStatus === 'INACTIVE'
        return t.status === 'ACTIVE' && t.licenseStatus === 'ACTIVE'
      })

  const activeTenantId = selectedTenantId ?? filteredTenants[0]?.id ?? tenants[0]?.id ?? null
  const activeTenant: Tenant | undefined = tenants.find(t => t.id === activeTenantId)

  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['branches', activeTenantId],
    queryFn: () => getTenantBranches(activeTenantId!),
    enabled: !!activeTenantId,
  })


  // Mutations
  const createTenantMut = useMutation({
    mutationFn: () => createTenant({
      name: tenantForm.name, slug: tenantForm.slug,
      licensePlan: tenantForm.licensePlan, maxUsers: Number(tenantForm.maxUsers) || 5,
    }),
    onSuccess: data => {
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setSelectedTenantId(data.id)
      setCreateTenantModal(false)
      setTenantForm({ name: '', slug: '', maxUsers: '5', licensePlan: 'MONTHLY' })
    },
  })

  const updateLicenseMut = useMutation({
    mutationFn: () => updateTenantLicense(activeTenantId!, {
      licensePlan: licenseForm.licensePlan,
      maxUsers: Number(licenseForm.maxUsers) || 5,
      licenseStartedAt: licenseForm.licenseStartedAt || undefined,
      licenseExpiresAt: licenseForm.licenseExpiresAt || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setLicenseModal(false)
    },
  })

  const createBranchMut = useMutation({
    mutationFn: () => createBranch(activeTenantId!, branchForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches', activeTenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setCreateBranchModal(false)
      setBranchForm({ name: '', code: '', currencyCode: 'AED' })
    },
  })

  const editBranchMut = useMutation({
    mutationFn: () => updatePlatformBranch(activeTenantId!, editBranchTarget!.id, editBranchForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches', activeTenantId] })
      setEditBranchTarget(null)
    },
  })

  const toggleTenantMut = useMutation({
    mutationFn: (isActive: boolean) => updateTenantStatus(activeTenantId!, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })

  const openLicenseModal = () => {
    if (activeTenant) {
      const toDateInput = (d?: string) => d ? new Date(d).toISOString().slice(0, 10) : ''
      setLicenseForm({
        licensePlan: activeTenant.licensePlan ?? 'MONTHLY',
        maxUsers: String(activeTenant.maxUsers ?? 5),
        licenseStartedAt: toDateInput(activeTenant.licenseStartedAt),
        licenseExpiresAt: toDateInput(activeTenant.licenseExpiresAt),
      })
    }
    setLicenseModal(true)
  }

  const openEditBranch = (b: Branch) => {
    setEditBranchForm({ name: b.name, code: b.code, currencyCode: b.currencyCode, isActive: b.isActive })
    setEditBranchTarget(b)
  }

  // Non-platform view
  if (!isPlatform) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building2 size={48} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-600">{t.branches.title}</h2>
        <p className="text-gray-400 mt-2 max-w-sm">{t.branches.platformOnly}</p>
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl px-6 py-3">
          <p className="text-sm text-gray-500">{t.branches.currentBranch}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Tenant tabs ───────────────────────────────────────────────── */}
      <Card className="p-3 space-y-2">
        {/* Filter bar */}
        <div className="flex items-center gap-1.5 flex-wrap border-b border-gray-100 pb-2">
          {(['ALL', 'ACTIVE', 'EXPIRED', 'INACTIVE'] as const).map(f => {
            const count = f === 'ALL' ? tenants.length
              : f === 'EXPIRED' ? tenants.filter(t => t.licenseStatus === 'EXPIRED').length
              : f === 'INACTIVE' ? tenants.filter(t => t.status === 'INACTIVE' || t.licenseStatus === 'INACTIVE').length
              : tenants.filter(t => t.status === 'ACTIVE' && t.licenseStatus === 'ACTIVE').length
            const label = f === 'ALL' ? t.branches.filterAll
              : f === 'ACTIVE' ? t.branches.filterActive
              : f === 'EXPIRED' ? t.branches.filterExpired
              : t.branches.filterInactive
            const dotColor = f === 'ACTIVE' ? 'bg-green-500' : f === 'EXPIRED' ? 'bg-red-500' : f === 'INACTIVE' ? 'bg-gray-400' : ''
            return (
              <button key={f} onClick={() => { setStatusFilter(f); setSelectedTenantId(null) }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                  ${statusFilter === f ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
                {label}
                <span className={`text-xs px-1 rounded ${statusFilter === f ? 'text-blue-200' : 'text-gray-400'}`}>{count}</span>
              </button>
            )
          })}
          <button
            onClick={() => setCreateTenantModal(true)}
            className="ms-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-200"
          >
            <Plus size={14} />
            {t.branches.newTenant}
          </button>
        </div>

        {/* Tenant chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {tenantsLoading ? (
            <Spinner size="sm" className="text-blue-600" />
          ) : filteredTenants.length === 0 ? (
            <span className="text-sm text-gray-400">{t.branches.noTenants}</span>
          ) : (
            filteredTenants.map(ten => {
              const isExpired = ten.licenseStatus === 'EXPIRED'
              const isInactive = ten.status === 'INACTIVE' || ten.licenseStatus === 'INACTIVE'
              const dotColor = isExpired ? 'bg-red-400' : isInactive ? 'bg-gray-400' : 'bg-green-400'
              return (
                <button
                  key={ten.id}
                  onClick={() => setSelectedTenantId(ten.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                    ${activeTenantId === ten.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  {ten.name}
                </button>
              )
            })
          )}
        </div>
      </Card>

      {/* ── Tenant info + license ─────────────────────────────────────── */}
      {activeTenant && (
        <div className="bg-gradient-to-l from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Store size={20} className="text-blue-200" />
                <h2 className="text-lg font-bold">{activeTenant.name}</h2>
                <span className="text-blue-300 text-sm font-mono">/{activeTenant.slug}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${activeTenant.status === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}>
                  {activeTenant.status}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-blue-300 text-xs mb-0.5">{t.branches.licensePlan}</p>
                  <p className="font-semibold text-sm">
                    {activeTenant.licensePlan === 'MONTHLY' ? t.branches.monthly : t.branches.yearly}
                  </p>
                </div>
                <div>
                  <p className="text-blue-300 text-xs mb-0.5">{t.branches.licenseStatus}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${activeTenant.licenseStatus === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {activeTenant.licenseStatus}
                  </span>
                </div>
                <div>
                  <p className="text-blue-300 text-xs mb-0.5">{t.branches.assignedUsers}</p>
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="text-blue-300" />
                    <span className="font-semibold text-sm">
                      {activeTenant.assignedUsers ?? 0}
                      <span className="text-blue-300 font-normal"> / {activeTenant.maxUsers}</span>
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-blue-300 text-xs mb-0.5">{t.branches.licenseExpires}</p>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-blue-300" />
                    <span className="font-semibold text-sm">
                      {activeTenant.licenseExpiresAt
                        ? new Date(activeTenant.licenseExpiresAt).toLocaleDateString(locale)
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={openLicenseModal}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors border border-white/30"
              >
                <RefreshCw size={14} />
                {t.branches.renewLicense}
              </button>
              {activeTenant.status === 'ACTIVE' ? (
                <button
                  onClick={() => toggleTenantMut.mutate(false)}
                  disabled={toggleTenantMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/70 hover:bg-red-500 text-white text-sm font-medium transition-colors border border-red-400/50"
                >
                  <PowerOff size={14} />
                  {t.branches.deactivateTenant}
                </button>
              ) : (
                <button
                  onClick={() => toggleTenantMut.mutate(true)}
                  disabled={toggleTenantMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/80 hover:bg-green-500 text-white text-sm font-medium transition-colors border border-green-400/50"
                >
                  <Power size={14} />
                  {t.branches.activateTenant}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Branches + users ──────────────────────────────────────────── */}
      {activeTenantId && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Building2 size={16} className="text-gray-500" />
              {t.branches.title}
              {!branchesLoading && (
                <span className="text-xs text-gray-400 font-normal">({branches.length})</span>
              )}
            </h3>
            <Button size="sm" onClick={() => setCreateBranchModal(true)}>
              <Plus size={15} />
              {t.branches.addBranch}
            </Button>
          </div>

          {branchesLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" className="text-blue-600" />
            </div>
          ) : branches.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
              <Building2 size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium">{t.branches.noBranches}</p>
              <button
                onClick={() => setCreateBranchModal(true)}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                {t.branches.addBranch}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {branches.map(b => (
                <BranchAccordion
                  key={b.id}
                  branch={b}
                  tenantId={activeTenantId}
                  locale={locale}
                  onEdit={openEditBranch}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Create Tenant Modal ────────────────────────────────────────── */}
      <Modal open={createTenantModal} onClose={() => setCreateTenantModal(false)}
        title={t.branches.newTenant}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateTenantModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => createTenantMut.mutate()} loading={createTenantMut.isPending}>
              {t.branches.createTenant}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <Store size={18} className="text-blue-600 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-700">{t.branches.tenantInfo}</p>
          </div>
          <Input label={`${t.branches.tenantName} *`} value={tenantForm.name}
            onChange={e => setTenantForm(p => ({ ...p, name: e.target.value }))}
            placeholder={lang === 'ar' ? 'مثال: صالون الأناقة' : 'e.g. Elegance Salon'} />
          <Input label={`${t.branches.slug} *`} value={tenantForm.slug}
            onChange={e => setTenantForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
            placeholder="elegance-salon" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.branches.licensePlan}</label>
              <select value={tenantForm.licensePlan}
                onChange={e => setTenantForm(p => ({ ...p, licensePlan: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="MONTHLY">{t.branches.monthly}</option>
                <option value="YEARLY">{t.branches.yearly}</option>
              </select>
            </div>
            <Input label={t.branches.maxUsers} type="number" value={tenantForm.maxUsers}
              onChange={e => setTenantForm(p => ({ ...p, maxUsers: e.target.value }))} placeholder="5" />
          </div>
          {createTenantMut.isError && <p className="text-sm text-red-500">{t.common.error}</p>}
        </div>
      </Modal>

      {/* ── License Modal ──────────────────────────────────────────────── */}
      <Modal open={licenseModal} onClose={() => setLicenseModal(false)}
        title={`${t.branches.renewLicense} — ${activeTenant?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLicenseModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => updateLicenseMut.mutate()} loading={updateLicenseMut.isPending}>
              {t.branches.updateLicense}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Current status summary */}
          {activeTenant && (
            <div className="flex gap-3 p-3 bg-blue-50 rounded-lg text-sm">
              <div className="flex-1">
                <p className="text-blue-500 text-xs mb-0.5">{t.branches.licenseStatus}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTenant.licenseStatus === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {activeTenant.licenseStatus}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-blue-500 text-xs mb-0.5">{t.branches.licenseExpires}</p>
                <p className="font-semibold text-gray-800">
                  {activeTenant.licenseExpiresAt ? new Date(activeTenant.licenseExpiresAt).toLocaleDateString(locale) : '—'}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-blue-500 text-xs mb-0.5">{t.branches.assignedUsers}</p>
                <p className="font-semibold text-gray-800">{activeTenant.assignedUsers ?? 0} / {activeTenant.maxUsers}</p>
              </div>
            </div>
          )}
          {/* Plan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.branches.licensePlan}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['MONTHLY', 'YEARLY'] as const).map(plan => (
                <button key={plan} type="button"
                  onClick={() => setLicenseForm(p => ({ ...p, licensePlan: plan }))}
                  className={`py-2.5 rounded-lg border-2 text-sm font-semibold transition-all
                    ${licenseForm.licensePlan === plan
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {plan === 'MONTHLY' ? t.branches.monthly : t.branches.yearly}
                </button>
              ))}
            </div>
          </div>
          {/* Max users — prominent */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.branches.maxUsers} <span className="text-blue-600 font-bold">{licenseForm.maxUsers}</span>
            </label>
            <input type="range" min="1" max="50" value={licenseForm.maxUsers}
              onChange={e => setLicenseForm(p => ({ ...p, maxUsers: e.target.value }))}
              className="w-full accent-blue-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>1</span><span>10</span><span>20</span><span>30</span><span>50</span>
            </div>
          </div>
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.branches.startDate} type="date" value={licenseForm.licenseStartedAt}
              onChange={e => setLicenseForm(p => ({ ...p, licenseStartedAt: e.target.value }))} />
            <Input label={t.branches.endDate} type="date" value={licenseForm.licenseExpiresAt}
              onChange={e => setLicenseForm(p => ({ ...p, licenseExpiresAt: e.target.value }))} />
          </div>
          <p className="text-xs text-gray-400">
            {lang === 'ar'
              ? 'إذا لم تحدد تاريخ الانتهاء، يُحسب تلقائياً من تاريخ البداية والخطة المختارة'
              : 'If end date is empty, it is auto-calculated from start date + plan'}
          </p>
          {updateLicenseMut.isError && <p className="text-sm text-red-500">{t.common.error}</p>}
        </div>
      </Modal>

      {/* ── Create Branch Modal ────────────────────────────────────────── */}
      <Modal open={createBranchModal} onClose={() => setCreateBranchModal(false)}
        title={t.branches.addBranch}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateBranchModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => createBranchMut.mutate()} loading={createBranchMut.isPending}>
              {t.branches.addBranchBtn}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label={`${t.branches.branchName} *`} value={branchForm.name}
            onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} />
          <Input label={`${t.branches.branchCode} *`} value={branchForm.code}
            onChange={e => setBranchForm(p => ({ ...p, code: e.target.value }))} placeholder="BRANCH-01" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.common.currency}</label>
            <select value={branchForm.currencyCode}
              onChange={e => setBranchForm(p => ({ ...p, currencyCode: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="AED">AED</option>
              <option value="SAR">SAR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          {createBranchMut.isError && <p className="text-sm text-red-500">{t.common.error}</p>}
        </div>
      </Modal>

      {/* ── Edit Branch Modal ──────────────────────────────────────────── */}
      <Modal open={!!editBranchTarget} onClose={() => setEditBranchTarget(null)}
        title={`${t.branches.editBranch}: ${editBranchTarget?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditBranchTarget(null)}>{t.common.cancel}</Button>
            <Button onClick={() => editBranchMut.mutate()} loading={editBranchMut.isPending}>
              {t.common.save}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label={`${t.branches.branchName} *`} value={editBranchForm.name}
            onChange={e => setEditBranchForm(p => ({ ...p, name: e.target.value }))} />
          <Input label={`${t.branches.branchCode} *`} value={editBranchForm.code}
            onChange={e => setEditBranchForm(p => ({ ...p, code: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.common.currency}</label>
            <select value={editBranchForm.currencyCode}
              onChange={e => setEditBranchForm(p => ({ ...p, currencyCode: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="AED">AED</option>
              <option value="SAR">SAR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
            <input type="checkbox" checked={editBranchForm.isActive}
              onChange={e => setEditBranchForm(p => ({ ...p, isActive: e.target.checked }))}
              className="w-4 h-4 text-blue-600 rounded" />
            <div>
              <p className="text-sm font-medium text-gray-900">{t.common.active}</p>
              <p className="text-xs text-gray-500">
                {editBranchForm.isActive
                  ? (lang === 'ar' ? 'الفرع نشط ويقبل المستخدمين' : 'Branch is active and accepts users')
                  : (lang === 'ar' ? 'الفرع معطّل' : 'Branch is disabled')}
              </p>
            </div>
          </label>
          {editBranchMut.isError && <p className="text-sm text-red-500">{t.common.error}</p>}
        </div>
      </Modal>
    </div>
  )
}
