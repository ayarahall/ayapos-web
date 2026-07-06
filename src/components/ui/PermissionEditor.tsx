import { useT } from '../../i18n/useT'

// ── Permission tree definition ────────────────────────────────────────────────

export interface PermissionNode {
  key: string
  children?: string[]
}

export const PERMISSION_TREE: PermissionNode[] = [
  { key: 'pos', children: ['pos.discount', 'pos.refund', 'pos.void'] },
  { key: 'products', children: ['products.create', 'products.edit'] },
  { key: 'services', children: ['services.create', 'services.edit'] },
  { key: 'customers', children: ['customers.edit', 'customers.delete'] },
  {
    key: 'appointments',
    children: ['appointments.view_all', 'appointments.create', 'appointments.edit', 'appointments.cancel'],
  },
  {
    key: 'employees',
    children: ['employees.create', 'employees.edit', 'employees.attendance', 'employees.salary'],
  },
  { key: 'expenses', children: ['expenses.create', 'expenses.approve'] },
  { key: 'documents' },
  { key: 'cashier', children: ['cashier.close', 'cashier.history'] },
  { key: 'invoices', children: ['invoices.view_all', 'invoices.edit', 'invoices.refund'] },
  { key: 'reports', children: ['reports.financial', 'reports.staff', 'reports.export'] },
]

// ── Privilege templates ────────────────────────────────────────────────────────

export interface PrivilegeTemplate {
  key: string
  color: string
  permissions: string[]
}

export const PRIVILEGE_TEMPLATES: PrivilegeTemplate[] = [
  {
    key: 'basicCashier',
    color: 'bg-green-100 text-green-700 border-green-200',
    permissions: [
      'pos', 'pos.discount',
      'products', 'services',
      'customers',
      'appointments', 'appointments.create',
      'cashier',
      'invoices',
    ],
  },
  {
    key: 'seniorCashier',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    permissions: [
      'pos', 'pos.discount', 'pos.refund',
      'products', 'products.edit',
      'services', 'services.edit',
      'customers', 'customers.edit',
      'appointments', 'appointments.create', 'appointments.edit',
      'cashier', 'cashier.close',
      'invoices', 'invoices.edit', 'invoices.refund', 'invoices.view_all',
    ],
  },
  {
    key: 'hrStaff',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    permissions: [
      'customers',
      'appointments', 'appointments.view_all', 'appointments.create', 'appointments.edit', 'appointments.cancel',
      'employees', 'employees.create', 'employees.edit', 'employees.attendance',
      'expenses', 'expenses.create',
    ],
  },
  {
    key: 'branchManager',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    permissions: [
      'pos', 'pos.discount', 'pos.refund', 'pos.void',
      'products', 'products.create', 'products.edit',
      'services', 'services.create', 'services.edit',
      'customers', 'customers.edit',
      'appointments', 'appointments.view_all', 'appointments.create', 'appointments.edit', 'appointments.cancel',
      'employees', 'employees.create', 'employees.edit', 'employees.attendance', 'employees.salary',
      'expenses', 'expenses.create', 'expenses.approve',
      'documents',
      'cashier', 'cashier.close', 'cashier.history',
      'invoices', 'invoices.view_all', 'invoices.edit', 'invoices.refund',
      'reports', 'reports.financial', 'reports.staff',
    ],
  },
  {
    key: 'readOnly',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    permissions: [
      'products', 'services', 'customers', 'invoices', 'invoices.view_all', 'reports',
    ],
  },
  {
    key: 'fullAccess',
    color: 'bg-red-100 text-red-700 border-red-200',
    permissions: [
      'pos', 'pos.discount', 'pos.refund', 'pos.void',
      'products', 'products.create', 'products.edit',
      'services', 'services.create', 'services.edit',
      'customers', 'customers.edit', 'customers.delete',
      'appointments', 'appointments.view_all', 'appointments.create', 'appointments.edit', 'appointments.cancel',
      'employees', 'employees.create', 'employees.edit', 'employees.attendance', 'employees.salary',
      'expenses', 'expenses.create', 'expenses.approve',
      'documents',
      'cashier', 'cashier.close', 'cashier.history',
      'invoices', 'invoices.view_all', 'invoices.edit', 'invoices.refund',
      'reports', 'reports.financial', 'reports.staff', 'reports.export',
    ],
  },
]

// ── Helper ────────────────────────────────────────────────────────────────────

function getLabel(key: string, labels: Record<string, string>): string {
  return labels[key] ?? key
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PermissionEditorProps {
  value: string[]
  onChange: (perms: string[]) => void
  username?: string
}

export default function PermissionEditor({ value, onChange, username }: PermissionEditorProps) {
  const t = useT()
  const labels = t.users.permissionLabels as Record<string, string>
  const templateLabels = t.users.permissionTemplates

  function toggle(perm: string) {
    if (value.includes(perm)) {
      onChange(value.filter(p => p !== perm))
    } else {
      onChange([...value, perm])
    }
  }

  function toggleParent(node: PermissionNode) {
    const parentOn = value.includes(node.key)
    if (parentOn) {
      // turn off parent + all children
      const toRemove = new Set([node.key, ...(node.children ?? [])])
      onChange(value.filter(p => !toRemove.has(p)))
    } else {
      // turn on parent only (children can be individually toggled)
      onChange([...value, node.key])
    }
  }

  function applyTemplate(template: PrivilegeTemplate) {
    onChange([...template.permissions])
  }

  const parentChecked = (key: string) => value.includes(key)
  const childChecked = (key: string) => value.includes(key)

  return (
    <div className="space-y-4">
      {/* Username context */}
      {username && (
        <p className="text-sm text-slate-600">
          <span className="font-medium">{username}</span>
        </p>
      )}

      {/* Privilege Templates */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          {t.users.permissions} — Templates
        </p>
        <div className="flex flex-wrap gap-2">
          {PRIVILEGE_TEMPLATES.map(tmpl => (
            <button
              key={tmpl.key}
              onClick={() => applyTemplate(tmpl)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:opacity-80 ${tmpl.color}`}
            >
              {templateLabels[tmpl.key as keyof typeof templateLabels]}
            </button>
          ))}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Permission tree */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {PERMISSION_TREE.map(node => {
          const isOn = parentChecked(node.key)
          return (
            <div key={node.key} className={`rounded-xl border transition-colors ${isOn ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-white'}`}>
              {/* Parent row */}
              <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={() => toggleParent(node)}
                  className="w-4 h-4 accent-blue-600 shrink-0"
                />
                <span className={`text-sm font-semibold ${isOn ? 'text-blue-700' : 'text-slate-700'}`}>
                  {getLabel(node.key, labels)}
                </span>
              </label>

              {/* Children — only visible when parent is on */}
              {isOn && node.children && node.children.length > 0 && (
                <div className="px-4 pb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-blue-100">
                  {node.children.map(child => (
                    <label key={child} className="flex items-center gap-2 cursor-pointer mt-1.5">
                      <input
                        type="checkbox"
                        checked={childChecked(child)}
                        onChange={() => toggle(child)}
                        className="w-3.5 h-3.5 accent-blue-500 shrink-0"
                      />
                      <span className="text-xs text-slate-600">{getLabel(child, labels)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Active count */}
      <p className="text-xs text-slate-400 text-right">
        {value.length} permission{value.length !== 1 ? 's' : ''} selected
      </p>
    </div>
  )
}
