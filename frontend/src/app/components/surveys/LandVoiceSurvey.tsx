import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { Mic, MicOff, CheckCircle, Loader2, RefreshCw, Volume2, VolumeX, ExternalLink, ArrowLeft } from 'lucide-react';
import { landSurveyAPI, farmAPI, audioAPI } from '../../utils/api';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { PretextText } from '../ui/pretext-text';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useStore } from '../../store';
import { LangCode, createT } from '../../utils/i18n';

const LAND_SESSION_KEY = 'land_survey_session_id';
const LAND_VALIDATION_TOGGLE_KEY = 'land_survey_validation_enabled';
const CHART_COLORS = ['#22c55e', '#06b6d4', '#f59e0b', '#f97316', '#a855f7'];
const PRETEXT_BASE_FONT = '400 1rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_TITLE_FONT = '600 2rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_PROMPT_FONT = '500 1.125rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_EXAMPLE_FONT = '400 0.875rem Inter, "Noto Sans", "Segoe UI", sans-serif';

function formatINR(value: number) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
}

// Mirror of backend normalize_number_transcript — converts spoken word-numbers
// to digit strings so the input always shows "2000" instead of "two thousand".
function normalizeNumberWords(text: string): string {
  if (/\d/.test(text)) return text; // already has digits
  const units: Record<string, number> = {
    zero: 0, oh: 0, one: 1, won: 1, two: 2, to: 2, too: 2,
    three: 3, tree: 3, free: 3, four: 4, for: 4, fore: 4,
    five: 5, fife: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9, nein: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };
  const scales: Record<string, number> = {
    hundred: 100, thousand: 1_000, lakh: 100_000, million: 1_000_000, crore: 10_000_000,
  };
  const tokens = text.toLowerCase().replace(/[,\s]+/g, ' ').trim().split(' ');
  let current = 0;
  let total = 0;
  let found = false;
  for (const token of tokens) {
    if (token in units) { current += units[token]; found = true; }
    else if (token in scales) {
      const scale = scales[token];
      if (current === 0) current = 1;
      if (scale >= 1000) { total += current * scale; current = 0; }
      else { current *= scale; }
      found = true;
    } else if (token === 'and' || token === 'point') { continue; }
  }
  if (!found) return text;
  return String(Math.round(total + current));
}

