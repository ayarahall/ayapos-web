import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserCog, Plus, Key, Shield, ChevronDown, ChevronUp, Crown, ToggleLeft, ToggleRight } from 'lucide-react'
import {
  getTenants, getTenantUsers, createTenantUser, setTenantUserPassword,
  getOwners, createOwner, updateOwnerStatus, setOwnerPassword,
} from '../api/platform'
import {
  getTenantBranches, getBranchUsers, createBranchUser,
  setBranchUserPassword, updateBranchUserPermissions,
  type BranchUser,
} from '../api/tenantAdmin'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { ROLE_LABELS } from '../types'

const ALL_PERMISSIONS = ['pos', 'products', 'services', 'customers', 'appointments', 'employees', 'expenses', 'cashier', 'invoices', 'reports']
const PLATFORM_ROLES = ['TENANT', 'CASHIER', 'HR', 'BRANCH_MANAGER']
const BRANCH_ROLES = ['BRANCH_MANAGER', 'HR', 'CASHIER']

const roleVariant = (r: string): 'blue' | 'purple' | 'green' | 'gray' | 'yellow' => {
  if (r === 'OWNER') return 'purple'
  if (r === 'ADMIN' || r === 'TENANT') return 'blue'
  if (r === 'CASHIER') return 'green'
  if (r === 'BRANCH_MANAGER') return 'yellow'
  return 'gray'
}

