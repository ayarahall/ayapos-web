import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, UserCircle2, Calendar, Clock, FileText,
  Layers, CheckCircle2, LogIn, LogOut, Edit2,
} from 'lucide-react'
import {
  listEmployees, getAttendanceSummary, createEmployee, updateEmployee,
  getAttendanceHistory, checkIn, checkOut, markAttendance,
  getShifts, createShift, getLeaves, createLeave, getDocuments, createDocument,
  type Employee, type AttendanceRecord, type EmployeeShift, type EmployeeLeave, type EmployeeDocument,
} from '../api/employees'
import { useT } from '../i18n/useT'
import Modal from '../components/ui/Modal'
import { useToastStore } from '../store/toastStore'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d?: string) { return d ? new Date(d).toLocaleDateString() : '—' }
function fmtTime(d?: string) { return d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }
function todayStr() { return new Date().toISOString().slice(0, 10) }

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, string> = {
    present: 'bg-green-100 text-green-700',
    late: 'bg-yellow-100 text-yellow-700',
    absent: 'bg-red-100 text-red-700',
    off: 'bg-slate-100 text-slate-600',
    leave: 'bg-blue-100 text-blue-700',
  }
  if (!status) return <span className="text-slate-300 text-xs">—</span>
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>{status}</span>
}

// ─── Employee Form ────────────────────────────────────────────────────────────

type EmpForm = {
  fullName: string; phone: string; email: string; employeeCode: string
  jobTitle: string; employmentType: string; salaryType: string
  baseSalary: string; deductionPerLateMinute: string; deductionPerAbsentDay: string
  weeklyOffDays: string; hireDate: string; photoUrl: string; notes: string
  isBookableForAppointments: boolean; trackAttendance: boolean; isActive: boolean
  linkedUserId: string; appointmentColor: string
}

function blankForm(): EmpForm {
  return {
    fullName: '', phone: '', email: '', employeeCode: '', jobTitle: '',
    employmentType: 'employee', salaryType: 'monthly', baseSalary: '',
    deductionPerLateMinute: '', deductionPerAbsentDay: '',
    weeklyOffDays: 'Fri,Sat', hireDate: '', photoUrl: '', notes: '',
    isBookableForAppointments: true, trackAttendance: true, isActive: true, linkedUserId: '',
    appointmentColor: '#3B82F6',
  }
}

function empToForm(e: Employee): EmpForm {
  return {
    fullName: e.fullName, phone: e.phone ?? '', email: e.email ?? '',
    employeeCode: e.employeeCode ?? '', jobTitle: e.jobTitle ?? '',
    employmentType: e.employmentType ?? 'employee', salaryType: e.salaryType ?? 'monthly',
    baseSalary: e.baseSalary?.toString() ?? '', deductionPerLateMinute: e.deductionPerLateMinute?.toString() ?? '',
    deductionPerAbsentDay: e.deductionPerAbsentDay?.toString() ?? '', weeklyOffDays: e.weeklyOffDays ?? '',
    hireDate: e.hireDate ? e.hireDate.slice(0, 10) : '', photoUrl: e.photoUrl ?? '', notes: e.notes ?? '',
    isBookableForAppointments: e.isBookableForAppointments, trackAttendance: e.trackAttendance,
    isActive: e.isActive, linkedUserId: e.linkedUserId ?? '',
    appointmentColor: e.appointmentColor ?? '#3B82F6',
  }
}

function formToPayload(f: EmpForm) {
  return {
    fullName: f.fullName, phone: f.phone || undefined, email: f.email || undefined,
    employeeCode: f.employeeCode || undefined, jobTitle: f.jobTitle || undefined,
    employmentType: f.employmentType, salaryType: f.salaryType,
    baseSalary: f.baseSalary ? parseFloat(f.baseSalary) : undefined,
    deductionPerLateMinute: f.deductionPerLateMinute ? parseFloat(f.deductionPerLateMinute) : undefined,
    deductionPerAbsentDay: f.deductionPerAbsentDay ? parseFloat(f.deductionPerAbsentDay) : undefined,
    weeklyOffDays: f.weeklyOffDays || undefined, hireDate: f.hireDate || undefined,
    photoUrl: f.photoUrl || undefined, notes: f.notes || undefined,
    isBookableForAppointments: f.isBookableForAppointments,
    trackAttendance: f.trackAttendance, isActive: f.isActive,
    linkedUserId: f.linkedUserId ? f.linkedUserId : undefined,
    appointmentColor: f.appointmentColor || undefined,
  }
}

