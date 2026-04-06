import { useState, useRef, useCallback } from 'react'

function applyDomainCorrections(text) {
  // Keep casing/punctuation as much as possible; only normalize aquaponics vocabulary.
  let t = String(text || '')
  t = t.replace(/\b(hydroponic|aquaponic)\b/gi, 'aquaponics')
  t = t.replace(/\bmedia\s+(video|bead|bid|bad|vet|bet|bread)\b/gi, 'media bed')
  t = t.replace(/\b(till|tell|app|apia|telepathy|talapia|tilapya|tila\s+pia|tilapiya|telapia|to lapia)\b/gi, 'tilapia')
  t = t.replace(/\b(troat|trowt|traut)\b/gi, 'trout')
  t = t.replace(/\b(kaarp|carf|cap)\b/gi, 'carp')
  t = t.replace(/\b(barry|mundi|bear a monday|barra|baramundi|baramandi|barramandy|barramundy|barramundi)\b/gi, 'barramundi')
  t = t.replace(/\b(parch|purch|persh)\b/gi, 'perch')
  t = t.replace(/\b(samon|salman)\b/gi, 'salmon')
  t = t.replace(/\b(nft|empty|an empty|and ft|n f t)\b/gi, 'nft')
  t = t.replace(/\b(dwc|do you see|deep water)\b/gi, 'dwc')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

function resolveDefaultBackendUrl() {
  const envBase = import.meta.env.VITE_API_URL
  if (envBase && typeof envBase === 'string') {
    return `${envBase.replace(/\/$/, '')}/audio/transcribe`
  }
  if (typeof window === 'undefined') return 'http://localhost:8000/api/v1/audio/transcribe'
  return `${window.location.protocol}//${window.location.hostname}:8000/api/v1/audio/transcribe`
}

function getRecorderMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder?.isTypeSupported) return null
  const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return preferred.find((t) => window.MediaRecorder.isTypeSupported(t)) || null
}

function extensionFromMime(mimeType) {
  if (!mimeType) return 'webm'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

export function useVoiceRecorder({
  onResult,
  onInterim,
  phraseHints = [],
  questionId,
  autoStopMs = 7000,
  backendUrl = resolveDefaultBackendUrl(),
} = {}) {
  const [isListening, setIsListening] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [confidence, setConfidence] = useState(null)
  const [auditId, setAuditId] = useState('')
  const [alternatives, setAlternatives] = useState([])
  const [interpretation, setInterpretation] = useState(null)
  const [entityConfidence, setEntityConfidence] = useState(null)
  const [error, setError] = useState(null)
  const [micPermission, setMicPermission] = useState('unknown')

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const autoStopTimerRef = useRef(null)

  const supported = typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator?.mediaDevices?.getUserMedia

  const questionContext = Array.isArray(phraseHints)
    ? phraseHints.filter(Boolean).join('. ')
    : phraseHints

  const requestPermission = useCallback(async () => {
    if (!supported) {
      setMicPermission('unavailable')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      setMicPermission('granted')
      stream.getTracks().forEach((track) => track.stop())
      return true
    } catch {
      setMicPermission('denied')
      return false
    }
  }, [supported])

  const start = useCallback(async () => {
    if (isListening || isProcessing || isStarting) return
    if (!supported) {
      setMicPermission('unavailable')
      setError('Audio recording is not supported in this browser. Use Chrome or Edge.')
      return
    }

    try {
      setIsStarting(true)
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      setMicPermission('granted')

      const mimeType = getRecorderMimeType()
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstart = () => {
        setIsStarting(false)
        setIsListening(true)
        setError(null)
        setTranscript('')
        setFinalTranscript('')
        setConfidence(null)
        setAuditId('')
        setAlternatives([])
        setInterpretation(null)
        setEntityConfidence(null)
      }

      mediaRecorder.onstop = async () => {
        setIsListening(false)
        if (autoStopTimerRef.current) {
          clearTimeout(autoStopTimerRef.current)
          autoStopTimerRef.current = null
        }

        if (!audioChunksRef.current.length) {
          setError('No audio captured. Please try again.')
          streamRef.current?.getTracks()?.forEach((track) => track.stop())
          streamRef.current = null
          return
        }

        setIsProcessing(true)
        const recordedMime = mediaRecorderRef.current?.mimeType || getRecorderMimeType() || 'audio/webm'
        const extension = extensionFromMime(recordedMime)
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedMime })
        const formData = new FormData()
        formData.append('file', audioBlob, `recording.${extension}`)
        formData.append('language', 'en')
        if (questionContext) formData.append('question_context', questionContext)
        if (questionId) formData.append('question_id', questionId)
        const token = localStorage.getItem('access_token')
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined

        try {
          const response = await fetch(backendUrl, {
            method: 'POST',
            body: formData,
            headers,
          })
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}))
            const message = payload?.detail || payload?.message || `Transcription failed (${response.status})`
            throw new Error(message)
          }

          const data = await response.json()
          const text = applyDomainCorrections(data?.text || '')
          setTranscript(text)
          setFinalTranscript(text)
          const conf = Number(data?.confidence ?? 1)
          setConfidence(conf)
          setAuditId(data?.audit_id || '')
          setInterpretation(data?.interpretation || null)
          setAlternatives(Array.isArray(data?.alternatives) ? data.alternatives : [])
          const farmInterp = data?.interpretation?.farm_name
          setEntityConfidence(
            farmInterp?.confidence ?? data?.interpretation?.farm_name?.extraction_confidence ?? null
          )
          if (onResult) onResult(text, conf, data)
        } catch (err) {
          setError(err?.message || 'Transcription failed')
        } finally {
          setIsProcessing(false)
          streamRef.current?.getTracks()?.forEach((track) => track.stop())
          streamRef.current = null
        }
      }

      mediaRecorder.start()
      autoStopTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }, autoStopMs)
    } catch {
      setIsStarting(false)
      setMicPermission('denied')
      setError('Microphone permission denied or unavailable.')
      setIsListening(false)
    }
  }, [backendUrl, isListening, isProcessing, isStarting, onResult, supported, questionContext, questionId, autoStopMs])

  const stop = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return
    mediaRecorderRef.current.stop()
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setFinalTranscript('')
    setConfidence(null)
    setAuditId('')
    setAlternatives([])
    setInterpretation(null)
    setEntityConfidence(null)
    setError(null)
  }, [])

  return {
    isListening,
    isStarting,
    isProcessing,
    transcript,
    finalTranscript,
    confidence,
    auditId,
    alternatives,
    interpretation,
    entityConfidence,
    error,
    start,
    stop,
    reset,
    requestPermission,
    supported,
    micPermission,
  }
}
