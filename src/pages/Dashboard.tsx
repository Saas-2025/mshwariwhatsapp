import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, MessageSquare, Send, Bot, Inbox, Activity, BarChart3, PieChart, Crown, CreditCard, ArrowLeft } from 'lucide-react';

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');

const Dashboard = () => {
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

  const daily: { date: string; incoming: number; replies: number }[] = data?.daily || [];
  const maxDaily = Math.max(1, ...daily.map(d => Math.max(d.incoming, d.replies)));
  const bd = data?.replyBreakdown || { ai: 0, keyword: 0, manual: 0 };
  const bdTotal = Math.max(1, bd.ai + bd.keyword + bd.manual);
  const seg = [
    { label: 'ذكاء اصطناعي', value: bd.ai, cls: 'bg-purple-500', text: 'text-purple-600' },
    { label: 'كلمات مفتاحية', value: bd.keyword, cls: 'bg-amber-500', text: 'text-amber-600' },
    { label: 'يدوي', value: bd.manual, cls: 'bg-blue-500', text: 'text-blue-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">مرحباً، {user.name || 'مستخدم'} 👋</h2>
        <p className="text-slate-500 text-sm">نظرة عامة على نشاطك{user.role !== 'admin' ? ' (أرقامك أنت فقط)' : ''}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>
      ) : !data ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* Current subscription plan */}
          {data.plan ? (
            <div className="bg-gradient-to-l from-emerald-700 via-emerald-600 to-emerald-500 rounded-2xl shadow-md p-6 text-white relative overflow-hidden">
              <div className="absolute -left-10 -top-10 w-44 h-44 bg-white/10 rounded-full" />
              <div className="absolute left-10 -bottom-12 w-32 h-32 bg-white/5 rounded-full" />
              <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="shrink-0">
                  <div className="flex items-center gap-2 text-emerald-100 text-sm font-bold mb-1"><Crown size={16} className="text-amber-300" /> باقتك الحالية</div>
                  <h3 className="text-2xl font-extrabold">{data.plan.name}</h3>
                  <p className="text-emerald-100 text-sm mt-1">
                    {data.plan.priceMonthly > 0 ? `${Number(data.plan.priceMonthly).toLocaleString('en-US')} ${data.plan.currency} / شهرياً` : 'باقة مجانية'}
                  </p>
                </div>

                <div className="flex-1 grid grid-cols-2 sm:grid-cols-2 gap-4 lg:max-w-md">
                  {[
                    { label: 'الأجهزة', used: data.usage.devices, limit: data.plan.maxSessions },
                    { label: 'المحادثات', used: data.usage.conversations, limit: data.plan.maxConversations },
                  ].map((u, i) => {
                    const pct = u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : null;
                    return (
                      <div key={i} className="bg-white/10 rounded-xl p-3">
                        <div className="flex items-center justify-between text-xs text-emerald-50 mb-1.5">
                          <span>{u.label}</span>
                          <span className="font-bold">{u.used} / {u.limit > 0 ? u.limit : '∞'}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct === null ? 15 : pct}%`, opacity: pct === null ? 0.4 : 1 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Link to="/subscriptions" className="shrink-0 inline-flex items-center gap-2 bg-white text-emerald-700 font-bold px-5 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors shadow-sm">
                  عرض الباقات <ArrowLeft size={16} />
                </Link>
              </div>
            </div>
          ) : (
            <Link to="/subscriptions" className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-dashed border-emerald-300 p-5 hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors group">
              <span className="flex items-center gap-3 text-slate-600">
                <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><CreditCard size={20} /></span>
                <span><span className="font-bold text-slate-800 block">لم يتم تعيين باقة لحسابك بعد</span><span className="text-sm">تصفّح الباقات المتاحة واختر ما يناسب أعمالك</span></span>
              </span>
              <span className="text-emerald-600 font-bold flex items-center gap-1 group-hover:gap-2 transition-all">الباقات <ArrowLeft size={16} /></span>
            </Link>
          )}

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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 7-day bars */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart3 size={18} className="text-emerald-500" /> النشاط — آخر 7 أيام</h3>
              {daily.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12">لا توجد بيانات بعد.</p>
              ) : (
                <div className="flex items-end justify-around gap-2 h-56">
                  {daily.map(d => (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <div className="flex items-end gap-1 h-full">
                        <div className="w-3.5 bg-blue-400 rounded-t" style={{ height: `${(d.incoming / maxDaily) * 100}%` }} title={`واردة: ${d.incoming}`} />
                        <div className="w-3.5 bg-emerald-500 rounded-t" style={{ height: `${(d.replies / maxDaily) * 100}%` }} title={`ردود: ${d.replies}`} />
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded" /> واردة</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" /> ردود</span>
              </div>
            </div>

            {/* Reply sources */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><PieChart size={18} className="text-emerald-500" /> مصادر الردود</h3>
              <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 mb-4">
                {seg.map((s, i) => s.value > 0 && (
                  <div key={i} className={s.cls} style={{ width: `${(s.value / bdTotal) * 100}%` }} title={`${s.label}: ${s.value}`} />
                ))}
              </div>
              <div className="space-y-3">
                {seg.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600"><span className={`w-3 h-3 rounded ${s.cls}`} /> {s.label}</span>
                    <span className={`font-bold ${s.text}`}>{s.value} <span className="text-slate-400 text-xs">({Math.round((s.value / bdTotal) * 100)}%)</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
