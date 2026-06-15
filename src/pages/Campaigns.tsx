import React, { useState, useEffect } from 'react';
import { Megaphone, Search, RefreshCw, CheckCircle2, XCircle, Send, Image as ImageIcon, FileText, Video, Mic, Clock } from 'lucide-react';
import MessageSender from '../components/MessageSender';

interface CampaignsProps {
    socket: any;
}

const apiBase = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const token = () => localStorage.getItem('token');

const TYPE_META: Record<string, { icon: React.ReactNode; label: string }> = {
    text: { icon: <Send size={14} />, label: 'نص' },
    image: { icon: <ImageIcon size={14} />, label: 'صورة' },
    video: { icon: <Video size={14} />, label: 'فيديو' },
    audio: { icon: <Mic size={14} />, label: 'صوت' },
    document: { icon: <FileText size={14} />, label: 'ملف' },
};

const fmtDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return `${d.toLocaleDateString('ar-EG')} ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
};

const CampaignHistory: React.FC = () => {
    const isAdmin = (JSON.parse(localStorage.getItem('user') || '{}').role === 'admin');
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'all' | 'completed' | 'stopped'>('all');

    const load = async () => {
        try {
            const res = await fetch(`${apiBase()}/api/campaigns`, { headers: { Authorization: `Bearer ${token()}` } });
            if (res.ok) setItems(await res.json());
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    useEffect(() => {
        load();
        const onComplete = () => setTimeout(load, 1200); // give the server a moment to persist
        window.addEventListener('campaign-complete', onComplete);
        return () => window.removeEventListener('campaign-complete', onComplete);
    }, []);

    const q = search.trim().toLowerCase();
    const shown = items.filter(c =>
        (status === 'all' || c.status === status) &&
        (!q || (c.sessionName || '').toLowerCase().includes(q) || (c.preview || '').toLowerCase().includes(q) || (c.ownerName || '').toLowerCase().includes(q))
    );

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <h3 className="font-bold text-slate-700 flex items-center gap-2 shrink-0"><Megaphone size={18} className="text-emerald-500" /> الحملات المُرسلة</h3>
                <div className="flex items-center gap-2 flex-1 sm:justify-end">
                    <div className="relative flex-1 sm:max-w-[200px]">
                        <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في الحملات..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-9 pl-3 text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div className="inline-flex bg-slate-50 border border-slate-200 rounded-xl p-1 shrink-0">
                        {(['all', 'completed', 'stopped'] as const).map(s => (
                            <button key={s} onClick={() => setStatus(s)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${status === s ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                                {s === 'all' ? 'الكل' : s === 'completed' ? 'مكتملة' : 'موقوفة'}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => { setLoading(true); load(); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg shrink-0" title="تحديث"><RefreshCw size={16} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[72vh] custom-scrollbar">
                {loading ? (
                    <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" /></div>
                ) : shown.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-sm">{items.length === 0 ? 'لا توجد حملات مُرسلة بعد. أرسل حملتك الأولى من الفورم.' : 'لا توجد حملات مطابقة.'}</div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {shown.map(c => {
                            const tm = TYPE_META[c.type] || TYPE_META.text;
                            const rate = c.total > 0 ? Math.round((c.success / c.total) * 100) : 0;
                            return (
                                <div key={c._id} className="p-4 hover:bg-slate-50/60 transition-colors">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{tm.icon} {tm.label}</span>
                                                <span className="font-bold text-slate-800 text-sm truncate">{c.sessionName}</span>
                                                {isAdmin && c.ownerName && <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-100">{c.ownerName}</span>}
                                            </div>
                                            <p className="text-xs text-slate-500 line-clamp-2 break-words">{c.preview || '—'}</p>
                                        </div>
                                        <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${c.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {c.status === 'completed' ? 'مكتملة' : 'موقوفة'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
                                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle2 size={13} /> {c.success}</span>
                                        <span className="inline-flex items-center gap-1 text-red-500 font-bold"><XCircle size={13} /> {c.failed}</span>
                                        <span className="text-slate-400">الإجمالي: {c.total}</span>
                                        <span className="text-slate-400 mr-auto inline-flex items-center gap-1"><Clock size={12} /> {fmtDate(c.createdAt)}</span>
                                    </div>
                                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${rate}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

const Campaigns: React.FC<CampaignsProps> = ({ socket }) => {
    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">إرسال الحملات</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-1">
                    <MessageSender socket={socket} status="" />
                </div>
                <div className="lg:col-span-2">
                    <CampaignHistory />
                </div>
            </div>
        </div>
    );
};

export default Campaigns;
