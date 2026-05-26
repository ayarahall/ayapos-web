import client from './client'
import type { PagedResult } from '../types'

export interface AppointmentResource {
  userId: string
  username: string
  role: string
}

export interface AppointmentListItem {
  id: string
  customerId?: string
  serviceId?: string
  customerName: string
  customerPhone: string
  serviceName: string
  servicePrice?: number
  currencyCode: string
  resourceName: string
  startAt: string
  endAt: string
  status: string
  notes: string
  itemCount: number
  createdAt: string
}

export interface AppointmentScheduleEntry {
  id: string
  customerId?: string
  serviceId?: string
  customerName: string
  customerPhone: string
  serviceName: string
  servicePrice?: number
  currencyCode: string
  resourceName: string
  startAt: string
  endAt: string
  status: string
  notes: string
}

export interface AppointmentScheduleColumn {
  userId?: string
  resourceName: string
  role: string
  isUnassigned: boolean
  items: AppointmentScheduleEntry[]
}

export interface AppointmentScheduleBoard {
  date: string
  columns: AppointmentScheduleColumn[]
}

export async function getAppointments(
  tenantSlug: string,
  params: {
    page?: number
    pageSize?: number
    status?: string
    q?: string
    dateFrom?: string
    dateTo?: string
  } = {}
): Promise<PagedResult<AppointmentListItem>> {
  const res = await client.get<PagedResult<AppointmentListItem>>(
    `/t/${tenantSlug}/appointments`,
    { params: { page: 1, pageSize: 25, ...params } }
  )
  return res.data
}

export async function getResources(tenantSlug: string): Promise<AppointmentResource[]> {
  const res = await client.get<AppointmentResource[]>(`/t/${tenantSlug}/appointments/resources`)
  return res.data
}

export async function getSchedule(
  tenantSlug: string,
  date?: string
): Promise<AppointmentScheduleBoard> {
  const res = await client.get<AppointmentScheduleBoard>(
    `/t/${tenantSlug}/appointments/schedule`,
    { params: date ? { date } : {} }
  )
  return res.data
}

export async function createAppointment(
  tenantSlug: string,
  payload: {
    customerId: string
    serviceId: string
    startAt: string
    endAt: string
    resourceName?: string
    notes?: string
  }
): Promise<string> {
  const res = await client.post<string>(`/t/${tenantSlug}/appointments`, payload)
  return res.data
}

export async function updateAppointmentStatus(
  tenantSlug: string,
  appointmentId: string,
  status: string,
  branchIdOverride?: string
): Promise<AppointmentListItem> {
  const res = await client.post<AppointmentListItem>(
    `/t/${tenantSlug}/appointments/${appointmentId}/status`,
    { status },
    branchIdOverride ? { headers: { 'X-Branch-Id': branchIdOverride } } : undefined
  )
  return res.data
}

export async function updateAppointment(
  tenantSlug: string,
  appointmentId: string,
  payload: {
    customerId: string
    serviceId: string
    startAt: string
    endAt: string
    resourceName?: string
    notes?: string
  }
): Promise<AppointmentListItem> {
  const res = await client.post<AppointmentListItem>(
    `/t/${tenantSlug}/appointments/${appointmentId}`,
    payload
  )
  return res.data
}
