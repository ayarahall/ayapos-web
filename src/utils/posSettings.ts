export interface PosSettings {
  requirePaymentReference: boolean
}

export const defaultPosSettings: PosSettings = {
  requirePaymentReference: false,
}

export const getPosSettingsKey = (branchId?: string | null) =>
  `ayapos-pos-settings:${branchId ?? 'default'}`

export function loadPosSettings(branchId?: string | null): PosSettings {
  const raw = localStorage.getItem(getPosSettingsKey(branchId))
  if (!raw) return defaultPosSettings

  try {
    return { ...defaultPosSettings, ...JSON.parse(raw) }
  } catch {
    return defaultPosSettings
  }
}

export function savePosSettings(branchId: string | null | undefined, settings: PosSettings) {
  localStorage.setItem(getPosSettingsKey(branchId), JSON.stringify(settings))
}
