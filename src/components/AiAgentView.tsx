import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Trash2, Sparkles, Copy, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useToast } from './UiPrimitives';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

const STARTER_PROMPTS: Record<'admin' | 'teacher' | 'student', Array<{ label: string; prompt: string }>> = {
  admin: [
    { label: 'Roman Urdu · Overview', prompt: 'Academy ke total students, pending fees aur pending credentials ka summary batao.' },
    { label: 'English · Excel Sheet', prompt: 'How does the Credentials Excel Sheet save and export student and teacher passwords?' },
    { label: 'اردو · کورسز', prompt: 'سندھ ٹیک انسٹی ٹیوٹ میں کون سے کورسز اور کلاسز چل رہی ہیں؟' },
    { label: 'سنڌي · اڪيڊمي', prompt: 'سنڌ ٽيڪ انسٽيٽيوٽ بابت ۽ اسان جي پروگرامن بابت معلومات ڏيو.' },
  ],
  teacher: [
    { label: 'Roman Urdu · My Schedule', prompt: 'Meri assigned classes, courses aur aaj ka timetable batao.' },
    { label: 'English · Attendance Guide', prompt: 'How do I mark student attendance and grade assignments in the portal?' },
    { label: 'اردو · پروفائل', prompt: 'میں اپنا پروفائل اور پاسورڈ کیسے تبدیل کر سکتا ہوں؟' },
    { label: 'سنڌي · اسائنمينٽس', prompt: 'منهنجي کلاسن جون اسائنمينٽس ۽ شاگردن جي تعداد بابت ٻڌايو.' },
  ],
  student: [
    { label: 'Roman Urdu · Meri Fee & Courses', prompt: 'Meri fee challan status, attendance aur SindhTech academy ke courses batao.' },
    { label: 'English · Profile & Timetable', prompt: 'What is my class timetable and how can I edit my profile details?' },
    { label: 'اردو · رزلٹ اور حاضری', prompt: 'میری حاضری فیصد اور امتحانی رزلٹ کی تفصیل بتائیں۔' },
    { label: 'سنڌي · اڪيڊمي مدد', prompt: 'منهنجي ڪلاس، فيس چالان ۽ ٽائيم ٽيبل بابت معلومات ڏيو.' },
  ],
};

export function AiAgentPanel({
  role,
  userName,
  compact = false,
  onClose,
}: {
  role: 'admin' | 'teacher' | 'student';
  userName: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const { notify } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text:
        `Assalam-o-Alaikum ${userName}! Main SindhTech Institute (Academy & Training Center, Pakistan) ka AI Agent hoon.\n\n` +
        `Aap mujh se English, Roman Urdu, اردو, سنڌي ya kisi bhi zaban mein academy ke courses, fees, attendance, timetable, profile edit aur portal features ke bare mein pooch sakte hain — main usi zaban mein jawab dunga!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages.slice(-8), userMsg];
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setSending(true);

    try {
      const res = await apiRequest<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: query,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: res.reply || 'No response received.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      notify(err.message || 'AI Agent could not process your question right now.', 'error');
    } finally {
      setSending(false);
    }
  };

  const starters = STARTER_PROMPTS[role];

  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden ${
        compact ? 'h-full border-0 rounded-none' : 'h-[calc(100vh-11rem)] min-h-[520px]'
      }`}
    >
      {/* Header */}
      <div className="px-5 py-3.5 bg-[#0F2942] text-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-bold text-sm truncate">
              SindhTech Multilingual AI Agent
            </h2>
            <p className="text-[11px] text-slate-300 truncate">
              Replies in your exact language · English · Roman Urdu · اردو · سنڌي · Any language
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: 'welcome-reset',
                  role: 'assistant',
                  text: `Chat cleared. Ask anything about SindhTech Institute in any language!`,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ])
            }
            aria-label="Clear AI chat"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI Agent drawer"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Multilingual Quick Starters */}
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5 shrink-0">
        {starters.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => sendMessage(s.prompt)}
            disabled={sending}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition-colors"
          >
            <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Conversation Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[#0F2942] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700'
              }`}
            >
              <div dir="auto">{m.text}</div>
              <div
                className={`mt-1.5 flex items-center justify-between gap-3 text-[10px] ${
                  m.role === 'user' ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span className="font-mono-tabular">{m.timestamp}</span>
                {m.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(m.text);
                      notify('Response copied.', 'info');
                    }}
                    className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
              Thinking in your language...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          dir="auto"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask in English, Roman Urdu, اردو, سنڌي, or any language..."
          className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0F2942] dark:focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
        >
          <Send className="w-4 h-4" />
          Send
        </button>
      </form>
    </div>
  );
}
