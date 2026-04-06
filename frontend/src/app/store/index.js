/**
 * store/index.js — Zustand global store.
 * Manages: auth state, active questionnaire session, analysis results.
 */
import { create } from 'zustand'
import { authAPI, sessionAPI, analysisAPI } from '../utils/api'

const ACTIVE_SESSION_KEY = 'active_session_id'
const LAST_COMPLETED_SESSION_KEY = 'last_completed_session_id'
const LAST_FARM_ID_KEY = 'last_farm_id'
const SELECTED_FARM_ID_KEY = 'selected_farm_id'

// ── Auth Slice ────────────────────────────────────────────────────────────────
const authSlice = (set, get) => ({
  user:    null,
  isAuth:  !!localStorage.getItem('access_token'),
  authErr: null,

  login: async (email, password) => {
    set({ authErr: null })
    const { data } = await authAPI.login({ email, password })
    localStorage.setItem('access_token',  data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    const me = await authAPI.me()
    set({ user: me.data, isAuth: true })
  },

  register: async (email, full_name, password) => {
    set({ authErr: null })
    await authAPI.register({ email, full_name, password })
    await get().login(email, password)
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem(ACTIVE_SESSION_KEY)
    localStorage.removeItem(LAST_COMPLETED_SESSION_KEY)
    localStorage.removeItem(LAST_FARM_ID_KEY)
    localStorage.removeItem(SELECTED_FARM_ID_KEY)
    set({ user: null, isAuth: false, session: null, analysis: null })
  },

  fetchMe: async () => {
    try {
      const { data } = await authAPI.me()
      set({ user: data, isAuth: true })
    } catch {
      get().logout()
    }
  },
})

// ── Session Slice ─────────────────────────────────────────────────────────────
const sessionSlice = (set, get) => ({
  session:  null,           // { session_id, status, current_question, progress_answered, progress_total, context }
  loading:  false,
  error:    null,
  analysis: null,

  startSession: async (farmId = null) => {
    set({ loading: true, error: null })
    const effectiveFarmId = farmId
      ?? localStorage.getItem(SELECTED_FARM_ID_KEY)
      ?? localStorage.getItem(LAST_FARM_ID_KEY)
      ?? null
    const { data } = await sessionAPI.start({ farm_id: effectiveFarmId })
    if (effectiveFarmId) {
      localStorage.setItem(SELECTED_FARM_ID_KEY, effectiveFarmId)
    }
    localStorage.setItem(ACTIVE_SESSION_KEY, data.session_id)
    set({ session: data, loading: false })
    return data
  },

  setSelectedFarmId: (farmId) => {
    if (farmId) {
      localStorage.setItem(SELECTED_FARM_ID_KEY, farmId)
    } else {
      localStorage.removeItem(SELECTED_FARM_ID_KEY)
    }
  },

  resumeSession: async () => {
    const sessionId = localStorage.getItem(ACTIVE_SESSION_KEY)
    if (!sessionId) return null

    set({ loading: true, error: null })
    try {
      const { data } = await sessionAPI.get(sessionId)
      set({ session: data, loading: false })
      if (data.status === 'completed') {
        localStorage.removeItem(ACTIVE_SESSION_KEY)
        localStorage.setItem(LAST_COMPLETED_SESSION_KEY, data.session_id)
        await get().fetchAnalysis(data.session_id)
      }
      return data
    } catch {
      localStorage.removeItem(ACTIVE_SESSION_KEY)
      set({ loading: false })
      return null
    }
  },

  submitAnswer: async (questionId, answerText, inputMethod = 'text', confidence = null, voiceMeta = null) => {
    const { session } = get()
    if (!session) return
    set({ loading: true, error: null })
    const { data } = await sessionAPI.answer({
      session_id:       session.session_id,
      question_id:      questionId,
      answer_text:      answerText,
      input_method:     inputMethod,
      confidence_score: confidence,
      voice_meta:       voiceMeta,
    })
    localStorage.setItem(ACTIVE_SESSION_KEY, data.session_id)
    set({ session: data, loading: false })

    // Auto-fetch analysis when session completes
    if (data.status === 'completed') {
      localStorage.removeItem(ACTIVE_SESSION_KEY)
      localStorage.setItem(LAST_COMPLETED_SESSION_KEY, data.session_id)
      await get().fetchAnalysis(data.session_id)
    }
    return data
  },

  restoreSurveyState: async () => {
    const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY)
    if (activeSessionId) {
      return get().resumeSession()
    }

    const lastCompletedSessionId = localStorage.getItem(LAST_COMPLETED_SESSION_KEY)
    if (!lastCompletedSessionId) return null

    set({ loading: true, error: null })
    try {
      const { data } = await sessionAPI.get(lastCompletedSessionId)
      set({ session: data, loading: false })
      if (data.status === 'completed') {
        await get().fetchAnalysis(data.session_id)
      } else if (data.status === 'in_progress') {
        localStorage.setItem(ACTIVE_SESSION_KEY, data.session_id)
      }
      return data
    } catch {
      localStorage.removeItem(LAST_COMPLETED_SESSION_KEY)
      set({ loading: false })
      return null
    }
  },

  goBackQuestion: async () => {
    const { session } = get()
    if (!session) return
    set({ loading: true, error: null })
    const { data } = await sessionAPI.back({ session_id: session.session_id })
    localStorage.setItem(ACTIVE_SESSION_KEY, data.session_id)
    set({ session: data, loading: false, analysis: null })
    return data
  },

  fetchAnalysis: async (sessionId) => {
    set({ loading: true })
    const { data } = await analysisAPI.get(sessionId)
    localStorage.setItem(LAST_COMPLETED_SESSION_KEY, sessionId)
    if (data?.farm_id) {
      localStorage.setItem(LAST_FARM_ID_KEY, data.farm_id)
    }
    set({ analysis: data, loading: false })
    return data
  },

  resetSession: () => {
    localStorage.removeItem(ACTIVE_SESSION_KEY)
    set({ session: null, analysis: null, error: null })
  },
})

// ── UI Slice ──────────────────────────────────────────────────────────────────
const uiSlice = (set) => ({
  sidebarOpen:    true,
  activePage:     'dashboard',
  toasts:         [],
  toggleSidebar:  () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActivePage:  (p) => set({ activePage: p }),
  addToast: (toast) => {
    const id = Date.now()
    set((s) => ({ toasts: [...s.toasts, { id, ...toast }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000)
  },
})

export const useStore = create((...args) => ({
  ...authSlice(...args),
  ...sessionSlice(...args),
  ...uiSlice(...args),
}))
