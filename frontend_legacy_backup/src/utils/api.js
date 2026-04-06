/**
 * utils/api.js — Axios instance with JWT injection, token refresh, and error normalization.
 */
import axios from 'axios'

const BASE =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000/api/v1`

export const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ── Request: inject Bearer token ─────────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response: handle 401 / normalise errors ───────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${BASE}/auth/refresh`, null, {
            headers: { Authorization: `Bearer ${refresh}` },
          })
          localStorage.setItem('access_token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          original.headers.Authorization = `Bearer ${data.access_token}`
          return api(original)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      }
    }
    const msg = error.response?.data?.detail || error.response?.data?.message || error.message
    return Promise.reject(new Error(Array.isArray(msg) ? msg.map(m => m.msg).join(', ') : msg))
  }
)

// ── Typed helpers ─────────────────────────────────────────────────────────────
export const authAPI = {
  register: (body)  => api.post('/auth/register', body),
  login:    (body)  => api.post('/auth/login', body),
  me:       ()      => api.get('/auth/me'),
}

export const sessionAPI = {
  start:   (body)      => api.post('/session/start', body),
  answer:  (body)      => api.post('/session/answer', body),
  back:    (body)      => api.post('/session/back', body),
  get:     (id)        => api.get(`/session/${id}`),
  abandon: (id)        => api.delete(`/session/${id}`),
}

export const analysisAPI = {
  get: (sessionId) => api.get(`/analysis/${sessionId}`),
}

export const reportAPI = {
  history:  ()          => api.get('/report/history'),
  get:      (sessionId) => api.get(`/report/${sessionId}`, { responseType: 'blob' }),
  download: async (sessionId, filename = 'aquaponic-report.pdf') => {
    const res = await api.get(`/report/${sessionId}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },
}

export const farmAPI = {
  list:             ()               => api.get('/farm/'),
  create:           (body)           => api.post('/farm/', body),
  records:          (farmId)         => api.get(`/farm/${farmId}/records`),
  createWaterReading: (farmId, body) => api.post(`/farm/${farmId}/water-readings`, body),
}

export const iotAPI = {
  devices: () => api.get('/iot/devices'),
}

export const audioAPI = {
  transcribe: async (blob, language = 'en', questionContext = null) => {
    const formData = new FormData()
    formData.append('file', blob, 'audio.webm')
    formData.append('language', language)
    if (questionContext) formData.append('question_context', questionContext)
    
    return api.post('/audio/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  health: () => api.get('/audio/health'),
}

export const financeSheetsAPI = {
  status: (sessionId) => api.get(`/finance/sheets/sync-status?session_id=${encodeURIComponent(sessionId)}`),
  push: (sessionId, expectedSheetVersion = null, force = false) =>
    api.post('/finance/sheets/push', {
      session_id: sessionId,
      expected_sheet_version: expectedSheetVersion,
      force,
    }),
  pullIfChanged: (sessionId, sinceSheetVersion) =>
    api.post('/finance/sheets/pull-if-changed', {
      session_id: sessionId,
      since_sheet_version: sinceSheetVersion,
    }),
}

export const landSurveyAPI = {
  start: (body = {}) => api.post('/land-survey/start', body),
  get: (sessionId) => api.get(`/land-survey/${sessionId}`),
  answer: (body) => api.post('/land-survey/answer', body),
  dashboard: (sessionId) => api.get(`/land-survey/${sessionId}/dashboard`),
  exportJson: (sessionId) => api.get(`/land-survey/${sessionId}/export?format=json`),
  exportCsv: (sessionId) => api.get(`/land-survey/${sessionId}/export?format=csv`, { responseType: 'blob' }),
  syncSheet: (sessionId) => api.post(`/land-survey/${sessionId}/sync-sheet`),
}
