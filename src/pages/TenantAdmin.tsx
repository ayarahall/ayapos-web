import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Key, Shield, Upload, CheckCircle2, AlertCircle, Power, Trash2 } from 'lucide-react'
import {
  getTenantSummary, getTenantBranches, createTenantAdminBranch,
  getBranchUsers, createBranchUser, setBranchUserPassword,
  updateBranchUserPermissions, updateBranchUserLicense,
  getPrintSettings, updatePrintSettings, updateBranch,
  importBranchServices, importBranchProducts,
  getAdminFeatureSettings, updateAdminFeatureSettings,
  type TenantBranch, type BranchUser, type PrintSettings, type ServiceImportResult, type TenantSummary,
  type FeatureSettings, defaultFeatureSettings,
} from '../api/tenantAdmin'
import { getProducts, createProduct, updateProduct, deleteProduct } from '../api/products'
import { getServices, createService, updateService, deleteService } from '../api/services'
import { useAuthStore } from '../store/authStore'
import { useT } from '../i18n/useT'
import Modal from '../components/ui/Modal'
import PermissionEditor from '../components/ui/PermissionEditor'
import type { ProductListItem, ServiceListItem } from '../types'
import { useToastStore } from '../store/toastStore'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    BRANCH_MANAGER: 'bg-purple-100 text-purple-700',
    HR: 'bg-blue-100 text-blue-700',
    CASHIER: 'bg-green-100 text-green-700',
    TENANT: 'bg-orange-100 text-orange-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[role] ?? 'bg-slate-100 text-slate-600'}`}>
      {role}
    </span>
  )
}