export function LandVoiceSurvey() {
  const selectedLanguage: string = useStore((s: any) => s.globalLanguage) || 'en';
  const tr = createT((selectedLanguage as LangCode) || 'en');
  const [lowConfPrompt, setLowConfPrompt] = useState<{ auditId: string; original: string } | null>(null);
  const [state, setState] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [marketUpdating, setMarketUpdating] = useState(false);
  const [error, setError] = useState('');
  const [lookerUrl, setLookerUrl] = useState<string | null>(null);
  const [lookerSetup, setLookerSetup] = useState<string[] | null>(null);
  const [overrideValues, setOverrideValues] = useState<Record<string, string>>({});
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true);
  const [isQuestionSpeaking, setIsQuestionSpeaking] = useState(false);
  const [farms, setFarms] = useState<any[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  // pendingVoiceSubmit: set when Whisper returns a transcript; starts a countdown before auto-submit
  const [pendingVoiceSubmit, setPendingVoiceSubmit] = useState<{ text: string; countdown: number } | null>(null);
  const [validationEnabled, setValidationEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem(LAND_VALIDATION_TOGGLE_KEY);
    return saved == null ? false : saved === 'true';
  });
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastSpokenPromptRef = useRef('');
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechSupported = typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  const speakText = (text: string, onDone?: () => void) => {
    if (!speechSupported || !aiVoiceEnabled) { onDone?.(); return; }
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.onend = () => { console.log('[TTS] speakText onend'); onDone?.(); };
    utter.onerror = (e) => { console.error('[TTS] speakText onerror:', e.error, e); onDone?.(); };
    synth.resume();
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(() => synth.speak(utter), 50);
    } else {
      synth.speak(utter);
    }
  };

  const boot = async () => {
    setLoading(true);
    setError('');
    // Farms are fast and don't block the survey — load fire-and-forget
    farmAPI.list().then((res: any) => { if (res?.data) setFarms(res.data); }).catch(() => {});
    try {
      // Use the stored session ID directly — avoids the slow /report/analytics call
      const savedSessionId = localStorage.getItem(LAND_SESSION_KEY);
      if (savedSessionId) {
        try {
          const { data } = await landSurveyAPI.get(savedSessionId);
          setState(data);
          if (data.status === 'completed') {
            // Load dashboard and looker URL in parallel
            const [dash, looker] = await Promise.all([
              landSurveyAPI.dashboard(savedSessionId),
              landSurveyAPI.lookerUrl(savedSessionId).catch(() => null),
            ]);
            setDashboard(dash.data);
            if (looker?.data?.url) setLookerUrl(looker.data.url);
            else if (looker?.data?.setup_instructions) setLookerSetup(looker.data.setup_instructions);
          }
          return;
        } catch {
          // Stale/invalid session — clear it and fall through to show farm picker
          localStorage.removeItem(LAND_SESSION_KEY);
        }
      }
      // No valid saved session → show farm picker (state stays null)
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startSurvey = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await landSurveyAPI.start({
        enable_validation_question: validationEnabled,
        farm_id: selectedFarmId || undefined,
        language: selectedLanguage,
      });
      localStorage.setItem(LAND_SESSION_KEY, data.session_id);
      setState(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    boot();
  }, []);

  // Re-fetch current question in new language when global language changes mid-survey
  const prevLangRef = useRef(selectedLanguage);
  useEffect(() => {
    if (prevLangRef.current === selectedLanguage) return;
    prevLangRef.current = selectedLanguage;
    const sid = state?.session_id;
    if (!sid || state?.status !== 'in_progress') return;
    landSurveyAPI.get(sid, selectedLanguage).then(({ data }: any) => {
      setState((s: any) => s ? { ...s, current_question: data.current_question } : s);
    }).catch(() => {});
  }, [selectedLanguage, state?.session_id, state?.status]);

  const prompt = state?.current_question;
  const isComplete = state?.status === 'completed';
  const isOpenEndedCropQuestion = prompt?.id === 'crop_name';
  const autoStopMs = isOpenEndedCropQuestion ? 10000 : 4500;

  const voice = useVoiceRecorder({
    autoStopMs,
    questionType: state?.requires_confirmation ? 'confirm' : (prompt?.type ?? undefined),
    questionId: prompt?.id,
    phraseHints: [prompt?.text, prompt?.example, ...(prompt?.options || [])].filter(Boolean).join('. '),
    language: selectedLanguage,
  });

  // When Whisper returns a transcript → fill input and start 3-second review countdown.
  // User can edit the input to cancel the countdown, or just wait and it auto-submits.
  useEffect(() => {
    if (!voice.finalTranscript) return;
    let text = voice.finalTranscript.trim();
    if (!text) return;
    const qType = state?.requires_confirmation ? 'confirm' : (prompt?.type ?? '');
    if (qType === 'number') text = normalizeNumberWords(text);
    setCurrentInput(text);
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    setPendingVoiceSubmit({ text, countdown: 8 });
    // Show correction banner for low-confidence transcriptions
    if (voice.confidence !== null && voice.confidence < 0.6 && voice.auditId) {
      setLowConfPrompt({ auditId: voice.auditId, original: text });
    } else {
      setLowConfPrompt(null);
    }
  }, [voice.finalTranscript]);

  const costData = Object.entries(dashboard?.cost_breakdown || {}).map(([name, value]) => ({
    name,
    value: Number(value || 0),
  }));

  const revenueVsCostData = [
    {
      name: 'Annual',
      Revenue: Number(dashboard?.summary?.total_revenue || 0),
      Cost: Number(dashboard?.summary?.total_cost || 0),
    },
  ];

  // Countdown: decrement every second → auto-submit at 0.
  useEffect(() => {
    if (!pendingVoiceSubmit) return;
    if (pendingVoiceSubmit.countdown <= 0) {
      setPendingVoiceSubmit(null);
      submitAnswer(pendingVoiceSubmit.text, 'voice');
      return;
    }
    pendingTimerRef.current = setTimeout(() => {
      setPendingVoiceSubmit((prev) => prev ? { ...prev, countdown: prev.countdown - 1 } : null);
    }, 1000);
    return () => { if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current); };
  }, [pendingVoiceSubmit]);

  // Auto-dismiss low-confidence banner after 8 seconds (enough time to read + act)
  useEffect(() => {
    if (!lowConfPrompt) return;
    const t = setTimeout(() => setLowConfPrompt(null), 8000);
    return () => clearTimeout(t);
  }, [lowConfPrompt]);

  // Cancels the auto-submit countdown when the user manually edits the text field.
  const handleInputChange = (value: string) => {
    setCurrentInput(value);
    if (pendingVoiceSubmit) {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      setPendingVoiceSubmit(null);
    }
  };

  // Clear input and reset when question changes.
  useEffect(() => {
    if (prompt) {
      setCurrentInput('');
      setError('');
      setPendingVoiceSubmit(null);
      setLowConfPrompt(null);
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    }
  }, [prompt?.id]);

  // Request mic permission on mount (no auto-listen).
  useEffect(() => {
    if (voice.supported) voice.requestPermission();
  }, [voice.supported]);

  const buildSpokenPrompt = () => {
    if (!prompt) return '';
    let spoken = prompt.text;
    if (prompt.example) spoken += `. Example: ${prompt.example}.`;
    if (prompt.options?.length) spoken += `. Options: ${prompt.options.join(', ')}.`;
    return spoken;
  };

  const _doSpeak = (text: string, onEnd: () => void) => {
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    utter.pitch = 1.0;
    // Do NOT set lang/voice — let the browser use its default en voice.
    // Setting lang='en-IN' silently fails on Linux where espeak-ng has no en-IN voice.
    speechUtteranceRef.current = utter;
    utter.onstart = () => console.log('[TTS] onstart');
    utter.onend = () => { console.log('[TTS] onend'); onEnd(); };
    utter.onerror = (e) => { console.error('[TTS] onerror:', e.error, e); onEnd(); };
    synth.resume();
    console.log('[TTS] speak() — paused:', synth.paused, 'speaking:', synth.speaking, 'pending:', synth.pending);
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(() => synth.speak(utter), 50);
    } else {
      synth.speak(utter);
    }
  };

  // Speak the question, then auto-start the mic (voice-first UX).
  const speakAndListen = async () => {
    if (!prompt || loading || submitting) return;
    if (!speechSupported || !aiVoiceEnabled) {
      if (voice.supported && !voice.isListening && !voice.isProcessing) voice.start();
      return;
    }
    setIsQuestionSpeaking(true);
    _doSpeak(buildSpokenPrompt(), () => {
      setIsQuestionSpeaking(false);
      if (voice.supported && !voice.isListening && !voice.isProcessing) voice.start();
    });
  };

  // Speak question without auto-starting mic — used for replay button.
  const speakQuestion = () => {
    if (!prompt || !speechSupported) return;
    setIsQuestionSpeaking(true);
    _doSpeak(buildSpokenPrompt(), () => setIsQuestionSpeaking(false));
  };

  // Auto-speak (and then auto-listen) when a new question arrives.
  useEffect(() => {
    if (!prompt || !state || loading) return;
    const signature = `${prompt.id}:${state.requires_confirmation ? 'confirm' : 'question'}`;
    if (lastSpokenPromptRef.current === signature) return;
    lastSpokenPromptRef.current = signature;
    speakAndListen();
  }, [prompt?.id, state?.requires_confirmation, loading]);

  // Cancel speech on unmount.
  useEffect(() => {
    return () => {
      if (speechSupported && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    };
  }, [speechSupported]);

  const submitAnswer = async (overrideText?: string, inputMethod: 'text' | 'voice' = 'text', validationOverride?: boolean) => {
    if (!state || !prompt || submitting) return;
    const answer = (overrideText ?? currentInput).trim();
    if (!answer) return;

    const effectiveValidation = validationOverride ?? validationEnabled;

    setSubmitting(true);
    setError('');
    try {
      const { data } = await landSurveyAPI.answer({
        session_id: state.session_id,
        question_id: prompt.id,
        answer_text: answer,
        language: selectedLanguage,
        input_method: inputMethod,
        confidence_score: 1.0,
        enable_validation_question: effectiveValidation,
      });
      setState(data);
      if (typeof data?.context?.validation_enabled === 'boolean' && data.context.validation_enabled !== validationEnabled) {
        setValidationEnabled(data.context.validation_enabled);
        localStorage.setItem(LAND_VALIDATION_TOGGLE_KEY, String(data.context.validation_enabled));
      }
      if (data.status === 'completed') {
        const dash = await landSurveyAPI.dashboard(data.session_id);
        setDashboard(dash.data);
        const looker = await landSurveyAPI.lookerUrl(data.session_id).catch(() => null);
        if (looker?.data?.url) setLookerUrl(looker.data.url);
        else if (looker?.data?.setup_instructions) setLookerSetup(looker.data.setup_instructions);
      }
    } catch (e: any) {
      const msg = e.message || 'Invalid answer. Please try again.';
      // Session out of sync — re-fetch current question and silently recover
      if (msg.includes('Expected answer for') && state?.session_id) {
        try {
          const { data } = await landSurveyAPI.get(state.session_id);
          setState(data);
          setError('');
        } catch {
          setError(msg);
        }
      } else {
        setError(msg);
        speakText(msg, () => {
          if (voice.supported && !voice.isListening && !voice.isProcessing) voice.start();
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const refreshSessionAndDashboard = async (sessionId: string) => {
    const [sessionRes, dashRes] = await Promise.all([
      landSurveyAPI.get(sessionId),
      landSurveyAPI.dashboard(sessionId),
    ]);
    setState(sessionRes.data);
    setDashboard(dashRes.data);
    if (!lookerUrl && !lookerSetup) {
      const looker = await landSurveyAPI.lookerUrl(sessionId).catch(() => null);
      if (looker?.data?.url) setLookerUrl(looker.data.url);
      else if (looker?.data?.setup_instructions) setLookerSetup(looker.data.setup_instructions);
    }
  };

  const getPriceMeta = (cropName: string) => {
    const sources = state?.context?.market_price_source || {};
    const raw = sources[cropName] ?? sources[String(cropName || '').toLowerCase()];
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string') return { source: raw, mode: 'auto' };
    return null;
  };

  const handleRefreshMarketPrices = async () => {
    if (!state?.session_id || marketUpdating) return;
    setMarketUpdating(true);
    setError('');
    try {
      await landSurveyAPI.refreshMarketPrices(state.session_id);
      await refreshSessionAndDashboard(state.session_id);
    } catch (e: any) {
      setError(e.message || 'Failed to refresh market prices.');
    } finally {
      setMarketUpdating(false);
    }
  };

  const handleSetManualPrice = async (cropName: string, fallbackPrice: number) => {
    if (!state?.session_id || marketUpdating) return;
    const raw = (overrideValues[cropName] ?? String(fallbackPrice ?? '')).trim();
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed < 0) {
      setError(`Enter a valid non-negative price for ${cropName}.`);
      return;
    }

    setMarketUpdating(true);
    setError('');
    try {
      await landSurveyAPI.overrideCropPrice(state.session_id, {
        crop_name: cropName,
        price_per_kg: parsed,
        use_market_price: false,
      });
      await refreshSessionAndDashboard(state.session_id);
      setOverrideValues((prev) => ({ ...prev, [cropName]: String(parsed) }));
    } catch (e: any) {
      setError(e.message || `Failed to set manual price for ${cropName}.`);
    } finally {
      setMarketUpdating(false);
    }
  };

  const handleUseAutoPrice = async (cropName: string) => {
    if (!state?.session_id || marketUpdating) return;
    setMarketUpdating(true);
    setError('');
    try {
      await landSurveyAPI.overrideCropPrice(state.session_id, {
        crop_name: cropName,
        use_market_price: true,
      });
      await refreshSessionAndDashboard(state.session_id);
    } catch (e: any) {
      setError(e.message || `Failed to switch ${cropName} back to auto price.`);
    } finally {
      setMarketUpdating(false);
    }
  };

  const [goingBack, setGoingBack] = useState(false);
  const handleBack = async () => {
    if (!state?.session_id || goingBack) return;
    setGoingBack(true);
    setError('');
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    setPendingVoiceSubmit(null);
    setCurrentInput('');
    try {
      const { data } = await landSurveyAPI.back(state.session_id);
      setState(data);
    } catch (e: any) {
      setError(e.message || 'Could not go back.');
    } finally {
      setGoingBack(false);
    }
  };

  const handleRestart = async () => {
    localStorage.removeItem(LAND_SESSION_KEY);
    setState(null);
    setDashboard(null);
    setCurrentInput('');
    setLookerUrl(null);
    setLookerSetup(null);
    setOverrideValues({});
    setSelectedFarmId('');
    setPendingVoiceSubmit(null);
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    lastSpokenPromptRef.current = '';
    if (speechSupported && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    // Don't auto-boot — show farm picker instead
  };

  const handleValidationToggle = async () => {
    const next = !validationEnabled;
    setValidationEnabled(next);
    localStorage.setItem(LAND_VALIDATION_TOGGLE_KEY, String(next));

    // If we are currently on a confirmation prompt and validation is turned off,
    // auto-continue with the pending parsed answer.
    if (!next && state?.requires_confirmation && prompt?.id === 'confirm_current' && !submitting) {
      await submitAnswer('yes', 'text', false);
    }
  };

  if (loading && !state) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-20">
        <div className="animate-pulse flex items-center gap-3">
          <Loader2 className="w-6 h-6 text-purple-600 animate-spin" />
          <span className="text-gray-600">{tr('survey_preparing')}</span>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="max-w-xl mx-auto py-16">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">{tr('land_survey_title')}</h2>
          <p className="text-gray-500 mb-8 text-sm">{tr('link_farm_optional')}</p>
          {farms.length > 0 && (
            <div className="mb-6">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">{tr('link_farm_optional')}</Label>
              <select
                value={selectedFarmId}
                onChange={(e) => setSelectedFarmId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">{tr('no_farm_link')}</option>
                {farms.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.location})</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <Button onClick={startSurvey} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
            {tr('start_land_survey')}
          </Button>
        </div>
      </div>
    );
  }

  if (isComplete && dashboard) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <PretextText
              text={tr('land_complete')}
              font={PRETEXT_TITLE_FONT}
              lineHeight={40}
              className="mb-2 text-gray-900"
            />
            <PretextText
              text={tr('financial_analysis')}
              font={PRETEXT_BASE_FONT}
              lineHeight={24}
              className="text-gray-600"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-emerald-50 rounded-lg p-6">
              <p className="text-sm text-emerald-600 mb-1">{tr('total_revenue')}</p>
              <p className="text-emerald-900 font-medium text-lg">
                ₹{Number(dashboard.summary?.total_revenue || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6">
              <p className="text-sm text-amber-600 mb-1">{tr('total_cost')}</p>
              <p className="text-amber-900 font-medium text-lg">
                ₹{Number(dashboard.summary?.total_cost || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6">
              <p className="text-sm text-blue-600 mb-1">{tr('net_profit')}</p>
              <p className="text-blue-900 font-medium text-lg">
                ₹{Number(dashboard.summary?.profit || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6">
              <p className="text-sm text-purple-600 mb-1">{tr('roi')}</p>
              <p className="text-purple-900 font-medium text-lg">
                {dashboard.summary?.roi_percent == null ? 'N/A' : `${dashboard.summary.roi_percent}%`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
            <div className="rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-900 mb-4 font-semibold">{tr('cost_breakdown')}</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={105}
                      label
                    >
                      {costData.map((entry, i) => (
                        <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatINR(Number(v || 0))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-900 mb-4 font-semibold">{tr('revenue_vs_cost')}</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueVsCostData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => formatINR(Number(v || 0))} />
                    <Legend />
                    <Bar dataKey="Revenue" fill="#22c55e" />
                    <Bar dataKey="Cost" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-gray-900 mb-4 font-semibold">{tr('crop_analysis')}</h3>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs text-gray-500">
                {tr('market_price_auto')}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={handleRefreshMarketPrices}
                disabled={marketUpdating}
              >
                {marketUpdating ? tr('refreshing') : tr('refresh_prices')}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{tr('col_crop')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{tr('col_yield')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{tr('col_price_unit')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{tr('col_price_source')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{tr('col_revenue')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{tr('col_cost')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{tr('col_profit')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">{tr('col_override')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {(dashboard.crop_performance || []).map((row: any, index: number) => {
                    const meta = getPriceMeta(row.crop);
                    const sourceLabel = meta?.source || row.price_source || 'manual/unknown';
                    const isManual = meta?.mode === 'manual';
                    return (
                    <tr key={index}>
                      <td className="px-4 py-3 text-gray-900 capitalize">{row.crop}</td>
                      <td className="px-4 py-3 text-gray-600">{row.annual_yield_kg}</td>
                      <td className="px-4 py-3 text-gray-600">₹{row.price_per_kg}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <p className="text-xs font-medium">{sourceLabel}</p>
                        {meta?.fetched_at ? (
                          <p className="text-[11px] text-gray-500">{new Date(meta.fetched_at).toLocaleString()}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-900">₹{Number(row.revenue_annual || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-gray-600">₹{Number(row.allocated_cost_annual || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-emerald-700 font-medium">₹{Number(row.profit_annual || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-gray-600 min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={overrideValues[row.crop] ?? String(row.price_per_kg ?? '')}
                            onChange={(e) => setOverrideValues((prev) => ({ ...prev, [row.crop]: e.target.value }))}
                            className="h-8"
                            min="0"
                            step="0.01"
                            disabled={marketUpdating}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => handleSetManualPrice(row.crop, Number(row.price_per_kg || 0))}
                            disabled={marketUpdating}
                          >
                            {tr('btn_save')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => handleUseAutoPrice(row.crop)}
                            disabled={marketUpdating || !isManual}
                          >
                            {tr('btn_auto')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    )})}
                </tbody>
              </table>
            </div>
          </div>

          {lookerSetup && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-900 mb-2">Looker Studio Setup (one-time)</p>
              <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                {lookerSetup.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
              <p className="text-xs text-blue-600 mt-2">Once configured, set <code>LOOKER_STUDIO_REPORT_ID</code> in your backend .env and restart.</p>
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleRestart} variant="outline" className="flex-1">
              {tr('start_new_plan')}
            </Button>
            {lookerUrl && (
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={() => window.open(lookerUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View in Looker Studio
              </Button>
            )}
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={async () => {
              if (state?.session_id) {
                try {
                  await landSurveyAPI.syncSheet(state.session_id);
                  alert('Successfully synced with Google Sheets!');
                } catch (e: any) {
                  alert('Sync failed: ' + e.message);
                }
              }
            }}>
              {tr('sync_sheets')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-20">
        <p className="text-gray-500">{tr('survey_failed_load')}</p>
        <Button onClick={handleRestart} variant="outline" className="ml-4">{tr('btn_retry')}</Button>
      </div>
    );
  }

  const progressValue = ((state.progress_answered + 1) / Math.max(state.progress_total, state.progress_answered + 1)) * 100;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Mic className="w-5 h-5" />
              <span className="text-sm font-medium">{tr('land_survey_title')}</span>
            </div>
          </div>
          <PretextText
            text={tr('land_survey_title')}
            font={PRETEXT_TITLE_FONT}
            lineHeight={40}
            className="text-gray-900 mb-2"
          />
          <PretextText
            text={tr('land_survey_desc')}
            font={PRETEXT_BASE_FONT}
            lineHeight={24}
            className="text-gray-600"
          />
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              {tr('question_label')} {state.progress_answered + 1}
            </span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>

        <div className="mb-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <PretextText
              text={prompt.text}
              font={PRETEXT_PROMPT_FONT}
              lineHeight={30}
              className="text-blue-900"
            />
            {prompt.example ? (
              <PretextText
                text={`Example: ${prompt.example}`}
                font={PRETEXT_EXAMPLE_FONT}
                lineHeight={22}
                className="text-blue-700 mt-2"
                whiteSpace="pre-wrap"
              />
            ) : null}
          </div>

          <div>
            <Label>{state?.requires_confirmation ? tr('confirm_answer') : tr('your_answer')}</Label>
            <div className="flex gap-2 mt-2">
              {/* Mic button: start/stop recording manually */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (pendingVoiceSubmit) {
                    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
                    setPendingVoiceSubmit(null);
                  }
                  if (voice.isListening) { voice.stop(); }
                  else if (!voice.isProcessing && !voice.isStarting) { voice.start(); }
                }}
                disabled={submitting}
                className={`px-3 shrink-0 ${voice.isListening ? 'border-red-400 bg-red-50' : ''}`}
                title={voice.isListening ? 'Stop recording' : 'Start recording'}
              >
                {voice.isListening ? (
                  <MicOff className="w-4 h-4 text-red-500" />
                ) : (voice.isStarting || voice.isProcessing) ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </Button>
              <Input
                type="text"
                value={currentInput}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (pendingVoiceSubmit) {
                      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
                      setPendingVoiceSubmit(null);
                    }
                    submitAnswer();
                  }
                }}
                placeholder={state?.requires_confirmation ? tr('say_yes_or_no') : tr('speak_or_type')}
                className="text-lg py-6"
                disabled={submitting}
                autoFocus
              />
              {/* Replay question */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  lastSpokenPromptRef.current = '';
                  if (aiVoiceEnabled) speakQuestion();
                  else { lastSpokenPromptRef.current = ''; speakQuestion(); }
                }}
                disabled={isQuestionSpeaking}
                className="px-3 shrink-0"
                title="Replay question"
              >
                {isQuestionSpeaking ? <VolumeX className="w-4 h-4 animate-pulse" /> : <Volume2 className="w-4 h-4" />}
              </Button>
            </div>

            {/* 3-second review banner — shown after Whisper returns a transcript */}
            {pendingVoiceSubmit && (
              <div className="mt-3 flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 text-white text-sm font-bold shrink-0">
                    {pendingVoiceSubmit.countdown}
                  </span>
                  <span className="text-sm text-emerald-900 truncate">
                    {tr('submitting_answer')} <strong>"{pendingVoiceSubmit.text}"</strong>
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-emerald-400 text-emerald-700 hover:bg-emerald-100"
                  onClick={() => {
                    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
                    setPendingVoiceSubmit(null);
                  }}
                >
                  Edit
                </Button>
              </div>
            )}

            {/* Status row */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {voice.isListening && (
                <span className="text-xs px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 animate-pulse">
                  🎙 Listening — speak now
                </span>
              )}
              {voice.isProcessing && (
                <span className="text-xs px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-700">
                  ⚙ Whisper processing...
                </span>
              )}
              {isQuestionSpeaking && (
                <span className="text-xs px-2 py-1 rounded-md bg-purple-50 border border-purple-200 text-purple-700">
                  🔊 Reading question...
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAiVoiceEnabled((prev) => {
                      const next = !prev;
                      if (!next && speechSupported && window.speechSynthesis.speaking) {
                        window.speechSynthesis.cancel();
                        setIsQuestionSpeaking(false);
                      }
                      return next;
                    });
                  }}
                >
                  {aiVoiceEnabled ? <Volume2 className="w-3.5 h-3.5 mr-1" /> : <VolumeX className="w-3.5 h-3.5 mr-1" />}
                  AI Voice {aiVoiceEnabled ? 'On' : 'Off'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleValidationToggle}>
                  Validation {validationEnabled ? 'On' : 'Off'}
                </Button>
              </div>
            </div>

            {voice.error && (
              <p className="text-amber-600 text-sm mt-2">
                ⚠ {voice.error} — please speak more clearly or type your answer.
              </p>
            )}
            {lowConfPrompt && (
              <div className="mt-2 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <span className="text-amber-600 shrink-0 mt-0.5">⚠</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-800 font-medium mb-1">Low confidence — did we hear you correctly?</p>
                  <p className="text-xs text-amber-700 truncate">"{lowConfPrompt.original}"</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    onClick={() => setLowConfPrompt(null)}
                  >
                    Correct
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 bg-white hover:bg-amber-50"
                    onClick={async () => {
                      if (!lowConfPrompt) return;
                      const corrected = currentInput.trim();
                      if (corrected && corrected !== lowConfPrompt.original) {
                        await audioAPI.correct(
                          lowConfPrompt.auditId,
                          lowConfPrompt.original,
                          corrected,
                          { language: selectedLanguage, questionId: prompt?.id, sessionId: state?.session_id }
                        ).catch(() => {});
                      }
                      setLowConfPrompt(null);
                    }}
                  >
                    Wrong — submit fix
                  </button>
                </div>
              </div>
            )}
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleBack}
              variant="outline"
              size="sm"
              disabled={goingBack || submitting || !state?.session_id}
              title="Go back to previous question"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              {goingBack ? '...' : 'Back'}
            </Button>
            <Button
              onClick={handleRestart}
              variant="outline"
              size="sm"
              className="text-gray-400 border-gray-200 hover:text-red-600 hover:border-red-300"
              title="Discard current survey and start from scratch"
            >
              Start Fresh
            </Button>
          </div>
          <Button
            onClick={() => {
              if (pendingVoiceSubmit) {
                if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
                setPendingVoiceSubmit(null);
              }
              submitAnswer();
            }}
            disabled={!currentInput || submitting}
            className="bg-emerald-600 hover:bg-emerald-700 px-8"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {submitting ? 'Submitting...' : state?.requires_confirmation ? 'Confirm' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
