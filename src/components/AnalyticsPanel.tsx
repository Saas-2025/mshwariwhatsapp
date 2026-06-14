import React, { useState, useEffect } from 'react';
import { BarChart3, Inbox, Send, Bot, Users, Percent, RefreshCw } from 'lucide-react';

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

const AnalyticsPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl()}/api/sessions/${sessionId}/analytics`, { headers: authHeaders() });
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { setStats(null); load(); }, [sessionId]);

  const maxDaily = stats ? Math.max(1, ...stats.daily.map(d => Math.max(d.incoming, d.replies))) : 1;

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>;
  if (!stats) return <div className="text-center text-slate-400 py-12">لا توجد بيانات بعد.</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-600 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
          <RefreshCw size={16} /> تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={<Inbox size={20} />} label="رسائل واردة" value={stats.incoming} color="bg-blue-100 text-blue-600" />
        <StatCard icon={<Send size={20} />} label="ردود مُرسلة" value={stats.replies} color="bg-emerald-100 text-emerald-600" />
        <StatCard icon={<Bot size={20} />} label="ردود AI" value={stats.aiReplies} color="bg-purple-100 text-purple-600" />
        <StatCard icon={<Bot size={20} />} label="ردود كلمات" value={stats.keywordReplies} color="bg-amber-100 text-amber-600" />
        <StatCard icon={<Users size={20} />} label="عملاء" value={stats.uniqueChats} color="bg-cyan-100 text-cyan-600" />
        <StatCard icon={<Percent size={20} />} label="نسبة الرد" value={`${stats.responseRate}%`} color="bg-rose-100 text-rose-600" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><BarChart3 size={18} className="text-emerald-500" /> آخر 7 أيام</h3>
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
    </div>
  );
};

export default AnalyticsPanel;
