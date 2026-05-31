import { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { InsightCard } from '../ui/InsightCard';
import { buildInputs, computeMetrics, generateInsights } from '../../utils/analysisUtils';
import type { Recommendation } from '../../utils/analysisUtils';
import {
  ArrowUpRight,
  Brain,
  ChevronRight,
  Coins,
  Fish,
  Leaf,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import { api, reportAPI } from '../../utils/api';
import { useStore } from '../../store';
import { LangCode, createT } from '../../utils/i18n';

type Message = { role: 'user' | 'ai'; text: string };
type SurveyOption = {
  session_id: string;
  survey_type: string;
  project_name: string;
  completed_at: string | null;
};

const promptSuggestions = [
  'How can I improve ROI for this farm?',
  'What is the biggest cost risk in this plan?',
  'Suggest better crop or fish mix options.',
  'What should I change before scaling up?',
];

const advisorHighlights = [
  { label: 'Farm-aware advice', value: 'Uses your latest survey context', icon: Leaf },
  { label: 'Financial focus', value: 'Revenue, ROI, payback, risk', icon: Coins },
  { label: 'Operational lens', value: 'Crops, fish, inputs, timing', icon: Fish },
];

function parseMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  const regex = /\*\*([^*]+)\*\*|__([^_]+)__|_([^_]+)_|\*([^*]+)\*|`([^`]+)`/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }

    // Add styled segment
    const bold = match[1] || match[2]; // ** or __
    const italic = match[3] || match[4]; // _ or *
    const code = match[5];

    if (bold) {
      parts.push(<strong key={parts.length} className="font-semibold text-slate-900">{bold}</strong>);
    } else if (italic) {
      parts.push(<em key={parts.length} className="italic text-slate-900">{italic}</em>);
    } else if (code) {
      parts.push(
        <code key={parts.length} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-900">
          {code}
        </code>
      );
    }

    last = regex.lastIndex;
  }

  // Add remaining plain text
  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length === 0 ? [text] : parts;
}

function AIMessage({ text, index, thinkOpen, onToggleThink }: { text: string; index: number; thinkOpen: boolean; onToggleThink: () => void }) {
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i);
  const think = thinkMatch ? thinkMatch[1].trim() : null;
  const visible = text.replace(/<think>[\s\S]*?<\/think>/i, '').trim();

  const sections = visible
    ? visible.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    : [];

  const renderParagraph = (p: string, idx: number) => {
    // detect numbered or bulleted lists inside paragraph
    if (/^\s*(?:\d+\.|-|•)\s+/m.test(p)) {
      const items = p.split(/\n+/).map(l => l.replace(/^\s*(?:\d+\.|-|•)\s+/, '').trim()).filter(Boolean);
      return (
        <ul key={idx} className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-700">
          {items.map((it, j) => (
            <li key={j}>{parseMarkdown(it)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={idx} className="mt-2 text-sm text-slate-700">
        {parseMarkdown(p)}
      </p>
    );
  };

  return (
    <div>
      {think ? (
        <div className="mb-1 flex items-start justify-between">
          <div className="text-xs text-slate-400">Assistant</div>
          <button
            onClick={onToggleThink}
            className="ml-3 rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-emerald-600 ring-1 ring-slate-100 hover:bg-emerald-50"
          >
            {thinkOpen ? 'Hide thinking' : 'Show thinking'}
          </button>
        </div>
      ) : null}

      <div>
        {sections.length === 0 ? (
          <p className="text-sm text-slate-700">{parseMarkdown(visible)}</p>
        ) : (
          sections.map((sec, idx) => {
            // If the section starts with a heading like "Recommendations:"
            const headingMatch = sec.match(/^([A-Z][A-Za-z0-9\s]{1,40}):\s*\n?/);
            if (headingMatch) {
              const heading = headingMatch[1];
              const body = sec.replace(/^([A-Z][A-Za-z0-9\s]{1,40}):\s*\n?/, '').trim();
              return (
                <div key={idx} className="mt-2">
                  <div className="text-sm font-semibold text-slate-800">{heading}</div>
                  {renderParagraph(body, idx)}
                </div>
              );
            }
            // otherwise render as paragraph or list
            return (
              <div key={idx} className="mt-2">
                {renderParagraph(sec, idx)}
              </div>
            );
          })
        )}
      </div>

      {think && thinkOpen ? (
        <div className="mt-3 rounded-lg bg-violet-50/70 px-3 py-2 text-sm text-violet-900 ring-1 ring-violet-100">
          <div className="mb-1 text-xs font-semibold text-violet-800">Thinking (internal chain-of-thought)</div>
          <div className="whitespace-pre-wrap text-sm">{think}</div>
        </div>
      ) : null}
    </div>
  );
}

export function AIAdvisor() {
  const lang: LangCode = (useStore((s: any) => s.globalLanguage) || 'en') as LangCode;
  const tr = createT(lang);
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinkOpenMap, setThinkOpenMap] = useState<Record<number, boolean>>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [surveysLoading, setSurveysLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const loadSurveys = async () => {
      try {
        const { data } = await reportAPI.analytics();
        const topSessions: SurveyOption[] = data?.top_sessions || [];
        setSurveys(topSessions);
        const lastId = localStorage.getItem('last_completed_session_id');
        const defaultSession =
          topSessions.find(s => s.session_id === lastId) ||
          topSessions.find(s => s.survey_type === 'ai') ||
          topSessions.find(s => s.survey_type === 'land') ||
          null;
        setSelectedSessionId(defaultSession?.session_id || null);
      } catch {
        // fall back to generic advice
      } finally {
        setSurveysLoading(false);
      }
    };
    loadSurveys();
  }, []);

  const handleSurveyChange = (sessionId: string) => {
    setSelectedSessionId(sessionId || null);
    setMessages([]);
    setError(null);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const { data } = await api.post(
        '/ai/chat',
        { message: text, session_id: selectedSessionId || undefined },
        { timeout: 90_000 },
      );
      setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch (err: any) {
      setError((err as Error).message || 'AI service unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestClick = (prompt: string) => {
    setInput(prompt);
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text: prompt }]);
    setLoading(true);
    
    (async () => {
      try {
        const { data } = await api.post(
          '/ai/chat',
          { message: prompt, session_id: selectedSessionId || undefined },
          { timeout: 90_000 },
        );
        setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
      } catch (err: any) {
        setError((err as Error).message || 'AI service unavailable. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  };

  const analysis = useStore((s: any) => s.analysis);

  const todaysInsights: Recommendation[] = useMemo(() => {
    if (!analysis) return [];
    const apiRecs = analysis?.financial_plan?.ai_recommendations;
    if (Array.isArray(apiRecs) && apiRecs.length > 0) {
      return apiRecs.slice(0, 3).map((r: any) => ({
        priority: (['high', 'medium', 'low'].includes(r.priority) ? r.priority : 'low') as any,
        category: String(r.category || 'Insight'),
        title: String(r.title || ''),
        detail: String(r.detail || ''),
      }));
    }
    const inputs = buildInputs(analysis);
    const metrics = computeMetrics(inputs, 1);
    return generateInsights(inputs, metrics).slice(0, 3);
  }, [analysis]);

  const selectedSurvey = surveys.find(s => s.session_id === selectedSessionId);
  const farmType = selectedSurvey?.survey_type === 'ai' ? 'aquaponic' : 'land';

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-50">
      <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-7xl flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
        <div className="rounded-3xl border border-emerald-100/80 bg-white/85 p-5 shadow-[0_18px_60px_-35px_rgba(16,185,129,0.45)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Sparkles className="h-3.5 w-3.5" />
                AI Advisor
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{tr('ai_advisor_title')}</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-500 md:text-base">
                  {tr('powered_by_sarvam')} · {tr('ai_advisor_desc')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[28rem]">
              {advisorHighlights.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <item.icon className="h-4 w-4 text-emerald-600" />
                    {item.label}
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-800">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {messages.length === 0 && todaysInsights.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                  Today's Insights
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {todaysInsights.map((ins, i) => (
                    <InsightCard key={i} {...ins} index={i} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid flex-1 gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-[0_18px_60px_-45px_rgba(15,23,42,0.5)]">
            <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-4 md:px-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Conversation</p>
                  <h2 className="mt-1 text-base font-semibold text-slate-900">Advisor workspace</h2>
                </div>

                <div className="w-full max-w-xl">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Advising for</label>
                  {surveysLoading ? (
                    <div className="h-11 rounded-xl bg-slate-100 animate-pulse" />
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedSessionId || ''}
                        onChange={e => handleSurveyChange(e.target.value)}
                        className="w-full appearance-none rounded-xl border border-emerald-200 bg-white px-4 py-3 pr-10 text-sm text-slate-700 shadow-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                      >
                        <option value="">General advice (no survey context)</option>
                        {surveys.map(s => {
                          const date = s.completed_at
                            ? new Date(s.completed_at).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '';
                          const type = s.survey_type === 'ai' ? 'Aquaponic' : 'Land';
                          return (
                            <option key={s.session_id} value={s.session_id}>
                              {type}: {s.project_name}{date ? ` · ${date}` : ''}
                            </option>
                          );
                        })}
                      </select>
                      <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-slate-400" />
                    </div>
                  )}
                  {selectedSurvey ? (
                    <p className="mt-1.5 text-xs text-emerald-600">
                      Using your {farmType} farm data for personalized recommendations.
                    </p>
                  ) : !surveysLoading ? (
                    <p className="mt-1.5 text-xs text-amber-600">
                      {surveys.length === 0
                        ? tr('complete_survey_advice')
                        : 'Choose a survey to ground the advice in your latest data.'}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.05),transparent_35%)] px-4 py-5 md:px-5">
              {messages.length === 0 && !loading ? (
                <div className="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-100 bg-emerald-50/30 px-6 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-emerald-100">
                    <MessageSquareText className="h-7 w-7 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">Ask a question to get started</h3>
                  <p className="mt-2 max-w-lg text-sm text-slate-500">
                    Try one of the suggested prompts below or ask about your current farm setup, finances, or crop mix.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {promptSuggestions.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleSuggestClick(prompt)}
                        disabled={loading}
                        className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition duration-200 hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-[0_0_16px_rgba(16,185,129,0.4)] hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[92%] gap-3 md:max-w-[78%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div
                          className={`mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-xs font-semibold ${
                            msg.role === 'user'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                          }`}
                        >
                          {msg.role === 'user' ? 'U' : 'AI'}
                        </div>
                        <div
                          className={`rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                            msg.role === 'user'
                              ? 'rounded-tr-md bg-emerald-600 text-white'
                              : 'rounded-tl-md border border-slate-200 bg-white text-slate-800'
                          }`}
                        >
                          {msg.role === 'ai' ? (
                            <AIMessage
                              text={msg.text}
                              index={i}
                              thinkOpen={!!thinkOpenMap[i]}
                              onToggleThink={() => setThinkOpenMap(prev => ({ ...prev, [i]: !prev[i] }))}
                            />
                          ) : (
                            msg.text
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {loading && (
                    <div className="flex justify-start">
                      <div className="flex max-w-[78%] gap-3">
                        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                          AI
                        </div>
                        <div className="rounded-3xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <div className="flex gap-1.5">
                              <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.2s]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.1s]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-600" />
                            </div>
                            <span>{tr('ai_thinking')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                        {error}
                      </div>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 bg-white/95 px-4 py-4 md:px-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {promptSuggestions.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSuggestClick(prompt)}
                    disabled={loading}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition duration-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    selectedSurvey
                      ? `Ask about your ${farmType} farm…`
                      : 'Ask about crops, fish, finances…'
                  }
                  disabled={loading}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {tr('btn_send')}
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <aside className="flex min-h-0 flex-col gap-4">
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-[0_18px_60px_-45px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Advisor mode</h3>
                  <p className="text-xs text-slate-500">Fast, farm-aware guidance</p>
                </div>
              </div>

              <div className="space-y-3">
                {selectedSurvey ? (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Selected context</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedSurvey.project_name}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {selectedSurvey.survey_type === 'ai' ? 'Aquaponic' : 'Land'} survey · {selectedSurvey.completed_at ? new Date(selectedSurvey.completed_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }) : 'Recent'}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">No context selected</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">General advice mode</p>
                    <p className="mt-1 text-xs text-slate-600">Pick a survey to make the advice more specific.</p>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Best prompts</p>
                  <div className="mt-3 space-y-2">
                    {promptSuggestions.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handleSuggestClick(prompt)}
                        disabled={loading}
                        className="flex w-full items-center justify-between rounded-xl border border-white bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition duration-200 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 hover:shadow-[0_0_10px_rgba(16,185,129,0.25)] hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="pr-3">{prompt}</span>
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">What to ask</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    <li>• Improve yield without increasing cost too much</li>
                    <li>• Find the weakest financial assumption</li>
                    <li>• Compare fish vs crop revenue balance</li>
                    <li>• Reduce risk before scaling the farm</li>
                  </ul>
                </div>
              </div>
            </div>

            {selectedSurvey && analysis && (
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-3">
                  Farm Metrics
                </p>
                {(() => {
                  const inputs = buildInputs(analysis);
                  const metrics = computeMetrics(inputs, 1);
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['Annual Rev', `₹${(metrics.annRev / 100000).toFixed(1)}L`],
                        ['ROI', `${metrics.roi.toFixed(0)}%`],
                        ['Payback', metrics.payback ? `${Math.round(metrics.payback)}mo` : 'N/A'],
                        ['NPV', `₹${(metrics.npv / 100000).toFixed(1)}L`],
                      ].map(([l, v]) => (
                        <div key={l}>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide">{l}</p>
                          <p className="text-sm font-semibold text-slate-900">{v}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
