import { useState, useEffect, useRef, useCallback, Component } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Sparkles,
  AlertCircle,
  Leaf,
  TrendingUp,
  AlertTriangle,
  XCircle,
  Mic,
  MicOff,
  Loader2,
} from 'lucide-react';
import { useStore } from '../../store';
import { reportAPI, audioAPI } from '../../utils/api';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { PretextText } from '../ui/pretext-text';
import { LangCode, createT } from '../../utils/i18n';

class SurveyErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: any) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <p className="text-gray-800 font-medium mb-1">Something went wrong displaying this page.</p>
            <p className="text-gray-500 text-sm mb-4">Your survey data is saved. You can download your report from the Reports page.</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"
            >
              Reload page
            </button>
            {/* Note: error boundary has no lang context — strings use English fallback */}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


const PRETEXT_BASE_FONT = '400 1rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_TITLE_FONT = '600 2rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_PROMPT_FONT = '500 1.125rem Inter, "Noto Sans", "Segoe UI", sans-serif';
const PRETEXT_HINT_FONT = '400 0.875rem Inter, "Noto Sans", "Segoe UI", sans-serif';

// Converts spoken word-numbers (including Indian system) to digit strings.
// "Five lakh" → "500000", "twenty thousand" → "20000", "5,000" → "5000".
function normalizeNumberWords(text: string): string {
  const cleaned = text.replace(/,/g, '').trim();
  if (/^\d+(\.\d+)?$/.test(cleaned)) return cleaned; // already pure digits
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
  const tokens = cleaned.toLowerCase().replace(/\s+/g, ' ').trim().split(' ');
  // Check if there are any digit tokens mixed with word tokens
  const digitMatch = cleaned.replace(/\s/g, '').match(/\d+(\.\d+)?/);
  if (digitMatch) return digitMatch[0];
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

function AISurveyInner() {
  const { session, loading, startSession, submitAnswer, goBackQuestion, analysis, resetSession, restoreSurveyState, globalLanguage } = useStore((state: any) => ({
    session: state.session,
    loading: state.loading,
    startSession: state.startSession,
    submitAnswer: state.submitAnswer,
    goBackQuestion: state.goBackQuestion,
    analysis: state.analysis,
    resetSession: state.resetSession,
    restoreSurveyState: state.restoreSurveyState,
    globalLanguage: state.globalLanguage,
  }));

  const selectedLanguage = globalLanguage || 'en';
  const tr = createT((selectedLanguage as LangCode) || 'en');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [lowConfPrompt, setLowConfPrompt] = useState<{ auditId: string; original: string } | null>(null);
  const [parsedValue, setParsedValue] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [ttsAvailable, setTtsAvailable] = useState(true); // false if browser has no voices
  const initializedRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pendingTtsRef = useRef<string | null>(null);
  const currentQuestionTypeRef = useRef<string | undefined>(undefined);

  // Keep ref in sync so onResult closure always sees the latest question type
  useEffect(() => {
    currentQuestionTypeRef.current = session?.current_question?.type;
  }, [session?.current_question?.type]);

  // Auto-dismiss low-confidence banner after 8 seconds
  useEffect(() => {
    if (!lowConfPrompt) return;
    const t = setTimeout(() => setLowConfPrompt(null), 8000);
    return () => clearTimeout(t);
  }, [lowConfPrompt]);

  // Detect TTS voice availability — update both ways (true AND false) so the check
  // doesn't get stuck false when voices load asynchronously after first empty call.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) { setTtsAvailable(false); return; }
    const check = () => setTtsAvailable(synth.getVoices().length > 0);
    check();
    synth.addEventListener('voiceschanged', check);
    const t = setTimeout(check, 2000);
    return () => { synth.removeEventListener('voiceschanged', check); clearTimeout(t); };
  }, []);

  // Voice recorder
  const { isListening, isStarting, isProcessing, error: voiceError, start: startVoice, stop: stopVoice, supported: voiceSupported } = useVoiceRecorder({
    onResult: useCallback((text: string, conf: number, data: any) => {
      const normalized = currentQuestionTypeRef.current === 'number' ? normalizeNumberWords(text) : text;
      setCurrentAnswer(normalized);
      // Show correction banner when confidence is low so user can flag bad transcriptions
      if (conf < 0.6 && data?.audit_id) {
        setLowConfPrompt({ auditId: data.audit_id, original: normalized });
      } else {
        setLowConfPrompt(null);
      }
    }, []),
    questionId: session?.current_question?.id,
    questionType: session?.current_question?.type,
    language: selectedLanguage,
  });

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      try {
        // Restore an in-progress or completed session from localStorage first.
        // Only start a brand-new session if there is nothing to resume.
        const restored = await restoreSurveyState();
        if (!restored) {
          resetSession();
          await startSession(null, selectedLanguage);
        }
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, [restoreSurveyState, resetSession, startSession]);

  // When language changes mid-survey, re-fetch current session to get translated question
  const prevLangRef = useRef(selectedLanguage);
  useEffect(() => {
    if (prevLangRef.current === selectedLanguage) return;
    prevLangRef.current = selectedLanguage;
    const sid = session?.session_id;
    if (!sid || session?.status !== 'in_progress') return;
    import('../../utils/api').then(({ sessionAPI }) => {
      sessionAPI.get(sid, selectedLanguage).then(({ data }: any) => {
        // Only update the displayed question text — don't overwrite full session state
        // since the store session is the source of truth for progress/status
        useStore.setState((s: any) => ({
          session: s.session ? { ...s.session, current_question: data.current_question } : s.session,
        }));
      }).catch(() => {});
    });
  }, [selectedLanguage, session?.session_id, session?.status]);

  const currentQuestion = session?.current_question;
  const progress = session ? (session.progress_answered / session.progress_total) * 100 : 0;
  const isComplete = session?.status === 'completed';

  // Keep a stable ref to startVoice so TTS onend callback is never stale
  const startVoiceRef = useRef(startVoice);
  useEffect(() => { startVoiceRef.current = startVoice; }, [startVoice]);

  // Speak a question aloud. Called either directly from a click (🔊 Read button)
  // or from handleConfirm after await — both paths work because Chrome's transient
  // user-activation window lasts ~5 s, covering the typical API round-trip.
  const speakText = useCallback((text: string) => {
    const synth = window.speechSynthesis;
    if (!synth || !ttsEnabled) return;

    // Only open mic for free-text questions — select/boolean/multiselect use button clicks
    const qType = currentQuestionTypeRef.current;
    const openMic = () => {
      if (qType === 'text' || qType === 'number') {
        setTimeout(() => { if (voiceSupported) startVoiceRef.current(); }, 1500);
      }
    };

    const doSpeak = () => {
      const voices = synth.getVoices();
      // Prefer a voice that matches the current language; fall back to English only if lang is 'en'
      const langVoice = voices.find(v => v.lang.startsWith(selectedLanguage) && v.localService)
                     ?? voices.find(v => v.lang.startsWith(selectedLanguage));
      const enVoice  = langVoice
                     ?? (selectedLanguage === 'en' ? (voices.find(v => v.lang.startsWith('en') && v.localService) ?? voices.find(v => v.lang.startsWith('en'))) : null);
      console.log('[TTS] doSpeak — voices:', voices.length,
        '| chosen:', enVoice?.name, '| lang match:', !!langVoice,
        '| paused:', synth.paused, '| speaking:', synth.speaking);
      // If the language is not English and no matching voice found, skip TTS and open mic directly
      if (!enVoice && selectedLanguage !== 'en') {
        console.log('[TTS] No voice for lang', selectedLanguage, '— skipping TTS, opening mic directly');
        openMic();
        return;
      }
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.9;
      if (enVoice) utt.voice = enVoice;
      utt.onstart = () => console.log('[TTS] onstart fired');
      utt.onend = () => { console.log('[TTS] onend fired'); openMic(); };
      utt.onerror = (e) => { console.error('[TTS] onerror:', e.error, e); openMic(); };
      utteranceRef.current = utt;
      synth.speak(utt);
      console.log('[TTS] speak() called — speaking now:', synth.speaking, '| pending:', synth.pending);
    };

    // Always resume first — Chrome auto-pauses the synthesis engine after inactivity.
    synth.resume();
    console.log('[TTS] speakText called — paused:', synth.paused, '| speaking:', synth.speaking, '| pending:', synth.pending);

    if (synth.speaking || synth.pending) {
      synth.cancel();
      console.log('[TTS] cancelled existing speech, waiting 50ms');
      setTimeout(doSpeak, 50);
    } else {
      const voices = synth.getVoices();
      if (voices.length > 0) {
        doSpeak();
      } else {
        console.log('[TTS] no voices yet, waiting for voiceschanged');
        synth.addEventListener('voiceschanged', doSpeak, { once: true });
      }
    }
  }, [ttsEnabled, voiceSupported]);

  // Auto-open mic when question changes — always open mic immediately alongside TTS
  useEffect(() => {
    if (!currentQuestion || isComplete) return;
    window.speechSynthesis?.cancel();
    if (voiceSupported && (currentQuestion.type === 'text' || currentQuestion.type === 'number')) {
      // Open mic immediately within user gesture context — don't wait for TTS to finish
      const t = setTimeout(() => startVoiceRef.current(), 600);
      return () => clearTimeout(t);
    }
  }, [currentQuestion?.id, voiceSupported, isComplete]);

  // Update input text when question changes
  useEffect(() => {
    setCurrentAnswer('');
    setShowConfirmation(false);
    setLowConfPrompt(null);
  }, [currentQuestion?.id]);

  if (isInitializing || loading && !currentQuestion && !isComplete) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-20">
        <div className="animate-pulse flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-emerald-600 animate-spin" />
          <span className="text-gray-600">{tr('survey_preparing')}</span>
        </div>
      </div>
    );
  }

  const handleNext = () => {
    if (!currentAnswer) return;
    setParsedValue(currentAnswer);
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    if (!currentQuestion || submitting) return;
    setSubmitting(true);
    try {
      const result: any = await submitAnswer(currentQuestion.id, parsedValue, 'text', null, null, selectedLanguage);
      setShowConfirmation(false);
      setCurrentAnswer('');
      setParsedValue('');
      // Speak next question from user-gesture context — Chrome blocks speak() from useEffect
      if (result?.current_question?.text) speakText(result.current_question.text);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = async () => {
    if (showConfirmation) {
      setShowConfirmation(false);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await goBackQuestion();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestart = async () => {
    resetSession();
    setCurrentAnswer('');
    setShowConfirmation(false);
    setSubmitting(false);
    await startSession(null, selectedLanguage);
  };

  if (isComplete && analysis) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <PretextText
              text={tr('survey_complete')}
              font={PRETEXT_TITLE_FONT}
              lineHeight={40}
              className="text-gray-900 mb-2"
            />
            <PretextText
              text={tr('ai_analysis_ready')}
              font={PRETEXT_BASE_FONT}
              lineHeight={24}
              className="text-gray-600"
            />
          </div>

          {(() => {
            const fp = analysis.financial_plan || {};
            const revenue = fp.total_revenue_annual ?? null;
            const opex = fp.total_opex_annual ?? null;
            const capex = fp.total_capex ?? null;
            const profit = revenue !== null && opex !== null ? revenue - opex : null;
            const fmt = (v: number | null) => v !== null ? `₹${Math.round(v).toLocaleString('en-IN')}` : '---';
            const recs: string[] = fp.ai_recommendations || [];
            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-emerald-50 rounded-lg p-6 text-center">
                    <p className="text-sm text-emerald-600 mb-2">{tr('annual_revenue')}</p>
                    <p className="text-emerald-900 font-medium text-lg">{fmt(revenue)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-6 text-center">
                    <p className="text-sm text-amber-600 mb-2">{tr('capex_opex')}</p>
                    <p className="text-amber-900 font-medium text-lg">
                      {capex !== null && opex !== null ? `₹${Math.round(capex + opex).toLocaleString('en-IN')}` : '---'}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-6 text-center">
                    <p className="text-sm text-blue-600 mb-2">{tr('annual_profit')}</p>
                    <p className="text-blue-900 font-medium text-lg">{fmt(profit)}</p>
                  </div>
                </div>
                {fp.roi_percent !== null && fp.roi_percent !== undefined && (
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-purple-50 rounded-lg p-4 text-center">
                      <p className="text-sm text-purple-600 mb-1">{tr('roi')}</p>
                      <p className="text-purple-900 font-semibold">{Number(fp.roi_percent).toFixed(1)}%</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-sm text-gray-600 mb-1">{tr('payback_period')}</p>
                      <p className="text-gray-900 font-semibold">{fp.payback_period_months ? `${fp.payback_period_months} ${tr('months')}` : '---'}</p>
                    </div>
                  </div>
                )}
                <div className="bg-gray-50 rounded-lg p-6 mb-6">
                  <h3 className="text-gray-900 mb-4 font-semibold">{tr('ai_recommendations')}</h3>
                  <ul className="space-y-4">
                    {recs.map((rec: any, index: number) => {
                      const title = typeof rec === 'string' ? rec : (rec.title || rec.detail || '');
                      const detail = typeof rec === 'object' && rec !== null ? rec.detail : '';
                      const category = typeof rec === 'object' && rec !== null ? rec.category : '';
                      const priority = typeof rec === 'object' && rec !== null ? rec.priority : '';
                      return (
                        <li key={index} className="flex items-start gap-3">
                          <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-1" />
                          <div className="flex-1">
                            {(category || priority) && (
                              <div className="flex items-center gap-2 mb-0.5">
                                {category && <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">{category}</span>}
                                {priority === 'high' && <span className="text-xs font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">High Priority</span>}
                              </div>
                            )}
                            <p className="text-gray-800 font-medium text-sm">{title}</p>
                            {detail && detail !== title && <p className="text-gray-500 text-sm mt-0.5">{detail}</p>}
                          </div>
                        </li>
                      );
                    })}
                    {!recs.length && (
                      <li className="text-gray-500 italic">Analysis generated successfully.</li>
                    )}
                  </ul>
                </div>
              </>
            );
          })()}

          {/* Crop Intelligence Section */}
          {session?.context?.crop_intelligence?.evaluated && (
            <div className="border border-emerald-200 rounded-lg p-6 mb-6 bg-emerald-50">
              <div className="flex items-center gap-2 mb-4">
                <Leaf className="w-5 h-5 text-emerald-600" />
                <h3 className="font-semibold text-gray-900">{tr('crop_feasibility')}</h3>
                <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                  {session.context.crop_intelligence.area_m2} m²
                </span>
              </div>
              <div className="space-y-4">
                {(session.context.crop_intelligence.evaluations || []).map((ev: any) => {
                  const feasibility = ev.feasibility;
                  const colorMap: Record<string, string> = {
                    feasible: 'bg-green-50 border-green-200',
                    challenging: 'bg-amber-50 border-amber-200',
                    not_feasible: 'bg-red-50 border-red-200',
                    unknown: 'bg-gray-50 border-gray-200',
                  };
                  const badgeMap: Record<string, string> = {
                    feasible: 'bg-green-100 text-green-700',
                    challenging: 'bg-amber-100 text-amber-700',
                    not_feasible: 'bg-red-100 text-red-700',
                    unknown: 'bg-gray-100 text-gray-600',
                  };
                  const IconMap: Record<string, any> = {
                    feasible: CheckCircle,
                    challenging: AlertTriangle,
                    not_feasible: XCircle,
                    unknown: AlertCircle,
                  };
                  const Icon = IconMap[feasibility] || AlertCircle;
                  return (
                    <div key={ev.crop} className={`rounded-lg border p-4 ${colorMap[feasibility] || ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <span className="font-medium text-gray-900">{ev.crop}</span>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${badgeMap[feasibility] || ''}`}>
                          {feasibility.replace('_', ' ')}
                        </span>
                      </div>
                      {ev.yield_estimate?.annual_yield_kg && (
                        <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Est. annual yield: <strong>{ev.yield_estimate.annual_yield_kg} kg</strong></span>
                          <span className="text-gray-400">({ev.yield_estimate.cycles_per_year} cycles × {ev.yield_estimate.yield_per_m2_kg} kg/m²)</span>
                        </div>
                      )}
                      {[...(ev.reasons || []), ...(ev.warnings || [])].map((msg: string, i: number) => (
                        <p key={i} className="text-xs text-gray-600 mt-1">• {msg}</p>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleRestart} variant="outline" className="flex-1">
              {tr('start_new_survey')}
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => session?.session_id && reportAPI.download(session.session_id, `aquaponic-report-${session.session_id.slice(0,8)}.pdf`)}
            >
              {tr('download_pdf')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-20">
        <p className="text-gray-500">{tr('survey_failed_load')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <Sparkles className="w-5 h-5" />
              <span className="text-sm font-medium">Aquaponics Survey</span>
            </div>
            <div className="flex items-center gap-2">
              {!ttsAvailable ? (
                <span
                  className="text-xs text-amber-600 border border-amber-200 bg-amber-50 rounded px-2 py-1"
                  title="No TTS voices found. On Linux: sudo apt install espeak-ng speech-dispatcher, then restart Chrome."
                >
                  🔇 {tr('no_tts_voices')}
                </span>
              ) : (
                <button
                  onClick={() => { setTtsEnabled(v => !v); window.speechSynthesis?.cancel(); }}
                  className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-1"
                  title={ttsEnabled ? 'Mute voice' : 'Enable voice'}
                >
                  {ttsEnabled ? '🔊 Voice On' : '🔇 Voice Off'}
                </button>
              )}
            </div>
          </div>
          <PretextText
            text="Aquaponics Planning Survey"
            font={PRETEXT_TITLE_FONT}
            lineHeight={40}
            className="text-gray-900 mb-2"
          />
          <PretextText
            text="Answer a few questions to get personalized farm planning recommendations"
            font={PRETEXT_BASE_FONT}
            lineHeight={24}
            className="text-gray-600"
          />
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              Question {session.progress_answered + 1} of {session.progress_total}
            </span>
            <span className="text-sm font-medium text-emerald-600">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {!showConfirmation ? (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-lg block text-gray-900 font-medium">{tr('question_label')}</Label>
              {ttsEnabled && ttsAvailable && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      // Minimal test — bypasses speakText entirely
                      const s = window.speechSynthesis;
                      s.cancel();
                      const u = new SpeechSynthesisUtterance('test');
                      u.onstart = () => console.log('[TTS-TEST] onstart');
                      u.onend = () => console.log('[TTS-TEST] onend');
                      u.onerror = (e) => console.error('[TTS-TEST] onerror', e.error, e);
                      s.speak(u);
                      console.log('[TTS-TEST] raw speak called, speaking:', s.speaking);
                    }}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1"
                    title="Raw TTS test — check console"
                  >
                    🔬 Test
                  </button>
                  <button
                    onClick={() => speakText(currentQuestion.text)}
                    className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 border border-emerald-200 rounded px-2 py-1"
                    title="Read question aloud"
                  >
                    🔊 Read
                  </button>
                </div>
              )}
            </div>
            <PretextText
              text={currentQuestion.text}
              font={PRETEXT_PROMPT_FONT}
              lineHeight={30}
              className="text-gray-900 mb-2"
            />
            {currentQuestion.hint && (
              <PretextText
                text={currentQuestion.hint}
                font={PRETEXT_HINT_FONT}
                lineHeight={22}
                className="text-sm text-gray-500 mb-4"
              />
            )}

            {(currentQuestion.type === 'text' || currentQuestion.type === 'number') && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  {currentQuestion.unit === '₹' && (
                    <span className="text-gray-500">₹</span>
                  )}
                  <Input
                    type={currentQuestion.type}
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    placeholder={isProcessing ? tr('transcribing') : isListening ? tr('listening') : tr('type_or_speak')}
                    className="text-lg py-6"
                    autoFocus
                  />
                  {currentQuestion.unit && currentQuestion.unit !== '₹' && (
                    <span className="text-gray-500">{currentQuestion.unit}</span>
                  )}
                  {voiceSupported && (
                    <button
                      type="button"
                      onClick={() => isListening ? stopVoice() : startVoice()}
                      disabled={isProcessing || isStarting}
                      className={`flex-shrink-0 p-3 rounded-full border-2 transition-all ${
                        isListening
                          ? 'bg-red-50 border-red-400 text-red-600 animate-pulse'
                          : 'bg-gray-50 border-gray-300 text-gray-600 hover:border-emerald-400 hover:text-emerald-600'
                      }`}
                      title={isListening ? 'Stop recording' : 'Speak your answer'}
                    >
                      {isProcessing || isStarting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : isListening ? (
                        <MicOff className="w-5 h-5" />
                      ) : (
                        <Mic className="w-5 h-5" />
                      )}
                    </button>
                  )}
                </div>
                {voiceError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    {voiceError}
                  </p>
                )}
                {lowConfPrompt && (
                  <div className="mt-2 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-800 font-medium mb-1">{tr('low_confidence')}</p>
                      <p className="text-xs text-amber-700 truncate">"{lowConfPrompt.original}"</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        onClick={() => setLowConfPrompt(null)}
                      >
                        {tr('btn_correct_heard')}
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 bg-white hover:bg-amber-50"
                        onClick={async () => {
                          if (!lowConfPrompt) return;
                          const corrected = currentAnswer.trim();
                          if (corrected && corrected !== lowConfPrompt.original) {
                            await audioAPI.correct(
                              lowConfPrompt.auditId,
                              lowConfPrompt.original,
                              corrected,
                              { language: selectedLanguage, questionId: session?.current_question?.id, sessionId: session?.session_id }
                            ).catch(() => {});
                          }
                          setLowConfPrompt(null);
                        }}
                      >
                        {tr('btn_wrong_fix')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {(currentQuestion.type === 'select' || currentQuestion.type === 'boolean') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(currentQuestion.type === 'boolean' ? ['yes', 'no'] : currentQuestion.options || []).map((option: string) => (
                  <button
                    key={option}
                    onClick={() => setCurrentAnswer(option)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      currentAnswer === option
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {currentQuestion.type === 'multiselect' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(currentQuestion.options || []).map((option: string) => {
                  const selectedItems = currentAnswer ? currentAnswer.split(', ') : [];
                  const isSelected = selectedItems.includes(option);
                  return (
                    <button
                      key={option}
                      onClick={() => {
                        let newArr = [...selectedItems];
                        if (isSelected) newArr = newArr.filter(i => i !== option);
                        else newArr.push(option);
                        setCurrentAnswer(newArr.join(', '));
                      }}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-8">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-blue-900 mb-2">{tr('please_confirm')}</p>
                  <PretextText
                    text={`${tr('you_answered')} ${parsedValue}`}
                    font={PRETEXT_PROMPT_FONT}
                    lineHeight={28}
                    className="text-blue-800"
                    whiteSpace="pre-wrap"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={session.progress_answered === 0 && !showConfirmation || submitting}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr('btn_back')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-red-500 text-xs"
              onClick={() => { resetSession(); startSession(null, selectedLanguage); }}
              disabled={submitting}
            >
              Start Fresh
            </Button>
          </div>

          {!showConfirmation ? (
            <Button
              onClick={handleNext}
              disabled={!currentAnswer}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {session.progress_answered === session.progress_total - 1 ? tr('btn_complete') : tr('btn_next')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? tr('submitting') : tr('confirm_continue')}
              <CheckCircle className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AISurvey() {
  return (
    <SurveyErrorBoundary>
      <AISurveyInner />
    </SurveyErrorBoundary>
  );
}
