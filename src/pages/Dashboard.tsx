import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, MessageSquare, Send, Bot, Inbox, Activity, CheckCircle2, Circle, ArrowLeft } from 'lucide-react';

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');

const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${baseUrl()}/api/dashboard`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        if (res.ok) setData(await res.json());
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, []);

  const cards = data ? [
    { icon: <Smartphone size={20} />, label: 'الأجهزة', value: data.devices, sub: `${data.connected} متصل`, color: 'bg-emerald-100 text-emerald-600' },
    { icon: <MessageSquare size={20} />, label: 'المحادثات', value: data.conversations, color: 'bg-blue-100 text-blue-600' },
    { icon: <Inbox size={20} />, label: 'رسائل واردة', value: data.incoming, color: 'bg-cyan-100 text-cyan-600' },
    { icon: <Send size={20} />, label: 'ردود مُرسلة', value: data.replies, color: 'bg-purple-100 text-purple-600' },
    { icon: <Bot size={20} />, label: 'ردود الذكاء الاصطناعي', value: data.aiReplies, color: 'bg-amber-100 text-amber-600' },
    { icon: <Activity size={20} />, label: 'رسائل آخر 24 ساعة', value: data.today, color: 'bg-rose-100 text-rose-600' },
  ] : [];

  const steps = data ? [
    { done: data.onboarding.hasDevice, label: 'أضف جهازاً جديداً', to: '/devices' },
    { done: data.onboarding.hasConnected, label: 'اربط واتساب (امسح كود QR)', to: '/devices' },
    { done: data.onboarding.hasGroq, label: 'أضف مفتاح Groq للذكاء الاصطناعي', to: '/devices' },
    { done: data.onboarding.hasAgent, label: 'فعّل المساعد الذكي', to: '/devices' },
    { done: data.onboarding.hasKnowledge, label: 'أضف قاعدة معرفة', to: '/devices' },
  ] : [];
  const allDone = steps.length > 0 && steps.every(s => s.done);
  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">مرحباً، {user.name || 'مستخدم'} 👋</h2>
        <p className="text-slate-500 text-sm">نظرة عامة على نشاطك</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>
      ) : !data ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">تعذّر تحميل البيانات.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {cards.map((c, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${c.color}`}>{c.icon}</div>
                <p className="text-2xl font-extrabold text-slate-800">{c.value}</p>
                <p className="text-sm text-slate-500">{c.label}</p>
                {c.sub && <p className="text-xs text-emerald-500 font-bold mt-1">{c.sub}</p>}
              </div>
            ))}
          </div>

          {!allDone && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-slate-700">خطوات البدء</h3>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{doneCount}/{steps.length}</span>
              </div>
              <p className="text-xs text-slate-400 mb-4">أكمل الخطوات لتشغيل البوت بالكامل</p>
              <div className="space-y-2">
                {steps.map((s, i) => (
                  <button key={i} onClick={() => navigate(s.to)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-colors ${s.done ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                    {s.done ? <CheckCircle2 size={20} className="text-emerald-500 shrink-0" /> : <Circle size={20} className="text-slate-300 shrink-0" />}
                    <span className={`flex-1 text-sm font-bold ${s.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{s.label}</span>
                    {!s.done && <ArrowLeft size={16} className="text-slate-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {allDone && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center gap-3">
              <CheckCircle2 size={24} className="text-emerald-500" />
              <p className="text-emerald-700 font-bold text-sm">إعدادك مكتمل — البوت جاهز ويعمل! 🎉</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