function PermissionsEditor({
  user, branchId, onClose,
}: { user: BranchUser; branchId: string; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [perms, setPerms] = useState<string[]>(user.permissions)

  const mut = useMutation({
    mutationFn: () => updateBranchUserPermissions(branchId, user.id, perms),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branch-users', branchId] })
      onClose()
    },
  })

  const toggle = (p: string) =>
    setPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])

  const permLabel = (p: string) =>
    (t.users.permissionLabels as Record<string, string>)[p] ?? p

  return (
    <Modal open onClose={onClose} title={`${t.users.editPermissions} — ${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
          <Button onClick={() => mut.mutate()} loading={mut.isPending}>{t.users.savePermissions}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          {user.permissionsConfigured ? t.users.permissionsCustom : t.users.permissionsDefault}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_PERMISSIONS.map(p => (
            <label key={p} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors
              ${perms.includes(p) ? 'bg-blue-50 border-blue-300 text-blue-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)}
                className="w-4 h-4 text-blue-600 rounded" />
              <span className="text-sm font-medium">{permLabel(p)}</span>
            </label>
          ))}
        </div>
        {mut.isError && <p className="text-sm text-red-600">{t.common.error}</p>}
      </div>
    </Modal>
  )
}

function BranchUsersSection({ branchId, branchName }: { branchId: string; branchName: string }) {
  const t = useT()
  const lang = useLangStore(s => s.lang)
  const qc = useQueryClient()
  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'

  const [expanded, setExpanded] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [pwdModal, setPwdModal] = useState(false)
  const [permUser, setPermUser] = useState<BranchUser | null>(null)
  const [pwdUserId, setPwdUserId] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [form, setForm] = useState({ username: '', role: 'CASHIER', password: '', pin: '' })

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['branch-users', branchId],
    queryFn: () => getBranchUsers(branchId),
    enabled: expanded,
  })

  const createMut = useMutation({
    mutationFn: () => createBranchUser(branchId, { ...form, licensePlan: 'MONTHLY' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branch-users', branchId] })
      setCreateModal(false)
      setForm({ username: '', role: 'CASHIER', password: '', pin: '' })
    },
  })

  const pwdMut = useMutation({
    mutationFn: () => setBranchUserPassword(branchId, pwdUserId, newPwd),
    onSuccess: () => { setPwdModal(false); setNewPwd('') },
  })

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <UserCog size={16} className="text-blue-600" />
          </div>
          <div className="text-start">
            <p className="font-semibold text-gray-900">{branchName}</p>
            <p className="text-xs text-gray-500">{t.users.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreateModal(true) }}>
            <Plus size={14} />{t.users.addBranchUser}
          </Button>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {isLoading ? (
            <div className="flex justify-center py-6"><Spinner size="md" className="text-blue-600" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-2.5 text-start text-xs font-semibold text-gray-500">{t.login.username}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold text-gray-500">{t.users.role}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold text-gray-500">{t.users.permissions}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold text-gray-500">{t.users.licenseExpires}</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {u.username[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={roleVariant(u.role)}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {u.permissionsConfigured
                          ? <Badge variant="purple"><Shield size={10} className="inline me-0.5" />{t.users.permissionsCustom}</Badge>
                          : <Badge variant="gray">{t.users.permissionsDefault}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(u.licenseExpiresAt).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPermUser(u)}
                          className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title={t.users.editPermissions}>
                          <Shield size={15} />
                        </button>
                        <button onClick={() => { setPwdUserId(u.id); setPwdModal(true) }}
                          className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors" title={t.users.changePassword}>
                          <Key size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-8 text-sm">{t.users.noUsers}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={createModal} onClose={() => setCreateModal(false)} title={t.users.addBranchUser}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>{t.common.add}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label={`${t.login.username} *`} value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.users.role}</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {BRANCH_ROLES.map(r => <option key={r} value={r}>{t.users.roles[r as keyof typeof t.users.roles] ?? r}</option>)}
            </select>
          </div>
          <Input label={`${t.login.password} *`} type="password" value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          <Input label={`${t.users.pin} *`} type="text" placeholder="1234" value={form.pin}
            onChange={e => setForm(p => ({ ...p, pin: e.target.value }))} />
          {createMut.isError && <p className="text-sm text-red-600">{t.common.error}</p>}
        </div>
      </Modal>

      <Modal open={pwdModal} onClose={() => setPwdModal(false)} title={t.users.changePassword} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwdModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => pwdMut.mutate()} loading={pwdMut.isPending}>{t.common.save}</Button>
          </>
        }
      >
        <Input label={t.users.newPassword} type="password" value={newPwd}
          onChange={e => setNewPwd(e.target.value)} />
      </Modal>

      {permUser && (
        <PermissionsEditor user={permUser} branchId={branchId} onClose={() => setPermUser(null)} />
      )}
    </Card>
  )
}

function PlatformOwnersSection() {
  const t = useT()
  const lang = useLangStore(s => s.lang)
  const qc = useQueryClient()
  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'

  const [expanded, setExpanded] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [pwdOwnerId, setPwdOwnerId] = useState<string | null>(null)
  const [newPwd, setNewPwd] = useState('')
  const [form, setForm] = useState({ username: '', password: '' })

  const { data: owners = [], isLoading } = useQuery({
    queryKey: ['platform-owners'],
    queryFn: () => getOwners(),
    enabled: expanded,
  })

  const createMut = useMutation({
    mutationFn: () => createOwner({ username: form.username, password: form.password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-owners'] })
      setCreateModal(false)
      setForm({ username: '', password: '' })
    },
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateOwnerStatus(id, !isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-owners'] }),
  })

  const pwdMut = useMutation({
    mutationFn: () => setOwnerPassword(pwdOwnerId!, newPwd),
    onSuccess: () => { setPwdOwnerId(null); setNewPwd('') },
  })

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-purple-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <Crown size={16} className="text-purple-600" />
          </div>
          <div className="text-start">
            <p className="font-semibold text-gray-900">{t.users.owners}</p>
            <p className="text-xs text-gray-500">AyaPOS Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); setCreateModal(true) }}>
            <Plus size={14} />{t.users.addOwner}
          </Button>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {isLoading ? (
            <div className="flex justify-center py-6"><Spinner size="md" className="text-purple-600" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-2.5 text-start text-xs font-semibold text-gray-500">{t.login.username}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold text-gray-500">{t.common.status}</th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold text-gray-500">{t.common.createdAt}</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {owners.map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {o.username[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{o.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={o.isActive ? 'green' : 'red'}>
                        {o.isActive ? t.common.active : t.common.inactive}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(o.createdAt).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleMut.mutate({ id: o.id, isActive: o.isActive })}
                          className="p-1.5 rounded hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition-colors"
                          title={t.users.toggleActive}
                        >
                          {o.isActive
                            ? <ToggleRight size={16} className="text-green-500" />
                            : <ToggleLeft size={16} className="text-gray-400" />}
                        </button>
                        <button
                          onClick={() => setPwdOwnerId(o.id)}
                          className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                          title={t.users.changePassword}
                        >
                          <Key size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {owners.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-gray-400 py-8 text-sm">{t.users.noUsers}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create Owner Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title={t.users.addOwner}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>{t.common.add}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label={`${t.login.username} *`} value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          <Input label={`${t.login.password} *`} type="password" value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          {createMut.isError && <p className="text-sm text-red-600">{t.common.error}</p>}
        </div>
      </Modal>

      {/* Change Owner Password Modal */}
      <Modal open={!!pwdOwnerId} onClose={() => setPwdOwnerId(null)} title={t.users.changePassword} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwdOwnerId(null)}>{t.common.cancel}</Button>
            <Button onClick={() => pwdMut.mutate()} loading={pwdMut.isPending}>{t.common.save}</Button>
          </>
        }
      >
        <Input label={t.users.newPassword} type="password" value={newPwd}
          onChange={e => setNewPwd(e.target.value)} />
      </Modal>
    </Card>
  )
}

export default function Users() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const lang = useLangStore(s => s.lang)
  const t = useT()
  const isPlatform = user?.scope === 'platform'
  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [createModal, setCreateModal] = useState(false)
  const [pwdModal, setPwdModal] = useState(false)
  const [pwdUserId, setPwdUserId] = useState<string | null>(null)
  const [newPwd, setNewPwd] = useState('')
  const [form, setForm] = useState({ username: '', role: 'CASHIER', password: '', pin: '1234' })

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => getTenants(),
    enabled: isPlatform,
  })

  const activeTenantId = selectedTenantId ?? tenants[0]?.id ?? null

  const { data: platformUsers, isLoading: platformUsersLoading } = useQuery({
    queryKey: ['tenant-users', activeTenantId],
    queryFn: () => getTenantUsers(activeTenantId!),
    enabled: isPlatform && !!activeTenantId,
  })

  const { data: tenantBranches, isLoading: branchesLoading } = useQuery({
    queryKey: ['tenant-branches'],
    queryFn: () => getTenantBranches(),
    enabled: !isPlatform,
  })

  const createMut = useMutation({
    mutationFn: () => createTenantUser(activeTenantId!, { ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-users', activeTenantId] })
      setCreateModal(false)
      setForm({ username: '', role: 'CASHIER', password: '', pin: '1234' })
    },
  })

  const pwdMut = useMutation({
    mutationFn: () => setTenantUserPassword(activeTenantId!, pwdUserId!, newPwd),
    onSuccess: () => { setPwdModal(false); setNewPwd(''); setPwdUserId(null) },
  })

  // ── Tenant scope view ──────────────────────────────────────
  if (!isPlatform) {
    if (branchesLoading) return <div className="flex justify-center py-16"><Spinner size="lg" className="text-blue-600" /></div>

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{t.users.title}</h3>
        </div>
        {(tenantBranches ?? []).map(b => (
          <BranchUsersSection key={b.id} branchId={b.id} branchName={b.name} />
        ))}
        {(tenantBranches ?? []).length === 0 && (
          <Card className="text-center py-16 text-gray-400">
            <UserCog size={40} className="mx-auto mb-3 text-gray-300" />
            <p>{t.users.noUsers}</p>
          </Card>
        )}
      </div>
    )
  }

  // ── Platform scope view ────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Platform Owners section */}
      <PlatformOwnersSection />

      {/* Tenant selector */}
      {tenantsLoading ? (
        <div className="flex justify-center py-4"><Spinner size="md" className="text-blue-600" /></div>
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-700">{t.nav.tenant}:</span>
            {tenants.map(ten => (
              <button key={ten.id} onClick={() => setSelectedTenantId(ten.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors
                  ${activeTenantId === ten.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}>
                {ten.name}
              </button>
            ))}
            {tenants.length === 0 && (
              <span className="text-sm text-gray-400">{t.branches.noTenants}</span>
            )}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{t.users.title}</h3>
        <Button onClick={() => setCreateModal(true)} disabled={!activeTenantId}>
          <Plus size={16} />{t.users.addUser}
        </Button>
      </div>

      {platformUsersLoading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" className="text-blue-600" /></div>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-start">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 text-start">{t.login.username}</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-start">{t.users.role}</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-start">{t.common.status}</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-start">{t.users.licenseExpires}</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-start">{t.common.createdAt}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(platformUsers ?? []).map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={roleVariant(u.role)}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.isActive ? 'green' : 'red'}>
                      {u.isActive ? t.common.active : t.common.inactive}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.licenseExpiresAt ? new Date(u.licenseExpiresAt).toLocaleDateString(locale) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(u.createdAt).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setPwdUserId(u.id); setPwdModal(true) }}
                      className="p-1.5 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors" title={t.users.changePassword}>
                      <Key size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {(platformUsers ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-12">
                    <UserCog size={32} className="mx-auto mb-2 text-gray-300" />
                    {t.users.noUsers}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create user modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title={t.users.addUser}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>{t.common.add}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label={`${t.login.username} *`} value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.users.role}</label>
            <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PLATFORM_ROLES.map(r => <option key={r} value={r}>{t.users.roles[r as keyof typeof t.users.roles] ?? r}</option>)}
            </select>
          </div>
          <Input label={t.login.password} type="password" value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          <Input label={t.users.pin} type="text" placeholder="1234" value={form.pin}
            onChange={e => setForm(p => ({ ...p, pin: e.target.value }))} />
          {createMut.isError && <p className="text-sm text-red-600">{t.common.error}</p>}
        </div>
      </Modal>

      {/* Change password modal */}
      <Modal open={pwdModal} onClose={() => setPwdModal(false)} title={t.users.changePassword} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwdModal(false)}>{t.common.cancel}</Button>
            <Button onClick={() => pwdMut.mutate()} loading={pwdMut.isPending}>{t.common.save}</Button>
          </>
        }
      >
        <Input label={t.users.newPassword} type="password" value={newPwd}
          onChange={e => setNewPwd(e.target.value)} />
      </Modal>
    </div>
  )
}
