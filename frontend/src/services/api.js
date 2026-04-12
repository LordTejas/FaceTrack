import axios from 'axios'

// In dev mode, Vite proxy handles /api -> localhost:8000
// In production (Tauri bundle), call the backend directly
const isProduction = !window.location.port || window.location.protocol === 'tauri:'
const BASE_URL = isProduction ? 'http://127.0.0.1:8000' : ''

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor to unwrap .data
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    let detail = error.response?.data?.detail
    // FastAPI validation errors return detail as an array of objects
    if (Array.isArray(detail)) {
      detail = detail.map((e) => e.msg || JSON.stringify(e)).join('; ')
    } else if (typeof detail === 'object' && detail !== null) {
      detail = JSON.stringify(detail)
    }
    const message =
      detail ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred'
    return Promise.reject(new Error(message))
  }
)

// Health
export const checkHealth = () => api.get('/health')

// Devices
export const getDevices = () => api.get('/api/devices/')
export const addNetworkCamera = (data) => api.post('/api/devices/', data)
export const deleteDevice = (id) => api.delete(`/api/devices/${id}`)
export const connectDevice = (id) => api.post(`/api/devices/${id}/connect`)
export const disconnectDevice = () => api.post('/api/devices/disconnect')
export const getActiveDevice = () => api.get('/api/devices/active')

// Students
export const getStudents = (params) => api.get('/api/students/', { params })
export const getStudent = (id) => api.get(`/api/students/${id}`)
export const createStudent = (data) => api.post('/api/students/', data)
export const updateStudent = (id, data) => api.put(`/api/students/${id}`, data)
export const deleteStudent = (id) => api.delete(`/api/students/${id}`)
export const captureSample = (studentId) =>
  api.post(`/api/students/${studentId}/samples`)
export const deleteSample = (studentId, sampleId) =>
  api.delete(`/api/students/${studentId}/samples/${sampleId}`)
export const getStudentSamples = (studentId) =>
  api.get(`/api/students/${studentId}/samples`)

// Training
export const startTraining = () => api.post('/api/train/')
export const getTrainingStatus = () => api.get('/api/train/status')

// Sessions
export const getSessions = (params) => api.get('/api/sessions/', { params })
export const createSession = (data) => api.post('/api/sessions/', data)
export const updateSession = (id, data) =>
  api.put(`/api/sessions/${id}`, data)
export const getSession = (id) => api.get(`/api/sessions/${id}`)

// Attendance
export const getAttendance = (params) =>
  api.get('/api/attendance/', { params })
export const createAttendance = (data) => api.post('/api/attendance/', data)
export const deleteAttendance = (id) => api.delete(`/api/attendance/${id}`)
export const exportAttendance = (params) =>
  api.get('/api/attendance/export', { params, responseType: 'blob' })

// Config
export const getConfig = () => api.get('/api/config/')
export const updateConfig = (data) => api.put('/api/config/', data)

export default api
