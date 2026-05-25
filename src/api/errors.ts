import axios from 'axios'

export function getApiErrorMessage(error: unknown, fallback = 'حدث خطأ، يرجى المحاولة مرة أخرى') {
  if (!axios.isAxiosError(error)) return fallback

  const data = error.response?.data
  if (typeof data === 'string' && data.trim()) return data
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (typeof record.message === 'string') return record.message
    if (typeof record.title === 'string') return record.title
    if (typeof record.error === 'string') return record.error
    if (record.errors && typeof record.errors === 'object') {
      const values = Object.values(record.errors as Record<string, unknown>)
      const first = values.flatMap((value) => Array.isArray(value) ? value : [value])[0]
      if (typeof first === 'string') return first
    }
  }

  return error.message || fallback
}
