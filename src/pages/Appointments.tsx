import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays, List, Plus, Search, Clock, User,
  Wrench, ChevronLeft, ChevronRight, Pencil
} from 'lucide-react'
import {
  getAppointments, getResources, getSchedule,
  createAppointment, updateAppointmentStatus, updateAppointment,
  type AppointmentListItem,
  type AppointmentScheduleEntry,
} from '../api/appointments'
import { getCustomers, createCustomer } from '../api/customers'
import { getServices } from '../api/services'
import { listEmployees } from '../api/employees'
import { useAuthStore } from '../store/authStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { formatShortDate, formatTime as formatDubaiTime, todayInDubaiISO } from '../utils/date'
import { upsertPosDraftTab } from '../utils/posDrafts'

/* helpers */

const STATUS_AR: Record<string, string> = {
  scheduled: 'مجدول',
  confirmed: 'مؤكد',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  no_show: 'لم يحضر',
}

const STATUS_VARIANT: Record<string, 'blue' | 'green' | 'gray' | 'red' | 'yellow'> = {
  scheduled: 'blue',
  confirmed: 'green',
  completed: 'gray',
  cancelled: 'red',
  no_show: 'yellow',
}

const ALL_STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']

const toLocalDatetimeValue = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const todayISO = () => todayInDubaiISO()

const formatTime = (iso: string) =>
  formatDubaiTime(iso, 'ar')

const formatDate = (iso: string) =>
  formatShortDate(iso, 'ar')

const TIMELINE_DEFAULT_START = 7 * 60
const TIMELINE_DEFAULT_END = 23 * 60
const TIMELINE_HOUR_HEIGHT = 76

const pad2 = (value: number) => String(value).padStart(2, '0')

const minutesToTime = (minutes: number) =>
  `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`

const minutesToDatetimeValue = (date: string, minutes: number) =>
  `${date}T${minutesToTime(minutes)}`

const addMinutesToDatetimeValue = (value: string, minutes: number) => {
  const d = new Date(value)
  d.setMinutes(d.getMinutes() + minutes)
  return toLocalDatetimeValue(d.toISOString())
}

const minutesOfDay = (iso: string) => {
  const [, time = '00:00'] = toLocalDatetimeValue(iso).split('T')
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const roundToQuarter = (minutes: number) =>
  Math.round(minutes / 15) * 15

/* empty form */
interface ApptForm {
  customerId: string
  serviceId: string
  resourceName: string
  startAt: string
  endAt: string
  notes: string
}

const emptyForm = (): ApptForm => {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0)
  const end = new Date(now.getTime() + 60 * 60 * 1000)
  return {
    customerId: '', serviceId: '', resourceName: '',
    startAt: toLocalDatetimeValue(now.toISOString()),
    endAt: toLocalDatetimeValue(end.toISOString()),
    notes: '',
  }
}

