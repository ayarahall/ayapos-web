import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Search, FileText, Eye, History, UploadCloud, ClipboardCheck, RefreshCw, CheckCircle2 } from 'lucide-react'
import {
  getDocuments, uploadDocument, getDocumentFileBlobUrl, getDocumentAuditLog,
  reviewDocument, approveDocument, retryDocument,
  type DocumentType, type LanguageHint, type DocumentStatus, type DocumentUpload,
} from '../api/documents'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import { useT } from '../i18n/useT'
import { useToastStore } from '../store/toastStore'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'

const DOCUMENT_TYPES: DocumentType[] = ['SCANNED_FORM', 'CERTIFICATE', 'CONSENT_FORM', 'REPORT', 'SERVICE_RECEIPT', 'OTHER']
const REVIEW_FIELD_KEYS = ['customerName', 'service', 'price', 'customerPhone', 'changeAmount'] as const
type ReviewFieldKey = typeof REVIEW_FIELD_KEYS[number]
type ReviewForm = Record<ReviewFieldKey, string>
const EMPTY_REVIEW_FORM: ReviewForm = { customerName: '', service: '', price: '', customerPhone: '', changeAmount: '' }

function parseFieldsJson(json?: string | null): ReviewForm {
  const result = { ...EMPTY_REVIEW_FORM }
  if (!json) return result
  try {
    const parsed = JSON.parse(json) as Record<string, string | null | undefined>
    for (const key of REVIEW_FIELD_KEYS) {
      result[key] = parsed[key] ?? ''
    }
  } catch {
    // malformed JSON — fall back to empty form rather than crashing the modal
  }
  return result
}
const LANGUAGE_HINTS: LanguageHint[] = ['auto', 'ar', 'en']
const STATUS_VARIANT: Record<DocumentStatus, 'gray' | 'blue' | 'purple' | 'yellow' | 'green' | 'red'> = {
  PENDING: 'gray',
  PROCESSING: 'blue',
  EXTRACTED: 'purple',
  REVIEWED: 'yellow',
  APPROVED: 'green',
  FAILED: 'red',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Documents() {
  const qc = useQueryClient()
  const { user, branchId } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const t = useT()
  const toast = useToastStore()
  const slug = user?.tenantSlug ?? ''
  const locale = lang === 'ar' ? 'ar-AE' : 'en-AE'

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploadDocType, setUploadDocType] = useState<DocumentType>('OTHER')
  const [uploadLangHint, setUploadLangHint] = useState<LanguageHint>('auto')
  const [auditDocId, setAuditDocId] = useState<string | null>(null)
  const [reviewDoc, setReviewDoc] = useState<DocumentUpload | null>(null)
  const [reviewForm, setReviewForm] = useState<ReviewForm>(EMPTY_REVIEW_FORM)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['documents', slug, branchId ?? 'login-branch', page, search, typeFilter, statusFilter],
    queryFn: () => getDocuments(slug, {
      page, pageSize: 15, q: search || undefined,
      documentType: typeFilter || undefined, status: statusFilter || undefined,
    }),
    enabled: !!slug,
  })

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadDocument(slug, file, { documentType: uploadDocType, languageHint: uploadLangHint }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', slug, branchId ?? 'login-branch'] })
      toast.success(t.documents.uploadSuccess)
    },
  })

  const auditQuery = useQuery({
    queryKey: ['documents-audit-log', slug, auditDocId],
    queryFn: () => getDocumentAuditLog(slug, auditDocId!),
    enabled: !!slug && !!auditDocId,
  })

  const invalidateDocuments = () => qc.invalidateQueries({ queryKey: ['documents', slug, branchId ?? 'login-branch'] })

  const reviewMut = useMutation({
    mutationFn: (fields: ReviewForm) => reviewDocument(slug, reviewDoc!.id, fields),
    onSuccess: (updated) => {
      invalidateDocuments()
      setReviewDoc(updated)
      toast.success(t.documents.reviewSaved)
    },
  })

  const approveMut = useMutation({
    mutationFn: () => approveDocument(slug, reviewDoc!.id),
    onSuccess: () => {
      invalidateDocuments()
      toast.success(t.documents.approved)
      setReviewDoc(null)
    },
  })

  const retryMut = useMutation({
    mutationFn: (id: string) => retryDocument(slug, id),
    onSuccess: () => {
      invalidateDocuments()
      toast.success(t.documents.retrySuccess)
    },
  })

  const handleFile = (file: File | null | undefined) => {
    if (!file) return
    uploadMut.mutate(file)
  }

  const openReview = (doc: DocumentUpload) => {
    setReviewDoc(doc)
    setReviewForm(parseFieldsJson(doc.reviewedFieldsJson ?? doc.extractedFieldsJson))
  }

  const reviewField = (key: ReviewFieldKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setReviewForm((p) => ({ ...p, [key]: e.target.value }))

  const handleViewOriginal = async (id: string) => {
    try {
      const url = await getDocumentFileBlobUrl(slug, id)
      window.open(url, '_blank')
    } catch {
      toast.error(t.common.error)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-72">
          <Search size={16} className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder={t.documents.searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="w-full border border-gray-300 rounded-lg px-3 pe-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t.documents.allTypes}</option>
            {DOCUMENT_TYPES.map((dt) => (
              <option key={dt} value={dt}>{t.documents.types[dt]}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t.documents.allStatuses}</option>
            {(Object.keys(t.documents.statuses) as DocumentStatus[]).map((s) => (
              <option key={s} value={s}>{t.documents.statuses[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={`rounded-xl border-2 border-dashed px-5 py-5 flex items-center gap-4 flex-wrap transition-colors
          ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
      >
        <UploadCloud size={28} className={dragOver ? 'text-blue-500' : 'text-gray-400'} />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-medium text-gray-700">
            {dragOver ? t.documents.dragActive : t.documents.dropHint}
          </p>
        </div>

        <select
          value={uploadDocType}
          onChange={(e) => setUploadDocType(e.target.value as DocumentType)}
          className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          title={t.documents.documentType}
        >
          {DOCUMENT_TYPES.map((dt) => (
            <option key={dt} value={dt}>{t.documents.types[dt]}</option>
          ))}
        </select>
        <select
          value={uploadLangHint}
          onChange={(e) => setUploadLangHint(e.target.value as LanguageHint)}
          className="border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          title={t.documents.languageHint}
        >
          {LANGUAGE_HINTS.map((l) => (
            <option key={l} value={l}>{t.documents.languages[l]}</option>
          ))}
        </select>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          loading={uploadMut.isPending}
          disabled={uploadMut.isPending}
        >
          {uploadMut.isPending ? t.documents.uploading : <><Upload size={16} />{t.documents.uploadDocument}</>}
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-blue-600" /></div>
        ) : (data?.items ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <FileText size={32} className="mb-2" />
            <p className="text-sm">{t.documents.noDocuments}</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-right">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">{t.documents.title}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">{t.documents.documentType}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">{t.documents.fileSize}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">{t.common.status}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500">{t.documents.uploadedAt}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.items ?? []).map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium text-gray-900 truncate max-w-[220px]">{doc.originalFileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{t.documents.types[doc.documentType]}</td>
                    <td className="px-4 py-3 text-gray-600">{formatFileSize(doc.fileSizeBytes)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[doc.status] ?? 'gray'}>{t.documents.statuses[doc.status]}</Badge>
                      {doc.status === 'FAILED' && doc.failureReason && (
                        <p className="text-xs text-red-500 mt-1 max-w-[180px] truncate" title={doc.failureReason}>
                          {doc.failureReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(doc.createdAt).toLocaleString(locale)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleViewOriginal(doc.id)}
                          className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          title={t.documents.viewOriginal}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => setAuditDocId(doc.id)}
                          className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          title={t.documents.auditLog}
                        >
                          <History size={15} />
                        </button>
                        {(doc.status === 'EXTRACTED' || doc.status === 'REVIEWED' || doc.status === 'APPROVED') && (
                          <button
                            onClick={() => openReview(doc)}
                            className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                            title={t.documents.review}
                          >
                            {doc.status === 'APPROVED' ? <CheckCircle2 size={15} className="text-green-500" /> : <ClipboardCheck size={15} />}
                          </button>
                        )}
                        {doc.status === 'FAILED' && (
                          <button
                            onClick={() => retryMut.mutate(doc.id)}
                            disabled={retryMut.isPending}
                            className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-40"
                            title={t.documents.retry}
                          >
                            <RefreshCw size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(data?.total ?? 0) > 15 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">{data?.total} — {t.common.page} {page}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    {t.common.prev}
                  </Button>
                  <Button variant="secondary" size="sm" disabled={(page * 15) >= (data?.total ?? 0)} onClick={() => setPage((p) => p + 1)}>
                    {t.common.next}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Audit log modal */}
      <Modal open={!!auditDocId} onClose={() => setAuditDocId(null)} title={t.documents.auditLog} size="md">
        {auditQuery.isLoading ? (
          <div className="flex justify-center py-8"><Spinner size="md" className="text-blue-600" /></div>
        ) : (auditQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{t.documents.noAuditLog}</p>
        ) : (
          <ul className="space-y-3">
            {(auditQuery.data ?? []).map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 text-sm">
                <History size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-800">{entry.action}</p>
                  <p className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString(locale)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Review / approve modal */}
      <Modal
        open={!!reviewDoc}
        onClose={() => setReviewDoc(null)}
        title={t.documents.reviewTitle}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewDoc(null)}>{t.common.cancel}</Button>
            <Button variant="secondary" onClick={() => reviewMut.mutate(reviewForm)} loading={reviewMut.isPending}>
              {t.documents.saveReview}
            </Button>
            <Button onClick={() => approveMut.mutate()} loading={approveMut.isPending} disabled={reviewDoc?.status === 'APPROVED'}>
              <CheckCircle2 size={16} />{t.documents.approveDocument}
            </Button>
          </>
        }
      >
        {reviewDoc && (
          <div className="space-y-5">
            {!reviewDoc.extractedText && !reviewDoc.extractedFieldsJson && (
              <p className="text-sm text-gray-400">{t.documents.noExtractionYet}</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label={t.documents.customerName} value={reviewForm.customerName} onChange={reviewField('customerName')} />
              <Input label={t.documents.service} value={reviewForm.service} onChange={reviewField('service')} />
              <Input label={t.documents.price} value={reviewForm.price} onChange={reviewField('price')} />
              <Input label={t.documents.customerPhone} value={reviewForm.customerPhone} onChange={reviewField('customerPhone')} />
              <Input label={t.documents.changeAmount} value={reviewForm.changeAmount} onChange={reviewField('changeAmount')} />
            </div>

            {reviewDoc.extractedText && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.documents.extractedTextLabel}</label>
                <textarea
                  readOnly
                  value={reviewDoc.extractedText}
                  rows={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 bg-gray-50 font-mono resize-y"
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
