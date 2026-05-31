import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, ChevronRight, Sparkles, X } from 'lucide-react';
import { api } from '../../utils/api';
import { useStore } from '../../store';
import { InsightCard } from '../ui/InsightCard';
import { buildInputs, computeMetrics, generateInsights } from '../../utils/analysisUtils';
import type { Recommendation } from '../../utils/analysisUtils';
import { cn } from '../ui/utils';

type Message = { role: 'user' | 'ai'; text: string };

interface FloatingAdvisorProps {
  onOpenFullPage: () => void;
}

export function FloatingAdvisor({ onOpenFullPage }: FloatingAdvisorProps) {
  const [open, setOpen] = useState(false);
  const [chatMode, setChatMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const analysis = useStore((s: any) => s.analysis);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const insights: Recommendation[] = useMemo(() => {
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

  const sessionId =
    typeof window !== 'undefined'
      ? localStorage.getItem('last_completed_session_id')
      : null;

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setChatMode(true);
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post(
        '/ai/chat',
        { message: msg, session_id: sessionId || undefined },
        { timeout: 90_000 },
      );
      setMessages((prev) => [...prev, { role: 'ai', text: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Sorry, the AI advisor is unavailable right now.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-[320px] sm:w-[400px] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '480px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-green-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-slate-900">AI Advisor</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onOpenFullPage();
                    setOpen(false);
                  }}
                  className="text-xs text-green-600 font-semibold hover:text-green-700 flex items-center gap-0.5"
                >
                  Full page <ChevronRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-600 ml-1"
                  aria-label="Close AI Advisor panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {!chatMode && insights.length > 0 ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Today's Insights
                  </p>
                  {insights.map((ins, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(`Tell me more: ${ins.title}`)}
                      className="w-full text-left hover:opacity-90 transition-opacity"
                    >
                      <InsightCard {...ins} index={i} />
                    </button>
                  ))}
                </>
              ) : !chatMode && insights.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  Complete a survey to see AI insights here.
                </p>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex',
                        msg.role === 'user' ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                          msg.role === 'user'
                            ? 'bg-green-600 text-white rounded-tr-sm'
                            : 'bg-slate-100 text-slate-800 rounded-tl-sm',
                        )}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex gap-1.5 px-3 py-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce [animation-delay:-0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-bounce [animation-delay:-0.1s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-bounce" />
                    </div>
                  )}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 p-3 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask about your farm…"
                  disabled={loading}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  className="rounded-xl bg-green-600 px-3 py-2 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Send message"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-12 h-12 rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 flex items-center justify-center transition-colors"
        aria-label={open ? 'Close AI Advisor' : 'Open AI Advisor'}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-5 h-5" />
            </motion.span>
          ) : (
            <motion.span
              key="s"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Sparkles className="w-5 h-5" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
