import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, User, Bot, RefreshCw, Search, ChevronRight, Send, Paperclip,
  Trash2, Sliders, Phone, Ban, Save
} from 'lucide-react';

interface Convo { remoteJid: string; number: string; pushName?: string; lastText: string; lastRole: string; lastTime: number; total: number; }
interface ChatMsg { role: 'user' | 'assistant'; text: string; source?: string; pushName?: string; timestamp: number; }
interface ChatCfg { aiDisabled: boolean; customPrompt: string; }

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const jsonH = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtTime = (ts: number) => {
  try { return new Date(ts * 1000).toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};

const ConversationsPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeJid, setActiveJid] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [cfg, setCfg] = useState<ChatCfg>({ aiDisabled: false, customPrompt: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvos = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${baseUrl()}/api/sessions/${sessionId}/conversations`, { headers: authH() });
      if (res.ok) setConvos(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { setConvos([]); setActiveJid(null); setThread([]); loadConvos(); }, [sessionId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);

  const openThread = async (jid: string) => {
    setActiveJid(jid);
    setShowSettings(false);
    setLoadingThread(true);
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`${baseUrl()}/api/sessions/${sessionId}/conversations/${encodeURIComponent(jid)}`, { headers: authH() }),
        fetch(`${baseUrl()}/api/sessions/${sessionId}/chat-settings/${encodeURIComponent(jid)}`, { headers: authH() })
      ]);
      if (tRes.ok) setThread(await tRes.json());
      if (cRes.ok) { const c = await cRes.json(); setCfg(c); setPromptDraft(c.customPrompt || ''); }
    } catch { /* ignore */ } finally { setLoadingThread(false); }
  };

  const send = async (type: string, content: string, caption?: string) => {
    if (!activeJid || !content) return;
    setSending(true);
    try {
      const res = await fetch(`${baseUrl()}/api/sessions/${sessionId}/conversations/${encodeURIComponent(activeJid)}/send`, {
        method: 'POST', headers: jsonH(), body: JSON.stringify({ type, content, caption })
      });
      if (res.ok) {
        setThread(prev => [...prev, { role: 'assistant', text: type === 'text' ? content : (caption || `[${type}]`), source: 'manual', timestamp: Math.floor(Date.now() / 1000) }]);
        setText('');
        loadConvos();
      } else {
        alert((await res.json().catch(() => ({}))).error || 'فشل الإرسال');
      }
    } catch (e: any) { alert(e.message); } finally { setSending(false); }
  };

  const sendText = () => { if (text.trim()) send('text', text.trim()); };

  const sendFile = async (file: File) => {
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { alert('الملف أكبر من 16MB'); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file);
    });
    const t = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document';
    await send(t, dataUrl, text.trim() || file.name);
    if (fileRef.current) fileRef.current.value = '';
  };

  const toggleAi = async () => {
    const next = !cfg.aiDisabled;
    setCfg(c => ({ ...c, aiDisabled: next }));
    await fetch(`${baseUrl()}/api/sessions/${sessionId}/chat-settings/${encodeURIComponent(activeJid!)}`, {
      method: 'PUT', headers: jsonH(), body: JSON.stringify({ aiDisabled: next })
    }).catch(() => setCfg(c => ({ ...c, aiDisabled: !next })));
  };

  const savePrompt = async () => {
    setCfg(c => ({ ...c, customPrompt: promptDraft }));
    await fetch(`${baseUrl()}/api/sessions/${sessionId}/chat-settings/${encodeURIComponent(activeJid!)}`, {
      method: 'PUT', headers: jsonH(), body: JSON.stringify({ customPrompt: promptDraft })
    });
    setShowSettings(false);
  };

  const deleteConvo = async (jid: string) => {
    if (!confirm('حذف هذه المحادثة نهائياً من السجل؟')) return;
    await fetch(`${baseUrl()}/api/sessions/${sessionId}/conversations/${encodeURIComponent(jid)}`, { method: 'DELETE', headers: authH() });
    if (activeJid === jid) { setActiveJid(null); setThread([]); }
    loadConvos();
  };

  const filtered = convos.filter(c => !search ||
    (c.pushName || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.number || '').includes(search) ||
    (c.lastText || '').toLowerCase().includes(search.toLowerCase()));

  const active = convos.find(c => c.remoteJid === activeJid);
  const activeNumber = active?.number || (activeJid ? activeJid.split('@')[0].replace('fb:', 'FB:') : '');

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={loadConvos} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-600 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
          <RefreshCw size={16} /> تحديث
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[64vh]">
        {/* Chat List */}
        <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm flex-col overflow-hidden ${activeJid ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-slate-100 relative">
            <Search size={16} className="absolute right-6 top-6 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filtered.length === 0 && <div className="text-center text-slate-400 py-12 text-sm">لا توجد محادثات.</div>}
            {filtered.map(c => (
              <div key={c.remoteJid}
                className={`w-full p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-center gap-3 cursor-pointer group ${activeJid === c.remoteJid ? 'bg-emerald-50/60' : ''}`}
                onClick={() => openThread(c.remoteJid)}>
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                  {(c.pushName || c.number || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-bold text-slate-700 text-sm truncate">{c.pushName || c.number}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{fmtTime(c.lastTime)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono truncate" dir="ltr">{c.number}</p>
                  <p className="text-xs text-slate-400 truncate">{c.lastRole === 'assistant' ? '🤖 ' : ''}{c.lastText}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteConvo(c.remoteJid); }}
                  className="text-slate-300 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0" title="حذف المحادثة">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className={`md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex-col overflow-hidden ${activeJid ? 'flex' : 'hidden md:flex'}`}>
          {!activeJid ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <MessageSquare size={48} className="opacity-20 mb-3" /> اختر محادثة لعرضها
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-3 border-b border-slate-100 flex items-center gap-3">
                <button onClick={() => setActiveJid(null)} className="md:hidden text-slate-400 hover:text-slate-600 p-1" title="رجوع"><ChevronRight size={22} /></button>
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                  {(active?.pushName || activeNumber).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-700 text-sm truncate">{active?.pushName || activeNumber}</p>
                  <p className="text-xs text-slate-400 font-mono flex items-center gap-1" dir="ltr"><Phone size={11} /> {activeNumber}</p>
                </div>
                <button onClick={toggleAi} title={cfg.aiDisabled ? 'الـ AI متوقف لهذا العميل — اضغط للتشغيل' : 'إيقاف رد الـ AI لهذا العميل'}
                  className={`p-2 rounded-lg ${cfg.aiDisabled ? 'bg-red-50 text-red-500' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                  {cfg.aiDisabled ? <Ban size={18} /> : <Bot size={18} />}
                </button>
                <button onClick={() => setShowSettings(s => !s)} title="معاملة خاصة لهذا العميل"
                  className={`p-2 rounded-lg ${cfg.customPrompt ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
                  <Sliders size={18} />
                </button>
                <button onClick={() => deleteConvo(activeJid)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50" title="حذف المحادثة">
                  <Trash2 size={18} />
                </button>
              </div>

              {cfg.aiDisabled && (
                <div className="bg-red-50 text-red-600 text-xs font-bold px-4 py-2 flex items-center gap-2 border-b border-red-100">
                  <Ban size={14} /> الرد الآلي بالذكاء الاصطناعي متوقف لهذا العميل.
                </div>
              )}

              {/* Custom-prompt panel */}
              {showSettings && (
                <div className="p-3 bg-slate-50 border-b border-slate-100 space-y-2">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1"><Sliders size={13} /> تعليمات خاصة لهذا العميل (يتعامل معها البوت بشكل مختلف)</label>
                  <textarea value={promptDraft} onChange={e => setPromptDraft(e.target.value)} rows={3}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-sm focus:outline-none focus:border-emerald-500 resize-none"
                    placeholder="مثال: هذا العميل VIP — خاطبه برسمية وقدّم له خصم 10%..." />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowSettings(false)} className="text-xs text-slate-500 px-3 py-1.5">إلغاء</button>
                    <button onClick={savePrompt} className="text-xs bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"><Save size={13} /> حفظ</button>
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-slate-50/50">
                {loadingThread ? (
                  <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" /></div>
                ) : thread.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm ${m.role === 'assistant' ? 'bg-emerald-500 text-white rounded-bl-sm' : 'bg-white text-slate-700 border border-slate-200 rounded-br-sm'}`}>
                      <div className="flex items-center gap-1 mb-0.5 opacity-70 text-[10px]">
                        {m.role === 'assistant' ? <><Bot size={11} /> {m.source === 'manual' ? 'أنت' : m.source === 'keyword' ? 'البوت (كلمة)' : 'البوت'}</> : <><User size={11} /> العميل</>}
                      </div>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p className={`text-[9px] mt-1 ${m.role === 'assistant' ? 'text-white/60' : 'text-slate-400'}`}>{fmtTime(m.timestamp)}</p>
                    </div>
                  </div>
                ))}
                {!loadingThread && thread.length === 0 && <div className="text-center text-slate-400 py-8 text-sm">لا توجد رسائل.</div>}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              <div className="p-3 border-t border-slate-100 flex items-end gap-2">
                <input ref={fileRef} type="file" className="hidden" onChange={e => e.target.files && e.target.files[0] && sendFile(e.target.files[0])} />
                <button onClick={() => fileRef.current?.click()} disabled={sending} className="p-2.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-xl disabled:opacity-50" title="إرفاق ملف/صورة">
                  <Paperclip size={20} />
                </button>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={1}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                  placeholder="اكتب رسالة..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-emerald-500 max-h-28" />
                <button onClick={sendText} disabled={sending || !text.trim()} className="p-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 shrink-0" title="إرسال">
                  {sending ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin block" /> : <Send size={20} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConversationsPanel;
