import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, User, Pencil, Phone, Mail } from 'lucide-react'
import { getCustomers, createCustomer, updateCustomer } from '../api/customers'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import type { Customer } from '../types'

interface CustomerForm { fullName: string; phone: string; email: string; notes: string }
const empty: CustomerForm = { fullName: '', phone: '', email: '', notes: '' }

export default function Customers() {
  const qc = useQueryClient()
  const { user, branchId } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const t = useT()
  const slug = user?.tenantSlug ?? ''

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(empty)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', slug, branchId ?? 'login-branch', page, search],
    queryFn: () => getCustomers(slug, { page, pageSize: 15, search }),
    enabled: !!slug,
  })

  const createMut = useMutation({
    mutationFn: (f: CustomerForm) => createCustomer(slug, { fullName: f.fullName, phone: f.phone || undefined, email: f.email || undefined, notes: f.notes || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers', slug, branchId ?? 'login-branch'] }); close() },
  })

  const updateMut = useMutation({
    mutationFn: (f: CustomerForm) => updateCustomer(slug, editCustomer!.id, { fullName: f.fullName, phone: f.phone || undefined, email: f.email || undefined, notes: f.notes || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers', slug, branchId ?? 'login-branch'] }); close() },
  })

  const close = () => setModalOpen(false)
  const openCreate = () => { setEditCustomer(null); setForm(empty); setModalOpen(true) }
  const openEdit = (c: Customer) => { setEditCustomer(c); setForm({ fullName: c.fullName, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '' }); setModalOpen(true) }
  const f = (k: keyof CustomerForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [k]: e.target.value }))
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (editCustomer) updateMut.mutate(form); else createMut.mutate(form) }

  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input placeholder={t.customers.searchPlaceholder} value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full border border-gray-300 rounded-lg px-3 pe-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <Button onClick={openCreate}><Plus size={16} />{t.customers.addCustomer}</Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-blue-600" /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-right">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">{t.customers.fullName}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">{t.common.phone}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">{t.common.email}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">{t.common.status}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">{t.common.createdAt}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.items ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">{c.fullName[0]}</div>
                        <span className="font-medium text-gray-900">{c.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.phone ? <span className="flex items-center gap-1 text-gray-600"><Phone size={12} />{c.phone}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.email ? <span className="flex items-center gap-1 text-gray-600"><Mail size={12} />{c.email}</span> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.isActive ? 'green' : 'red'}>{c.isActive ? t.common.active : t.common.inactive}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.createdAt).toLocaleDateString(locale)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50"><Pencil size={16} /></button>
                    </td>
                  </tr>
                ))}
                {(data?.items ?? []).length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-12">
                    <User size={32} className="mx-auto mb-2 text-gray-300" />{t.customers.noCustomers}
                  </td></tr>
                )}
              </tbody>
            </table>
            {(data?.total ?? 0) > 15 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">{data?.total}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t.common.prev}</Button>
                  <Button variant="secondary" size="sm" disabled={(page * 15) >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>{t.common.next}</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={close}
        title={editCustomer ? t.customers.editCustomer : t.customers.addCustomer}
        footer={
          <>
            <Button variant="secondary" onClick={close}>{t.common.cancel}</Button>
            <Button form="customer-form" type="submit" loading={createMut.isPending || updateMut.isPending}>
              {editCustomer ? t.common.save : t.common.add}
            </Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
          <Input label={`${t.customers.fullName} *`} value={form.fullName} onChange={f('fullName')} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label={t.common.phone} value={form.phone} onChange={f('phone')} type="tel" />
            <Input label={t.common.email} value={form.email} onChange={f('email')} type="email" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.common.notes}</label>
            <textarea value={form.notes} onChange={f('notes')} rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </form>
      </Modal>
    </div>
  )
}
