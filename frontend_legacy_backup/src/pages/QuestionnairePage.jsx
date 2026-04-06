/**
 * pages/QuestionnairePage.jsx — Voice + text survey interface.
 * Full-featured: animated progress, voice waveform, type-aware input, skip logic.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Send, ChevronRight, ChevronLeft, CheckCircle2, Volume2, VolumeX, RefreshCw } from 'lucide-react'
import { useStore } from '../store'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'

const CATEGORY_COLORS = {
  setup:     'bg-blue-500/20 text-blue-300 border-blue-500/30',
  fish:      'bg-forest-500/20 text-forest-300 border-forest-500/30',
  crops:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  water:     'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  financial: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  goals:     'bg-purple-500/20 text-purple-300 border-purple-500/30',
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(video|bead|bid|bad|vet|bet|bread)\b/g, 'bed')
    .replace(/\b(till|tell|app|apia|telepathy|talapia|to lapia)\b/g, 'tilapia')
    .replace(/\b(nft|empty|an empty|and ft|n f t)\b/g, 'nft')
    .replace(/\b(dwc|do you see|deep water)\b/g, 'dwc')
    .replace(/\b(barry|mundi|bear a monday|barra|barramundi)\b/g, 'barramundi')
    .replace(/\b(hydroponic|aquaponic)\b/g, 'aquaponics')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isGenericNonAnswer(value) {
  const t = String(value || '').toLowerCase().trim().replace(/[.!?,]/g, '')
  if (!t) return true
  const generic = new Set([
    'thank you', 'thanks', 'ok', 'okay', 'yes', 'no', 'hmm', 'huh', 'hello', 'hi',
    'please repeat', 'repeat', 'can you repeat', 'next', 'continue',
  ])
  return generic.has(t)
}

// ── Wave Animation ─────────────────────────────────────────────────────────────
function VoiceWave({ active }) {
  return (
    <div className={`flex items-center gap-1 h-10 transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-30'}`}>
      {[1, 0.6, 1, 0.7, 0.9, 0.5, 0.8, 0.6, 1, 0.7].map((h, i) => (
        <div key={i}
          className="w-1 rounded-full bg-forest-400"
          style={{
            height: `${h * 100}%`,
            animation: active ? `wave ${0.8 + i * 0.07}s ease-in-out infinite alternate` : 'none',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  )
}

// ── Select Input ──────────────────────────────────────────────────────────────
function SelectInput({ question, onSelect, selectedValue }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
      {question.options.map((opt) => (
        <button key={opt} onClick={() => onSelect(opt)}
          className={`px-4 py-3.5 rounded-xl border text-sm text-left font-medium transition-all duration-150
            ${selectedValue === opt
              ? 'bg-forest-500/25 border-forest-400/60 text-forest-200'
              : 'glass-sm text-slate-300 hover:border-forest-500/40 hover:text-slate-100'}`}>
          {opt}
        </button>
      ))}
    </div>
  )
}

function MultiSelectInput({ question, onToggle, selectedValues }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
      {question.options.map((opt) => {
        const isSelected = selectedValues.includes(opt)
        return (
          <button
            key={opt}
            onClick={() => onToggle(opt)}
            className={`px-4 py-3.5 rounded-xl border text-sm text-left font-medium transition-all duration-150
              ${isSelected
                ? 'bg-forest-500/25 border-forest-400/60 text-forest-200'
                : 'glass-sm text-slate-300 hover:border-forest-500/40 hover:text-slate-100'}`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

// ── Boolean Input ─────────────────────────────────────────────────────────────
function BoolInput({ onSelect, selectedValue }) {
  return (
    <div className="flex gap-4 mt-4">
      {[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }].map(({ label, value }) => (
        <button key={value} onClick={() => onSelect(value)}
          className={`flex-1 py-4 rounded-xl border text-sm font-semibold transition-all duration-150
            ${selectedValue === value
              ? (value === 'yes' ? 'bg-forest-500/25 border-forest-400/60 text-forest-200' : 'bg-red-500/15 border-red-400/40 text-red-300')
              : 'glass-sm text-slate-300 hover:border-forest-500/30'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default function QuestionnairePage() {
  const { session, loading, startSession, resumeSession, submitAnswer, goBackQuestion, analysis, resetSession } = useStore()
  const navigate = useNavigate()

  const [textInput,  setTextInput]  = useState('')
  const [selectVal,  setSelectVal]  = useState('')
  const [multiSelectVals, setMultiSelectVals] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [initializing, setInitializing] = useState(true)
  const inputRef = useRef(null)
  const initRef = useRef(false)
  const lastAutoSubmitKeyRef = useRef('')
  const [voiceConfirm, setVoiceConfirm] = useState(null) // { bestGuess, alternatives, transcript, auditId, ... }
  const [pendingFarmNameVoiceMeta, setPendingFarmNameVoiceMeta] = useState(null)
  const [voiceAccepted, setVoiceAccepted] = useState(null) // string | null
  const [draftPrefillQuestionId, setDraftPrefillQuestionId] = useState(null)
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true)
  const [autoListenEnabled, setAutoListenEnabled] = useState(true)
  const [isQuestionSpeaking, setIsQuestionSpeaking] = useState(false)
  const [isAwaitingUserInput, setIsAwaitingUserInput] = useState(false)
  const speechSupported = typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
  const speechUtteranceRef = useRef(null)
  const lastSpokenQuestionRef = useRef('')

  const FARM_NAME_ENTITY_CONF_THRESHOLD = 0.65
  const FARM_NAME_STT_CONF_THRESHOLD = 0.45
  
  const questionHintPhrases = useMemo(() => [
    session?.current_question?.text,
    session?.current_question?.hint,
    ...(session?.current_question?.options || []),
    'aquaponics',
    'hydroponics',
    'media bed',
    'nft',
    'dwc',
  ].filter(Boolean), [session?.current_question?.id])

  // Memoized callbacks to prevent SpeechRecognition recreation
  const handleVoiceInterim = useCallback((text) => {
    setTextInput(text)
  }, [])

  const handleVoiceResult = useCallback((text, conf) => {
    setTextInput(text)
  }, [])

  // Voice recorder
  const voice = useVoiceRecorder({
    phraseHints: questionHintPhrases,
    onInterim: handleVoiceInterim,
    onResult: handleVoiceResult,
    questionId: session?.current_question?.id,
  })

  // Init session on mount
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const init = async () => {
      try {
        if (session) return
        const resumed = await resumeSession()
        if (!resumed || resumed.status !== 'in_progress') {
          await startSession()
        }
      } catch (e) {
        setError(e?.message || 'Unable to start survey session. Check backend connectivity and retry.')
      } finally {
        setInitializing(false)
      }
    }

    init()
  }, [session, resumeSession, startSession])

  // Focus text input when question changes
  useEffect(() => {
    const currentQuestion = session?.current_question
    if (currentQuestion?.type === 'text' || currentQuestion?.type === 'number') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }

    const draftValue = currentQuestion?.id
      ? session?.context?.draft_answers?.[currentQuestion.id]
      : undefined

    const shouldUseDraftPrefill = draftPrefillQuestionId === currentQuestion?.id
    const normalizedDraft = Array.isArray(draftValue)
      ? draftValue.join(', ')
      : (draftValue ?? '')

    lastAutoSubmitKeyRef.current = ''
    setIsAwaitingUserInput(false)
    setVoiceConfirm(null)
    setPendingFarmNameVoiceMeta(null)
    setVoiceAccepted(null)
    setTextInput((currentQuestion?.type === 'text' || currentQuestion?.type === 'number') ? String(shouldUseDraftPrefill ? (normalizedDraft || '') : '') : '')
    setSelectVal((currentQuestion?.type === 'select' || currentQuestion?.type === 'boolean') ? String(shouldUseDraftPrefill ? (normalizedDraft || '') : '') : '')
    setMultiSelectVals(
      currentQuestion?.type === 'multiselect'
        ? (shouldUseDraftPrefill
          ? (Array.isArray(draftValue)
            ? draftValue.map((v) => String(v))
            : String(normalizedDraft || '').split(',').map((v) => v.trim()).filter(Boolean))
          : [])
        : []
    )
    setError('')
  }, [session?.current_question?.id, draftPrefillQuestionId])

  // Auto-navigate to analysis when complete
  useEffect(() => {
    if (session?.status === 'completed' && analysis) {
      setTimeout(() => navigate('/analysis'), 1500)
    }
  }, [session?.status, analysis])

  const handleSubmit = async (overrideText, voiceMeta = null) => {
    const q = session?.current_question
    if (!q || submitting) return
    if (voice.isListening) voice.stop()
    const multiAnswer = multiSelectVals.join(', ')
    const answer = [
      overrideText,
      voice.transcript,
      textInput,
      multiAnswer,
      selectVal,
    ].find((v) => typeof v === 'string' && v.trim().length > 0)

    if (!answer) { setError('Please provide an answer.'); return }

    setSubmitting(true)
    setError('')
    try {
      // For farm_name, if the user was prompted by low-confidence STT and then edited/confirmed,
      // we attach an explicit voice audit record for debugging.
      let attachedVoiceMeta = voiceMeta
      if (!attachedVoiceMeta && q.id === 'farm_name' && pendingFarmNameVoiceMeta) {
        const chosen = answer
        const correction_action = !overrideText
          ? 'edited_manual'
          : (chosen === pendingFarmNameVoiceMeta.bestGuess
              ? 'confirmed_best_guess_after_edit'
              : (pendingFarmNameVoiceMeta.alternatives || []).includes(chosen)
                ? 'confirmed_alternative_after_edit'
                : 'edited_manual')

        attachedVoiceMeta = {
          audit_id: pendingFarmNameVoiceMeta.auditId,
          transcript: pendingFarmNameVoiceMeta.transcript,
          stt_confidence: pendingFarmNameVoiceMeta.sttConf,
          entity_confidence: pendingFarmNameVoiceMeta.entityConf,
          chosen_alternative: chosen,
          correction_action,
        }
      }

      const input_method = voice.transcript ? 'voice' : attachedVoiceMeta ? 'voice' : 'text'
      await submitAnswer(q.id, answer, input_method, voice.confidence, attachedVoiceMeta)
      setDraftPrefillQuestionId(null)
      setTextInput('')
      setSelectVal('')
      setMultiSelectVals([])
      voice.reset()
      setVoiceConfirm(null)
      setPendingFarmNameVoiceMeta(null)
      setVoiceAccepted(null)
    } catch (e) {
      const message = String(e?.message || 'Unable to submit answer.')
      if (q?.id === 'farm_location') {
        setError(`${message} Try saying: Bengaluru Karnataka`)
        if (!voice.isListening && !voice.isProcessing) {
          setTimeout(() => {
            voice.start()
          }, 250)
        }
      } else {
        setError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleVoiceToggle = async () => {
    if (speechSupported && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
      setIsQuestionSpeaking(false)
    }
    if (voice.isProcessing || submitting) return
    if (voice.isListening) {
      setIsAwaitingUserInput(false)
      voice.stop()
    } else {
      setTextInput('')
      setIsAwaitingUserInput(true)
      await voice.start()
    }
  }

  const buildSpokenPrompt = useCallback((question) => {
    if (!question) return ''
    let prompt = question.text
    if (question.hint) {
      prompt += `. Hint: ${question.hint}`
    }
    if (question.type === 'select' || question.type === 'multiselect') {
      const opts = (question.options || []).join(', ')
      if (opts) {
        prompt += `. Options are: ${opts}.`
      }
    }
    if (question.type === 'boolean') {
      prompt += '. Please answer yes or no.'
    }
    return prompt
  }, [])

  const speakQuestion = useCallback(async (question, { autoListen = false } = {}) => {
    if (!speechSupported || !aiVoiceEnabled || !question) return
    if (voice.isListening) voice.stop()
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
    }

    const utterance = new SpeechSynthesisUtterance(buildSpokenPrompt(question))
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.lang = 'en-IN'
    speechUtteranceRef.current = utterance
    setIsQuestionSpeaking(true)

    utterance.onend = async () => {
      setIsQuestionSpeaking(false)
      setIsAwaitingUserInput(true)
      if (autoListen && autoListenEnabled && !submitting && !voice.isProcessing && !voice.isListening && voice.supported) {
        try {
          await voice.start()
        } finally {
          setIsAwaitingUserInput(false)
        }
      }
    }
    utterance.onerror = () => {
      setIsQuestionSpeaking(false)
      setIsAwaitingUserInput(false)
    }

    window.speechSynthesis.speak(utterance)
  }, [aiVoiceEnabled, autoListenEnabled, buildSpokenPrompt, speechSupported, submitting, voice])

  useEffect(() => {
    const q = session?.current_question
    if (!q || !aiVoiceEnabled) return
    if (lastSpokenQuestionRef.current === q.id) return
    lastSpokenQuestionRef.current = q.id
    speakQuestion(q, { autoListen: true })
  }, [session?.current_question?.id, aiVoiceEnabled, speakQuestion])

  useEffect(() => {
    if (!autoListenEnabled || !voice.supported) return
    // Preflight mic permission so the user does not need to tap the mic button.
    voice.requestPermission()
  }, [autoListenEnabled, voice.supported, voice.requestPermission])

  useEffect(() => {
    const q = session?.current_question
    if (!q || submitting) return
    if (!autoListenEnabled || !voice.supported) return
    // Fallback: if TTS is unavailable/off, start listening as soon as question is loaded.
    if (!speechSupported || !aiVoiceEnabled) {
      setIsAwaitingUserInput(true)
      voice.start().finally(() => setIsAwaitingUserInput(false))
    }
  }, [
    session?.current_question?.id,
    autoListenEnabled,
    speechSupported,
    aiVoiceEnabled,
    submitting,
    voice.supported,
    voice.start,
  ])

  useEffect(() => {
    return () => {
      if (speechSupported && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel()
      }
    }
  }, [speechSupported])

  const micStatusText = voice.isListening
    ? 'Listening... tap to stop'
    : isAwaitingUserInput
      ? 'Waiting for your answer...'
    : voice.isStarting
      ? 'Requesting microphone permission...'
      : voice.isProcessing
        ? 'Transcribing audio...'
        : (voice.supported
          ? 'Mic is off. Tap to start recording.'
          : 'Audio recording is unavailable in this browser. Use Chrome or Edge.')

  const handlePrevious = async () => {
    if (submitting || loading) return
    setSubmitting(true)
    setError('')
    try {
      const data = await goBackQuestion()
      setDraftPrefillQuestionId(data?.current_question?.id || null)
      voice.reset()
      setVoiceConfirm(null)
      setPendingFarmNameVoiceMeta(null)
      setTextInput('')
      setSelectVal('')
      setMultiSelectVals([])
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleMultiSelect = (option) => {
    setMultiSelectVals((prev) => (
      prev.includes(option)
        ? prev.filter((v) => v !== option)
        : [...prev, option]
    ))
  }

  useEffect(() => {
    const q = session?.current_question
    if (!q || submitting) return
    if (q.type !== 'number' && q.type !== 'text') return
    const transcript = (voice.finalTranscript || '').trim()
    if (!transcript) return

    const key = `${q.id}:${transcript}`
    if (lastAutoSubmitKeyRef.current === key) return
    // Critical: farm_name should require confidence-aware interpretation confirmation.
    if (q.id === 'farm_name') {
      const farmInterp = voice.interpretation?.farm_name
      const bestGuess = farmInterp?.best || transcript
      const entityConf = farmInterp?.confidence ?? voice.entityConfidence ?? voice.confidence ?? 0
      const sttConf = voice.confidence ?? 0
      const isLow = typeof farmInterp?.needs_confirmation === 'boolean'
        ? farmInterp.needs_confirmation
        : (entityConf < FARM_NAME_ENTITY_CONF_THRESHOLD || sttConf < FARM_NAME_STT_CONF_THRESHOLD)

      const shouldReject = sttConf < 0.2 || isGenericNonAnswer(transcript) || isGenericNonAnswer(bestGuess)

      if (shouldReject) {
        setVoiceConfirm(null)
        setPendingFarmNameVoiceMeta(null)
        setTextInput('')
        setError("I couldn't clearly catch the farm/project name. Please say only the name again.")
        if (!voice.isListening && !voice.isProcessing) {
          setTimeout(() => {
            voice.start()
          }, 250)
        }
        return
      }

      if (isLow) {
        const meta = {
          bestGuess,
          alternatives: farmInterp?.alternatives || [],
          transcript,
          auditId: voice.auditId,
          entityConf,
          sttConf,
        }
        setVoiceConfirm(meta)
        setTextInput(bestGuess)
        setPendingFarmNameVoiceMeta(meta)
        return
      }

      lastAutoSubmitKeyRef.current = key
      setPendingFarmNameVoiceMeta(null)
      handleSubmit(bestGuess, {
        audit_id: voice.auditId,
        transcript,
        stt_confidence: sttConf,
        entity_confidence: entityConf,
        chosen_alternative: bestGuess,
        correction_action: 'auto_submitted_best_guess',
      })
      return
    }

    lastAutoSubmitKeyRef.current = key
    handleSubmit(transcript)
  }, [
    voice.finalTranscript,
    voice.confidence,
    voice.interpretation,
    voice.entityConfidence,
    voice.auditId,
    session?.current_question?.id,
    session?.current_question?.type,
    submitting,
  ])

  // Intelligent voice matching for select/multiselect/boolean questions
  useEffect(() => {
    const q = session?.current_question
    if (!q || submitting) return
    if (q.type !== 'select' && q.type !== 'multiselect' && q.type !== 'boolean') return

    const transcript = normalizeForMatch(voice.finalTranscript)
    if (!transcript) return

    // Prevent duplicate matching on same transcript
    const key = `${q.id}:${transcript}`
    if (lastAutoSubmitKeyRef.current === key) return

    // Simple fuzzy matching: check if transcript contains option or option contains main words from transcript
    const options = q.type === 'boolean' 
      ? ['yes', 'no'] 
      : (q.options || [])

    let bestMatch = null
    let bestScore = 0

    for (const option of options) {
      const optionLower = normalizeForMatch(option)
      
      // Exact or near-exact match
      if (optionLower === transcript || transcript === optionLower) {
        bestMatch = option
        bestScore = 1.0
        break
      }
      
      // Check if transcript contains the option
      if (transcript.includes(optionLower)) {
        const score = optionLower.length / transcript.length
        if (score > bestScore) {
          bestMatch = option
          bestScore = score
        }
      }
      
      // Check if option contains key words from transcript
      const words = transcript.split(/\s+/)
      const matchedWords = words.filter(w => w.length > 2 && optionLower.includes(w))
      if (matchedWords.length > 0) {
        const score = matchedWords.length / words.length * 0.8
        if (score > bestScore) {
          bestMatch = option
          bestScore = score
        }
      }
    }

    // Auto-select if confidence is reasonable (>0.35)
    if (bestMatch && bestScore > 0.35) {
      lastAutoSubmitKeyRef.current = key
      
      if (q.type === 'multiselect') {
        setMultiSelectVals([bestMatch])
        // Submit after a brief delay to show selection
        setTimeout(() => {
          handleSubmit(bestMatch)
        }, 300)
      } else if (q.type === 'boolean') {
        setSelectVal(bestMatch)
        setTimeout(() => {
          handleSubmit(bestMatch)
        }, 300)
      } else {
        // select
        setSelectVal(bestMatch)
        setTimeout(() => {
          handleSubmit(bestMatch)
        }, 300)
      }
    }
  }, [voice.finalTranscript, session?.current_question?.id, session?.current_question?.type, submitting])

  // ── Render States ─────────────────────────────────────────────────────────
  if (initializing || (!session && loading)) {
    return <LoadingSkeleton message="Preparing your survey session..." />
  }

  if (session?.status === 'completed') {
    return (
      <CompletedScreen
        analysis={analysis}
        onStartNew={async () => {
          resetSession()
          await startSession()
        }}
      />
    )
  }

  const q = session?.current_question
  if (!q) {
    return (
      <div className="max-w-2xl mx-auto glass p-6 space-y-4 animate-fade-in">
        <h2 className="font-display text-xl font-semibold text-slate-100">Survey session is not ready</h2>
        <p className="text-slate-400 text-sm">{error || 'Unable to load the next question yet.'}</p>
        <button
          onClick={async () => {
            setError('')
            setInitializing(true)
            try {
              const resumed = await resumeSession()
              if (!resumed || resumed.status !== 'in_progress') {
                await startSession()
              }
            } catch (e) {
              setError(e?.message || 'Retry failed. Please try again.')
            } finally {
              setInitializing(false)
            }
          }}
          className="btn-primary"
        >
          Retry loading survey
        </button>
      </div>
    )
  }

  const progress = session
    ? Math.round((session.progress_answered / session.progress_total) * 100)
    : 0
  const catColor = CATEGORY_COLORS[q?.category] ?? CATEGORY_COLORS.setup
  const previousAnswerRaw = q?.id ? session?.context?.draft_answers?.[q.id] : undefined
  const previousAnswerText = Array.isArray(previousAnswerRaw)
    ? previousAnswerRaw.map((v) => String(v)).join(', ')
    : String(previousAnswerRaw ?? '').trim()
  const hasPreviousAnswer = previousAnswerText.length > 0 && draftPrefillQuestionId === q?.id

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <p className="label-sm">Interview Workflow</p>
        <h1 className="page-title mt-1">AI Farm Survey</h1>
        <p className="text-slate-400 text-sm mt-2">Guided, adaptive questions to build your financial and production plan.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <aside className="xl:col-span-1 space-y-3">
          <div className="panel">
            <div className="flex items-center justify-between mb-3">
              <span className="label-sm">Progress</span>
              <span className="text-sm font-mono text-forest-400">
                {session?.progress_answered ?? 0} / {session?.progress_total ?? 0}
              </span>
            </div>
            <div className="w-full h-2 bg-forest-900/60 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-forest-500 to-forest-300"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-500">{progress}% complete</span>
              {q && <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${catColor}`}>{q.category}</span>}
            </div>
          </div>

          <div className="panel">
            <p className="label-sm">Current Mode</p>
            <p className="mt-2 text-sm text-slate-300">
              {voice.isListening ? 'Voice capture is active.' : voice.isProcessing ? 'Processing speech to text.' : 'Answer using voice or keyboard.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiVoiceEnabled((v) => {
                    const next = !v
                    if (!next && speechSupported && window.speechSynthesis.speaking) {
                      window.speechSynthesis.cancel()
                      setIsQuestionSpeaking(false)
                    }
                    return next
                  })
                }}
                className={`btn-ghost text-xs ${aiVoiceEnabled ? 'border-forest-500/40 text-forest-300' : ''}`}
              >
                {aiVoiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />} AI Voice {aiVoiceEnabled ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => setAutoListenEnabled((v) => !v)}
                className={`btn-ghost text-xs ${autoListenEnabled ? 'border-forest-500/40 text-forest-300' : ''}`}
              >
                Auto Listen {autoListenEnabled ? 'On' : 'Off'}
              </button>
            </div>
            {voice.transcript && (
              <div className="mt-3 rounded-xl border border-forest-700/30 bg-forest-900/35 p-3">
                <p className="text-[11px] uppercase tracking-widest text-slate-500">Captured speech</p>
                <p className="mt-1 text-sm text-forest-300">"{voice.transcript}"</p>
              </div>
            )}
          </div>

          {hasPreviousAnswer && (
            <div className="panel">
              <p className="label-sm">Previous answer</p>
              <p className="mt-2 text-sm text-slate-300">{previousAnswerText}</p>
            </div>
          )}
        </aside>

        <section className="xl:col-span-2">
          <AnimatePresence mode="wait">
            {q && (
              <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="panel"
          >
            <p className="font-display text-2xl font-semibold text-slate-100 leading-snug">{q.text}</p>
            {q.hint && <p className="text-slate-500 text-sm mt-1.5 italic">{q.hint}</p>}
            {q.unit && <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-400 font-mono">{q.unit}</span>}

            {/* Voice + Waveform */}
            <div className="mt-5 flex items-center gap-4 py-3 px-4 rounded-xl bg-forest-900/40 border border-forest-700/20">
              <button
                onClick={handleVoiceToggle}
                aria-pressed={voice.isListening}
                disabled={voice.micPermission === 'unavailable' || submitting}
                className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200
                  ${voice.isListening
                    ? 'bg-red-500/20 border border-red-400/40 text-red-400 animate-pulse'
                    : voice.isStarting || voice.isProcessing
                      ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                      : 'bg-forest-500/20 border border-forest-400/30 text-forest-400 hover:bg-forest-500/30'}`}
              >
                {voice.isListening
                  ? <MicOff size={18} />
                  : voice.isStarting || voice.isProcessing
                    ? <RefreshCw size={16} className="animate-spin" />
                    : <Mic size={18} />}
              </button>

              <div className="flex-1 flex items-center">
                {isQuestionSpeaking
                  ? <p className="text-forest-300 text-sm">AI is asking the question...</p>
                  : voice.isListening || voice.isStarting || isAwaitingUserInput
                  ? <VoiceWave active />
                  : <p className="text-slate-500 text-sm">{micStatusText}</p>}
              </div>

              <button
                type="button"
                onClick={() => speakQuestion(q, { autoListen: false })}
                disabled={!speechSupported || !aiVoiceEnabled || submitting || voice.isProcessing}
                className="w-10 h-10 rounded-xl border border-forest-500/30 text-forest-300 hover:bg-forest-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                title="Replay AI question"
              >
                <Volume2 size={15} />
              </button>

              {(voice.isListening || voice.isStarting || voice.isProcessing || isAwaitingUserInput) && (
                <span className="text-xs px-2 py-1 rounded-md bg-forest-800/60 border border-forest-600/40 text-forest-300">
                  {voice.isListening ? 'ON' : isAwaitingUserInput ? 'WAITING' : voice.isStarting ? 'STARTING' : 'PROCESSING'}
                </span>
              )}

              {voice.transcript && !voice.isListening && (
                <Volume2 size={14} className="text-forest-400 flex-shrink-0" />
              )}
            </div>

            {/* Input area */}
            <div className="mt-4">
              {q.type === 'boolean' ? (
                <BoolInput onSelect={(v) => { setSelectVal(v); handleSubmit(v) }} selectedValue={selectVal} />
              ) : q.type === 'select' ? (
                <SelectInput question={q} onSelect={(v) => { setSelectVal(v); handleSubmit(v) }} selectedValue={selectVal} />
              ) : q.type === 'multiselect' ? (
                <>
                  <MultiSelectInput question={q} onToggle={toggleMultiSelect} selectedValues={multiSelectVals} />
                  {multiSelectVals.length > 0 && (
                    <p className="mt-2 text-xs text-slate-400">Selected: {multiSelectVals.join(', ')}</p>
                  )}
                </>
              ) : (
                <div className="flex gap-3">
                  <input
                    ref={inputRef}
                    type={q.type === 'number' ? 'number' : 'text'}
                    value={textInput || voice.transcript}
                    onChange={(e) => { setTextInput(e.target.value); voice.reset() }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      if (q?.id === 'farm_name' && voiceConfirm) return
                      handleSubmit()
                    }}
                    placeholder={q.type === 'number' ? 'Enter a number…' : 'Type your answer…'}
                    className="input-field flex-1"
                  />
                </div>
              )}

              {q?.id === 'farm_name' && voiceConfirm && (
                <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4" role="status" aria-live="polite">
                  <p className="text-sm font-semibold text-amber-200">Low confidence detected. Please confirm your farm name.</p>
                  <p className="text-xs text-amber-100/80 mt-1">
                    Captured: <span className="font-mono">{voiceConfirm.transcript}</span>
                  </p>

                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-widest text-amber-100/70">Best suggestion</p>
                    <p className="mt-1 text-sm text-amber-100 font-medium">{voiceConfirm.bestGuess}</p>
                    {voiceAccepted && (
                      <p className="mt-2 text-xs text-forest-100">
                        Accepted: <span className="font-mono">{voiceAccepted}</span>
                      </p>
                    )}

                    {voiceConfirm.alternatives?.length > 0 && (
                      <>
                        <p className="text-xs uppercase tracking-widest text-amber-100/70 mt-3">Alternatives</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {voiceConfirm.alternatives.map((alt) => (
                            <button
                              key={alt}
                              type="button"
                              onClick={() => {
                                setVoiceAccepted(alt)
                                handleSubmit(alt, {
                                  audit_id: voiceConfirm.auditId,
                                  transcript: voiceConfirm.transcript,
                                  stt_confidence: voiceConfirm.sttConf,
                                  entity_confidence: voiceConfirm.entityConf,
                                  chosen_alternative: alt,
                                  correction_action: 'confirmed_alternative',
                                })
                              }}
                              disabled={submitting}
                              className="btn-ghost text-amber-100 border border-amber-400/35 hover:border-amber-400/60"
                            >
                              Use: {alt}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setVoiceAccepted(voiceConfirm.bestGuess)
                        handleSubmit(voiceConfirm.bestGuess, {
                          audit_id: voiceConfirm.auditId,
                          transcript: voiceConfirm.transcript,
                          stt_confidence: voiceConfirm.sttConf,
                          entity_confidence: voiceConfirm.entityConf,
                          chosen_alternative: voiceConfirm.bestGuess,
                          correction_action: 'confirmed_best_guess',
                        })
                      }}
                      disabled={submitting}
                      className="btn-primary"
                    >
                      Confirm
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        // Let the user edit manually without accidental resubmission of the full transcript.
                        setTextInput(voiceConfirm.bestGuess)
                        voice.reset()
                        setVoiceConfirm(null)
                        setVoiceAccepted(null)
                        setTimeout(() => inputRef.current?.focus(), 50)
                      }}
                      disabled={submitting}
                      className="btn-ghost"
                    >
                      Edit manually
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        setError('')
                        voice.reset()
                        setVoiceConfirm(null)
                        setPendingFarmNameVoiceMeta(null)
                        setVoiceAccepted(null)
                        await voice.start()
                      }}
                      disabled={voice.isProcessing || submitting}
                      className="btn-ghost"
                    >
                      Re-record
                    </button>

                    <p className="text-xs text-amber-100/80 ml-auto">
                      {Math.round((voiceConfirm.entityConf ?? 0) * 100)}% entity / {Math.round((voiceConfirm.sttConf ?? 0) * 100)}% STT
                    </p>
                  </div>
                </div>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            {voice.error && <p className="mt-2 text-sm text-amber-400">{voice.error}</p>}

            {/* Submit button (only for text/number/multiselect) */}
            {(q.type === 'text' || q.type === 'number' || q.type === 'multiselect') && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={handlePrevious}
                  disabled={submitting || loading || (session?.progress_answered ?? 0) === 0}
                  className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} /> Previous Question
                </button>
                <button
                  onClick={() => handleSubmit()}
                  disabled={submitting || (q?.id === 'farm_name' && !!voiceConfirm) || (!textInput.trim() && !voice.transcript && !selectVal && multiSelectVals.length === 0)}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? <><RefreshCw size={15} className="animate-spin" /> Saving…</>
                    : <><Send size={15} /> Next Question <ChevronRight size={14} /></>}
                </button>
              </div>
            )}

            {(q.type === 'select' || q.type === 'boolean') && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={handlePrevious}
                  disabled={submitting || loading || (session?.progress_answered ?? 0) === 0}
                  className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} /> Previous Question
                </button>
                <button
                  onClick={() => handleSubmit(selectVal || previousAnswerText)}
                  disabled={submitting || (!selectVal && !previousAnswerText)}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? <><RefreshCw size={15} className="animate-spin" /> Saving…</>
                    : <><Send size={15} /> Next Question <ChevronRight size={14} /></>}
                </button>
              </div>
            )}
          </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Session ID footer */}
      {session && (
        <p className="text-center text-xs text-slate-600 font-mono">
          Session: {session.session_id?.slice(0, 8)}…
        </p>
      )}
    </div>
  )
}

function LoadingSkeleton({ message = 'Loading survey...' }) {
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-forest-800/60 rounded-xl" />
      <div className="glass p-5 h-24" />
      <div className="glass p-6 h-64" />
      <p className="text-slate-500 text-sm animate-none">{message}</p>
    </div>
  )
}

function CompletedScreen({ analysis, onStartNew }) {
  const navigate = useNavigate()
  return (
    <div className="max-w-2xl mx-auto text-center space-y-6 py-12 animate-fade-in">
      <div className="w-20 h-20 mx-auto rounded-full bg-forest-500/20 border border-forest-400/40 flex items-center justify-center glow-green">
        <CheckCircle2 size={36} className="text-forest-400" />
      </div>
      <div>
        <h2 className="font-display text-3xl font-bold text-slate-100">Survey Complete!</h2>
        <p className="text-slate-400 mt-2">Your AI financial plan is being generated…</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {analysis && (
          <button onClick={() => navigate('/analysis')} className="btn-primary mx-auto">
            View Analysis & Financial Plan
          </button>
        )}
        <button
          onClick={async () => {
            if (onStartNew) await onStartNew()
            navigate('/survey')
          }}
          className="btn-ghost mx-auto"
        >
          Start New Survey
        </button>
      </div>
    </div>
  )
}
