/**
 * utils/api.js — Axios instance with JWT injection, token refresh, and error normalization.
 */
import axios from 'axios'

// Always route through nginx (same origin /api/v1) — never bypass to :8000 directly
const BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api/v1`

export const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 70_000, // 70s — Render free tier cold start takes up to 60s
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
  register:   (body)       => api.post('/auth/register', body),
  login:      (body)       => api.post('/auth/login', body),
  me:         ()           => api.get('/auth/me'),
  googleAuth: (credential) => api.post('/auth/google', { credential }),
}

export const sessionAPI = {
  start:   (body)               => api.post('/session/start', body),
  answer:  (body)               => api.post('/session/answer', body),
  back:    (body)               => api.post('/session/back', body),
  get:     (id, language = '')  => api.get(`/session/${id}`, { params: language ? { language } : {} }),
  abandon: (id)                 => api.delete(`/session/${id}`),
}

export const analysisAPI = {
  get: (sessionId) => api.get(`/analysis/${sessionId}`),
}

// In-memory cache for the analytics endpoint — it's called on Dashboard mount AND
// Analytics mount. A 60-second TTL means the second navigation skips the network
// entirely. Invalidated when a survey completes (call reportAPI.invalidateAnalytics()).
let _analyticsCache = null; // { promise, ts }
const ANALYTICS_TTL = 60_000;

export const reportAPI = {
  history:           (limit = 20, offset = 0) => api.get('/report/history', { params: { limit, offset } }),
  analytics:         (farmId = null)           => api.get('/report/analytics', { params: farmId ? { farm_id: farmId } : {} }),
  dashboard:         (farmId = null)           => api.get('/report/dashboard', { params: farmId ? { farm_id: farmId } : {} }),
  invalidateAnalytics: ()                      => { _analyticsCache = null },
  get:               (sessionId)               => api.get(`/report/${sessionId}`),
  download: async (sessionId, filename = 'aquaponic-report.pdf') => {
    const res = await api.get(`/report/${sessionId}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  },
}

export const cropAPI = {
  list:        ()      => api.get('/crop/list'),
  weather:     (farmId) => api.get(`/crop/weather/${farmId}`),
  analyzeFarm: (body)  => api.post('/crop/analyze-farm', body),
}

export const farmAPI = {
  list:               ()                    => api.get('/farm/'),
  get:                (id)                  => api.get(`/farm/${id}`),
  create:             (body)                => api.post('/farm/', body),
  records:            (farmId)              => api.get(`/farm/${farmId}/records`),
  createWaterReading: (farmId, body)        => api.post(`/farm/${farmId}/water-readings`, body),
  latestSession:      (farmId)              => api.get(`/farm/${farmId}/latest-session`),
  sessions:           (farmId)              => api.get(`/farm/${farmId}/sessions`),
  edit:               (farmId, body)        => api.post(`/farm/${farmId}/edit`, body),
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
      timeout: 90000, // Whisper on CPU can take 40-60s; override global 30s timeout
    })
  },
  correct: (auditId, originalTranscript, correctedTranscript, { language = 'en', questionId = null, sessionId = null } = {}) =>
    api.post('/audio/correct', {
      audit_id: auditId,
      original_transcript: originalTranscript,
      corrected_transcript: correctedTranscript,
      language,
      question_id: questionId,
      session_id: sessionId,
    }),
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
  get: (sessionId, language = '') => api.get(`/land-survey/${sessionId}`, { params: language ? { language } : {} }),
  answer: (body) => api.post('/land-survey/answer', body),
  back: (sessionId) => api.post(`/land-survey/${sessionId}/back`),
  dashboard: (sessionId) => api.get(`/land-survey/${sessionId}/dashboard`),
  exportJson: (sessionId) => api.get(`/land-survey/${sessionId}/export?format=json`),
  exportCsv: (sessionId) => api.get(`/land-survey/${sessionId}/export?format=csv`, { responseType: 'blob' }),
  refreshMarketPrices: (sessionId) => api.post(`/land-survey/${sessionId}/refresh-market-prices`),
  overrideCropPrice: (sessionId, body) => api.post(`/land-survey/${sessionId}/override-crop-price`, body),
  syncSheet: (sessionId) => api.post(`/land-survey/${sessionId}/sync-sheet`),
  lookerUrl: (sessionId) => api.get(`/land-survey/${sessionId}/looker-url`),
}
