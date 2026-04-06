import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { Mic, MicOff, CheckCircle, Loader2, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import { landSurveyAPI } from '../../utils/api';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { PretextText } from '../ui/pretext-text';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';

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

export function LandVoiceSurvey() {
  const [state, setState] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [marketUpdating, setMarketUpdating] = useState(false);
  const [error, setError] = useState('');
  const [lastCapturedAnswer, setLastCapturedAnswer] = useState('');
  const [overrideValues, setOverrideValues] = useState<Record<string, string>>({});
  const [aiVoiceEnabled, setAiVoiceEnabled] = useState(true);
  const [autoListenEnabled, setAutoListenEnabled] = useState(true);
  const [isQuestionSpeaking, setIsQuestionSpeaking] = useState(false);
  const [isAwaitingInput, setIsAwaitingInput] = useState(false);
  const [validationEnabled, setValidationEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem(LAND_VALIDATION_TOGGLE_KEY);
    return saved == null ? false : saved === 'true';
  });
  const lastVoiceSubmitRef = useRef('');
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastSpokenPromptRef = useRef('');
  const speechSupported = typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  const boot = async () => {
    setLoading(true);
    setError('');
    try {
      const sid = localStorage.getItem(LAND_SESSION_KEY);
      if (sid) {
        const { data } = await landSurveyAPI.get(sid);
        setState(data);
        if (typeof data?.context?.validation_enabled === 'boolean') {
          setValidationEnabled(data.context.validation_enabled);
          localStorage.setItem(LAND_VALIDATION_TOGGLE_KEY, String(data.context.validation_enabled));
        }
        if (data.status === 'completed') {
          const dash = await landSurveyAPI.dashboard(sid);
          setDashboard(dash.data);
        }
      } else {
        const { data } = await landSurveyAPI.start({ enable_validation_question: validationEnabled });
        localStorage.setItem(LAND_SESSION_KEY, data.session_id);
        setState(data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    boot();
  }, []);

  const prompt = state?.current_question;
  const isComplete = state?.status === 'completed';
  const isOpenEndedCropQuestion = prompt?.id === 'crop_name';
  const autoStopMs = isOpenEndedCropQuestion ? 10000 : 4500;

  const voice = useVoiceRecorder({
    autoStopMs,
    phraseHints: [prompt?.text, prompt?.example, ...(prompt?.options || [])].filter(Boolean).join('. '),
  });

  useEffect(() => {
    if (voice.finalTranscript) {
      setCurrentInput(voice.finalTranscript);
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

  useEffect(() => {
    if (prompt) {
      setCurrentInput('');
      setError('');
      setIsAwaitingInput(false);
      lastVoiceSubmitRef.current = '';
    }
  }, [prompt?.id]);

  useEffect(() => {
    if (!autoListenEnabled || !voice.supported) return;
    voice.requestPermission();
  }, [autoListenEnabled, voice.supported, voice.requestPermission]);

  const buildSpokenPrompt = () => {
    if (!prompt) return '';
    let spoken = prompt.text;
    if (prompt.example) spoken += `. Example: ${prompt.example}.`;
    if (prompt.options?.length) spoken += `. Allowed answers: ${prompt.options.join(', ')}.`;
    return spoken;
  };

  const speakAndListen = async () => {
    if (!prompt || loading || submitting || !autoListenEnabled || !voice.supported) return;

    if (!speechSupported || !aiVoiceEnabled) {
      setIsAwaitingInput(true);
      await voice.start();
      setIsAwaitingInput(false);
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utter = new SpeechSynthesisUtterance(buildSpokenPrompt());
    utter.lang = 'en-IN';
    utter.rate = 0.95;
    utter.pitch = 1.0;
    speechUtteranceRef.current = utter;
    setIsQuestionSpeaking(true);

    utter.onend = async () => {
      setIsQuestionSpeaking(false);
      setIsAwaitingInput(true);
      await voice.start();
      setIsAwaitingInput(false);
    };

    utter.onerror = () => {
      setIsQuestionSpeaking(false);
      setIsAwaitingInput(false);
    };

    window.speechSynthesis.speak(utter);
  };

  useEffect(() => {
    if (!prompt || !state || loading) return;
    const signature = `${prompt.id}:${state.requires_confirmation ? 'confirm' : 'question'}`;
    if (lastSpokenPromptRef.current === signature) return;
    lastSpokenPromptRef.current = signature;
    speakAndListen();
  }, [prompt?.id, state?.requires_confirmation, loading, submitting, autoListenEnabled, aiVoiceEnabled]);

  useEffect(() => {
    return () => {
      if (speechSupported && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speechSupported]);

  useEffect(() => {
    const captured = (voice.finalTranscript || '').trim();
    if (!captured || !state || !prompt || loading || submitting) return;

    const key = `${prompt.id}:${captured}`;
    if (lastVoiceSubmitRef.current === key) return;
    lastVoiceSubmitRef.current = key;
    submitAnswer(captured, 'voice');
  }, [voice.finalTranscript, prompt?.id, loading, submitting, state?.requires_confirmation]);

  const submitAnswer = async (overrideText?: string, inputMethod: 'text' | 'voice' = 'text', validationOverride?: boolean) => {
    if (!state || !prompt || submitting) return;
    const answer = (overrideText ?? currentInput).trim();
    if (!answer) return;

    const effectiveValidation = validationOverride ?? validationEnabled;

    setSubmitting(true);
    setError('');
    try {
      if (!state?.requires_confirmation) {
        setLastCapturedAnswer(answer);
      }
      const { data } = await landSurveyAPI.answer({
        session_id: state.session_id,
        question_id: prompt.id,
        answer_text: answer,
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
      }
    } catch (e: any) {
      setError(e.message);
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

  const handleRestart = async () => {
    localStorage.removeItem(LAND_SESSION_KEY);
    setState(null);
    setDashboard(null);
    setCurrentInput('');
    setLastCapturedAnswer('');
    setOverrideValues({});
    lastSpokenPromptRef.current = '';
    lastVoiceSubmitRef.current = '';
    await boot();
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
          <span className="text-gray-600">Preparing Voice Land Farm Planning...</span>
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
              text="Land Planning Complete!"
              font={PRETEXT_TITLE_FONT}
              lineHeight={40}
              className="mb-2 text-gray-900"
            />
            <PretextText
              text="Financial analysis for your multi-crop farm plan"
              font={PRETEXT_BASE_FONT}
              lineHeight={24}
              className="text-gray-600"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-emerald-50 rounded-lg p-6">
              <p className="text-sm text-emerald-600 mb-1">Total Revenue</p>
              <p className="text-emerald-900 font-medium text-lg">
                ₹{Number(dashboard.summary?.total_revenue || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-6">
              <p className="text-sm text-amber-600 mb-1">Total Cost</p>
              <p className="text-amber-900 font-medium text-lg">
                ₹{Number(dashboard.summary?.total_cost || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-6">
              <p className="text-sm text-blue-600 mb-1">Net Profit</p>
              <p className="text-blue-900 font-medium text-lg">
                ₹{Number(dashboard.summary?.profit || 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6">
              <p className="text-sm text-purple-600 mb-1">ROI</p>
              <p className="text-purple-900 font-medium text-lg">
                {dashboard.summary?.roi_percent == null ? 'N/A' : `${dashboard.summary.roi_percent}%`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
            <div className="rounded-lg border border-gray-200 p-5">
              <h3 className="text-gray-900 mb-4 font-semibold">Cost Breakdown</h3>
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
              <h3 className="text-gray-900 mb-4 font-semibold">Revenue vs Cost (Annual)</h3>
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
            <h3 className="text-gray-900 mb-4 font-semibold">Crop-Level Analysis</h3>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs text-gray-500">
                Market prices are auto-fetched from Agmarknet where available. You can optionally override any crop price.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={handleRefreshMarketPrices}
                disabled={marketUpdating}
              >
                {marketUpdating ? 'Refreshing...' : 'Refresh Market Prices'}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Crop</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Yield/Yr (kg)</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Price/Unit</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Price Source</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Revenue</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Cost</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Profit</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Override</th>
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
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-2"
                            onClick={() => handleUseAutoPrice(row.crop)}
                            disabled={marketUpdating || !isManual}
                          >
                            Auto
                          </Button>
                        </div>
                      </td>
                    </tr>
                    )})}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleRestart} variant="outline" className="flex-1">
              Start New Plan
            </Button>
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
              Sync to Google Sheets
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="max-w-3xl mx-auto flex justify-center py-20">
        <p className="text-gray-500">Failed to load survey question.</p>
        <Button onClick={handleRestart} variant="outline" className="ml-4">Retry</Button>
      </div>
    );
  }

  const progressValue = ((state.progress_answered + 1) / Math.max(state.progress_total, state.progress_answered + 1)) * 100;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8">
          <div className="flex items-center gap-2 text-purple-600 mb-4">
            <Mic className="w-5 h-5" />
            <span className="text-sm font-medium">Voice-Enabled Survey</span>
          </div>
          <PretextText
            text="Land & Crop Planning"
            font={PRETEXT_TITLE_FONT}
            lineHeight={40}
            className="text-gray-900 mb-2"
          />
          <PretextText
            text="AI asks each question by voice, then the mic auto-starts for your answer."
            font={PRETEXT_BASE_FONT}
            lineHeight={24}
            className="text-gray-600"
          />
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              Question {state.progress_answered + 1}
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
            <Label>{state?.requires_confirmation ? 'Validation response' : 'Your response'}</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (speechSupported && window.speechSynthesis.speaking) {
                    window.speechSynthesis.cancel();
                    setIsQuestionSpeaking(false);
                  }
                  if (voice.isListening) {
                    setIsAwaitingInput(false);
                    voice.stop();
                  } else {
                    setIsAwaitingInput(true);
                    voice.start().finally(() => setIsAwaitingInput(false));
                  }
                }}
                disabled={submitting || voice.isProcessing}
                className="px-3"
                title="Record answer"
              >
                {voice.isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (voice.isStarting || voice.isProcessing) ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </Button>
              <Input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAnswer();
                }}
                placeholder={state?.requires_confirmation ? 'Say or type your response...' : 'Say or type your answer...'}
                className="text-lg py-6"
                disabled={submitting}
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!speechSupported || !aiVoiceEnabled) return;
                  lastSpokenPromptRef.current = '';
                  speakAndListen();
                }}
                className="px-3"
                title="Replay question"
              >
                <Volume2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="mt-3 flex items-center gap-2">
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleValidationToggle}
              >
                Validation Question {validationEnabled ? 'On' : 'Off'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAutoListenEnabled((prev) => !prev)}
              >
                Auto Listen {autoListenEnabled ? 'On' : 'Off'}
              </Button>
              {(isQuestionSpeaking || voice.isListening || isAwaitingInput || voice.isStarting || voice.isProcessing) ? (
                <span className="text-xs px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700">
                  {isQuestionSpeaking
                    ? 'AI asking...'
                    : voice.isListening
                      ? 'Listening'
                      : isAwaitingInput
                        ? 'Waiting'
                        : voice.isStarting
                          ? 'Starting'
                          : 'Processing'}
                </span>
              ) : null}
            </div>

            {lastCapturedAnswer ? (
              <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm font-medium text-emerald-900 mb-1">Captured input:</p>
                <p className="text-sm text-emerald-800">"{lastCapturedAnswer}"</p>
              </div>
            ) : null}

            {voice.transcript ? <p className="text-xs text-emerald-700 mt-2">Captured: "{voice.transcript}"</p> : null}
            {voice.error ? <p className="text-red-500 text-sm mt-2">{voice.error}</p> : null}
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end">
          <Button
            onClick={() => submitAnswer()}
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
