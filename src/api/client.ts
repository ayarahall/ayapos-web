import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const { token, branchId } = useAuthStore.getState()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (branchId) config.headers['X-Branch-Id'] = branchId
  return config
})

client.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    } else {
      const msg: string =
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
