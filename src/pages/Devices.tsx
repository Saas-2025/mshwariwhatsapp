import React, { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, QrCode, CheckCircle2, Plus, Trash2, X, AlertCircle, Code, Copy, Check, Bot, Sliders, Share2, Info } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Session {
    id: string;
    name: string;
    status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' | 'connecting' | 'disconnected';
    qr?: string;
    phoneNumber?: string;
    webhookUrl?: string; // Legacy
    webhookUrls?: string[]; // Legacy
    webhooks?: { name: string; url: string }[]; // New
    autoReplyEnabled?: boolean;
}

interface DevicesProps {
    socket: any;
}

type SettingsTab = 'overview' | 'api' | 'webhook' | 'autoreply';

const Devices: React.FC<DevicesProps> = ({ socket }) => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newSessionName, setNewSessionName] = useState('');
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [tokenCopied, setTokenCopied] = useState(false);

    // Filter tabs (page level) + settings modal
    const [filter, setFilter] = useState<'all' | 'connected' | 'offline'>('all');
    const [settingsSession, setSettingsSession] = useState<Session | null>(null);
    const [activeTab, setActiveTab] = useState<SettingsTab>('overview');

    // Webhook editor state
    const [webhookNameInput, setWebhookNameInput] = useState('');
    const [webhookUrlInput, setWebhookUrlInput] = useState('');
    const [webhooksList, setWebhooksList] = useState<{ name: string, url: string }[]>([]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyToken = (text: string) => {
        navigator.clipboard.writeText(text);
        setTokenCopied(true);
        setTimeout(() => setTokenCopied(false), 2000);
    };

    useEffect(() => {
        if (!socket) return;

        socket.emit('list-sessions');

        const handleList = (list: any[]) => {
            setSessions(prev => list.map(s => {
                const existing = prev.find(p => p.id === s.id);
                return { ...s, qr: existing?.qr };
            }));
        };

        const handleUpdate = () => {
            socket.emit('list-sessions');
        };

        const handleSessionStatus = ({ sessionId, status }: any) => {
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status } : s));
        };

        const handleSessionQr = ({ sessionId, qr }: any) => {
            const cleanQR = qr.replace('data:image/png;base64,', '');
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, qr: cleanQR } : s));
        };

        socket.on('sessions-list', handleList);
        socket.on('sessions-updated', handleUpdate);
        socket.on('session-status', handleSessionStatus);
        socket.on('session-qr', handleSessionQr);

        return () => {
            socket.off('sessions-list', handleList);
            socket.off('sessions-updated', handleUpdate);
            socket.off('session-status', handleSessionStatus);
            socket.off('session-qr', handleSessionQr);
        };
    }, [socket]);

    const handleCreateSession = () => {
        if (!newSessionName.trim() || !socket) return;

        if (!socket.connected) {
            alert('لا يوجد اتصال بالسيرفر. تأكد من تشغيل السيرفر وحاول مرة أخرى.');
            return;
        }

        setLoading(true);

        const timeoutId = setTimeout(() => {
            if (loading) {
                setLoading(false);
                alert('استغرق الطلب وقتًا طويلاً. يرجى التحقق من الاتصال.');
            }
        }, 10000);

        socket.emit('create-session', { name: newSessionName }, (response: any) => {
            clearTimeout(timeoutId);
            setLoading(false);

            if (response && response.error) {
                alert('فشل إضافة الجهاز: ' + response.error);
                return;
            }

            if (response && response.sessionId) {
                setNewSessionName('');
                setShowAddModal(false);
                handleStartSession(response.sessionId);
            }
        });
    };

    const handleDeleteSession = (sessionId: string) => {
        if (confirm('هل أنت متأكد من حذف هذا الجهاز؟')) {
            socket.emit('delete-session', { sessionId });
            setSettingsSession(null);
        }
    };

    const handleStartSession = (sessionId: string) => {
        socket.emit('start-session', { sessionId });
    };

    const handleLogout = (sessionId: string) => {
        const session = sessions.find(s => s.id === sessionId);
        const isConnected = session?.status === 'CONNECTED';
        const message = isConnected
            ? 'هل تريد تسجيل الخروج من هذا الجهاز؟'
            : 'هل تريد إلغاء المحاولة وإعادة تعيين الجلسة؟';

        if (confirm(message)) {
            socket.emit('logout', { sessionId });
        }
    };

    const handleToggleAutoReply = async (sessionId: string, currentStatus: boolean | undefined) => {
        const isCurrentlyEnabled = currentStatus !== false;

        try {
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, autoReplyEnabled: !isCurrentlyEnabled } : s));

            const token = localStorage.getItem('token');
            const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || `${window.location.protocol}//${window.location.hostname}:3050`;

            const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/toggle-autoreply`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ enabled: !isCurrentlyEnabled })
            });

            if (!res.ok) {
                setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, autoReplyEnabled: isCurrentlyEnabled } : s));
                alert('فشل تغيير حالة الرد الآلي');
            }
        } catch (error) {
            console.error(error);
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, autoReplyEnabled: isCurrentlyEnabled } : s));
        }
    };

    const handleAddWebhook = () => {
        if (!webhookUrlInput.trim()) return;

        if (webhooksList.some(w => w.url === webhookUrlInput.trim())) {
            alert('هذا الرابط مضاف بالفعل');
            return;
        }

        setWebhooksList([...webhooksList, {
            name: webhookNameInput.trim() || 'Webhook',
            url: webhookUrlInput.trim()
        }]);
        setWebhookUrlInput('');
        setWebhookNameInput('');
    };

    const handleRemoveWebhook = (urlToRemove: string) => {
        setWebhooksList(webhooksList.filter(w => w.url !== urlToRemove));
    };

    const handleSaveWebhook = async () => {
        if (!settingsSession) return;

        try {
            const token = localStorage.getItem('token');
            const baseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || `${window.location.protocol}//${window.location.hostname}:3050`;

            const response = await fetch(`${baseUrl}/api/sessions/${settingsSession.id}/webhook`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    webhookUrl: '',
                    webhookUrls: [],
                    webhooks: webhooksList
                })
            });

            if (response.ok) {
                const updatedData = await response.json();
                setSessions(prev => prev.map(s =>
                    s.id === settingsSession.id ? {
                        ...s,
                        webhookUrl: updatedData.webhookUrl,
                        webhookUrls: updatedData.webhookUrls,
                        webhooks: updatedData.webhooks
                    } : s
                ));
                alert('تم حفظ روابط الويب هوك بنجاح');
            } else {
                const data = await response.json();
                console.error('Save failed:', data);
                alert('فشل حفظ الروابط: ' + (data.details || data.error || 'خطأ غير معروف'));
            }
        } catch (error: any) {
            console.error(error);
            alert('حدث خطأ أثناء الحفظ: ' + (error.message || error));
        }
    };

    const openSettings = (session: Session) => {
        setSettingsSession(session);
        setActiveTab('overview');
        setWebhookUrlInput('');
        setWebhookNameInput('');

        let initial: { name: string, url: string }[] = [];
        if (session.webhooks && session.webhooks.length > 0) initial = session.webhooks;
        else if (session.webhookUrls && session.webhookUrls.length > 0) initial = session.webhookUrls.map(url => ({ name: 'Webhook', url }));
        else if (session.webhookUrl) initial = [{ name: 'Default webhook', url: session.webhookUrl }];
        setWebhooksList(initial);
    };

    // --- Helpers ---
    const apiBase = () => import.meta.env.VITE_API_URL?.replace(/\/$/, '') || `${window.location.protocol}//${window.location.hostname}:3050`;

    const statusMeta = (status: Session['status']) => {
        switch (status) {
            case 'CONNECTED': return { label: 'متصل', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600', ring: 'bg-emerald-100 text-emerald-600' };
            case 'QR': return { label: 'بانتظار المسح', dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600', ring: 'bg-blue-100 text-blue-600' };
            case 'connecting': return { label: 'جاري الاتصال', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600', ring: 'bg-amber-100 text-amber-600' };
            case 'ERROR': return { label: 'خطأ في الاتصال', dot: 'bg-red-500', chip: 'bg-red-50 text-red-600', ring: 'bg-red-100 text-red-600' };
            default: return { label: 'غير متصل', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-500', ring: 'bg-slate-100 text-slate-400' };
        }
    };

    const counts = {
        all: sessions.length,
        connected: sessions.filter(s => s.status === 'CONNECTED').length,
        offline: sessions.filter(s => s.status !== 'CONNECTED').length,
    };

    const visibleSessions = sessions.filter(s =>
        filter === 'all' ? true : filter === 'connected' ? s.status === 'CONNECTED' : s.status !== 'CONNECTED'
    );

    // Live version of the session being edited (so the modal reflects toggles instantly)
    const liveSettings = settingsSession ? (sessions.find(s => s.id === settingsSession.id) || settingsSession) : null;

    const filterTabs: { id: typeof filter; label: string; count: number }[] = [
        { id: 'all', label: 'الكل', count: counts.all },
        { id: 'connected', label: 'متصل', count: counts.connected },
        { id: 'offline', label: 'غير متصل', count: counts.offline },
    ];

    const settingsTabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
        { id: 'overview', label: 'نظرة عامة', icon: <Info size={16} /> },
        { id: 'api', label: 'الربط البرمجي', icon: <Code size={16} /> },
        { id: 'webhook', label: 'Webhook', icon: <Share2 size={16} /> },
        { id: 'autoreply', label: 'الرد الآلي', icon: <Bot size={16} /> },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">إدارة الأجهزة</h2>
                    <p className="text-slate-500 text-sm">اربط أرقام واتساب وتحكم في إعداداتها</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                >
                    <Plus size={18} /> إضافة جهاز جديد
                </button>
            </div>

            {/* Filter Tabs */}
            {sessions.length > 0 && (
                <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                    {filterTabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setFilter(t.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${filter === t.id ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {t.label}
                            <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${filter === t.id ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>
                        </button>
                    ))}
                </div>
            )}

            {sessions.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-sm text-center">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
                        <Smartphone size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">لا توجد أجهزة متصلة</h3>
                    <p className="text-slate-500 mb-8 max-w-sm mx-auto">أضف جهازك الأول للبدء في إرسال الحملات.</p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-emerald-50 text-emerald-600 font-bold py-3 px-8 rounded-xl hover:bg-emerald-100 transition-all border-2 border-emerald-100"
                    >
                        إضافة جهاز
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleSessions.map(session => {
                        const meta = statusMeta(session.status);
                        const isOffline = !session.status || session.status === 'IDLE' || session.status === 'ERROR' || session.status === 'disconnected';
                        return (
                            <div key={session.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="p-6 flex-1 flex flex-col items-center text-center">
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${meta.ring}`}>
                                        {session.status === 'CONNECTED' ? <CheckCircle2 size={32} /> :
                                            session.status === 'QR' ? <QrCode size={32} /> :
                                                <Smartphone size={32} />}
                                    </div>

                                    <h3 className="font-bold text-lg text-slate-800 mb-1">{session.name}</h3>
                                    <p className="text-xs font-mono text-slate-400 mb-4 truncate max-w-full" dir="ltr">{session.phoneNumber || session.id}</p>

                                    {session.status === 'QR' && session.qr ? (
                                        <div className="mb-4 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                                            <QRCodeSVG value={session.qr} size={140} />
                                            <p className="text-[11px] text-slate-400 mt-2">امسح الكود من واتساب</p>
                                        </div>
                                    ) : (
                                        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 mb-4 ${meta.chip}`}>
                                            <div className={`w-2 h-2 rounded-full ${meta.dot} ${session.status === 'CONNECTED' || session.status === 'connecting' ? 'animate-pulse' : ''}`}></div>
                                            {meta.label}
                                        </div>
                                    )}

                                    <div className="mt-auto w-full space-y-2">
                                        {isOffline ? (
                                            <button
                                                onClick={() => handleStartSession(session.id)}
                                                className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                                            >
                                                ربط الجهاز
                                            </button>
                                        ) : session.status === 'CONNECTED' ? (
                                            <button
                                                onClick={() => handleLogout(session.id)}
                                                className="w-full py-2.5 bg-amber-50 text-amber-600 rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors"
                                            >
                                                تسجيل خروج
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleLogout(session.id)}
                                                className="w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <RefreshCw size={16} /> إعادة تعيين الجلسة
                                            </button>
                                        )}

                                        <button
                                            onClick={() => openSettings(session)}
                                            className="w-full py-2.5 bg-slate-50 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 border border-slate-200"
                                        >
                                            <Sliders size={16} /> إعدادات الجهاز
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {visibleSessions.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">
                            لا توجد أجهزة في هذا التصنيف.
                        </div>
                    )}
                </div>
            )}

            {/* ===== Settings Modal (Tabbed) ===== */}
            {settingsSession && liveSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir="rtl">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[88vh]">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${statusMeta(liveSettings.status).ring}`}>
                                    <Smartphone size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">{liveSettings.name}</h3>
                                    <p className="text-xs text-slate-400">{statusMeta(liveSettings.status).label}</p>
                                </div>
                            </div>
                            <button onClick={() => setSettingsSession(null)} className="text-slate-400 hover:text-slate-600 p-1">
                                <X size={22} />
                            </button>
                        </div>

                        {/* Tab Bar */}
                        <div className="flex gap-1 px-5 pt-3 border-b border-slate-100 overflow-x-auto">
                            {settingsTabs.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id)}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                                >
                                    {t.icon}
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            {/* Overview */}
                            {activeTab === 'overview' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <p className="text-xs text-slate-400 mb-1">الحالة</p>
                                            <p className="font-bold text-slate-700 flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${statusMeta(liveSettings.status).dot}`}></span>
                                                {statusMeta(liveSettings.status).label}
                                            </p>
                                        </div>
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                            <p className="text-xs text-slate-400 mb-1">الرقم</p>
                                            <p className="font-bold text-slate-700 font-mono text-sm" dir="ltr">{liveSettings.phoneNumber || '—'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                        <p className="text-xs text-slate-400 mb-1">معرّف الجلسة (Session ID)</p>
                                        <p className="font-mono text-sm text-slate-600 break-all" dir="ltr">{liveSettings.id}</p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteSession(liveSettings.id)}
                                        className="w-full py-3 text-red-500 hover:text-white hover:bg-red-500 border border-red-200 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 mt-2"
                                    >
                                        <Trash2 size={16} /> حذف الجهاز نهائياً
                                    </button>
                                </div>
                            )}

                            {/* API */}
                            {activeTab === 'api' && (
                                <div className="space-y-5" dir="ltr">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Endpoint URL</label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 bg-white p-3 rounded-lg border border-slate-200 font-mono text-sm text-slate-700 break-all">
                                                {`${apiBase()}/api/sessions/${liveSettings.id}/send`}
                                            </code>
                                            <button
                                                onClick={() => handleCopy(`${apiBase()}/api/sessions/${liveSettings.id}/send`)}
                                                className="p-3 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-emerald-500 hover:border-emerald-500 transition-colors shrink-0"
                                            >
                                                {copied ? <Check size={18} /> : <Copy size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Authorization Token (Bearer)</label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 bg-white p-3 rounded-lg border border-slate-200 font-mono text-sm text-slate-700 break-all line-clamp-2">
                                                {localStorage.getItem('token') || 'Token not found'}
                                            </code>
                                            <button
                                                onClick={() => handleCopyToken(localStorage.getItem('token') || '')}
                                                className="p-3 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-emerald-500 hover:border-emerald-500 transition-colors shrink-0"
                                            >
                                                {tokenCopied ? <Check size={18} /> : <Copy size={18} />}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2">
                                            Header: <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-600">Authorization: Bearer YOUR_TOKEN</code>
                                        </p>
                                    </div>

                                    <div>
                                        <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">Text Message (JSON)</span>
                                        <pre className="mt-2 bg-slate-900 text-slate-50 p-4 rounded-xl text-xs font-mono overflow-x-auto">
{`{
  "number": "201012345678",
  "type": "text",
  "content": "Hello via API!"
}`}
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* Webhook */}
                            {activeTab === 'webhook' && (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-500">سيتم إرسال إشعار (POST) لكل الروابط عند وصول رسالة جديدة لهذا الجهاز.</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                                            placeholder="اسم (مثلاً: n8n)"
                                            value={webhookNameInput}
                                            onChange={(e) => setWebhookNameInput(e.target.value)}
                                        />
                                        <input
                                            type="url"
                                            className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-left font-mono text-sm"
                                            placeholder="https://..."
                                            value={webhookUrlInput}
                                            onChange={(e) => setWebhookUrlInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddWebhook(); } }}
                                            dir="ltr"
                                        />
                                        <button
                                            onClick={handleAddWebhook}
                                            disabled={!webhookUrlInput.trim()}
                                            className="bg-emerald-500 text-white px-4 rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Plus size={20} />
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar">
                                        {webhooksList.length === 0 && (
                                            <p className="text-center text-slate-400 py-6 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                                لا توجد روابط مضافة.
                                            </p>
                                        )}
                                        {webhooksList.map((w, idx) => (
                                            <div key={idx} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 group">
                                                <div className="flex flex-col flex-1 overflow-hidden">
                                                    <span className="text-xs font-bold text-slate-700 truncate">{w.name}</span>
                                                    <code className="text-[10px] font-mono text-slate-500 truncate mt-0.5" dir="ltr" title={w.url}>{w.url}</code>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveWebhook(w.url)}
                                                    className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                                                    title="حذف"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        onClick={handleSaveWebhook}
                                        className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                                    >
                                        حفظ التغييرات ({webhooksList.length})
                                    </button>
                                </div>
                            )}

                            {/* Auto-reply */}
                            {activeTab === 'autoreply' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between bg-slate-50 rounded-xl p-4 border border-slate-200">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${liveSettings.autoReplyEnabled !== false ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                                                <Bot size={20} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-700">الرد الآلي لهذا الجهاز</p>
                                                <p className="text-xs text-slate-400">{liveSettings.autoReplyEnabled !== false ? 'مفعّل — سيرد البوت تلقائياً' : 'معطّل'}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleToggleAutoReply(liveSettings.id, liveSettings.autoReplyEnabled)}
                                            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${liveSettings.autoReplyEnabled !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                        >
                                            <span className={`pointer-events-none absolute left-0 inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${liveSettings.autoReplyEnabled !== false ? 'translate-x-[calc(100%+2px)]' : 'translate-x-[2px]'}`} />
                                        </button>
                                    </div>
                                    <div className="bg-blue-50 text-blue-700 p-3 rounded-xl text-sm flex items-start gap-2">
                                        <Info size={16} className="shrink-0 mt-0.5" />
                                        هذا المفتاح يوقف/يشغّل كل الردود الآلية لهذا الرقم. لإدارة الكلمات المفتاحية، افتح صفحة «الرد الآلي».
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Session Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir="rtl">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">إضافة جهاز جديد</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">اسم الجهاز</label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
                                    placeholder="مثال: الفريق التسويقي"
                                    value={newSessionName}
                                    onChange={(e) => setNewSessionName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={handleCreateSession}
                                disabled={!newSessionName.trim() || loading}
                                className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
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
