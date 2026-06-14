import React, { useState, useEffect } from 'react';
import { Brain, Smartphone, Cpu } from 'lucide-react';
import AIAgentPanel from '../components/AIAgentPanel';

interface SessionLite { id: string; name: string; status: string; }

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');

const AIAgent = () => {
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${baseUrl()}/api/sessions`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        if (res.ok) {
          const data: SessionLite[] = await res.json();
          setSessions(data);
          if (data.length) setSelectedSessionId((data.find(s => s.status === 'CONNECTED') || data[0]).id);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Brain className="w-8 h-8 text-emerald-500" /> الذكاء الاصطناعي (AI Agent)
        </h1>
        <p className="text-slate-500">مساعد ذكي مستقل لكل جهاز — بقواعد معرفة وذاكرة محادثة خاصة به</p>
      </div>

      {/* Device selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
        <Smartphone size={20} className="text-emerald-500 shrink-0" />
        <span className="text-sm font-bold text-slate-600 shrink-0">الجهاز:</span>
        {sessions.length === 0 ? (
          <span className="text-sm text-slate-400">لا توجد أجهزة — أضف جهازاً من صفحة «الأجهزة» أولاً.</span>
        ) : (
          <select value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-slate-700">
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status === 'CONNECTED' ? 'متصل' : 'غير متصل'})</option>)}
          </select>
        )}
      </div>

      {selectedSessionId ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <AIAgentPanel sessionId={selectedSessionId} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          <Brain size={40} className="mx-auto mb-3 opacity-30" /> اختر جهازاً لإعداد المساعد الذكي الخاص به.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-base font-bold text-slate-700 flex items-center gap-2 mb-3"><Cpu size={18} className="text-emerald-500" /> كيف يعمل؟</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-500">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><b className="text-emerald-600">1.</b> تصل رسالة من العميل لهذا الجهاز.</div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><b className="text-emerald-600">2.</b> يقرأ البوت سياق المحادثة + قواعد معرفة الجهاز.</div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><b className="text-emerald-600">3.</b> يرد تلقائياً عبر Groq AI بشكل مناسب.</div>
        </div>
      </div>
    </div>
  );
};

export default AIAgent;
