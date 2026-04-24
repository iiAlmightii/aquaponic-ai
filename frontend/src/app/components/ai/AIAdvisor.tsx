import { useState, useRef, useEffect } from 'react';
import { api } from '../../utils/api';

type Message = { role: 'user' | 'ai'; text: string };

export function AIAdvisor() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessionId = localStorage.getItem('last_completed_session_id');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError(null);
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const { data } = await api.post('/ai/chat', {
        message: text,
        session_id: sessionId || undefined,
      }, { timeout: 90_000 });
      setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch (err: any) {
      const detail = (err as Error).message || 'AI service unavailable. Please try again.';
      setError(detail);
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

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] sm:h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)] max-w-3xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">AI Advisor</h1>
        <p className="text-sm text-gray-500 mt-1">
          Powered by Sarvam 30B · Ask anything about your farm, crops, fish, or finances
        </p>
      </div>

      {!sessionId && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Complete a survey to get personalized advice — or ask a general question below.
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && !loading && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Ask a question to get started
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
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
          placeholder="Ask about crops, fish, finances…"
          disabled={loading}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
