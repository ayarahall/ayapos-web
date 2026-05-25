import client from './client'

export interface Employee {
  id: string
  branchId: string
  linkedUserId?: string
  linkedUsername?: string
  linkedUserRole?: string
  hasSystemAccess: boolean
  fullName: string
  phone?: string
  email?: string
  employeeCode?: string
  jobTitle?: string
  employmentType?: string
  salaryType?: string
  baseSalary?: number
  deductionPerLateMinute?: number
  deductionPerAbsentDay?: number
  weeklyOffDays?: string
  hireDate?: string
  photoUrl?: string
  notes?: string
  isBookableForAppointments: boolean
  trackAttendance: boolean
  isActive: boolean
  appointmentColor?: string
  todayAttendanceStatus?: string
  todayCheckInAt?: string
  todayCheckOutAt?: string
  todayDeductionAmount: number
}

export interface AttendanceSummary {
  date: string
  totalEmployees: number
  presentCount: number
  lateCount: number
  absentCount: number
  leaveCount: number
  totalDeductions: number
}

export interface AttendanceRecord {
  id: string
  staffId: string
  shiftId?: string
  shiftName?: string
  attendanceDate: string
  checkInAt?: string
  checkOutAt?: string
  status?: string
  lateMinutes?: number
  workedMinutes?: number
  deductionAmount?: number
  notes?: string
}

export interface EmployeeShift {
  id: string
  staffId: string
  name: string
  startTime: string
  endTime: string
  graceMinutes: number
  isActive: boolean
  effectiveFrom?: string
  effectiveTo?: string
  weeklyPattern?: string
}

export interface EmployeeLeave {
  id: string
  staffId: string
  leaveType: string
  startDate: string
  endDate: string
  isPaid: boolean
  status: string
  notes?: string
}

export interface EmployeeDocument {
  id: string
  staffId: string
  title: string
  documentType: string
  fileName?: string
  fileUrl?: string
  expiresAt?: string
}

const base = (branchId: string) => `/tenant-admin/branches/${branchId}/employees`

export async function listEmployees(branchId: string): Promise<Employee[]> {
  const res = await client.get<Employee[]>(base(branchId))
  return res.data
}

export async function getAttendanceSummary(branchId: string, date?: string): Promise<AttendanceSummary> {
  const res = await client.get<AttendanceSummary>(`${base(branchId)}/attendance-summary`, {
    params: date ? { date } : undefined,
  })
  return res.data
}

export async function createEmployee(branchId: string, payload: {
  fullName: string
  phone?: string
  email?: string
  employeeCode?: string
  jobTitle?: string
  employmentType?: string
  salaryType?: string
  baseSalary?: number
  deductionPerLateMinute?: number
  deductionPerAbsentDay?: number
  weeklyOffDays?: string
  hireDate?: string
  photoUrl?: string
  notes?: string
  isBookableForAppointments?: boolean
  trackAttendance?: boolean
  isActive?: boolean
  linkedUserId?: string
  appointmentColor?: string
}): Promise<Employee> {
  const res = await client.post<Employee>(base(branchId), payload)
  return res.data
}

export async function updateEmployee(branchId: string, employeeId: string, payload: {
  fullName: string
  phone?: string
  email?: string
  employeeCode?: string
  jobTitle?: string
  employmentType?: string
  salaryType?: string
  baseSalary?: number
  deductionPerLateMinute?: number
  deductionPerAbsentDay?: number
  weeklyOffDays?: string
  hireDate?: string
  photoUrl?: string
  notes?: string
  isBookableForAppointments?: boolean
  trackAttendance?: boolean
  isActive?: boolean
  linkedUserId?: string
  appointmentColor?: string
}): Promise<Employee> {
  const res = await client.post<Employee>(`${base(branchId)}/${employeeId}`, payload)
  return res.data
}

export async function getAttendanceHistory(branchId: string, employeeId: string, from?: string, to?: string): Promise<AttendanceRecord[]> {
  const res = await client.get<AttendanceRecord[]>(`${base(branchId)}/${employeeId}/attendance`, {
    params: { from, to },
  })
  return res.data
}

export async function checkIn(branchId: string, employeeId: string, payload: { attendanceDate?: string; checkInAt?: string; notes?: string }): Promise<AttendanceRecord> {
  const res = await client.post<AttendanceRecord>(`${base(branchId)}/${employeeId}/attendance/check-in`, payload)
  return res.data
}

export async function checkOut(branchId: string, employeeId: string, payload: { attendanceDate?: string; checkOutAt?: string; notes?: string }): Promise<AttendanceRecord> {
  const res = await client.post<AttendanceRecord>(`${base(branchId)}/${employeeId}/attendance/check-out`, payload)
  return res.data
}

export async function markAttendance(branchId: string, employeeId: string, payload: { attendanceDate: string; status: string; notes?: string }): Promise<AttendanceRecord> {
  const res = await client.post<AttendanceRecord>(`${base(branchId)}/${employeeId}/attendance/mark`, payload)
  return res.data
}

export async function getShifts(branchId: string, employeeId: string): Promise<EmployeeShift[]> {
  const res = await client.get<EmployeeShift[]>(`${base(branchId)}/${employeeId}/shifts`)
  return res.data
}

export async function createShift(branchId: string, employeeId: string, payload: {
  name: string
  startTime: string
  endTime: string
  graceMinutes?: number
  isActive?: boolean
  effectiveFrom?: string
  effectiveTo?: string
  weeklyPattern?: string
}): Promise<EmployeeShift> {
  const res = await client.post<EmployeeShift>(`${base(branchId)}/${employeeId}/shifts`, payload)
  return res.data
}

export async function getLeaves(branchId: string, employeeId: string): Promise<EmployeeLeave[]> {
  const res = await client.get<EmployeeLeave[]>(`${base(branchId)}/${employeeId}/leaves`)
  return res.data
}

export async function createLeave(branchId: string, employeeId: string, payload: {
  leaveType?: string
  startDate: string
  endDate: string
  isPaid?: boolean
  notes?: string
}): Promise<EmployeeLeave> {
  const res = await client.post<EmployeeLeave>(`${base(branchId)}/${employeeId}/leaves`, payload)
  return res.data
}

export async function getDocuments(branchId: string, employeeId: string): Promise<EmployeeDocument[]> {
  const res = await client.get<EmployeeDocument[]>(`${base(branchId)}/${employeeId}/documents`)
  return res.data
}

export async function createDocument(branchId: string, employeeId: string, payload: {
  title: string
  documentType?: string
  fileName?: string
  fileUrl?: string
  expiresAt?: string
}): Promise<EmployeeDocument> {
  const res = await client.post<EmployeeDocument>(`${base(branchId)}/${employeeId}/documents`, payload)
  return res.data
}
