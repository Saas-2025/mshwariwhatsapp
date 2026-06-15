import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smartphone, RefreshCw, QrCode, CheckCircle2, Plus, X, ChevronLeft, Search, LayoutGrid, List as ListIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Session {
    id: string;
    name: string;
    status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' | 'connecting' | 'disconnected';
    qr?: string;
    phoneNumber?: string;
    ownerName?: string;
    autoReplyEnabled?: boolean;
}

interface DevicesProps { socket: any; }

const Devices: React.FC<DevicesProps> = ({ socket }) => {
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newSessionName, setNewSessionName] = useState('');
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'connected' | 'offline'>('all');
    const [search, setSearch] = useState('');
    const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('devicesView') as 'grid' | 'list') || 'grid');
    const setViewPersist = (v: 'grid' | 'list') => { setView(v); localStorage.setItem('devicesView', v); };

    useEffect(() => {
        if (!socket) return;
        socket.emit('list-sessions');

        const handleList = (list: any[]) => {
            setSessions(prev => list.map(s => ({ ...s, qr: prev.find(p => p.id === s.id)?.qr })));
        };
        const handleUpdate = () => socket.emit('list-sessions');
        const handleStatus = ({ sessionId, status }: any) => setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status } : s));
        const handleQr = ({ sessionId, qr }: any) => setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, qr: qr.replace('data:image/png;base64,', '') } : s));

        socket.on('sessions-list', handleList);
        socket.on('sessions-updated', handleUpdate);
        socket.on('session-status', handleStatus);
        socket.on('session-qr', handleQr);
        return () => {
            socket.off('sessions-list', handleList);
            socket.off('sessions-updated', handleUpdate);
            socket.off('session-status', handleStatus);
            socket.off('session-qr', handleQr);
        };
    }, [socket]);

    const handleCreateSession = () => {
        if (!newSessionName.trim() || !socket) return;
        if (!socket.connected) { alert('لا يوجد اتصال بالسيرفر. تأكد من تشغيل السيرفر وحاول مرة أخرى.'); return; }
        setLoading(true);
        const timeoutId = setTimeout(() => { if (loading) { setLoading(false); alert('استغرق الطلب وقتًا طويلاً.'); } }, 10000);
        socket.emit('create-session', { name: newSessionName }, (response: any) => {
            clearTimeout(timeoutId);
            setLoading(false);
            if (response?.error) { alert('فشل إضافة الجهاز: ' + response.error); return; }
            if (response?.sessionId) {
                setNewSessionName('');
                setShowAddModal(false);
                socket.emit('start-session', { sessionId: response.sessionId });
                navigate(`/devices/${response.sessionId}`);
            }
        });
    };

    const handleStart = (e: React.MouseEvent, sessionId: string) => { e.stopPropagation(); socket.emit('start-session', { sessionId }); };

    const statusMeta = (status: Session['status']) => {
        switch (status) {
            case 'CONNECTED': return { label: 'متصل', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600', ring: 'bg-emerald-100 text-emerald-600' };
            case 'QR': return { label: 'بانتظار المسح', dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600', ring: 'bg-blue-100 text-blue-600' };
            case 'connecting': return { label: 'جاري الاتصال', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600', ring: 'bg-amber-100 text-amber-600' };
            case 'ERROR': return { label: 'خطأ', dot: 'bg-red-500', chip: 'bg-red-50 text-red-600', ring: 'bg-red-100 text-red-600' };
            default: return { label: 'غير متصل', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-500', ring: 'bg-slate-100 text-slate-400' };
        }
    };

    const counts = {
        all: sessions.length,
        connected: sessions.filter(s => s.status === 'CONNECTED').length,
        offline: sessions.filter(s => s.status !== 'CONNECTED').length,
    };
    const q = search.trim().toLowerCase();
    const visible = sessions.filter(s => {
        const matchFilter = filter === 'all' ? true : filter === 'connected' ? s.status === 'CONNECTED' : s.status !== 'CONNECTED';
        const matchSearch = !q || (s.name || '').toLowerCase().includes(q) || (s.ownerName || '').toLowerCase().includes(q);
        return matchFilter && matchSearch;
    });
    const filterTabs: { id: typeof filter; label: string; count: number }[] = [
        { id: 'all', label: 'الكل', count: counts.all },
        { id: 'connected', label: 'متصل', count: counts.connected },
        { id: 'offline', label: 'غير متصل', count: counts.offline },
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">إدارة الأجهزة</h2>
                    <p className="text-slate-500 text-sm">اضغط على أي جهاز للتحكم الكامل فيه (الذكاء الاصطناعي، المحادثات، التحليلات...)</p>
                </div>
                <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20">
                    <Plus size={18} /> إضافة جهاز جديد
                </button>
            </div>

            {sessions.length > 0 && (
                <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                    <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm w-fit">
                        {filterTabs.map(t => (
                            <button key={t.id} onClick={() => setFilter(t.id)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${filter === t.id ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
                                {t.label}
                                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${filter === t.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 md:w-64">
                            <Search size={16} className="absolute right-3 top-2.5 text-slate-400" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الجهاز أو المالك..."
                                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-sm shadow-sm focus:outline-none focus:border-emerald-500" />
                        </div>
                        <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm shrink-0">
                            <button onClick={() => setViewPersist('grid')} className={`p-2 rounded-lg transition-colors ${view === 'grid' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-600'}`} title="عرض شبكي"><LayoutGrid size={18} /></button>
                            <button onClick={() => setViewPersist('list')} className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-slate-600'}`} title="عرض قائمة"><ListIcon size={18} /></button>
                        </div>
                    </div>
                </div>
            )}

            {sessions.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-sm text-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400"><Smartphone size={40} /></div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">لا توجد أجهزة متصلة</h3>
                    <p className="text-slate-500 mb-8 max-w-sm mx-auto">أضف جهازك الأول للبدء.</p>
                    <button onClick={() => setShowAddModal(true)} className="bg-emerald-50 text-emerald-600 font-bold py-3 px-8 rounded-xl hover:bg-emerald-100 transition-all border-2 border-emerald-100">إضافة جهاز</button>
                </div>
            ) : view === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visible.map(session => {
                        const meta = statusMeta(session.status);
                        const isOffline = !session.status || session.status === 'IDLE' || session.status === 'ERROR' || session.status === 'disconnected';
                        return (
                            <div key={session.id} onClick={() => navigate(`/devices/${session.id}`)}
                                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all">
                                <div className="p-6 flex-1 flex flex-col items-center text-center">
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${meta.ring}`}>
                                        {session.status === 'CONNECTED' ? <CheckCircle2 size={32} /> : session.status === 'QR' ? <QrCode size={32} /> : <Smartphone size={32} />}
                                    </div>
                                    <h3 className="font-bold text-lg text-slate-800 mb-1">{session.name}</h3>
                                    <p className="text-xs font-mono text-slate-400 mb-2 truncate max-w-full" dir="ltr">{session.id}</p>
                                    {session.ownerName && (
                                        <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full mb-3 border border-purple-100">المالك: {session.ownerName}</span>
                                    )}

                                    {session.status === 'QR' && session.qr ? (
                                        <div className="mb-4 bg-white p-2 rounded-xl border border-slate-100 shadow-sm"><QRCodeSVG value={session.qr} size={128} /></div>
                                    ) : (
                                        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 mb-4 ${meta.chip}`}>
                                            <div className={`w-2 h-2 rounded-full ${meta.dot} ${session.status === 'CONNECTED' || session.status === 'connecting' ? 'animate-pulse' : ''}`} />{meta.label}
                                        </div>
                                    )}

                                    <div className="mt-auto w-full space-y-2">
                                        {isOffline ? (
                                            <button onClick={(e) => handleStart(e, session.id)} className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20">ربط الجهاز</button>
                                        ) : (
                                            <button onClick={() => navigate(`/devices/${session.id}`)} className="w-full py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2">
                                                فتح الجهاز <ChevronLeft size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {visible.length === 0 && <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">لا توجد أجهزة مطابقة.</div>}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
                    {visible.map(session => {
                        const meta = statusMeta(session.status);
                        const isOffline = !session.status || session.status === 'IDLE' || session.status === 'ERROR' || session.status === 'disconnected';
                        return (
                            <div key={session.id} onClick={() => navigate(`/devices/${session.id}`)}
                                className="flex items-center gap-4 p-4 hover:bg-slate-50 cursor-pointer transition-colors">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.ring}`}>
                                    {session.status === 'CONNECTED' ? <CheckCircle2 size={22} /> : session.status === 'QR' ? <QrCode size={22} /> : <Smartphone size={22} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-bold text-slate-800 truncate">{session.name}</h3>
                                        {session.ownerName && <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-100">المالك: {session.ownerName}</span>}
                                    </div>
                                    <p className="text-xs font-mono text-slate-400 truncate" dir="ltr">{session.id}</p>
                                </div>
                                <div className={`px-3 py-1 rounded-full text-xs font-bold items-center gap-1.5 hidden sm:flex shrink-0 ${meta.chip}`}>
                                    <div className={`w-2 h-2 rounded-full ${meta.dot} ${session.status === 'CONNECTED' ? 'animate-pulse' : ''}`} />{meta.label}
                                </div>
                                {isOffline ? (
                                    <button onClick={(e) => handleStart(e, session.id)} className="py-2 px-4 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors shrink-0">ربط</button>
                                ) : (
                                    <button onClick={(e) => { e.stopPropagation(); navigate(`/devices/${session.id}`); }} className="py-2 px-4 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors shrink-0 flex items-center gap-1">فتح <ChevronLeft size={16} /></button>
                                )}
                            </div>
                        );
                    })}
                    {visible.length === 0 && <div className="py-12 text-center text-slate-400">لا توجد أجهزة مطابقة.</div>}
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir="rtl">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">إضافة جهاز جديد</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">اسم الجهاز</label>
                                <input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors" placeholder="مثال: الفريق التسويقي" value={newSessionName} onChange={e => setNewSessionName(e.target.value)} autoFocus />
                            </div>
                            <button onClick={handleCreateSession} disabled={!newSessionName.trim() || loading} className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
                                {loading ? 'جاري الإضافة...' : 'إضافة وبدء الاتصال'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Devices;