export default function Appointments() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user, branchId } = useAuthStore()
  const slug = user?.tenantSlug ?? ''

  /* view state */
  const [view, setView] = useState<'list' | 'schedule'>('schedule')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [scheduleDate, setScheduleDate] = useState(todayISO())

  /* modal state */
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<AppointmentListItem | null>(null)
  const [form, setForm] = useState<ApptForm>(emptyForm())
  const [statusModalId, setStatusModalId] = useState<string | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing')
  const [newCustomerForm, setNewCustomerForm] = useState({ fullName: '', phone: '' })

  /* queries */
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['appointments', slug, branchId ?? 'login-branch', page, statusFilter, search],
    queryFn: () => getAppointments(slug, {
      page, pageSize: 15,
      status: statusFilter || undefined,
      q: search || undefined,
    }),
    enabled: !!slug && view === 'list',
    refetchOnWindowFocus: true,
  })

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ['appointments-schedule', slug, branchId ?? 'login-branch', scheduleDate],
    queryFn: () => getSchedule(slug, scheduleDate),
    enabled: !!slug && view === 'schedule',
    refetchOnWindowFocus: true,
  })

  const { data: employees } = useQuery({
    queryKey: ['employees', branchId],
    queryFn: () => listEmployees(branchId!),
    enabled: !!branchId && view === 'schedule',
  })

  const employeeColorByUserId = Object.fromEntries(
    (employees ?? [])
      .filter(em => em.appointmentColor)
      .map(em => [em.id, em.appointmentColor!])
  )

  const { data: resources } = useQuery({
    queryKey: ['appointment-resources', slug, branchId ?? 'login-branch'],
    queryFn: () => getResources(slug),
    enabled: !!slug,
  })

  const { data: customersPage } = useQuery({
    queryKey: ['customers-select', slug, branchId ?? 'login-branch'],
    queryFn: () => getCustomers(slug, { pageSize: 200 }),
    enabled: !!slug && modalOpen,
  })

  const { data: servicesPage } = useQuery({
    queryKey: ['services-select', slug, branchId ?? 'login-branch'],
    queryFn: () => getServices(slug, { pageSize: 200 }),
    enabled: !!slug && modalOpen,
  })

  /* mutations */
  const createMut = useMutation({
    mutationFn: (f: ApptForm) =>
      createAppointment(slug, {
        customerId: f.customerId,
        serviceId: f.serviceId,
        startAt: new Date(f.startAt).toISOString(),
        endAt: new Date(f.endAt).toISOString(),
        resourceName: f.resourceName || undefined,
        notes: f.notes || undefined,
      }),
    onSuccess: () => { invalidate(); closeModal() },
  })

  const updateMut = useMutation({
    mutationFn: (f: ApptForm) =>
      updateAppointment(slug, editItem!.id, {
        customerId: f.customerId,
        serviceId: f.serviceId,
        startAt: new Date(f.startAt).toISOString(),
        endAt: new Date(f.endAt).toISOString(),
        resourceName: f.resourceName || undefined,
        notes: f.notes || undefined,
      }),
    onSuccess: () => { invalidate(); closeModal() },
  })

  const statusMut = useMutation({
    mutationFn: () => updateAppointmentStatus(slug, statusModalId!, newStatus),
    onSuccess: () => { invalidate(); setStatusModalId(null) },
  })

  const markArrivalMut = useMutation({
    mutationFn: async ({ entry, arrived }: { entry: AppointmentScheduleEntry; arrived: boolean }) => {
      const nextStatus = arrived ? 'confirmed' : 'no_show'
      await updateAppointmentStatus(slug, entry.id, nextStatus)

      if (arrived && entry.customerId && entry.serviceId) {
        const priceCents = Math.round((entry.servicePrice ?? 0) * 100)
        upsertPosDraftTab({
          id: `appointment:${entry.id}`,
          appointmentId: entry.id,
          branchId: branchId ?? undefined,
          customerId: entry.customerId,
          customerName: entry.customerName,
          label: entry.customerName || 'عميل موعد',
          items: [{
            itemId: entry.serviceId,
            itemType: 'Service',
            nameAr: entry.serviceName || 'خدمة',
            nameEn: '',
            qty: 1,
            unitPriceCents: priceCents,
          }],
        })
      }

      return { arrived }
    },
    onSuccess: ({ arrived }) => {
      invalidate()
      if (arrived) navigate('/pos')
    },
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['appointments', slug, branchId ?? 'login-branch'] })
    qc.invalidateQueries({ queryKey: ['appointments-schedule', slug, branchId ?? 'login-branch'] })
  }

  /* handlers */
  const resetCustomerMode = () => {
    setCustomerMode('existing')
    setNewCustomerForm({ fullName: '', phone: '' })
  }

  const openCreate = () => {
    setEditItem(null)
    setForm(emptyForm())
    resetCustomerMode()
    setModalOpen(true)
  }

  const openCreateForResource = (resourceName: string, startMinutes?: number) => {
    const startAt = startMinutes == null ? undefined : minutesToDatetimeValue(scheduleDate, startMinutes)
    setEditItem(null)
    setForm({
      ...emptyForm(),
      resourceName,
      ...(startAt ? { startAt, endAt: addMinutesToDatetimeValue(startAt, 60) } : {}),
    })
    resetCustomerMode()
    setModalOpen(true)
  }

  const openEditScheduleEntry = (entry: AppointmentScheduleEntry) => {
    setEditItem({
      ...entry,
      itemCount: 1,
      createdAt: entry.startAt,
    })
    setForm({
      customerId: entry.customerId ?? '',
      serviceId: entry.serviceId ?? '',
      resourceName: entry.resourceName,
      startAt: toLocalDatetimeValue(entry.startAt),
      endAt: toLocalDatetimeValue(entry.endAt),
      notes: entry.notes,
    })
    resetCustomerMode()
    setModalOpen(true)
  }

  const openEdit = (item: AppointmentListItem) => {
    setEditItem(item)
    setForm({
      customerId: item.customerId ?? '',
      serviceId: item.serviceId ?? '',
      resourceName: item.resourceName,
      startAt: toLocalDatetimeValue(item.startAt),
      endAt: toLocalDatetimeValue(item.endAt),
      notes: item.notes,
    })
    resetCustomerMode()
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); resetCustomerMode() }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    let finalForm = form
    if (customerMode === 'new') {
      try {
        const newCustomerId = await createCustomer(slug, {
          fullName: newCustomerForm.fullName,
          phone: newCustomerForm.phone || undefined,
        })
        qc.invalidateQueries({ queryKey: ['customers-select', slug] })
        finalForm = { ...form, customerId: newCustomerId }
      } catch {
        return
      }
    }
    if (editItem) updateMut.mutate(finalForm)
    else createMut.mutate(finalForm)
  }

  const openStatusModal = (item: AppointmentListItem) => {
    setStatusModalId(item.id)
    setNewStatus(item.status)
  }

  const navigateSchedule = (delta: number) => {
    const d = new Date(scheduleDate)
    d.setDate(d.getDate() + delta)
    setScheduleDate(d.toISOString().slice(0, 10))
  }

  const mutError = createMut.error ?? updateMut.error
  const mutErrorMsg = (mutError as { response?: { data?: string } })?.response?.data ?? 'حدث خطأ'

  return (
    <div className="space-y-5">

      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${view === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List size={15} /> قائمة
            </button>
            <button
              onClick={() => setView('schedule')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${view === 'schedule' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <CalendarDays size={15} /> جدول
            </button>
          </div>

          {/* Status filter (list only) */}
          {view === 'list' && (
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setStatusFilter(''); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${statusFilter === '' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                الكل
              </button>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {STATUS_AR[s]}
                </button>
              ))}
            </div>
          )}

          {/* Date nav (schedule only) */}
          {view === 'schedule' && (
            <div className="flex items-center gap-2">
              <button onClick={() => navigateSchedule(-1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                <ChevronRight size={16} />
              </button>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => navigateSchedule(1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setScheduleDate(todayISO())}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200">
                اليوم
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {view === 'list' && (
            <div className="relative w-60">
              <Search size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="بحث..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="w-full border border-gray-300 rounded-lg px-3 pe-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <Button onClick={openCreate}>
            <Plus size={16} />
            حجز موعد
          </Button>
        </div>
      </div>

      {/* list view */}
      {view === 'list' && (
        <Card>
          {listLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" className="text-blue-600" />
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-right">
                    <th className="px-5 py-3 text-xs font-semibold text-gray-500">العميل</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">الخدمة</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">الموظف</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">الوقت</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">الحالة</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(listData?.items ?? []).map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {item.customerName?.[0] ?? '?'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 leading-tight">{item.customerName}</p>
                            {item.customerPhone && (
                              <p className="text-xs text-gray-400">{item.customerPhone}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Wrench size={13} className="text-purple-400 flex-shrink-0" />
                          <div>
                            <p className="text-gray-800 font-medium leading-tight">{item.serviceName}</p>
                            {item.servicePrice != null && (
                              <p className="text-xs text-gray-400">
                                {item.servicePrice.toFixed(2)} {item.currencyCode}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {item.resourceName ? (
                          <div className="flex items-center gap-1.5">
                            <User size={13} className="text-gray-400" />
                            <span className="text-gray-700">{item.resourceName}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">غير محدد</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-gray-700">
                          <Clock size={13} className="text-gray-400" />
                          <div>
                            <p className="text-xs font-medium">{formatDate(item.startAt)}</p>
                            <p className="text-xs text-gray-500">
                              {formatTime(item.startAt)} - {formatTime(item.endAt)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openStatusModal(item)}
                          title="تغيير الحالة"
                        >
                          <Badge variant={STATUS_VARIANT[item.status] ?? 'gray'}>
                            {STATUS_AR[item.status] ?? item.status}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openEdit(item)}
                          className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(listData?.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-14 text-gray-400">
                        <CalendarDays size={36} className="mx-auto mb-2 text-gray-200" />
                        لا توجد مواعيد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {(listData?.total ?? 0) > 15 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                  <p className="text-sm text-gray-500">{listData?.total} موعد</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
                    <Button variant="secondary" size="sm" disabled={(page * 15) >= (listData?.total ?? 0)} onClick={() => setPage(p => p + 1)}>التالي</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* schedule view */}
      {view === 'schedule' && (
        scheduleLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" className="text-blue-600" />
          </div>
        ) : (
          (() => {
            const columns = (scheduleData?.columns ?? []).filter((col) => !col.isUnassigned)
            const visibleColumns = columns.length > 0
              ? columns
              : (scheduleData?.columns ?? []).filter((col) => col.items.length > 0)

            if (visibleColumns.length === 0) {
              return (
                <Card className="py-14 text-center text-gray-400">
                  <CalendarDays size={36} className="mx-auto mb-2 text-gray-200" />
                  لا يوجد موظفين لعرض جدول المواعيد
                </Card>
              )
            }

            const entries = visibleColumns.flatMap((col) => col.items)
            const firstStart = entries.length > 0
              ? Math.min(...entries.map((entry) => minutesOfDay(entry.startAt)))
              : TIMELINE_DEFAULT_START
            const lastEnd = entries.length > 0
              ? Math.max(...entries.map((entry) => minutesOfDay(entry.endAt)))
              : TIMELINE_DEFAULT_END
            const timelineStart = Math.min(TIMELINE_DEFAULT_START, Math.floor(firstStart / 60) * 60)
            const timelineEnd = Math.max(TIMELINE_DEFAULT_END, Math.ceil(lastEnd / 60) * 60)
            const hourMarks = Array.from(
              { length: Math.max(1, (timelineEnd - timelineStart) / 60 + 1) },
              (_, index) => timelineStart + index * 60
            )
            const timelineHeight = ((timelineEnd - timelineStart) / 60) * TIMELINE_HOUR_HEIGHT

            const openFromTimelineClick = (
              event: React.MouseEvent<HTMLDivElement>,
              resourceName: string
            ) => {
              if (event.target !== event.currentTarget) return
              const rect = event.currentTarget.getBoundingClientRect()
              const relativeMinutes = (event.clientY - rect.top) / TIMELINE_HOUR_HEIGHT * 60
              const startMinutes = Math.max(
                timelineStart,
                Math.min(timelineEnd - 15, roundToQuarter(timelineStart + relativeMinutes))
              )
              openCreateForResource(resourceName, startMinutes)
            }

            return (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <div
                    className="min-w-[980px] grid"
                    style={{ gridTemplateColumns: `86px repeat(${visibleColumns.length}, minmax(260px, 1fr))` }}
                  >
                    <div className="border-b border-gray-100 bg-gray-50 px-3 py-3 text-xs font-semibold text-gray-500">
                      الوقت
                    </div>
                    {visibleColumns.map((col) => {
                      const colColor = col.userId ? (employeeColorByUserId[col.userId] ?? '#3B82F6') : '#3B82F6'
                      return (
                        <div key={col.resourceName} className="border-b border-s border-gray-100 px-4 py-3"
                          style={{ backgroundColor: colColor + '18' }}>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                              style={{ backgroundColor: colColor }}>
                              {col.resourceName[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">{col.resourceName}</p>
                              <p className="truncate text-xs text-gray-500">{col.role || `${col.items.length} موعد`}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    <div className="relative bg-gray-50" style={{ height: timelineHeight }}>
                      {hourMarks.slice(0, -1).map((minutes) => (
                        <div
                          key={minutes}
                          className="absolute inset-x-0 border-t border-gray-100 px-3 pt-1 text-xs font-semibold text-gray-500"
                          style={{ top: ((minutes - timelineStart) / 60) * TIMELINE_HOUR_HEIGHT }}
                        >
                          {minutesToTime(minutes)}
                        </div>
                      ))}
                    </div>

                    {visibleColumns.map((col) => {
                      const apptColor = col.userId ? (employeeColorByUserId[col.userId] ?? '#3B82F6') : '#3B82F6'
                      return (<div
                        key={`${col.resourceName}-timeline`}
                        className="relative border-s border-gray-100 bg-white"
                        style={{ height: timelineHeight }}
                        onClick={(event) => openFromTimelineClick(event, col.resourceName)}
                      >
                        {hourMarks.slice(0, -1).map((minutes) => (
                          <div
                            key={`${col.resourceName}-${minutes}`}
                            className="pointer-events-none absolute inset-x-0 border-t border-gray-100"
                            style={{ top: ((minutes - timelineStart) / 60) * TIMELINE_HOUR_HEIGHT }}
                          />
                        ))}

                        {col.items.length === 0 && (
                          <div className="pointer-events-none absolute inset-x-3 top-4 flex h-16 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm font-medium text-gray-300">
                            اضغط داخل العمود لحجز موعد
                          </div>
                        )}

                        {[...col.items]
                          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
                          .map((entry) => {
                            const start = minutesOfDay(entry.startAt)
                            const end = Math.max(start + 30, minutesOfDay(entry.endAt))
                            const top = Math.max(0, ((start - timelineStart) / 60) * TIMELINE_HOUR_HEIGHT)
                            const height = Math.max(48, ((end - start) / 60) * TIMELINE_HOUR_HEIGHT)
                            const isDone = entry.status === 'completed'
                            const isInPOS = entry.status === 'confirmed'
                            const entryColor = isDone ? '#9CA3AF' : apptColor

                            return (
                              <button
                                type="button"
                                key={entry.id}
                                onClick={isDone ? undefined : (event) => {
                                  event.stopPropagation()
                                  openEditScheduleEntry(entry)
                                }}
                                className={`absolute inset-x-3 rounded-lg border p-2 text-start shadow-sm transition-colors
                                  ${isDone ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                                style={{ top, height, borderColor: entryColor + '60', backgroundColor: entryColor + '18' }}
                              >
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold" style={{ color: entryColor }}>
                                    {formatTime(entry.startAt)} - {formatTime(entry.endAt)}
                                  </span>
                                  <Badge variant={STATUS_VARIANT[entry.status] ?? 'gray'}>
                                    {STATUS_AR[entry.status] ?? entry.status}
                                  </Badge>
                                </div>
                                <p className="truncate text-sm font-semibold text-gray-900">{entry.customerName}</p>
                                <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                                  <Wrench size={12} className="text-purple-500" />
                                  <span className="truncate">{entry.serviceName}</span>
                                </div>

                                {isDone ? (
                                  <div className="mt-2 flex items-center gap-1 border-t border-gray-200 pt-2 text-xs font-semibold text-gray-400">
                                    <span>✓ مكتمل</span>
                                  </div>
                                ) : isInPOS ? (
                                  <div className="mt-2 flex items-center gap-1 border-t border-blue-100 pt-2 text-xs font-semibold text-blue-600">
                                    <span>🛒 في الكاشير</span>
                                  </div>
                                ) : (
                                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-blue-100 pt-2">
                                    <label
                                      className="flex items-center justify-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs font-semibold text-green-700"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={false}
                                        disabled={markArrivalMut.isPending}
                                        onChange={(event) => {
                                          event.stopPropagation()
                                          if (event.currentTarget.checked) {
                                            markArrivalMut.mutate({ entry, arrived: true })
                                          }
                                        }}
                                      />
                                      حضر
                                    </label>
                                    <label
                                      className="flex items-center justify-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs font-semibold text-red-700"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={entry.status === 'no_show'}
                                        disabled={markArrivalMut.isPending}
                                        onChange={(event) => {
                                          event.stopPropagation()
                                          if (event.currentTarget.checked) {
                                            markArrivalMut.mutate({ entry, arrived: false })
                                          }
                                        }}
                                      />
                                      لم يحضر
                                    </label>
                                  </div>
                                )}
                              </button>
                            )
                          })}
                      </div>
                    )
                    })}
                  </div>
                </div>
              </Card>
            )
          })()
        )
      )}


      {/* create / edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editItem ? 'تعديل الموعد' : 'حجز موعد جديد'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>إلغاء</Button>
            <Button
              form="appt-form"
              type="submit"
              loading={createMut.isPending || updateMut.isPending}
            >
              {editItem ? 'حفظ التغييرات' : 'تأكيد الحجز'}
            </Button>
          </>
        }
      >
        <form id="appt-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Customer */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">
                العميل <span className="text-red-500">*</span>
              </label>
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setCustomerMode('existing')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors
                    ${customerMode === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  اختر من القائمة
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode('new')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors
                    ${customerMode === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  + عميل جديد
                </button>
              </div>
            </div>

            {customerMode === 'existing' ? (
              <select
                required
                value={form.customerId}
                onChange={(e) => setForm(p => ({ ...p, customerId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">-- اختر العميل --</option>
                {(customersPage?.items ?? []).filter(c => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}{c.phone ? ` - ${c.phone}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2 border border-blue-200 bg-blue-50 rounded-lg p-3">
                <input
                  type="text"
                  required
                  placeholder="الاسم الكامل *"
                  value={newCustomerForm.fullName}
                  onChange={(e) => setNewCustomerForm(p => ({ ...p, fullName: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
                <input
                  type="tel"
                  placeholder="رقم الجوال (اختياري)"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            )}
          </div>

          {/* Service */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الخدمة <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.serviceId}
              onChange={(e) => {
                const svc = servicesPage?.items.find(s => s.id === e.target.value)
                setForm(p => {
                  const start = p.startAt ? new Date(p.startAt) : new Date()
                  const end = new Date(start.getTime() + (svc?.durationMin ?? 60) * 60 * 1000)
                  return { ...p, serviceId: e.target.value, endAt: toLocalDatetimeValue(end.toISOString()) }
                })
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- اختر الخدمة --</option>
              {(servicesPage?.items ?? []).filter(s => s.isActive).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}{s.durationMin ? ` (${s.durationMin} دقيقة)` : ''} - {s.price.toFixed(2)} {s.currencyCode}
                </option>
              ))}
            </select>
          </div>

          {/* Resource (staff) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الموظف المسؤول</label>
            <select
              value={form.resourceName}
              onChange={(e) => setForm(p => ({ ...p, resourceName: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- غير محدد --</option>
              {(resources ?? []).map((r) => (
                <option key={r.userId} value={r.username}>
                  {r.username}{r.role ? ` - ${r.role}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date & time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                وقت البدء <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={form.startAt}
                onChange={(e) => setForm(p => ({ ...p, startAt: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                وقت الانتهاء <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                value={form.endAt}
                onChange={(e) => setForm(p => ({ ...p, endAt: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {(createMut.isError || updateMut.isError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {mutErrorMsg}
            </div>
          )}
        </form>
      </Modal>

      {/* status modal */}
      <Modal
        open={!!statusModalId}
        onClose={() => setStatusModalId(null)}
        title="تغيير حالة الموعد"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusModalId(null)}>إلغاء</Button>
            <Button onClick={() => statusMut.mutate()} loading={statusMut.isPending}>
              حفظ الحالة
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-2">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setNewStatus(s)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all
                ${newStatus === s
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'}`}
            >
              <span className="text-sm font-medium text-gray-800">{STATUS_AR[s]}</span>
              <Badge variant={STATUS_VARIANT[s] ?? 'gray'}>{STATUS_AR[s]}</Badge>
            </button>
          ))}
        </div>
        {statusMut.isError && (
          <p className="text-sm text-red-600 mt-3">حدث خطأ أثناء تحديث الحالة</p>
        )}
      </Modal>
    </div>
  )
}
