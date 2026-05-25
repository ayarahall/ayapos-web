import client from './client'
import type { Tenant, Branch, TenantUser, PlatformOwner } from '../types'

export interface PlatformBranchUser {
  id: string
  branchId: string
  username: string
  role: string
  isActive: boolean
  licensePlan: string
  licenseStatus: string
  licenseStartedAt: string
  licenseExpiresAt: string
  createdAt: string
}

export async function getTenants(): Promise<Tenant[]> {
  const res = await client.get<Tenant[]>('/platform/tenants')
  return res.data
}

export async function createTenant(payload: {
  name: string
  slug: string
  licensePlan?: string
  maxUsers?: number
}): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>('/platform/tenants', payload)
  return res.data
}

export async function updateTenantStatus(tenantId: string, isActive: boolean): Promise<{ id: string; name: string; status: string }> {
  const res = await client.post<{ id: string; name: string; status: string }>(
    `/platform/tenants/${tenantId}/status`,
    { isActive }
  )
  return res.data
}

export async function updateTenantLicense(tenantId: string, payload: {
  licensePlan: string
  maxUsers: number
  licenseStartedAt?: string
  licenseExpiresAt?: string
}): Promise<Tenant> {
  const res = await client.post<Tenant>(`/platform/tenants/${tenantId}/license`, payload)
  return res.data
}

export async function getTenantBranches(tenantId: string): Promise<Branch[]> {
  const res = await client.get<Branch[]>(`/platform/tenants/${tenantId}/branches`)
  return res.data
}

export async function createBranch(
  tenantId: string,
  payload: { name: string; code: string; currencyCode?: string }
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(
    `/platform/tenants/${tenantId}/branches`,
    payload
  )
  return res.data
}

export async function updatePlatformBranch(
  tenantId: string,
  branchId: string,
  payload: { name: string; code: string; currencyCode: string; isActive: boolean }
): Promise<Branch> {
  const res = await client.post<Branch>(`/platform/tenants/${tenantId}/branches/${branchId}`, payload)
  return res.data
}

export async function getTenantUsers(tenantId: string): Promise<TenantUser[]> {
  const res = await client.get<TenantUser[]>(`/platform/tenants/${tenantId}/users`)
  return res.data
}

export async function createTenantUser(
  tenantId: string,
  payload: { username: string; role: string; password?: string; pin?: string }
): Promise<{ id: string }> {
  const res = await client.post<{ id: string }>(
    `/platform/tenants/${tenantId}/users`,
    { licensePlan: 'MONTHLY', ...payload }
  )
  return res.data
}

export async function setTenantUserPassword(
  tenantId: string,
  userId: string,
  password: string
): Promise<void> {
  await client.post(`/platform/tenants/${tenantId}/users/${userId}/password`, { newPassword: password })
}

export async function updateTenantUserLicense(
  tenantId: string,
  userId: string,
  payload: { licensePlan: string; maxUsers?: number; isActive: boolean; licenseStartedAt?: string }
): Promise<TenantUser> {
  const res = await client.post<TenantUser>(`/platform/tenants/${tenantId}/users/${userId}/license`, payload)
  return res.data
}

// Branch Users (platform scope)
export async function getPlatformBranchUsers(tenantId: string, branchId: string): Promise<PlatformBranchUser[]> {
  const res = await client.get<PlatformBranchUser[]>(`/platform/tenants/${tenantId}/branches/${branchId}/users`)
  return res.data
}

export async function createPlatformBranchUser(
  tenantId: string,
  branchId: string,
  payload: { username: string; role: string; password?: string; pin: string; licensePlan?: string }
): Promise<PlatformBranchUser> {
  const res = await client.post<PlatformBranchUser>(
    `/platform/tenants/${tenantId}/branches/${branchId}/users`,
    { licensePlan: 'MONTHLY', ...payload }
  )
  return res.data
}

export async function setPlatformBranchUserPassword(
  tenantId: string, branchId: string, userId: string, newPassword: string
): Promise<void> {
  await client.post(`/platform/tenants/${tenantId}/branches/${branchId}/users/${userId}/password`, { newPassword })
}

export async function updatePlatformBranchUserLicense(
  tenantId: string, branchId: string, userId: string,
  payload: { licensePlan: string; isActive: boolean; licenseStartedAt?: string }
): Promise<PlatformBranchUser> {
  const res = await client.post<PlatformBranchUser>(
    `/platform/tenants/${tenantId}/branches/${branchId}/users/${userId}/license`,
    payload
  )
  return res.data
}

// Platform Owners
export async function getOwners(): Promise<PlatformOwner[]> {
  const res = await client.get<PlatformOwner[]>('/platform/owners')
  return res.data
}

export async function createOwner(payload: {
  username: string
  password: string
  isActive?: boolean
}): Promise<PlatformOwner> {
  const res = await client.post<PlatformOwner>('/platform/owners', { isActive: true, ...payload })
  return res.data
}

export async function updateOwnerStatus(ownerId: string, isActive: boolean): Promise<PlatformOwner> {
  const res = await client.post<PlatformOwner>(`/platform/owners/${ownerId}/status`, { isActive })
  return res.data
}

export async function setOwnerPassword(ownerId: string, newPassword: string): Promise<void> {
  await client.post(`/platform/owners/${ownerId}/password`, { newPassword })
}
