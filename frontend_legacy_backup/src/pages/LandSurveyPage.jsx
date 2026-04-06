import { useEffect, useMemo, useRef, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { Mic, MicOff, Send, Download, Sheet, Volume2, VolumeX, RefreshCw } from 'lucide-react'
import { landSurveyAPI } from '../utils/api'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'

const LAND_SESSION_KEY = 'land_survey_session_id'
const PIE_COLORS = ['#4ade80', '#22d3ee', '#f59e0b', '#f97316', '#a78bfa']
const GENERIC_NON_ANSWERS = new Set(['thank you', 'thanks', 'ok', 'okay', 'hello', 'hi', 'hmm', 'repeat'])

function fmtINR(v) {
  const n = Number(v || 0)
  return `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function isGenericNonAnswer(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-z\s]/g, '').trim()
  return GENERIC_NON_ANSWERS.has(t)
}

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

export default function LandSurveyPage() {
  const [state, setState] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [textInput, setTextInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true)
  const [autoListenEnabled, setAutoListenEnabled] = useState(true)
  const [isQuestionSpeaking, setIsQuestionSpeaking] = useState(false)
  const [isAwaitingInput, setIsAwaitingInput] = useState(false)
  const inputRef = useRef(null)
  const lastVoiceSubmitRef = useRef('')
  const speechUtteranceRef = useRef(null)
  const lastSpokenPromptRef = useRef('')
  const speechSupported = typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'

  const prompt = state?.current_question
  const isComplete = state?.status === 'completed'
  const isOpenEndedCropQuestion = prompt?.id === 'crop_name'
  const autoStopMs = isOpenEndedCropQuestion ? 10000 : 3200

  const voice = useVoiceRecorder({
    questionId: prompt?.id,
    autoStopMs,
    phraseHints: [prompt?.text, prompt?.example, ...(prompt?.options || [])].filter(Boolean),
    onResult: (text) => {
      if (!text) return
      setTextInput(text)
    },
  })

  const boot = async () => {
    setLoading(true)
    setError('')
    try {
      const sid = localStorage.getItem(LAND_SESSION_KEY)
      if (sid) {
        const { data } = await landSurveyAPI.get(sid)
        setState(data)
        if (data.status === 'completed') {
          const dash = await landSurveyAPI.dashboard(sid)
          setDashboard(dash.data)
        }
      } else {
        const { data } = await landSurveyAPI.start({})
        localStorage.setItem(LAND_SESSION_KEY, data.session_id)
        setState(data)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    boot()
  }, [])

  useEffect(() => {
    if (prompt && !state?.requires_confirmation) {
      setTextInput('')
      lastVoiceSubmitRef.current = ''
      setIsAwaitingInput(false)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [prompt?.id, state?.requires_confirmation])

  useEffect(() => {
    if (!autoListenEnabled || !voice.supported) return
    voice.requestPermission()
  }, [autoListenEnabled, voice.supported, voice.requestPermission])

  const buildSpokenPrompt = () => {
    if (!prompt) return ''
    let out = prompt.text
    if (prompt.example) out += `. Example: ${prompt.example}.`
    if (prompt.options?.length) out += `. Allowed answers: ${prompt.options.join(', ')}.`
    return out
  }

  const speakAndListen = async () => {
    if (!prompt || loading || !autoListenEnabled || !voice.supported) return

    // Fallback path: no speech synthesis or AI voice toggled off.
    if (!speechSupported || !aiVoiceEnabled) {
      setIsAwaitingInput(true)
      await voice.start()
      setIsAwaitingInput(false)
      return
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel()
    }

    const utter = new SpeechSynthesisUtterance(buildSpokenPrompt())
    utter.lang = 'en-IN'
    utter.rate = 0.95
    utter.pitch = 1.0
    speechUtteranceRef.current = utter
    setIsQuestionSpeaking(true)

    utter.onend = async () => {
      setIsQuestionSpeaking(false)
      setIsAwaitingInput(true)
      await voice.start()
      setIsAwaitingInput(false)
    }
    utter.onerror = () => {
      setIsQuestionSpeaking(false)
      setIsAwaitingInput(false)
    }

    window.speechSynthesis.speak(utter)
  }

  useEffect(() => {
    if (!prompt || !state || loading) return
    const signature = `${prompt.id}:${state.requires_confirmation ? 'confirm' : 'question'}`
    if (lastSpokenPromptRef.current === signature) return
    lastSpokenPromptRef.current = signature
    speakAndListen()
  }, [prompt?.id, state?.requires_confirmation, loading, autoListenEnabled, aiVoiceEnabled])

  useEffect(() => {
    return () => {
      if (speechSupported && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel()
      }
    }
  }, [speechSupported])

  useEffect(() => {
    const t = (voice.finalTranscript || '').trim()
    if (!t || !state || !prompt || loading) return

    // Ignore silence hallucinations (e.g. "Thank you") and re-listen.
    const confidence = Number(voice.confidence ?? 0)
    if (!state.requires_confirmation && isGenericNonAnswer(t) && confidence < 0.7) {
      setError("I couldn't capture your answer clearly. Please say it again.")
      setTextInput('')
      if (!voice.isListening && !voice.isProcessing) {
        setIsAwaitingInput(true)
        voice.start().finally(() => setIsAwaitingInput(false))
      }
      return
    }

    const key = `${prompt.id}:${t}`
    if (lastVoiceSubmitRef.current === key) return
    lastVoiceSubmitRef.current = key
    submitAnswer(t)
  }, [voice.finalTranscript, voice.confidence, state?.requires_confirmation])

  const submitAnswer = async (overrideText = null) => {
    if (!state || !prompt) return
    const answer = (overrideText ?? textInput).trim()
    if (!answer) {
      setError('Please provide a short answer.')
      return
    }

    setLoading(true)
    setError('')
    setSyncMsg('')
    try {
      const { data } = await landSurveyAPI.answer({
        session_id: state.session_id,
        question_id: prompt.id,
        answer_text: answer,
        input_method: overrideText ? 'voice' : 'text',
        confidence_score: voice.confidence,
      })
      setState(data)
      if (data.status === 'completed') {
        const dash = await landSurveyAPI.dashboard(data.session_id)
        setDashboard(dash.data)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const restartFresh = async () => {
    localStorage.removeItem(LAND_SESSION_KEY)
    setState(null)
    setDashboard(null)
    setTextInput('')
    await boot()
  }

  const downloadCsv = async () => {
    if (!state?.session_id) return
    const res = await landSurveyAPI.exportCsv(state.session_id)
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'land-farm-financial-plan.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadJson = async () => {
    if (!state?.session_id) return
    const res = await landSurveyAPI.exportJson(state.session_id)
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'land-farm-financial-plan.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const syncSheet = async () => {
    if (!state?.session_id) return
    setSyncMsg('')
    try {
      const { data } = await landSurveyAPI.syncSheet(state.session_id)
      setSyncMsg(`Sheet synced (${(data.tabs || []).join(', ')})`)
    } catch (e) {
      setSyncMsg(`Sheet sync failed: ${e.message}`)
    }
  }

  const costData = useMemo(() => {
    const cb = dashboard?.cost_breakdown || {}
    return Object.entries(cb).map(([name, value]) => ({ name, value: Number(value || 0) }))
  }, [dashboard])

  if (loading && !state) {
    return <div className="panel">Preparing land-farm voice survey...</div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="panel">
        <p className="label-sm">Land-Based Module</p>
        <h2 className="page-title mt-1">Voice Land Farm Financial Planning</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-3xl">Guided short-answer workflow for multi-crop production and cost planning. Capture answers by voice or text, then review analytics and sync to Google Sheets.</p>
      </section>

      {!isComplete && state && (
        <div className="panel max-w-5xl">
          <div className="flex items-center justify-between mb-3">
            <span className="label-sm">Progress</span>
            <span className="text-sm text-forest-300">{state.progress_answered} / {state.progress_total}</span>
          </div>

          <h2 className="font-display text-2xl text-slate-200">{prompt?.text}</h2>
          {prompt?.example && <p className="text-slate-500 text-sm mt-1">Example: {prompt.example}</p>}
          {isOpenEndedCropQuestion && (
            <p className="text-slate-500 text-xs mt-1">You can say more than one crop in one response, for example: tomato and onion.</p>
          )}

          {prompt?.options?.length > 0 && (
            <p className="text-slate-500 text-xs mt-2">Allowed: {prompt.options.join(', ')}</p>
          )}

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-300/80 p-3 bg-white">
            <button
              onClick={() => {
                if (speechSupported && window.speechSynthesis.speaking) {
                  window.speechSynthesis.cancel()
                  setIsQuestionSpeaking(false)
                }
                if (voice.isListening) {
                  setIsAwaitingInput(false)
                  voice.stop()
                } else {
                  setIsAwaitingInput(true)
                  voice.start().finally(() => setIsAwaitingInput(false))
                }
              }}
              className="w-10 h-10 rounded-lg bg-[#e8f4ec] border border-[#bcdcc6] text-[#17754c] flex items-center justify-center"
              disabled={loading || voice.isProcessing}
              title="Record answer"
            >
              {voice.isListening
                ? <MicOff size={16} />
                : (voice.isStarting || voice.isProcessing)
                  ? <RefreshCw size={16} className="animate-spin" />
                  : <Mic size={16} />}
            </button>
            <div className="min-w-[170px]">
              {isQuestionSpeaking
                ? <p className="text-sm text-forest-300">AI is asking...</p>
                : (voice.isListening || voice.isStarting || isAwaitingInput)
                  ? <VoiceWave active />
                  : <p className="text-sm text-slate-500">Mic is off. Waiting to listen.</p>}
            </div>
            <input
              ref={inputRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAnswer()
              }}
              placeholder={state.requires_confirmation ? 'Say yes or no...' : 'Short answer only...'}
              className="input-field flex-1"
            />
            <button
              type="button"
              onClick={() => {
                if (!speechSupported || !aiVoiceEnabled) return
                lastSpokenPromptRef.current = ''
                speakAndListen()
              }}
              className="w-10 h-10 rounded-lg border border-slate-300 text-slate-600 hover:text-forest-300 flex items-center justify-center"
              title="Replay question"
            >
              <Volume2 size={14} />
            </button>
            <button
              onClick={() => submitAnswer()}
              disabled={loading || !textInput.trim()}
              className="btn-primary flex items-center gap-2"
            >
              <Send size={14} /> Submit
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
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
              className="btn-ghost text-xs flex items-center gap-2"
            >
              {aiVoiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />} AI Voice {aiVoiceEnabled ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              onClick={() => setAutoListenEnabled((v) => !v)}
              className="btn-ghost text-xs"
            >
              Auto Listen {autoListenEnabled ? 'On' : 'Off'}
            </button>
            {(voice.isListening || isAwaitingInput || voice.isStarting || voice.isProcessing) && (
              <span className="text-xs px-2 py-1 rounded-md bg-[#e8f4ec] border border-[#bcdcc6] text-[#17754c]">
                {voice.isListening ? 'ON' : isAwaitingInput ? 'WAITING' : voice.isStarting ? 'STARTING' : 'PROCESSING'}
              </span>
            )}
          </div>

          {voice.transcript && <p className="text-xs text-forest-300 mt-2">Captured: "{voice.transcript}"</p>}
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

          <div className="mt-4">
            <button onClick={restartFresh} className="btn-ghost text-sm">Start Fresh Land Survey</button>
          </div>
        </div>
      )}

      {isComplete && dashboard && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <SummaryCard label="Total Revenue" value={fmtINR(dashboard.summary?.total_revenue)} />
            <SummaryCard label="Total Cost" value={fmtINR(dashboard.summary?.total_cost)} />
            <SummaryCard label="Profit" value={fmtINR(dashboard.summary?.profit)} />
            <SummaryCard label="ROI" value={dashboard.summary?.roi_percent == null ? 'N/A' : `${dashboard.summary.roi_percent}%`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="panel h-[340px]">
              <p className="label-sm">Cost Breakdown</p>
              <div className="h-[280px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie dataKey="value" data={costData} outerRadius={100} label>
                      {costData.map((entry, i) => <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtINR(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel h-[340px]">
              <p className="label-sm">Revenue vs Cost (Annual)</p>
              <div className="h-[280px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{ name: 'Annual', Revenue: Number(dashboard.summary?.total_revenue || 0), Cost: Number(dashboard.summary?.total_cost || 0) }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v) => fmtINR(v)} />
                    <Legend />
                    <Bar dataKey="Revenue" fill="#22c55e" />
                    <Bar dataKey="Cost" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="panel">
            <p className="label-sm mb-3">Crop-wise Performance</p>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-300/80">
                    <th className="py-2 pr-3">Crop</th>
                    <th className="py-2 pr-3">Annual Yield (kg)</th>
                    <th className="py-2 pr-3">Price/kg</th>
                    <th className="py-2 pr-3">Revenue</th>
                    <th className="py-2 pr-3">Cost</th>
                    <th className="py-2 pr-3">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard.crop_performance || []).map((row) => (
                    <tr key={row.crop} className="border-b border-slate-300/70 text-slate-700">
                      <td className="py-2 pr-3 capitalize">{row.crop}</td>
                      <td className="py-2 pr-3">{row.annual_yield_kg}</td>
                      <td className="py-2 pr-3">{fmtINR(row.price_per_kg)}</td>
                      <td className="py-2 pr-3">{fmtINR(row.revenue_annual)}</td>
                      <td className="py-2 pr-3">{fmtINR(row.allocated_cost_annual)}</td>
                      <td className="py-2 pr-3">{fmtINR(row.profit_annual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel flex flex-wrap items-center gap-3">
            <button className="btn-primary flex items-center gap-2" onClick={downloadCsv}><Download size={14} /> Download CSV</button>
            <button className="btn-ghost flex items-center gap-2" onClick={downloadJson}><Download size={14} /> Download JSON</button>
            <button className="btn-ghost flex items-center gap-2" onClick={syncSheet}><Sheet size={14} /> Sync Connected Sheet</button>
            <button className="btn-ghost" onClick={restartFresh}>New Land Survey</button>
            {syncMsg && <p className="text-xs text-slate-500">{syncMsg}</p>}
          </div>

          {(dashboard.warnings || []).length > 0 && (
            <div className="panel border-amber-500/40">
              <p className="label-sm text-amber-300">Validation Warnings</p>
              <ul className="mt-2 text-sm text-amber-200">
                {dashboard.warnings.map((w) => <li key={w}>- {w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="panel">
      <p className="label-sm">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-100">{value}</p>
    </div>
  )
}
