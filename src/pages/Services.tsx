import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Wrench, Pencil, CheckCircle, XCircle, Clock } from 'lucide-react'
import { getServices, createService, updateService } from '../api/services'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import type { ServiceListItem } from '../types'

interface ServiceForm {
  nameAr: string; nameEn: string; durationMin: string
  price: string; currencyCode: string; isActive: boolean
}
const emptyForm: ServiceForm = { nameAr: '', nameEn: '', durationMin: '', price: '', currencyCode: 'AED', isActive: true }

export default function Services() {
  const qc = useQueryClient()
  const { user, branchId } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const t = useT()
  const slug = user?.tenantSlug ?? ''

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editService, setEditService] = useState<ServiceListItem | null>(null)
  const [form, setForm] = useState<ServiceForm>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ['services', slug, branchId ?? 'login-branch', page],
    queryFn: () => getServices(slug, { page, pageSize: 15 }),
    enabled: !!slug,
  })

  const filtered = search.trim()
    ? (data?.items ?? []).filter((s) => s.nameAr?.includes(search) || s.nameEn?.toLowerCase().includes(search.toLowerCase()))
    : (data?.items ?? [])

  const createMut = useMutation({
    mutationFn: (f: ServiceForm) => createService(slug, { nameAr: f.nameAr, nameEn: f.nameEn || undefined, durationMin: f.durationMin ? parseInt(f.durationMin) : undefined, priceCents: Math.round(parseFloat(f.price) * 100), currencyCode: f.currencyCode }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services', slug, branchId ?? 'login-branch'] }); closeModal() },
  })

  const updateMut = useMutation({
    mutationFn: (f: ServiceForm) => updateService(slug, editService!.id, { nameAr: f.nameAr, nameEn: f.nameEn || undefined, durationMin: f.durationMin ? parseInt(f.durationMin) : undefined, isActive: f.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services', slug, branchId ?? 'login-branch'] }); closeModal() },
  })

  const openCreate = () => { setEditService(null); setForm(emptyForm); setModalOpen(true) }
  const openEdit = (s: ServiceListItem) => {
    setEditService(s)
    setForm({ nameAr: s.nameAr ?? '', nameEn: s.nameEn ?? '', durationMin: s.durationMin?.toString() ?? '', price: s.price.toString(), currencyCode: s.currencyCode, isActive: s.isActive })
    setModalOpen(true)
  }
  const closeModal = () => setModalOpen(false)
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (editService) updateMut.mutate(form); else createMut.mutate(form) }
  const f = (k: keyof ServiceForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }))

  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input placeholder={t.services.searchPlaceholder} value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 pe-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <Button onClick={openCreate}><Plus size={16} />{t.services.addService}</Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-blue-600" /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-right">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t.services.title}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t.services.duration}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t.common.price}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t.common.status}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t.common.createdAt}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center">
                          <Wrench size={16} className="text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{s.nameAr}</p>
                          {s.nameEn && <p className="text-xs text-gray-400">{s.nameEn}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.durationMin
                        ? <span className="flex items-center gap-1 text-gray-600"><Clock size={13} className="text-gray-400" />{s.durationMin} {t.services.minutes}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{s.price.toFixed(2)} {s.currencyCode}</td>
                    <td className="px-4 py-3">
                      {s.isActive
                        ? <Badge variant="green"><CheckCircle size={12} className="inline me-1" />{t.common.active}</Badge>
                        : <Badge variant="red"><XCircle size={12} className="inline me-1" />{t.common.inactive}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(s.createdAt).toLocaleDateString(locale)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-purple-600 p-1 rounded hover:bg-purple-50 transition-colors">
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-12">
                    <Wrench size={32} className="mx-auto mb-2 text-gray-300" />
                    {t.services.noServices}
                  </td></tr>
                )}
              </tbody>
            </table>

            {(data?.total ?? 0) > 15 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">{data?.total} — {t.common.page} {page}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t.common.prev}</Button>
                  <Button variant="secondary" size="sm" disabled={(page * 15) >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>{t.common.next}</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={closeModal}
        title={editService ? t.services.editService : t.services.addService}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>{t.common.cancel}</Button>
            <Button form="service-form" type="submit" loading={createMut.isPending || updateMut.isPending}>
              {editService ? t.common.save : t.common.add}
            </Button>
          </>
        }
      >
        <form id="service-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label={`${t.services.nameAr} *`} value={form.nameAr} onChange={f('nameAr')} required />
            <Input label={t.services.nameEn} value={form.nameEn} onChange={f('nameEn')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label={t.services.duration} type="number" min="1" value={form.durationMin} onChange={f('durationMin')} placeholder="30" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.common.currency}</label>
              <select value={form.currencyCode} onChange={f('currencyCode')} disabled={!!editService}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
                <option value="AED">AED</option>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          {!editService && (
            <Input label={`${t.common.price} *`} type="number" step="0.01" min="0" value={form.price} onChange={f('price')} required placeholder="0.00" />
          )}
          {!editService && (
            <p className="text-xs text-amber-600">{t.services.priceNote}</p>
          )}
          {editService && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 rounded text-blue-600" />
              <span className="text-sm text-gray-700">{t.common.active}</span>
            </label>
          )}
          {(createMut.isError || updateMut.isError) && <p className="text-sm text-red-600">{t.common.error}</p>}
        </form>
      </Modal>
    </div>
  )
}