function EmployeeForm({ form, onChange, error }: { form: EmpForm; onChange: (f: EmpForm) => void; error?: boolean }) {
  const t = useT()
  const e = t.employees
  const set = (k: keyof EmpForm, v: string | boolean) => onChange({ ...form, [k]: v })

  const textField = (key: keyof EmpForm, label: string, type = 'text') => (
    <div key={key}>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input type={type} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={form[key] as string} onChange={ev => set(key, ev.target.value)} />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {textField('fullName', e.fullName)}
        {textField('employeeCode', e.employeeCode)}
        {textField('phone', e.phone, 'tel')}
        {textField('email', e.email, 'email')}
        {textField('jobTitle', e.jobTitle)}
        {textField('hireDate', e.hireDate, 'date')}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">{e.employmentType}</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={form.employmentType} onChange={ev => set('employmentType', ev.target.value)}>
            <option value="employee">{e.employmentTypes.employee}</option>
            <option value="freelancer">{e.employmentTypes.freelancer}</option>
            <option value="parttime">{e.employmentTypes.parttime}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">{e.salaryType}</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={form.salaryType} onChange={ev => set('salaryType', ev.target.value)}>
            <option value="monthly">{e.salaryTypes.monthly}</option>
            <option value="daily">{e.salaryTypes.daily}</option>
            <option value="hourly">{e.salaryTypes.hourly}</option>
          </select>
        </div>
        {textField('baseSalary', e.baseSalary, 'number')}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {textField('deductionPerLateMinute', e.deductionPerLateMinute, 'number')}
        {textField('deductionPerAbsentDay', e.deductionPerAbsentDay, 'number')}
        {textField('weeklyOffDays', e.weeklyOffDays)}
        {textField('photoUrl', e.photoUrl)}
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">{e.notes}</label>
        <textarea rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
          value={form.notes} onChange={ev => set('notes', ev.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {([
          ['isBookableForAppointments', e.isBookable],
          ['trackAttendance', e.trackAttendance],
          ['isActive', t.common.active],
        ] as [keyof EmpForm, string][]).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form[key] as boolean}
              onChange={ev => set(key, ev.target.checked)} className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-slate-700">{label}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs text-slate-500">{t.common.appointmentColor}</label>
        <input type="color" value={form.appointmentColor} onChange={ev => set('appointmentColor', ev.target.value)}
          className="w-10 h-8 rounded border border-slate-200 cursor-pointer p-0.5" />
        <span className="text-xs text-slate-400 font-mono">{form.appointmentColor}</span>
      </div>

      {error && <p className="text-red-600 text-sm">{t.common.error}</p>}
    </div>
  )
}

// ─── Detail tabs ──────────────────────────────────────────────────────────────

function AttendanceTab({ branchId, employee }: { branchId: string; employee: Employee }) {
  const t = useT()
  const e = t.employees
  const qc = useQueryClient()
  const toast = useToastStore()
  const [markStatus, setMarkStatus] = useState('present')
  const today = todayStr()

  const historyQ = useQuery({
    queryKey: ['attendance-history', branchId, employee.id],
    queryFn: () => getAttendanceHistory(branchId, employee.id),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['attendance-history', branchId, employee.id] })
    qc.invalidateQueries({ queryKey: ['employees', branchId] })
  }

  const checkInMut = useMutation({
    mutationFn: () => checkIn(branchId, employee.id, { attendanceDate: today }),
    onSuccess: () => { invalidate(); toast.success(`✓ ${e.checkIn}`) },
  })

  const checkOutMut = useMutation({
    mutationFn: () => checkOut(branchId, employee.id, { attendanceDate: today }),
    onSuccess: () => { invalidate(); toast.success(`✓ ${e.checkOut}`) },
  })

  const markMut = useMutation({
    mutationFn: () => markAttendance(branchId, employee.id, { attendanceDate: today, status: markStatus }),
    onSuccess: () => { invalidate(); toast.success(`✓ ${t.common.done}`) },
  })

  const records = historyQ.data ?? []

  return (
    <div className="space-y-4">
      {/* Today controls */}
      <div className="bg-slate-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Today — {today}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => checkInMut.mutate()} disabled={checkInMut.isPending}
            className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
            <LogIn size={14} /> {e.checkIn}
          </button>
          <button onClick={() => checkOutMut.mutate()} disabled={checkOutMut.isPending}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            <LogOut size={14} /> {e.checkOut}
          </button>
          <select value={markStatus} onChange={ev => setMarkStatus(ev.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
            {['present', 'late', 'absent', 'off', 'leave'].map(s => (
              <option key={s} value={s}>{e[s as keyof typeof e] as string}</option>
            ))}
          </select>
          <button onClick={() => markMut.mutate()} disabled={markMut.isPending}
            className="flex items-center gap-1.5 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-100 disabled:opacity-50">
            <CheckCircle2 size={14} /> {e.markAttendance}
          </button>
        </div>
      </div>

      {/* History */}
      {historyQ.isLoading ? <p className="text-slate-400 text-sm">{t.common.loading}</p> : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {records.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">{t.common.noData}</p>
          ) : records.map((r: AttendanceRecord) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xs text-slate-500 w-24 shrink-0">{fmt(r.attendanceDate)}</span>
              <StatusBadge status={r.status} />
              <span className="text-xs text-slate-500">
                {fmtTime(r.checkInAt)} → {fmtTime(r.checkOutAt)}
              </span>
              {r.workedMinutes ? <span className="text-xs text-slate-400 ml-auto">{r.workedMinutes} {e.workedMinutes}</span> : null}
              {r.deductionAmount ? <span className="text-xs text-red-500">-{r.deductionAmount}</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ShiftsTab({ branchId, employee }: { branchId: string; employee: Employee }) {
  const t = useT()
  const e = t.employees
  const qc = useQueryClient()
  const toast = useToastStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', startTime: '09:00', endTime: '17:00', graceMinutes: '5', weeklyPattern: '', effectiveFrom: '', effectiveTo: '', isActive: true })

  const q = useQuery({ queryKey: ['shifts', branchId, employee.id], queryFn: () => getShifts(branchId, employee.id) })

  const addMut = useMutation({
    mutationFn: () => createShift(branchId, employee.id, {
      name: form.name || 'Main Shift', startTime: form.startTime, endTime: form.endTime,
      graceMinutes: parseInt(form.graceMinutes) || 5, weeklyPattern: form.weeklyPattern || undefined,
      effectiveFrom: form.effectiveFrom || undefined, effectiveTo: form.effectiveTo || undefined, isActive: form.isActive,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts', branchId, employee.id] }); setShowAdd(false); toast.success(`✓ ${e.addShift}`) },
  })

  const shifts = q.data ?? []

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={14} /> {e.addShift}
        </button>
      </div>

      {q.isLoading ? <p className="text-slate-400 text-sm">{t.common.loading}</p> : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {shifts.length === 0 ? <p className="text-slate-400 text-sm text-center py-6">{t.common.noData}</p> : shifts.map((s: EmployeeShift) => (
            <div key={s.id} className="px-4 py-3 flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${s.isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">{s.name}</p>
                <p className="text-xs text-slate-500">{s.startTime} → {s.endTime} · Grace: {s.graceMinutes}min</p>
                {s.weeklyPattern && <p className="text-xs text-slate-400">{s.weeklyPattern}</p>}
              </div>
              {s.effectiveFrom && <span className="text-xs text-slate-400">{fmt(s.effectiveFrom)} – {fmt(s.effectiveTo)}</span>}
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={e.addShift}>
        <div className="space-y-3">
          {[
            ['name', e.shiftName], ['startTime', e.startTime], ['endTime', e.endTime],
            ['graceMinutes', e.graceMinutes], ['weeklyPattern', e.weeklyPattern],
            ['effectiveFrom', e.startDate], ['effectiveTo', e.endDate],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-1">{label}</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                type={key === 'effectiveFrom' || key === 'effectiveTo' ? 'date' : key === 'graceMinutes' ? 'number' : 'text'}
                value={form[key as keyof typeof form] as string}
                onChange={ev => setForm(f => ({ ...f, [key]: ev.target.value }))} />
            </div>
          ))}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isActive} onChange={ev => setForm(f => ({ ...f, isActive: ev.target.checked }))} className="w-4 h-4 accent-blue-600" />
            <span className="text-sm">{t.common.active}</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">{t.common.add}</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function LeavesTab({ branchId, employee }: { branchId: string; employee: Employee }) {
  const t = useT()
  const e = t.employees
  const qc = useQueryClient()
  const toast = useToastStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ leaveType: 'leave', startDate: todayStr(), endDate: todayStr(), isPaid: true, notes: '' })

  const q = useQuery({ queryKey: ['leaves', branchId, employee.id], queryFn: () => getLeaves(branchId, employee.id) })

  const addMut = useMutation({
    mutationFn: () => createLeave(branchId, employee.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leaves', branchId, employee.id] }); setShowAdd(false); toast.success(`✓ ${e.addLeave}`) },
  })

  const leaves = q.data ?? []
  const leaveStatusColor: Record<string, string> = { approved: 'bg-green-100 text-green-700', pending: 'bg-yellow-100 text-yellow-700', rejected: 'bg-red-100 text-red-700' }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={14} /> {e.addLeave}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {leaves.length === 0 ? <p className="text-slate-400 text-sm text-center py-6">{t.common.noData}</p> : leaves.map((l: EmployeeLeave) => (
          <div key={l.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800 capitalize">{l.leaveType}</p>
              <p className="text-xs text-slate-500">{fmt(l.startDate)} → {fmt(l.endDate)}</p>
              {l.notes && <p className="text-xs text-slate-400 mt-0.5">{l.notes}</p>}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${l.isPaid ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{l.isPaid ? e.isPaid : 'Unpaid'}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${leaveStatusColor[l.status] ?? 'bg-slate-100 text-slate-600'}`}>{l.status}</span>
          </div>
        ))}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={e.addLeave}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">{e.leaveType}</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.leaveType} onChange={ev => setForm(f => ({ ...f, leaveType: ev.target.value }))}>
              {['annual', 'sick', 'emergency', 'maternity', 'unpaid', 'leave'].map(lt => (
                <option key={lt} value={lt}>{lt.charAt(0).toUpperCase() + lt.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['startDate', e.startDate], ['endDate', e.endDate]].map(([k, l]) => (
              <div key={k}>
                <label className="block text-xs text-slate-500 mb-1">{l}</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  value={form[k as 'startDate' | 'endDate']}
                  onChange={ev => setForm(f => ({ ...f, [k]: ev.target.value }))} />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{t.common.notes}</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={form.notes} onChange={ev => setForm(f => ({ ...f, notes: ev.target.value }))} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isPaid} onChange={ev => setForm(f => ({ ...f, isPaid: ev.target.checked }))} className="w-4 h-4 accent-blue-600" />
            <span className="text-sm">{e.isPaid}</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">{t.common.add}</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function DocumentsTab({ branchId, employee }: { branchId: string; employee: Employee }) {
  const t = useT()
  const e = t.employees
  const qc = useQueryClient()
  const toast = useToastStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', documentType: 'general', fileName: '', fileUrl: '', expiresAt: '' })

  const q = useQuery({ queryKey: ['documents', branchId, employee.id], queryFn: () => getDocuments(branchId, employee.id) })

  const addMut = useMutation({
    mutationFn: () => createDocument(branchId, employee.id, { ...form, expiresAt: form.expiresAt || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents', branchId, employee.id] }); setShowAdd(false); toast.success(`✓ ${e.addDocument}`) },
  })

  const docs = q.data ?? []

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={14} /> {e.addDocument}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {docs.length === 0 ? <p className="text-slate-400 text-sm text-center py-6">{t.common.noData}</p> : docs.map((d: EmployeeDocument) => (
          <div key={d.id} className="px-4 py-3 flex items-center gap-3">
            <FileText size={16} className="text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{d.title}</p>
              <p className="text-xs text-slate-500 capitalize">{d.documentType} {d.fileName ? `· ${d.fileName}` : ''}</p>
            </div>
            {d.expiresAt && (
              <span className={`text-xs ${new Date(d.expiresAt) < new Date() ? 'text-red-500' : 'text-slate-400'}`}>
                {fmt(d.expiresAt)}
              </span>
            )}
            {d.fileUrl && (
              <a href={d.fileUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline">Open</a>
            )}
          </div>
        ))}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={e.addDocument}>
        <div className="space-y-3">
          {[['title', e.docTitle], ['fileName', e.fileName], ['fileUrl', e.fileUrl]].map(([k, l]) => (
            <div key={k}>
              <label className="block text-xs text-slate-500 mb-1">{l}</label>
              <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form[k as keyof typeof form] as string}
                onChange={ev => setForm(f => ({ ...f, [k]: ev.target.value }))} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{e.docType}</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form.documentType} onChange={ev => setForm(f => ({ ...f, documentType: ev.target.value }))}>
                {['general', 'contract', 'id', 'passport', 'certificate', 'visa', 'medical'].map(dt => (
                  <option key={dt} value={dt}>{dt.charAt(0).toUpperCase() + dt.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{e.expiresAt}</label>
              <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                value={form.expiresAt} onChange={ev => setForm(f => ({ ...f, expiresAt: ev.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => addMut.mutate()} disabled={addMut.isPending || !form.title}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">{t.common.add}</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ─── Employee Detail Modal ────────────────────────────────────────────────────

type DetailTab = 'info' | 'attendance' | 'shifts' | 'leaves' | 'documents'

function EmployeeDetailModal({ branchId, employee, onClose }: { branchId: string; employee: Employee; onClose: () => void }) {
  const t = useT()
  const e = t.employees
  const qc = useQueryClient()
  const toast = useToastStore()
  const [tab, setTab] = useState<DetailTab>('info')
  const [form, setForm] = useState<EmpForm>(empToForm(employee))

  const updateMut = useMutation({
    mutationFn: () => updateEmployee(branchId, employee.id, formToPayload(form)),
    onSuccess: (updated) => {
      qc.setQueryData<Employee[]>(['employees', branchId], old => old?.map(em => em.id === updated.id ? updated : em) ?? [])
      qc.invalidateQueries({ queryKey: ['attendance-summary', branchId] })
      toast.success(`✓ ${t.common.saved}`)
      onClose()
    },
  })

  const tabs: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'info', label: e.info, icon: <UserCircle2 size={14} /> },
    { key: 'attendance', label: e.attendance, icon: <Clock size={14} /> },
    { key: 'shifts', label: e.shifts, icon: <Layers size={14} /> },
    { key: 'leaves', label: e.leaves, icon: <Calendar size={14} /> },
    { key: 'documents', label: e.documents, icon: <FileText size={14} /> },
  ]

  return (
    <Modal open onClose={onClose} title={employee.fullName} size="xl">
      {/* Tab bar */}
      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 -mt-1">
        {tabs.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 flex-1 justify-center py-2 text-xs font-medium rounded-lg transition-colors ${tab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div>
          <EmployeeForm form={form} onChange={setForm} error={updateMut.isError} />
          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
            <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
              {updateMut.isPending ? t.common.loading : t.common.save}
            </button>
            <button onClick={onClose} className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
          </div>
        </div>
      )}
      {tab === 'attendance' && <AttendanceTab branchId={branchId} employee={employee} />}
      {tab === 'shifts' && <ShiftsTab branchId={branchId} employee={employee} />}
      {tab === 'leaves' && <LeavesTab branchId={branchId} employee={employee} />}
      {tab === 'documents' && <DocumentsTab branchId={branchId} employee={employee} />}
    </Modal>
  )
}

// ─── Main Employees Tab ───────────────────────────────────────────────────────

export default function EmployeesTab({ branchId }: { branchId: string }) {
  const t = useT()
  const e = t.employees
  const qc = useQueryClient()
  const toast = useToastStore()
  const [selected, setSelected] = useState<Employee | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<EmpForm>(blankForm())
  const [search, setSearch] = useState('')

  const empQ = useQuery({ queryKey: ['employees', branchId], queryFn: () => listEmployees(branchId) })
  const summaryQ = useQuery({ queryKey: ['attendance-summary', branchId], queryFn: () => getAttendanceSummary(branchId) })

  const addMut = useMutation({
    mutationFn: () => createEmployee(branchId, formToPayload(addForm)),
    onSuccess: (emp) => {
      qc.setQueryData<Employee[]>(['employees', branchId], old => [...(old ?? []), emp])
      qc.invalidateQueries({ queryKey: ['attendance-summary', branchId] })
      setShowAdd(false)
      setAddForm(blankForm())
      toast.success(`✓ ${e.addEmployee}`)
    },
  })

  const archiveMut = useMutation({
    mutationFn: (em: Employee) => updateEmployee(branchId, em.id, { ...formToPayload(empToForm(em)), isActive: false }),
    onSuccess: (updated) => {
      qc.setQueryData<Employee[]>(['employees', branchId], old => old?.map(x => x.id === updated.id ? updated : x) ?? [])
      toast.success(`✓ ${t.common.archive}`)
    },
  })

  const employees = (empQ.data ?? []).filter(em =>
    !search || `${em.fullName} ${em.employeeCode ?? ''} ${em.jobTitle ?? ''}`.toLowerCase().includes(search.toLowerCase())
  )

  const summary = summaryQ.data

  return (
    <div className="space-y-4">
      {/* Attendance Summary */}
      {summary && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: e.totalEmployees, value: summary.totalEmployees, color: 'bg-slate-100 text-slate-700' },
            { label: e.present, value: summary.presentCount, color: 'bg-green-100 text-green-700' },
            { label: e.late, value: summary.lateCount, color: 'bg-yellow-100 text-yellow-700' },
            { label: e.absent, value: summary.absentCount, color: 'bg-red-100 text-red-700' },
            { label: e.leave, value: summary.leaveCount, color: 'bg-blue-100 text-blue-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl p-3 ${color} text-center`}>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <input className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
          placeholder={t.common.search} value={search} onChange={ev => setSearch(ev.target.value)} />
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus size={14} /> {e.addEmployee}
        </button>
      </div>

      {/* Employee list */}
      {empQ.isLoading ? <p className="text-slate-400 text-sm">{t.common.loading}</p> : employees.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-8">{e.noEmployees}</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {employees.map(em => (
            <div key={em.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
              onClick={() => setSelected(em)}>
              {/* Color dot + Avatar */}
              <div className="relative shrink-0">
                {em.appointmentColor && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white z-10"
                    style={{ backgroundColor: em.appointmentColor }} />
                )}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
                  {em.photoUrl
                    ? <img src={em.photoUrl} alt={em.fullName} className="w-full h-full object-cover" />
                    : <span className="text-blue-700 font-bold text-sm">{em.fullName.charAt(0).toUpperCase()}</span>}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-800">{em.fullName}</p>
                  {!em.isActive && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{t.common.inactive}</span>}
                  {em.isBookableForAppointments && <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">Bookable</span>}
                </div>
                <p className="text-xs text-slate-500">{em.jobTitle ?? '—'} {em.employeeCode ? `· #${em.employeeCode}` : ''}</p>
              </div>

              {/* Today attendance */}
              <div className="text-right">
                <StatusBadge status={em.todayAttendanceStatus} />
                {em.todayCheckInAt && <p className="text-xs text-slate-400 mt-0.5">{fmtTime(em.todayCheckInAt)}</p>}
              </div>

              {/* Archive button (active employees only) */}
              {em.isActive && (
                <button onClick={ev => { ev.stopPropagation(); if (confirm(t.common.confirmDelete)) archiveMut.mutate(em) }}
                  disabled={archiveMut.isPending}
                  className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 hover:opacity-75 shrink-0">
                  {t.common.archive}
                </button>
              )}

              {/* Edit icon */}
              <Edit2 size={14} className="text-slate-400 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Add Employee Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={e.addEmployee} size="xl">
        <EmployeeForm form={addForm} onChange={setAddForm} error={addMut.isError} />
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
          <button onClick={() => addMut.mutate()} disabled={addMut.isPending || !addForm.fullName}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm disabled:opacity-50">
            {addMut.isPending ? t.common.loading : t.common.add}
          </button>
          <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-200 py-2 rounded-lg text-sm">{t.common.cancel}</button>
        </div>
      </Modal>

      {/* Employee detail modal */}
      {selected && (
        <EmployeeDetailModal
          branchId={branchId}
          employee={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
