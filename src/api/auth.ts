import client from './client'
import type { LoginResponse, Branch } from '../types'

export async function loginTenant(payload: {
  tenantSlug: string
  branchId?: string
  username: string
  password: string
}): Promise<LoginResponse> {
  const res = await client.post<LoginResponse>('/auth/login', payload)
  return res.data
}

export async function loginTenantPin(payload: {
  tenantSlug: string
  branchId?: string
  username: string
  pin: string
}): Promise<LoginResponse> {
  const res = await client.post<LoginResponse>('/auth/tenant/pin-login', payload)
  return res.data
}

export async function loginPlatform(payload: {
  username: string
  password: string
}): Promise<LoginResponse> {
  const res = await client.post<LoginResponse>('/auth/platform/login', payload)
  return res.data
}

export async function getTenantBranches(tenantSlug: string): Promise<Branch[]> {
  const res = await client.get<Branch[]>(`/auth/tenant/${tenantSlug}/branches`)
  return res.data
}

export async function changePassword(payload: {
  currentPassword: string
  newPassword: string
}): Promise<void> {
  await client.post('/auth/change-password', payload)
}