function StatusDot({ active }: { active: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-slate-400'}`} />
}


// ─── Workspace Tab ───────────────────────────────────────────────────────────

function WorkspaceTab({ branch }: { branch: TenantBranch }) {
  const t = useT()
  const ta = t.tenantAdmin
  const qc = useQueryClient()
  const toast = useToastStore()

  const [branchForm, setBranchForm] = useState({
    name: branch.name,
    code: branch.code,
    currencyCode: branch.currencyCode,
    isActive: branch.isActive,
  })

  const printQuery = useQuery({
    queryKey: ['print-settings', branch.id],
    queryFn: () => getPrintSettings(branch.id),
  })

  const [printForm, setPrintForm] = useState<PrintSettings>({
    companyName: '', companyLogoUrl: '', companyPhone: '', companyAddress: '',
    companyTaxNumber: '', receiptTitle: 'Sales Receipt', receiptHeaderLine1: '',
    receiptHeaderLine2: '', receiptFooterNote: '', showBranchNameOnReceipt: true,
    showCustomerNameOnReceipt: true, showPaymentHistoryOnReceipt: true,
    autoPrintReceiptAfterPayment: false,
  })

  useEffect(() => {
    if (printQuery.data) setPrintForm(printQuery.data)
  }, [printQuery.data])

  useEffect(() => {
    setBranchForm({ name: branch.name, code: branch.code, currencyCode: branch.currencyCode, isActive: branch.isActive })
  }, [branch.id, branch.name, branch.code, branch.currencyCode, branch.isActive])

  const saveBranchMut = useMutation({
    mutationFn: () => updateBranch(branch.id, branchForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-admin-branches'] }); toast.success(`✓ ${ta.saveBranch}`) },
  })

  const savePrintMut = useMutation({
    mutationFn: () => updatePrintSettings(branch.id, printForm),
    onSuccess: (data) => { setPrintForm(data); toast.success(`✓ ${ta.savePrint}`) },
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Branch Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">{ta.branchSettings}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{ta.branchName}</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={branchForm.name} onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{ta.branchCode}</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={branchForm.code} onChange={e => setBranchForm(f => ({ ...f, code: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{ta.currencyCode}</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={3} value={branchForm.currencyCode}
              onChange={e => setBranchForm(f => ({ ...f, currencyCode: e.target.value.toUpperCase() }))} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={branchForm.isActive}
              onChange={e => setBranchForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-slate-700">{ta.active}</span>
          </label>
        </div>
        <button
          onClick={() => saveBranchMut.mutate()}
          disabled={saveBranchMut.isPending}
          className="mt-4 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={14} />
          {saveBranchMut.isPending ? t.common.loading : ta.saveBranch}
        </button>
      </div>

      {/* Print Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-800 mb-4">{ta.printSettings}</h3>
        {printQuery.isLoading ? (
          <p className="text-slate-500 text-sm">{t.common.loading}</p>
        ) : (
          <div className="space-y-3">
            {([
              ['companyName', ta.companyName],
              ['companyLogoUrl', ta.companyLogoUrl],
              ['companyPhone', ta.companyPhone],
              ['companyAddress', ta.companyAddress],
              ['companyTaxNumber', ta.companyTaxNumber],
              ['receiptTitle', ta.receiptTitle],
              ['receiptHeaderLine1', ta.receiptHeaderLine1],
              ['receiptHeaderLine2', ta.receiptHeaderLine2],
              ['receiptFooterNote', ta.receiptFooterNote],
            ] as [keyof PrintSettings, string][]).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1">{label}</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={(printForm[key] as string) ?? ''}
                  onChange={e => setPrintForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {([
                ['showBranchNameOnReceipt', ta.showBranchName],
                ['showCustomerNameOnReceipt', ta.showCustomerName],
                ['showPaymentHistoryOnReceipt', ta.showPaymentHistory],
                ['autoPrintReceiptAfterPayment', ta.autoPrint],
              ] as [keyof PrintSettings, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={printForm[key] as boolean}
                    onChange={e => setPrintForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600" />
                  <span className="text-xs text-slate-700">{label}</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => savePrintMut.mutate()}
              disabled={savePrintMut.isPending}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={14} />
              {savePrintMut.isPending ? t.common.loading : ta.savePrint}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Users Tab ───────────────────────────────────────────────────────────────

function UsersTab({ branch, summary }: { branch: TenantBranch; summary?: TenantSummary }) {
  const t = useT()
  const ta = t.tenantAdmin
  const qc = useQueryClient()
  const toast = useToastStore()
  const [showAdd, setShowAdd] = useState(false)
  const [pwdUser, setPwdUser] = useState<BranchUser | null>(null)
  const [permUser, setPermUser] = useState<BranchUser | null>(null)
  const [newPwd, setNewPwd] = useState('')
  const [perms, setPerms] = useState<string[]>([])

  const usersQuery = useQuery({
    queryKey: ['branch-users', branch.id],
    queryFn: () => getBranchUsers(branch.id),
  })

  const [addForm, setAddForm] = useState({ username: '', role: 'CASHIER', password: '', pin: '' })
  const [addPerms, setAddPerms] = useState<string[]>([])

  const addMut = useMutation({
    mutationFn: async () => {
      const created = await createBranchUser(branch.id, { ...addForm, licensePlan: 'MONTHLY' })
      if (addPerms.length > 0) {
        await updateBranchUserPermissions(branch.id, created.id, addPerms)
      }
      return created
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branch-users', branch.id] }); qc.invalidateQueries({ queryKey: ['tenant-summary'] }); setShowAdd(false); setAddForm({ username: '', role: 'CASHIER', password: '', pin: '' }); setAddPerms([]); toast.success(`✓ ${ta.addUser}`) },
  })

  const pwdMut = useMutation({
    mutationFn: () => setBranchUserPassword(branch.id, pwdUser!.id, newPwd),
    onSuccess: () => { setPwdUser(null); setNewPwd(''); toast.success(`✓ ${t.common.saved}`) },
  })

  const permMut = useMutation({
    mutationFn: () => updateBranchUserPermissions(branch.id, permUser!.id, perms),
    onSuccess: (updated) => {
      qc.setQueryData<BranchUser[]>(['branch-users', branch.id], old =>
        old?.map(u => u.id === updated.id ? updated : u) ?? []
      )
      setPermUser(null)
      toast.success(`✓ ${t.users.savePermissions}`)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (u: BranchUser) => updateBranchUserLicense(branch.id, u.id, {
      licensePlan: u.licensePlan,
      isActive: !u.isActive,
    }),
    onSuccess: (updated) => {
      qc.setQueryData<BranchUser[]>(['branch-users', branch.id], old =>
        old?.map(u => u.id === updated.id ? updated : u) ?? []
      )
    },
  })

  const users = usersQuery.data ?? []
  const licenseLimitReached = summary ? summary.assignedUsers >= summary.maxUsers : false

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <span className="text-sm text-slate-500">{users.length} {ta.users.toLowerCase()}</span>
          {summary && (
            <p className={`mt-1 text-xs ${licenseLimitReached ? 'text-red-600' : 'text-slate-500'}`}>
              {t.users.title}: {summary.assignedUsers} / {summary.maxUsers} · {ta.licensePlan}: {summary.licensePlan} · {ta.licenseStatus}: {summary.licenseStatus}
            </p>
          )}
        </div>
        <button onClick={() => setShowAdd(true)} disabled={licenseLimitReached}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
          <Plus size={14} /> {ta.addUser}
        </button>
      </div>
      {licenseLimitReached && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          وصلت الرخصة إلى الحد الأقصى للمستخدمين. ارفع الحد من تفاصيل الرخصة قبل إضافة مستخدم جديد.
        </div>
      )}

      {usersQuery.isLoading ? (
        <p className="text-slate-500 text-sm">{t.common.loading}</p>
      ) : users.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">{ta.noUsers}</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <StatusDot active={u.isActive} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{u.username}</p>
                <p className="text-xs text-slate-500">{t.users.licenseExpires}: {fmtDate(u.licenseExpiresAt)}</p>
              </div>
              <RoleBadge role={u.role} />
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleMut.mutate(u)}
                  title={u.isActive ? t.common.inactive : t.common.active}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600">
                  <Power size={14} />
                </button>
                <button
                  onClick={() => { setPwdUser(u); setNewPwd('') }}
                  title={t.users.changePassword}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600">
                  <Key size={14} />
                </button>
                <button
                  onClick={() => { setPermUser(u); setPerms(u.permissions) }}
                  title={t.users.editPermissions}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-purple-600">
                  <Shield size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={ta.addUser} size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Username</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="username" value={addForm.username}
                onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t.users.role}</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))}>
                <option value="CASHIER">{t.users.roles.CASHIER}</option>
                <option value="HR">{t.users.roles.HR}</option>
                <option value="BRANCH_MANAGER">{t.users.roles.BRANCH_MANAGER}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t.users.pin}</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="4+ digits" type="password" value={addForm.pin}
                onChange={e => setAddForm(f => ({ ...f, pin: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Password (optional)</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                type="password" placeholder="optional" value={addForm.password}
                onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          </div>

          <hr className="border-slate-100" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.users.permissions}</p>
          <PermissionEditor value={addPerms} onChange={setAddPerms} />

          {addMut.isError && <p className="text-red-600 text-sm">{t.common.error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending || licenseLimitReached}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {addMut.isPending ? t.common.loading : t.common.add}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="flex-1 border border-slate-200 py-2 rounded-lg text-sm hover:bg-slate-50">
              {t.common.cancel}
            </button>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal open={!!pwdUser} onClose={() => setPwdUser(null)} title={t.users.changePassword}>
        <p className="text-sm text-slate-600 mb-3">{pwdUser?.username}</p>
        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3"
          type="password" placeholder={t.users.newPassword} value={newPwd}
          onChange={e => setNewPwd(e.target.value)} />
        {pwdMut.isError && <p className="text-red-600 text-sm mb-2">{t.common.error}</p>}
        <div className="flex gap-2">
          <button onClick={() => pwdMut.mutate()} disabled={pwdMut.isPending || newPwd.length < 6}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {pwdMut.isPending ? t.common.loading : t.common.save}
          </button>
          <button onClick={() => setPwdUser(null)}
            className="flex-1 border border-slate-200 py-2 rounded-lg text-sm hover:bg-slate-50">
            {t.common.cancel}
          </button>
        </div>
      </Modal>

      {/* Permissions Modal */}
      <Modal open={!!permUser} onClose={() => setPermUser(null)} title={t.users.editPermissions} size="lg">
        <PermissionEditor value={perms} onChange={setPerms} username={permUser?.username} />
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
          <button onClick={() => permMut.mutate()} disabled={permMut.isPending}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {permMut.isPending ? t.common.loading : t.users.savePermissions}
          </button>
          <button onClick={() => { setPerms([]); setPermUser(null) }}
            className="flex-1 border border-slate-200 py-2 rounded-lg text-sm hover:bg-slate-50">
            {t.common.cancel}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Products Tab ────────────────────────────────────────────────────────────

function ProductsTab({ tenantSlug, branchId }: { tenantSlug: string; branchId: string }) {
  const t = useT()
  const ta = t.tenantAdmin
  const qc = useQueryClient()
  const toast = useToastStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<ProductListItem | null>(null)
  const [search, setSearch] = useState('')
  const [importResult, setImportResult] = useState<ServiceImportResult | null>(null)
  const [form, setForm] = useState({ nameAr: '', nameEn: '', sku: '', barcode: '', sellPrice: '', unit: '' })
  const [editForm, setEditForm] = useState({ nameAr: '', nameEn: '', sku: '', barcode: '', sellPrice: '', unit: '' })

  const query = useQuery({
    queryKey: ['admin-products', tenantSlug],
    queryFn: () => getProducts(tenantSlug, { pageSize: 100 }),
  })

  const addMut = useMutation({
    mutationFn: () => createProduct(tenantSlug, {
      nameAr: form.nameAr,
      nameEn: form.nameEn || undefined,
      sku: form.sku || undefined,
      barcode: form.barcode || undefined,
      sellPrice: parseFloat(form.sellPrice) || 0,
      unit: form.unit || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products', tenantSlug] })
      setShowAdd(false)
      setForm({ nameAr: '', nameEn: '', sku: '', barcode: '', sellPrice: '', unit: '' })
      toast.success(`✓ ${t.products.addProduct}`)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (p: ProductListItem) => updateProduct(tenantSlug, p.id, { isActive: !p.isActive }),
    onSuccess: (_, p) => { qc.invalidateQueries({ queryKey: ['admin-products', tenantSlug] }); toast.success(`✓ ${p.isActive ? t.common.inactive : t.common.active}`) },
  })

  const editMut = useMutation({
    mutationFn: () => updateProduct(tenantSlug, editItem!.id, {
      nameAr: editForm.nameAr || undefined,
      nameEn: editForm.nameEn || undefined,
      sku: editForm.sku || undefined,
      barcode: editForm.barcode || undefined,
      sellPrice: parseFloat(editForm.sellPrice) || undefined,
      unit: editForm.unit || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products', tenantSlug] })
      setEditItem(null)
      toast.success(`✓ ${t.common.saved}`)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProduct(tenantSlug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products', tenantSlug] })
      toast.success(`✓ ${t.common.done}`)
    },
  })

  const importMut = useMutation({
    mutationFn: (file: File) => importBranchProducts(branchId, file),
    onSuccess: (result) => {
      setImportResult(result)
      qc.invalidateQueries({ queryKey: ['admin-products', tenantSlug] })
    },
  })

  function openEdit(p: ProductListItem) {
    setEditItem(p)
    setEditForm({
      nameAr: p.nameAr ?? '',
      nameEn: p.nameEn ?? '',
      sku: p.sku ?? '',
      barcode: p.barcode ?? '',
      sellPrice: p.sellPrice?.toString() ?? '',
      unit: p.unit ?? '',
    })
  }

  const items = (query.data?.items ?? []).filter(p =>
    !search || `${p.nameAr} ${p.nameEn} ${p.sku} ${p.barcode}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
          placeholder={t.products.searchPlaceholder} value={search}
          onChange={e => setSearch(e.target.value)} />
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={14} /> {t.products.addProduct}
        </button>
        <button onClick={() => fileRef.current?.click()}
          disabled={importMut.isPending}
          className="flex items-center gap-1.5 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50">
          <Upload size={14} /> {ta.importProducts}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
          onChange={e => { if (e.target.files?.[0]) { importMut.mutate(e.target.files[0]); e.target.value = '' } }} />
      </div>

      {/* Import result */}
      {importResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-blue-600" />
            <span className="font-medium text-blue-800 text-sm">{ta.importResult}</span>
            <button onClick={() => setImportResult(null)} className="ml-auto text-xs text-blue-600 hover:underline">{t.common.close}</button>
          </div>
          <p className="text-sm text-blue-700">
            {ta.created}: {importResult.createdCount} · {ta.updated}: {importResult.updatedCount} · {ta.skipped}: {importResult.skippedCount} / {importResult.totalRows}
          </p>
          {importResult.issues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {importResult.issues.map(iss => (
                <li key={iss.rowNumber} className="flex items-start gap-1 text-xs text-red-700">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  Row {iss.rowNumber}: {iss.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {query.isLoading ? (
        <p className="text-slate-500 text-sm">{t.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">{t.products.noProducts}</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {items.map(p => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <StatusDot active={p.isActive} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{p.nameAr || p.nameEn}</p>
                <p className="text-xs text-slate-500">{p.nameEn} {p.sku ? `· ${p.sku}` : ''}</p>
              </div>
              <span className="text-sm font-medium text-slate-700">{p.sellPrice} {p.currencyCode}</span>
              <button onClick={() => openEdit(p)}
                className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:opacity-75">
                {t.common.edit}
              </button>
              <button onClick={() => toggleMut.mutate(p)}
                className={`text-xs px-2 py-1 rounded ${p.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'} hover:opacity-75`}>
                {p.isActive ? t.common.active : t.common.inactive}
              </button>
              <button onClick={() => { if (confirm(t.common.confirmDelete)) deleteMut.mutate(p.id) }}
                disabled={deleteMut.isPending}
                className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:opacity-75 disabled:opacity-40">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t.products.addProduct}>
        <div className="space-y-3">
          {[
            ['nameAr', t.products.nameAr], ['nameEn', t.products.nameEn],
            ['sku', t.products.sku], ['barcode', t.products.barcode],
            ['sellPrice', t.common.price], ['unit', 'Unit'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                type={key === 'sellPrice' ? 'number' : 'text'}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          {addMut.isError && <p className="text-red-600 text-sm">{t.common.error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending || !form.nameAr}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
              {addMut.isPending ? t.common.loading : t.common.add}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={t.common.edit}>
        <div className="space-y-3">
          {[
            ['nameAr', t.products.nameAr], ['nameEn', t.products.nameEn],
            ['sku', t.products.sku], ['barcode', t.products.barcode],
            ['sellPrice', t.common.price], ['unit', 'Unit'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                type={key === 'sellPrice' ? 'number' : 'text'}
                value={editForm[key as keyof typeof editForm]}
                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          {editMut.isError && <p className="text-red-600 text-sm">{t.common.error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={() => editMut.mutate()} disabled={editMut.isPending || !editForm.nameAr}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
              {editMut.isPending ? t.common.loading : t.common.save}
            </button>
            <button onClick={() => setEditItem(null)}
              className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Services Tab ────────────────────────────────────────────────────────────

function ServicesTab({ tenantSlug, branchId }: { tenantSlug: string; branchId: string }) {
  const t = useT()
  const ta = t.tenantAdmin
  const qc = useQueryClient()
  const toast = useToastStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<ServiceListItem | null>(null)
  const [importResult, setImportResult] = useState<ServiceImportResult | null>(null)
  const [form, setForm] = useState({ nameAr: '', nameEn: '', durationMin: '', priceCents: '' })
  const [editForm, setEditForm] = useState({ nameAr: '', nameEn: '', durationMin: '', priceCents: '' })

  const query = useQuery({
    queryKey: ['admin-services', tenantSlug],
    queryFn: () => getServices(tenantSlug, { pageSize: 200 }),
  })

  const addMut = useMutation({
    mutationFn: () => createService(tenantSlug, {
      nameAr: form.nameAr,
      nameEn: form.nameEn || undefined,
      durationMin: form.durationMin ? parseInt(form.durationMin) : undefined,
      priceCents: Math.round((parseFloat(form.priceCents) || 0) * 100),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-services', tenantSlug] })
      setShowAdd(false)
      setForm({ nameAr: '', nameEn: '', durationMin: '', priceCents: '' })
      toast.success(`✓ ${t.services.addService}`)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (s: ServiceListItem) => updateService(tenantSlug, s.id, { isActive: !s.isActive }),
    onSuccess: (_, s) => { qc.invalidateQueries({ queryKey: ['admin-services', tenantSlug] }); toast.success(`✓ ${s.isActive ? t.common.inactive : t.common.active}`) },
  })

  const editMut = useMutation({
    mutationFn: () => updateService(tenantSlug, editItem!.id, {
      nameAr: editForm.nameAr || undefined,
      nameEn: editForm.nameEn || undefined,
      durationMin: editForm.durationMin ? parseInt(editForm.durationMin) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-services', tenantSlug] })
      setEditItem(null)
      toast.success(`✓ ${t.common.saved}`)
    },
  })

  function openEdit(s: ServiceListItem) {
    setEditItem(s)
    setEditForm({
      nameAr: s.nameAr ?? '',
      nameEn: s.nameEn ?? '',
      durationMin: s.durationMin?.toString() ?? '',
      priceCents: s.price?.toString() ?? '',
    })
  }

  const deleteServiceMut = useMutation({
    mutationFn: (id: string) => deleteService(tenantSlug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-services', tenantSlug] })
      toast.success(`✓ ${t.common.done}`)
    },
  })

  const importMut = useMutation({
    mutationFn: (file: File) => importBranchServices(branchId, file),
    onSuccess: (result) => {
      setImportResult(result)
      qc.invalidateQueries({ queryKey: ['admin-services', tenantSlug] })
    },
  })

  const items = query.data?.items ?? []

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={14} /> {t.services.addService}
        </button>
        <button onClick={() => fileRef.current?.click()}
          disabled={importMut.isPending}
          className="flex items-center gap-1.5 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50">
          <Upload size={14} /> {ta.importServices}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden"
          onChange={e => { if (e.target.files?.[0]) { importMut.mutate(e.target.files[0]); e.target.value = '' } }} />
      </div>

      {/* Import result */}
      {importResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-blue-600" />
            <span className="font-medium text-blue-800 text-sm">{ta.importResult}</span>
            <button onClick={() => setImportResult(null)} className="ml-auto text-xs text-blue-600 hover:underline">{t.common.close}</button>
          </div>
          <p className="text-sm text-blue-700">
            {ta.created}: {importResult.createdCount} · {ta.updated}: {importResult.updatedCount} · {ta.skipped}: {importResult.skippedCount} / {importResult.totalRows}
          </p>
          {importResult.issues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {importResult.issues.map(iss => (
                <li key={iss.rowNumber} className="flex items-start gap-1 text-xs text-red-700">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  Row {iss.rowNumber}: {iss.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {query.isLoading ? (
        <p className="text-slate-500 text-sm">{t.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">{t.services.noServices}</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {items.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3">
              <StatusDot active={s.isActive} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{s.nameAr || s.nameEn}</p>
                <p className="text-xs text-slate-500">{s.nameEn} {s.durationMin ? `· ${s.durationMin} ${t.services.minutes}` : ''}</p>
              </div>
              <span className="text-sm font-medium text-slate-700">{s.price} {s.currencyCode}</span>
              <button onClick={() => openEdit(s)}
                className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:opacity-75">
                {t.common.edit}
              </button>
              <button onClick={() => toggleMut.mutate(s)}
                className={`text-xs px-2 py-1 rounded ${s.isActive ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'} hover:opacity-75`}>
                {s.isActive ? t.common.active : t.common.inactive}
              </button>
              <button onClick={() => { if (confirm(t.common.confirmDelete)) deleteServiceMut.mutate(s.id) }}
                disabled={deleteServiceMut.isPending}
                className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:opacity-75 disabled:opacity-40">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t.services.addService}>
        <div className="space-y-3">
          {[
            ['nameAr', t.services.nameAr], ['nameEn', t.services.nameEn],
            ['durationMin', t.services.duration], ['priceCents', t.common.price],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                type={key === 'durationMin' || key === 'priceCents' ? 'number' : 'text'}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <p className="text-xs text-slate-400">{t.services.priceNote}</p>
          {addMut.isError && <p className="text-red-600 text-sm">{t.common.error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending || !form.nameAr}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
              {addMut.isPending ? t.common.loading : t.common.add}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={t.common.edit}>
        <div className="space-y-3">
          {[
            ['nameAr', t.services.nameAr], ['nameEn', t.services.nameEn],
            ['durationMin', t.services.duration], ['priceCents', t.common.price],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                type={key === 'durationMin' || key === 'priceCents' ? 'number' : 'text'}
                value={editForm[key as keyof typeof editForm]}
                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          {editMut.isError && <p className="text-red-600 text-sm">{t.common.error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={() => editMut.mutate()} disabled={editMut.isPending || !editForm.nameAr}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
              {editMut.isPending ? t.common.loading : t.common.save}
            </button>
            <button onClick={() => setEditItem(null)}
              className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Feature Settings Tabs ──────────────────────────────────────────────────

function ToggleSetting({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${checked ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <span>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-1 block text-xs text-slate-500 leading-5">{description}</span>
      </span>
      <span className={`relative mt-1 h-6 w-11 rounded-full transition-colors ${checked ? 'bg-rose-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      </span>
    </label>
  )
}

function FeatureSettingsTab({ branch, feature }: { branch: TenantBranch; feature: 'appointments' | 'expenses' | 'pos' }) {
  const qc = useQueryClient()
  const toast = useToastStore()

  const query = useQuery({
    queryKey: ['admin-feature-settings', branch.id],
    queryFn: () => getAdminFeatureSettings(branch.id),
  })

  const saveMut = useMutation({
    mutationFn: (s: FeatureSettings) => updateAdminFeatureSettings(branch.id, s),
    onSuccess: (data) => {
      qc.setQueryData(['admin-feature-settings', branch.id], data)
      qc.invalidateQueries({ queryKey: ['feature-settings'] })
      toast.success('✓ تم حفظ الإعدادات')
    },
    onError: () => toast.error('فشل حفظ الإعدادات'),
  })

  const settings = query.data ?? defaultFeatureSettings

  const update = (patch: Partial<FeatureSettings>) => {
    saveMut.mutate({ ...settings, ...patch })
  }

  const title = feature === 'appointments' ? 'إعدادات المواعيد' : feature === 'expenses' ? 'إعدادات المصاريف' : 'إعدادات نقطة البيع'
  const description = feature === 'appointments'
    ? 'تحكم بسلوك الحجز والحضور وربط الموعد بالفاتورة بدون تنفيذ حجز من شاشة الإدارة.'
    : feature === 'expenses'
      ? 'تحكم بموافقات المصاريف وطريقة خصم الكاش والتنبيهات بدون إدخال مصروف من شاشة الإدارة.'
      : 'تحكم بقواعد الدفع والفواتير والتبويبات في نقطة البيع.'

  if (query.isLoading) return <p className="text-sm text-slate-400 py-6 text-center">جاري التحميل…</p>

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="mt-1 text-xs text-slate-600">{branch.name} · {description}</p>
        {saveMut.isPending && <p className="mt-1 text-xs text-slate-400">جاري الحفظ…</p>}
      </div>

      {feature === 'appointments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ToggleSetting title="إلزام اختيار العميل" description="لا يتم إنشاء الموعد إلا إذا كان مربوطاً بعميل معروف." checked={settings.appointmentsRequireCustomer} onChange={v => update({ appointmentsRequireCustomer: v })} />
          <ToggleSetting title="منع تضارب المواعيد" description="يمنع حفظ موعد يتداخل مع موعد آخر لنفس الموظفة." checked={settings.appointmentsPreventOverlap} onChange={v => update({ appointmentsPreventOverlap: v })} />
          <ToggleSetting title="تحديث عدم الحضور تلقائياً" description="إذا انتهى وقت الموعد ولم يتم تسجيل حضور، يظهر كـ لم يحضر." checked={settings.appointmentsAutoNoShow} onChange={v => update({ appointmentsAutoNoShow: v })} />
          <ToggleSetting title="إنشاء فاتورة عند تسجيل الحضور" description="عند تسجيل حضور العميل تفتح فاتورة/تاب في نقطة البيع تلقائياً." checked={settings.appointmentsCheckInCreatesInvoice} onChange={v => update({ appointmentsCheckInCreatesInvoice: v })} />
          <ToggleSetting title="إظهار خيار لم يحضر" description="يسمح للموظف بتعليم الموعد كعدم حضور من جدول المواعيد." checked={settings.appointmentsAllowNoShow} onChange={v => update({ appointmentsAllowNoShow: v })} />
          <ToggleSetting title="إظهار خيار إلغاء الموعد" description="يسمح للموظف بإلغاء الموعد من جدول المواعيد حسب الصلاحيات." checked={settings.appointmentsAllowCancel} onChange={v => update({ appointmentsAllowCancel: v })} />
        </div>
      )}

      {feature === 'expenses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ToggleSetting title="المصاريف تحتاج اعتماد" description="المصروف ينتقل لصندوق الوارد حتى يعتمده المسؤول." checked={settings.expensesRequireApproval} onChange={v => update({ expensesRequireApproval: v })} />
          <ToggleSetting title="خصم المصروف النقدي من الكاش" description="إذا كانت طريقة الدفع كاش يتم خصم المبلغ من النقد المتوفر." checked={settings.expensesDeductCash} onChange={v => update({ expensesDeductCash: v })} />
          <ToggleSetting title="تنبيه المسؤولين" description="إظهار إشعار عند وجود مصروفات بانتظار الاعتماد." checked={settings.expensesNotifyApprovers} onChange={v => update({ expensesNotifyApprovers: v })} />
          <ToggleSetting title="مساعدة الذكاء الاصطناعي" description="إتاحة اقتراح التصنيف والوصف عند توفر مفتاح OpenAI." checked={settings.expensesAllowAiAssist} onChange={v => update({ expensesAllowAiAssist: v })} />
        </div>
      )}

      {feature === 'pos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ToggleSetting title="طلب رقم المرجع" description="يطلب رقم العملية عند الدفع بالبطاقة أو التحويل." checked={settings.posRequirePaymentReference} onChange={v => update({ posRequirePaymentReference: v })} />
          <ToggleSetting title="الفاتورة تحتاج موعد/حضور" description="لا يسمح بإنشاء فاتورة بدون موعد أو تسجيل حضور إذا كان الخيار فعالاً." checked={settings.posRequireAppointment} onChange={v => update({ posRequireAppointment: v })} />
          <ToggleSetting title="طباعة تلقائية بعد الدفع" description="يفتح خيار الطباعة مباشرة بعد اكتمال الدفع." checked={settings.posAutoPrintReceipt} onChange={v => update({ posAutoPrintReceipt: v })} />
          <ToggleSetting title="تفعيل تبويبات الفواتير" description="يسمح بوجود أكثر من فاتورة مفتوحة لنفس الوقت في نقطة البيع." checked={settings.posAllowMultipleInvoiceTabs} onChange={v => update({ posAllowMultipleInvoiceTabs: v })} />
        </div>
      )}
    </div>
  )
}
// ─── Main Page ───────────────────────────────────────────────────────────────

type SubTab = 'workspace' | 'users' | 'products' | 'services' | 'appointmentSettings' | 'expenseSettings' | 'posSettings'

export default function TenantAdmin() {
  const t = useT()
  const ta = t.tenantAdmin
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const toast = useToastStore()
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('workspace')
  const [showAddBranch, setShowAddBranch] = useState(false)
  const [branchForm, setBranchForm] = useState({ name: '', code: '', currencyCode: 'AED' })

  const summaryQuery = useQuery({
    queryKey: ['tenant-summary'],
    queryFn: getTenantSummary,
  })

  const branchesQuery = useQuery({
    queryKey: ['tenant-admin-branches', user?.tenantSlug ?? ''],
    queryFn: getTenantBranches,
  })

  useEffect(() => {
    if (branchesQuery.data && branchesQuery.data.length > 0 && !activeBranchId) {
      setActiveBranchId(branchesQuery.data[0].id)
    }
  }, [branchesQuery.data, activeBranchId])

  const addBranchMut = useMutation({
    mutationFn: () => createTenantAdminBranch(branchForm),
    onSuccess: (branch) => {
      qc.invalidateQueries({ queryKey: ['tenant-admin-branches'] })
      setShowAddBranch(false)
      setBranchForm({ name: '', code: '', currencyCode: 'AED' })
      setActiveBranchId(branch.id)
      toast.success(`✓ ${ta.addBranch}`)
    },
  })

  const branches = branchesQuery.data ?? []
  const activeBranch = branches.find(b => b.id === activeBranchId) ?? null
  const summary = summaryQuery.data

  const subTabs: { key: SubTab; label: string }[] = [
    { key: 'workspace', label: 'إعدادات الفرع والطباعة' },
    { key: 'users', label: 'المستخدمون والصلاحيات' },
    { key: 'products', label: 'إعدادات المنتجات' },
    { key: 'services', label: 'إعدادات الخدمات' },
    { key: 'appointmentSettings', label: 'إعدادات المواعيد' },
    { key: 'expenseSettings', label: 'إعدادات المصاريف' },
    { key: 'posSettings', label: 'إعدادات نقطة البيع' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-slate-800">{ta.title}</h1>

      {/* Tenant summary */}
      {summary && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-blue-200 text-xs">{user?.tenantSlug}</p>
              <h2 className="text-xl font-bold">{summary.name}</h2>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-blue-200 text-xs">{ta.licensePlan}</p>
                <p className="font-semibold">{summary.licensePlan}</p>
              </div>
              <div>
                <p className="text-blue-200 text-xs">{ta.licenseStatus}</p>
                <p className="font-semibold">{summary.licenseStatus}</p>
              </div>
              <div>
                <p className="text-blue-200 text-xs">{ta.licenseExpires}</p>
                <p className="font-semibold">{fmtDate(summary.licenseExpiresAt)}</p>
              </div>
              <div>
                <p className="text-blue-200 text-xs">{ta.assignedUsers} / {ta.maxUsers}</p>
                <p className="font-semibold">{summary.assignedUsers} / {summary.maxUsers}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Branch tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-4 pb-0 border-b border-slate-100 overflow-x-auto">
          {branchesQuery.isLoading ? (
            <span className="text-sm text-slate-400 pb-4">{t.common.loading}</span>
          ) : branches.length === 0 ? (
            <span className="text-sm text-slate-400 pb-4">{ta.noBranches}</span>
          ) : (
            branches.map(b => (
              <button
                key={b.id}
                onClick={() => { setActiveBranchId(b.id); setSubTab('workspace') }}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                  activeBranchId === b.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                {b.name}
                {!b.isActive && <span className="ml-1 text-xs text-slate-400">(inactive)</span>}
              </button>
            ))
          )}
          <button
            onClick={() => setShowAddBranch(true)}
            className="ml-auto mb-1 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-50"
          >
            <Plus size={14} /> {ta.addBranch}
          </button>
        </div>

        {activeBranch ? (
          <div className="p-5">
            {/* Sub-tabs */}
            <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1">
              {subTabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSubTab(key)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                    subTab === key
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {subTab === 'workspace' && <WorkspaceTab branch={activeBranch} />}
            {subTab === 'users' && <UsersTab branch={activeBranch} summary={summary} />}
            {subTab === 'products' && user && <ProductsTab tenantSlug={user.tenantSlug} branchId={activeBranch.id} />}
            {subTab === 'services' && user && <ServicesTab tenantSlug={user.tenantSlug} branchId={activeBranch.id} />}
            {subTab === 'appointmentSettings' && <FeatureSettingsTab branch={activeBranch} feature="appointments" />}
            {subTab === 'expenseSettings' && <FeatureSettingsTab branch={activeBranch} feature="expenses" />}
            {subTab === 'posSettings' && <FeatureSettingsTab branch={activeBranch} feature="pos" />}
          </div>
        ) : (
          <div className="p-10 text-center text-slate-400 text-sm">{ta.noBranches}</div>
        )}
      </div>

      {/* Add Branch Modal */}
      <Modal open={showAddBranch} onClose={() => setShowAddBranch(false)} title={ta.addBranch}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{ta.branchName}</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={branchForm.name} onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{ta.branchCode}</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={branchForm.code} onChange={e => setBranchForm(f => ({ ...f, code: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{ta.currencyCode}</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              maxLength={3} value={branchForm.currencyCode}
              onChange={e => setBranchForm(f => ({ ...f, currencyCode: e.target.value.toUpperCase() }))} />
          </div>
          {addBranchMut.isError && <p className="text-red-600 text-sm">{t.common.error}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={() => addBranchMut.mutate()}
              disabled={addBranchMut.isPending || !branchForm.name || !branchForm.code}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
              {addBranchMut.isPending ? t.common.loading : t.common.add}
            </button>
            <button onClick={() => setShowAddBranch(false)}
              className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


