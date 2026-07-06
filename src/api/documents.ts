import client from './client'
import type { PagedResult } from '../types'

export type DocumentType = 'SCANNED_FORM' | 'CERTIFICATE' | 'CONSENT_FORM' | 'REPORT' | 'OTHER'
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'EXTRACTED' | 'REVIEWED' | 'APPROVED' | 'FAILED'
export type LanguageHint = 'ar' | 'en' | 'auto'

export interface DocumentUpload {
  id: string
  documentType: DocumentType
  originalFileName: string
  mimeType: string
  fileSizeBytes: number
  languageHint: LanguageHint
  status: DocumentStatus
  failureReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentAuditLogEntry {
  id: string
  action: string
  actorUserId?: string | null
  detailsJson?: string | null
  createdAt: string
}

export async function getDocuments(
  tenantSlug: string,
  params: { page?: number; pageSize?: number; documentType?: string; status?: string; q?: string } = {}
): Promise<PagedResult<DocumentUpload>> {
  const res = await client.get<PagedResult<DocumentUpload>>(
    `/t/${tenantSlug}/documents`,
    { params: { page: 1, pageSize: 25, ...params } }
  )
  return res.data
}

export async function getDocument(tenantSlug: string, id: string): Promise<DocumentUpload> {
  const res = await client.get<DocumentUpload>(`/t/${tenantSlug}/documents/${id}`)
  return res.data
}

export async function uploadDocument(
  tenantSlug: string,
  file: File,
  options: { documentType?: DocumentType; languageHint?: LanguageHint } = {}
): Promise<DocumentUpload> {
  const formData = new FormData()
  formData.append('file', file)
  if (options.documentType) formData.append('documentType', options.documentType)
  if (options.languageHint) formData.append('languageHint', options.languageHint)

  const res = await client.post<DocumentUpload>(
    `/t/${tenantSlug}/documents`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return res.data
}

// The file endpoint requires the same Authorization header as everything else,
// so a plain <img src="..."> / <a href="..."> won't work — fetch as a blob and
// hand the caller an object URL instead. Caller is responsible for revoking it
// (URL.revokeObjectURL) when done.
export async function getDocumentFileBlobUrl(tenantSlug: string, id: string): Promise<string> {
  const res = await client.get(`/t/${tenantSlug}/documents/${id}/file`, { responseType: 'blob' })
  return URL.createObjectURL(res.data as Blob)
}

export async function getDocumentAuditLog(tenantSlug: string, id: string): Promise<DocumentAuditLogEntry[]> {
  const res = await client.get<DocumentAuditLogEntry[]>(`/t/${tenantSlug}/documents/${id}/audit-log`)
  return res.data
}
