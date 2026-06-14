import React, { useState, useEffect } from 'react';
import { BarChart3, Smartphone, Inbox, Send, Bot, Users, Percent, RefreshCw } from 'lucide-react';

interface SessionLite { id: string; name: string; status: string; }
interface Stats {
  totalMessages: number;
  incoming: number;
  replies: number;
  aiReplies: number;
  keywordReplies: number;
  uniqueChats: number;
  responseRate: number;
  daily: { date: string; incoming: number; replies: number }[];
}

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; color: string }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>{icon}</div>
    <p className="text-2xl font-extrabold text-slate-800">{value}</p>
    <p className="text-sm text-slate-500">{label}</p>
  </div>
);

const Analytics = () => {
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

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

  const load = async () => {
    if (!selectedSessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl()}/api/sessions/${selectedSessionId}/analytics`, { headers: authHeaders() });
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { setStats(null); load(); }, [selectedSessionId]);

  const maxDaily = stats ? Math.max(1, ...stats.daily.map(d => Math.max(d.incoming, d.replies))) : 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-500" /> تحليل الردود
          </h2>
          <p className="text-slate-500 text-sm">إحصائيات الرسائل وردود البوت لكل جهاز</p>
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
          <button onClick={load} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-emerald-500 shadow-sm" title="تحديث">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>
      ) : !stats ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30" /> لا توجد بيانات بعد.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard icon={<Inbox size={20} />} label="رسائل واردة" value={stats.incoming} color="bg-blue-100 text-blue-600" />
            <StatCard icon={<Send size={20} />} label="ردود مُرسلة" value={stats.replies} color="bg-emerald-100 text-emerald-600" />
            <StatCard icon={<Bot size={20} />} label="ردود ذكاء اصطناعي" value={stats.aiReplies} color="bg-purple-100 text-purple-600" />
            <StatCard icon={<Bot size={20} />} label="ردود كلمات مفتاحية" value={stats.keywordReplies} color="bg-amber-100 text-amber-600" />
            <StatCard icon={<Users size={20} />} label="عملاء مختلفين" value={stats.uniqueChats} color="bg-cyan-100 text-cyan-600" />
            <StatCard icon={<Percent size={20} />} label="نسبة الرد" value={`${stats.responseRate}%`} color="bg-rose-100 text-rose-600" />
          </div>

          {/* 7-day chart */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-700 mb-4">آخر 7 أيام</h3>
            {stats.daily.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">لا توجد بيانات في آخر 7 أيام.</p>
            ) : (
              <div className="flex items-end justify-around gap-2 h-52">
                {stats.daily.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div className="flex items-end gap-1 h-full">
                      <div className="w-3 bg-blue-400 rounded-t" style={{ height: `${(d.incoming / maxDaily) * 100}%` }} title={`واردة: ${d.incoming}`} />
                      <div className="w-3 bg-emerald-500 rounded-t" style={{ height: `${(d.replies / maxDaily) * 100}%` }} title={`ردود: ${d.replies}`} />
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
        </>
      )}
    </div>
  );
};

export default Analytics;
