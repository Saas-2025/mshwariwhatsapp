import React, { useState, useEffect } from 'react';
import { MessageSquare, Smartphone, User, Bot, RefreshCw, Search } from 'lucide-react';

interface SessionLite { id: string; name: string; status: string; }
interface Convo { remoteJid: string; number: string; pushName?: string; lastText: string; lastRole: string; lastTime: number; total: number; }
interface ChatMsg { role: 'user' | 'assistant'; text: string; source?: string; pushName?: string; timestamp: number; }

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtTime = (ts: number) => {
  try {
    const d = new Date(ts * 1000);
    return d.toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const Conversations = () => {
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeJid, setActiveJid] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${baseUrl()}/api/sessions`, { headers: authHeaders() });
        if (res.ok) {
          const data: SessionLite[] = await res.json();
          setSessions(data);
          if (data.length) setSelectedSessionId((data.find(s => s.status === 'CONNECTED') || data[0]).id);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const loadConvos = async () => {
    if (!selectedSessionId) return;
    try {
      const res = await fetch(`${baseUrl()}/api/sessions/${selectedSessionId}/conversations`, { headers: authHeaders() });
      if (res.ok) setConvos(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => { setConvos([]); setActiveJid(null); setThread([]); loadConvos(); }, [selectedSessionId]);

  const openThread = async (jid: string) => {
    setActiveJid(jid);
    setLoadingThread(true);
    try {
      const res = await fetch(`${baseUrl()}/api/sessions/${selectedSessionId}/conversations/${encodeURIComponent(jid)}`, { headers: authHeaders() });
      if (res.ok) setThread(await res.json());
    } catch { /* ignore */ } finally { setLoadingThread(false); }
  };

  const filtered = convos.filter(c =>
    !search ||
    (c.pushName || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.number || '').includes(search) ||
    (c.lastText || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-emerald-500" /> سجل المحادثات
          </h2>
          <p className="text-slate-500 text-sm">كل المحادثات الواردة وردود البوت لكل جهاز</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedSessionId}
            onChange={e => setSelectedSessionId(e.target.value)}
            className="bg-white border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-slate-700 text-sm shadow-sm"
          >
            {sessions.length === 0 && <option value="">لا توجد أجهزة</option>}
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={loadConvos} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-emerald-500 shadow-sm" title="تحديث">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[70vh]">
        {/* Chat List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100 relative">
            <Search size={16} className="absolute right-6 top-6 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-10 pl-3 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filtered.length === 0 && (
              <div className="text-center text-slate-400 py-12 text-sm">لا توجد محادثات بعد.</div>
            )}
            {filtered.map(c => (
              <button
                key={c.remoteJid}
                onClick={() => openThread(c.remoteJid)}
                className={`w-full text-right p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-center gap-3 ${activeJid === c.remoteJid ? 'bg-emerald-50/60' : ''}`}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                  {(c.pushName || c.number || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-bold text-slate-700 text-sm truncate">{c.pushName || c.number}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{fmtTime(c.lastTime)}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{c.lastRole === 'assistant' ? '🤖 ' : ''}{c.lastText}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          {!activeJid ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <MessageSquare size={48} className="opacity-20 mb-3" />
              اختر محادثة لعرضها
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  {(convos.find(c => c.remoteJid === activeJid)?.pushName || activeJid).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-700 text-sm">{convos.find(c => c.remoteJid === activeJid)?.pushName || convos.find(c => c.remoteJid === activeJid)?.number}</p>
                  <p className="text-xs text-slate-400" dir="ltr">{activeJid.split('@')[0]}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 bg-slate-50/50">
                {loadingThread ? (
                  <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" /></div>
                ) : thread.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${m.role === 'assistant' ? 'bg-emerald-500 text-white rounded-bl-sm' : 'bg-white text-slate-700 border border-slate-200 rounded-br-sm'}`}>
                      <div className="flex items-center gap-1 mb-0.5 opacity-70 text-[10px]">
                        {m.role === 'assistant' ? <><Bot size={11} /> البوت{m.source === 'keyword' ? ' (كلمة مفتاحية)' : ''}</> : <><User size={11} /> العميل</>}
                      </div>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p className={`text-[9px] mt-1 ${m.role === 'assistant' ? 'text-white/60' : 'text-slate-400'}`}>{fmtTime(m.timestamp)}</p>
                    </div>
                  </div>
                ))}
                {!loadingThread && thread.length === 0 && (
                  <div className="text-center text-slate-400 py-8 text-sm">لا توجد رسائل.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Conversations;
