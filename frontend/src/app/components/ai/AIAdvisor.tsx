import { useState, useRef, useEffect } from 'react';
import { api, reportAPI } from '../../utils/api';

type Message = { role: 'user' | 'ai'; text: string };
type SurveyOption = {
  session_id: string;
  survey_type: string;
  project_name: string;
  completed_at: string | null;
};

export function AIAdvisor() {
  const [messages, setMessages] = useState<Message[]>([]);
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

  const selectedSurvey = surveys.find(s => s.session_id === selectedSessionId);
  const farmType = selectedSurvey?.survey_type === 'ai' ? 'aquaponic' : 'land';

  return (
    <div className="flex flex-col max-w-3xl mx-auto px-4 py-6" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">AI Advisor</h1>
        <p className="text-sm text-gray-500 mt-1">
          Powered by Sarvam 30B · Ask anything about your farm, crops, fish, or finances
        </p>
      </div>

      {/* Survey context selector */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Advising for</label>
        {surveysLoading ? (
          <div className="h-9 rounded-lg bg-gray-100 animate-pulse" />
        ) : (
          <select
            value={selectedSessionId || ''}
            onChange={e => handleSurveyChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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
        )}
        {selectedSurvey ? (
          <p className="mt-1 text-xs text-green-600">
            Using your {farmType} farm data — AI will give personalised recommendations
          </p>
        ) : !surveysLoading ? (
          <p className="mt-1 text-xs text-amber-600">
            {surveys.length === 0
              ? 'Complete a survey to unlock personalised advice.'
              : 'Select a survey above for personalised recommendations.'}
          </p>
        ) : null}
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Ask a question to get started
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-green-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm shadow-sm'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <span className="text-gray-400 text-sm">Sarvam is thinking…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex justify-start">
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 max-w-[80%]">
              {error}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-2 pt-3 border-t border-gray-200">
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
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
