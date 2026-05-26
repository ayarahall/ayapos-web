const timeZone = 'Asia/Dubai'

export const appTimeZone = timeZone

export const getLocale = (lang?: string) => (lang === 'ar' ? 'ar-AE' : 'en-AE')

function normalizeApiDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value)
}

export function formatDate(value: string | Date, lang?: string) {
  return new Intl.DateTimeFormat(getLocale(lang), {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(normalizeApiDate(value))
}

export function formatShortDate(value: string | Date, lang?: string) {
  return new Intl.DateTimeFormat(getLocale(lang), {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(normalizeApiDate(value))
}

export function formatDateTime(value: string | Date, lang?: string) {
  return new Intl.DateTimeFormat(getLocale(lang), {
    timeZone,
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
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(normalizeApiDate(value))
}

function dubaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
  }
}

export function todayInDubaiISO() {
  const { year, month, day } = dubaiParts()
  return `${year}-${month}-${day}`
}

export function toDubaiDateTimeValue(date = new Date()) {
  const { year, month, day, hour, minute } = dubaiParts(date)
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function toApiLocalDateTime(value: string) {
  if (!value) return value
  return value.length === 16 ? `${value}:00` : value
}

export function addDaysToISODate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return value.toISOString().slice(0, 10)
}

export function addMinutesToDateTimeValue(value: string, minutes: number) {
  const [datePart, timePart = '00:00'] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, mins] = timePart.split(':').map(Number)
  const next = new Date(year, month - 1, day, hours, mins + minutes, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`
}

export function dateRangeForDubaiDay(date: string) {
  return {
    dateFrom: `${date}T00:00:00`,
    dateTo: `${addDaysToISODate(date, 1)}T00:00:00`,
  }
}