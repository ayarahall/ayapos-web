import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://ayapos-api.onrender.com',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const { token, branchId } = useAuthStore.getState()
  if (token) config.headers.Authorization = `Bearer ${token}`
  // Only inject X-Branch-Id if the caller hasn't already set one explicitly
  if (branchId && !config.headers['X-Branch-Id']) {
    config.headers['X-Branch-Id'] = branchId
  }
  return config
})

client.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error.response?.status
    const method = String(error.config?.method ?? 'get').toLowerCase()
    const isReadOnlyNotFound = status === 404 && method === 'get'
    if (status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    } else if (!isReadOnlyNotFound) {
      const msg: string =
        (typeof error.response?.data === 'string' ? error.response.data : undefined) ??
        error.response?.data?.message ??
        error.response?.data?.error ??
        (status === 403 ? 'ليس لديك صلاحية لهذا الإجراء' :
         status === 404 ? 'العنصر غير موجود' :
         status === 409 ? error.response?.data?.message ?? 'يوجد تعارض في البيانات' :
         'حدث خطأ، يرجى المحاولة مرة أخرى')
      useToastStore.getState().error(msg)
    }
    return Promise.reject(error)
  }
)

export default client
