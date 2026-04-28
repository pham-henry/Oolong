import { useState, useRef, useEffect, FormEvent } from 'react';
import { askAssistant } from '../api/assistant';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What should I reorder this week?',
  'Which ingredients are closest to running out?',
  'Are any ingredients overstocked?',
  'What are the recent usage trends?',
  'Why is milk flagged for reorder?',
];

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(question: string) {
    if (!question.trim() || loading) return;
    setError('');
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const answer = await askAssistant(question);
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to reach the assistant. Check your ANTHROPIC_API_KEY.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await send(input);
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">✦ Smart Assistant</div>
        <div className="page-subtitle">Ask questions about inventory, reorders, and trends. Powered by Claude.</div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
        <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
                Smart Inventory Assistant
              </div>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24, maxWidth: 380, margin: '0 auto 24px' }}>
                Ask me about your inventory status, reorder needs, usage trends, or anything about your shop's supplies.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="btn btn-outline btn-sm"
                    onClick={() => send(s)}
                    style={{ fontSize: 12 }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role}`}>
              {msg.content}
            </div>
          ))}

          {loading && (
            <div className="chat-bubble assistant" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Analyzing inventory data...</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="chat-input-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your inventory..."
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
