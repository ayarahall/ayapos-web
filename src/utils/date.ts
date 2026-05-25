const timeZone = 'Asia/Dubai'

export const appTimeZone = timeZone

export const getLocale = (lang?: string) => (lang === 'ar' ? 'ar-AE' : 'en-AE')

function normalizeApiDate(value: string | Date) {
  if (value instanceof Date) return value
  return new Date(value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, ''))
}

export function formatDate(value: string | Date, lang?: string) {
  return new Intl.DateTimeFormat(getLocale(lang), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(normalizeApiDate(value))
}

export function formatShortDate(value: string | Date, lang?: string) {
  return new Intl.DateTimeFormat(getLocale(lang), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(normalizeApiDate(value))
}

export function formatDateTime(value: string | Date, lang?: string) {
  return new Intl.DateTimeFormat(getLocale(lang), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(normalizeApiDate(value))
}

export function formatTime(value: string | Date, lang?: string) {
  return new Intl.DateTimeFormat(getLocale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(normalizeApiDate(value))
}

export function todayInDubaiISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}
