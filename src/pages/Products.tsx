import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Package, Pencil, CheckCircle, XCircle } from 'lucide-react'
import { getProducts, createProduct, updateProduct } from '../api/products'
import { useAuthStore } from '../store/authStore'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import type { ProductListItem } from '../types'

interface ProductForm {
  nameAr: string; nameEn: string; sku: string; barcode: string
  sellPrice: string; unit: string; currencyCode: string
  trackInventory: boolean; isActive: boolean
}

const emptyForm: ProductForm = {
  nameAr: '', nameEn: '', sku: '', barcode: '',
  sellPrice: '', unit: '', currencyCode: 'AED',
  trackInventory: false, isActive: true,
}

export default function Products() {
  const qc = useQueryClient()
  const { user, branchId } = useAuthStore()
  const t = useT()
  const slug = user?.tenantSlug ?? ''

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<ProductListItem | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ['products', slug, branchId ?? 'login-branch', page, search],
    queryFn: () => getProducts(slug, { page, pageSize: 15, search }),
    enabled: !!slug,
  })

  const createMut = useMutation({
    mutationFn: (f: ProductForm) => createProduct(slug, {
      nameAr: f.nameAr, nameEn: f.nameEn || undefined, sku: f.sku || undefined,
      barcode: f.barcode || undefined, sellPrice: parseFloat(f.sellPrice),
      unit: f.unit || undefined, currencyCode: f.currencyCode, trackInventory: f.trackInventory,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products', slug, branchId ?? 'login-branch'] }); closeModal() },
  })

  const updateMut = useMutation({
    mutationFn: (f: ProductForm) => updateProduct(slug, editProduct!.id, {
      nameAr: f.nameAr, nameEn: f.nameEn || undefined, sku: f.sku || undefined,
      barcode: f.barcode || undefined, sellPrice: parseFloat(f.sellPrice),
      unit: f.unit || undefined, isActive: f.isActive,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products', slug, branchId ?? 'login-branch'] }); closeModal() },
  })

  const openCreate = () => { setEditProduct(null); setForm(emptyForm); setModalOpen(true) }
  const openEdit = (p: ProductListItem) => {
    setEditProduct(p)
    setForm({ nameAr: p.nameAr ?? '', nameEn: p.nameEn ?? '', sku: p.sku ?? '', barcode: p.barcode ?? '', sellPrice: p.sellPrice?.toString() ?? '', unit: p.unit ?? '', currencyCode: p.currencyCode ?? 'AED', trackInventory: p.trackInventory, isActive: p.isActive })
    setModalOpen(true)
  }
  const closeModal = () => setModalOpen(false)
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (editProduct) updateMut.mutate(form); else createMut.mutate(form) }
  const f = (k: keyof ProductForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((prev) => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input placeholder={t.products.searchPlaceholder} value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full border border-gray-300 rounded-lg px-3 pe-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <Button onClick={openCreate}><Plus size={16} />{t.products.addProduct}</Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-blue-600" /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-right">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">{t.common.name}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t.products.sku}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t.products.barcode}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t.common.price}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{t.common.status}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.items ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                          <Package size={16} className="text-blue-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.nameAr}</p>
                          {p.nameEn && <p className="text-xs text-gray-400">{p.nameEn}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{p.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{p.barcode ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{p.sellPrice?.toFixed(2)} {p.currencyCode}</td>
                    <td className="px-4 py-3">
                      {p.isActive
                        ? <Badge variant="green"><CheckCircle size={12} className="inline me-1" />{t.common.active}</Badge>
                        : <Badge variant="red"><XCircle size={12} className="inline me-1" />{t.common.inactive}</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors">
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(data?.items ?? []).length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-12">{t.products.noProducts}</td></tr>
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
        title={editProduct ? t.products.editProduct : t.products.addProduct}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>{t.common.cancel}</Button>
            <Button form="product-form" type="submit" loading={createMut.isPending || updateMut.isPending}>
              {editProduct ? t.common.save : t.common.add}
            </Button>
          </>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label={`${t.products.nameAr} *`} value={form.nameAr} onChange={f('nameAr')} required />
            <Input label={t.products.nameEn} value={form.nameEn} onChange={f('nameEn')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label={t.products.sku} value={form.sku} onChange={f('sku')} />
            <Input label={t.products.barcode} value={form.barcode} onChange={f('barcode')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label={`${t.common.price} *`} type="number" step="0.01" value={form.sellPrice} onChange={f('sellPrice')} required />
            <Input label="Unit" value={form.unit} onChange={f('unit')} placeholder="pcs / kg / L" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.common.currency}</label>
              <select value={form.currencyCode} onChange={f('currencyCode')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="AED">AED</option>
                <option value="SAR">SAR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="flex flex-col gap-3 justify-center pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.trackInventory}
                  onChange={(e) => setForm(p => ({ ...p, trackInventory: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600" />
                <span className="text-sm text-gray-700">{t.products.trackInventory}</span>
              </label>
              {editProduct && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive}
                    onChange={(e) => setForm(p => ({ ...p, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded text-blue-600" />
                  <span className="text-sm text-gray-700">{t.products.isActive}</span>
                </label>
              )}
            </div>
          </div>
          {(createMut.error || updateMut.error) && <p className="text-sm text-red-600">{t.common.error}</p>}
        </form>
      </Modal>
    </div>
  )
}
