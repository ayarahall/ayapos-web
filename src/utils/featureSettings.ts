export type FeatureSettings = {
  appointmentsRequireCustomer: boolean
  appointmentsPreventOverlap: boolean
  appointmentsAutoNoShow: boolean
  appointmentsCheckInCreatesInvoice: boolean
  appointmentsAllowNoShow: boolean
  appointmentsAllowCancel: boolean
  expensesRequireApproval: boolean
  expensesDeductCash: boolean
  expensesNotifyApprovers: boolean
  expensesAllowAiAssist: boolean
  posRequirePaymentReference: boolean
  posRequireAppointment: boolean
  posAutoPrintReceipt: boolean
  posAllowMultipleInvoiceTabs: boolean
}

export const defaultFeatureSettings: FeatureSettings = {
  appointmentsRequireCustomer: true,
  appointmentsPreventOverlap: true,
  appointmentsAutoNoShow: true,
  appointmentsCheckInCreatesInvoice: true,
  appointmentsAllowNoShow: true,
  appointmentsAllowCancel: true,
  expensesRequireApproval: true,
  expensesDeductCash: true,
  expensesNotifyApprovers: true,
  expensesAllowAiAssist: false,
  posRequirePaymentReference: false,
  posRequireAppointment: false,
  posAutoPrintReceipt: false,
  posAllowMultipleInvoiceTabs: true,
}

export const getFeatureSettingsKey = (branchId: string) => `ayapos-feature-settings:${branchId}`

export function loadFeatureSettings(branchId?: string | null): FeatureSettings {
  if (!branchId || typeof localStorage === 'undefined') return defaultFeatureSettings
  const raw = localStorage.getItem(getFeatureSettingsKey(branchId))
  if (!raw) return defaultFeatureSettings
  try {
    return { ...defaultFeatureSettings, ...JSON.parse(raw) }
  } catch {
    return defaultFeatureSettings
  }
}

export function saveFeatureSettings(branchId: string, settings: FeatureSettings) {
  localStorage.setItem(getFeatureSettingsKey(branchId), JSON.stringify(settings))
  window.dispatchEvent(new CustomEvent('ayapos-feature-settings-updated', { detail: { branchId, settings } }))
}

export function subscribeFeatureSettings(branchId: string | null | undefined, callback: (settings: FeatureSettings) => void) {
  if (!branchId) return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === getFeatureSettingsKey(branchId)) callback(loadFeatureSettings(branchId))
  }
  const onLocalUpdate = (event: Event) => {
    const detail = (event as CustomEvent<{ branchId: string; settings: FeatureSettings }>).detail
    if (detail?.branchId === branchId) callback(detail.settings)
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener('ayapos-feature-settings-updated', onLocalUpdate)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('ayapos-feature-settings-updated', onLocalUpdate)
  }
}
