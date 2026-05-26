import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Settings2, User, Key, Shield, CheckCircle, Printer, CreditCard } from 'lucide-react'
import { changePassword } from '../api/auth'
import { getTenantBranches, getPrintSettings, updatePrintSettings, type PrintSettings } from '../api/tenantAdmin'
import { useAuthStore } from '../store/authStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { ROLE_LABELS } from '../types'
import { defaultPosSettings, loadPosSettings, savePosSettings, type PosSettings } from '../utils/posSettings'

const defaultPrintSettings: PrintSettings = {
  companyName: '', companyLogoUrl: '', companyPhone: '',
  companyAddress: '', companyTaxNumber: '',
  receiptTitle: 'Sales Receipt',
  receiptHeaderLine1: '', receiptHeaderLine2: '', receiptFooterNote: '',
  showBranchNameOnReceipt: true, showCustomerNameOnReceipt: true,
  showPaymentHistoryOnReceipt: true, autoPrintReceiptAfterPayment: false,
}

function ReceiptSettings() {
  const t = useT()
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['tenant-branches'],
    queryFn: () => getTenantBranches(),
  })

  const activeBranchId = selectedBranchId ?? branches[0]?.id ?? null

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['print-settings', activeBranchId],
    queryFn: () => getPrintSettings(activeBranchId!),
    enabled: !!activeBranchId,
  })

  if (branchesLoading) return <div className="flex justify-center py-4"><Spinner size="md" className="text-blue-600" /></div>

  return (
    <Card>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center"><Printer size={16} className="text-green-600" /></div>
          <h3 className="font-semibold text-gray-800">{t.settings.receiptBranding}</h3>
        </div>
        {branches.length > 1 && (
          <select value={activeBranchId ?? ''} onChange={e => setSelectedBranchId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {settingsLoading ? (
        <div className="flex justify-center py-6"><Spinner size="md" className="text-blue-600" /></div>
      ) : activeBranchId ? (
        <ReceiptSettingsForm
          key={activeBranchId}
          activeBranchId={activeBranchId}
          initialSettings={settings ?? defaultPrintSettings}
        />
      ) : (
        <div className="px-5 py-5 text-sm text-gray-500">{t.branches.noBranches}</div>
      )}
    </Card>
  )
}

function PosSettingsPanel() {
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

  const { data: branches = [], isLoading: branchesLoading } = useQuery({
    queryKey: ['tenant-branches', 'pos-settings'],
    queryFn: () => getTenantBranches(),
  })

  const activeBranchId = selectedBranchId ?? branches[0]?.id ?? null

  if (branchesLoading) return <div className="flex justify-center py-4"><Spinner size="md" className="text-blue-600" /></div>

  return (
    <Card>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <CreditCard size={16} className="text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-800">إعدادات نقطة البيع</h3>
        </div>
        {branches.length > 1 && (
          <select value={activeBranchId ?? ''} onChange={e => setSelectedBranchId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {activeBranchId ? (
        <PosSettingsForm key={activeBranchId} activeBranchId={activeBranchId} />
      ) : (
        <div className="px-5 py-5 text-sm text-gray-500">لا توجد فروع</div>
      )}
    </Card>
  )
}

function PosSettingsForm({ activeBranchId }: { activeBranchId: string }) {
  const [form, setForm] = useState<PosSettings>(() => loadPosSettings(activeBranchId))
  const [saved, setSaved] = useState(false)

  const updateForm = (next: PosSettings) => {
    setForm(next)
    savePosSettings(activeBranchId, next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="px-5 py-5 space-y-4">
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700">
          <CheckCircle size={16} />
          <span className="text-sm">تم حفظ إعدادات نقطة البيع</span>
        </div>
      )}

      {([
        { key: 'requirePaymentReference' as const, label: 'طلب رقم المرجع عند الدفع بالبطاقة أو التحويل' },
        { key: 'requireAppointment' as const, label: 'لا يُسمح بإصدار فاتورة إلا بعد حجز موعد أو تسجيل حضور' },
      ]).map(({ key, label }) => (
        <label key={key} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors
          ${form[key] ? 'bg-blue-50 border-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}>
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <div className={`relative w-10 h-5 rounded-full transition-colors ${form[key] ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            <input
              type="checkbox"
              className="sr-only"
              checked={form[key]}
              onChange={e => updateForm({ ...form, [key]: e.target.checked })}
            />
          </div>
        </label>
      ))}
    </div>
  )
}

function ReceiptSettingsForm({
  activeBranchId,
  initialSettings,
}: {
  activeBranchId: string
  initialSettings: PrintSettings
}) {
  const t = useT()
  const [form, setForm] = useState<PrintSettings>(initialSettings)
  const [saved, setSaved] = useState(false)

  const mut = useMutation({
    mutationFn: () => updatePrintSettings(activeBranchId, form),
    onSuccess: (updated) => {
      setForm(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  return (
    <div className="px-5 py-5 space-y-5">
      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700">
          <CheckCircle size={16} />
          <span className="text-sm">{t.settings.savedSettings}</span>
        </div>
      )}

      {/* Company info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label={t.settings.companyName} value={form.companyName ?? ''}
          onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} />
        <Input label={t.settings.companyPhone} value={form.companyPhone ?? ''}
          onChange={e => setForm(p => ({ ...p, companyPhone: e.target.value }))} />
        <Input label={t.settings.companyAddress} value={form.companyAddress ?? ''}
          onChange={e => setForm(p => ({ ...p, companyAddress: e.target.value }))} />
        <Input label={t.settings.companyTaxNumber} value={form.companyTaxNumber ?? ''}
          onChange={e => setForm(p => ({ ...p, companyTaxNumber: e.target.value }))} />
      </div>

      {/* Receipt text */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label={t.settings.receiptTitle} value={form.receiptTitle}
          onChange={e => setForm(p => ({ ...p, receiptTitle: e.target.value }))} />
        <Input label={t.settings.receiptHeaderLine1} value={form.receiptHeaderLine1 ?? ''}
          onChange={e => setForm(p => ({ ...p, receiptHeaderLine1: e.target.value }))} />
        <Input label={t.settings.receiptHeaderLine2} value={form.receiptHeaderLine2 ?? ''}
          onChange={e => setForm(p => ({ ...p, receiptHeaderLine2: e.target.value }))} />
        <Input label={t.settings.receiptFooterNote} value={form.receiptFooterNote ?? ''}
          onChange={e => setForm(p => ({ ...p, receiptFooterNote: e.target.value }))} />
      </div>

      {/* Toggle options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          ['showBranchNameOnReceipt', t.settings.showBranchName],
          ['showCustomerNameOnReceipt', t.settings.showCustomerName],
          ['showPaymentHistoryOnReceipt', t.settings.showPaymentHistory],
          ['autoPrintReceiptAfterPayment', t.settings.autoPrint],
        ] as [keyof PrintSettings, string][]).map(([key, label]) => (
          <label key={key} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors
            ${form[key] ? 'bg-blue-50 border-blue-200' : 'border-gray-200 hover:bg-gray-50'}`}>
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <div className={`relative w-10 h-5 rounded-full transition-colors ${form[key] ? 'bg-blue-600' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              <input type="checkbox" className="sr-only" checked={!!form[key]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} />
            </div>
          </label>
        ))}
      </div>

      {mut.isError && <p className="text-sm text-red-600">{t.common.error}</p>}
      <Button onClick={() => mut.mutate()} loading={mut.isPending}>{t.common.save} {t.settings.receiptBranding}</Button>
    </div>
  )
}

export default function Settings() {
  const { user, branchId } = useAuthStore()
  const t = useT()
  const isTenant = user?.scope === 'tenant'
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' })
  const [pwdSuccess, setPwdSuccess] = useState(false)
  const [pwdError, setPwdError] = useState('')

  const pwdMut = useMutation({
    mutationFn: () => changePassword({ currentPassword: pwdForm.current, newPassword: pwdForm.next }),
    onSuccess: () => {
      setPwdSuccess(true); setPwdForm({ current: '', next: '', confirm: '' }); setPwdError('')
      setTimeout(() => setPwdSuccess(false), 4000)
    },
    onError: () => setPwdError(t.settings.currentPassword + ' ' + t.common.error),
  })

  const handlePwdSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setPwdError('')
    if (pwdForm.next !== pwdForm.confirm) { setPwdError(t.settings.passwordMismatch); return }
    if (pwdForm.next.length < 6) { setPwdError(t.settings.passwordTooShort); return }
    pwdMut.mutate()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Account info */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><User size={16} className="text-blue-600" /></div>
          <h3 className="font-semibold text-gray-800">{t.settings.accountInfo}</h3>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">{t.settings.username}</p>
              <p className="font-semibold text-gray-900">{user?.username}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{t.settings.userRole}</p>
              <Badge variant="blue">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</Badge>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">{t.settings.scope}</p>
              <Badge variant={user?.scope === 'platform' ? 'purple' : 'green'}>
                {user?.scope === 'platform' ? 'Platform' : 'Tenant'}
              </Badge>
            </div>
            {user?.scope === 'tenant' && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Slug</p>
                <p className="font-mono text-gray-900 text-sm">{user.tenantSlug}</p>
              </div>
            )}
          </div>
          {branchId && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
              <p className="text-xs text-blue-600 mb-1 flex items-center gap-1"><Shield size={12} /> Branch ID</p>
              <p className="text-sm font-mono text-blue-900">{branchId}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Change password */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center"><Key size={16} className="text-amber-600" /></div>
          <h3 className="font-semibold text-gray-800">{t.settings.changePassword}</h3>
        </div>
        <form onSubmit={handlePwdSubmit} className="px-5 py-5 space-y-4">
          {pwdSuccess && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-700">
              <CheckCircle size={16} />
              <span className="text-sm">{t.settings.passwordChanged}</span>
            </div>
          )}
          <Input label={t.settings.currentPassword} type="password" value={pwdForm.current}
            onChange={e => setPwdForm(p => ({ ...p, current: e.target.value }))} required />
          <Input label={t.settings.newPassword} type="password" value={pwdForm.next}
            onChange={e => setPwdForm(p => ({ ...p, next: e.target.value }))} required />
          <Input label={t.settings.confirmPassword} type="password" value={pwdForm.confirm}
            onChange={e => setPwdForm(p => ({ ...p, confirm: e.target.value }))} required />
          {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
          <Button type="submit" loading={pwdMut.isPending}>{t.settings.savePassword}</Button>
        </form>
      </Card>

      {/* Receipt & branding (tenant only) */}
      {isTenant && <PosSettingsPanel />}
      {isTenant && <ReceiptSettings />}

      {/* App info */}
      <Card>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center"><Settings2 size={16} className="text-gray-600" /></div>
          <h3 className="font-semibold text-gray-800">{t.settings.appInfo}</h3>
        </div>
        <div className="px-5 py-5 space-y-3 text-sm text-gray-600">
          <div className="flex justify-between"><span className="text-gray-500">{t.settings.version}</span><span className="font-medium">1.0.0</span></div>
          <div className="flex justify-between"><span className="text-gray-500">{t.settings.technology}</span><span className="font-medium">React + .NET 10</span></div>
          <div className="flex justify-between"><span className="text-gray-500">API</span><span className="font-mono text-xs">localhost:5167</span></div>
        </div>
      </Card>
    </div>
  )
}
