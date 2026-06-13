import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Bot, MessageSquare, Terminal, Smartphone, Edit2, Image as ImageIcon, Video, FileText, Mic, X } from 'lucide-react';

interface AutoReplyRule {
    _id: string;
    sessionId?: string;
    keyword: string;
    response: string;
    matchType: 'exact' | 'contains';
    replyType?: 'text' | 'image' | 'video' | 'audio' | 'document';
    mediaUrl?: string;
    isActive: boolean;
}

interface AutoReplyProps {
    socket: any;
}

const AutoReply: React.FC<AutoReplyProps> = ({ socket }) => {
    const [rules, setRules] = useState<AutoReplyRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);

    // Sessions State
    const [sessions, setSessions] = useState<any[]>([]);

    // Form State
    const [keyword, setKeyword] = useState('');
    const [response, setResponse] = useState('');
    const [matchType, setMatchType] = useState<'exact' | 'contains'>('contains'); // Default smart match
    const [replyType, setReplyType] = useState<'text' | 'image' | 'video' | 'audio' | 'document'>('text');
    const [mediaUrl, setMediaUrl] = useState('');
    const [selectedSessionId, setSelectedSessionId] = useState<string>(''); // '' means All

    useEffect(() => {
        fetchRules();

        // Fetch sessions for dropdown
        if (socket && socket.connected) {
            socket.emit('list-sessions');
            socket.on('sessions-list', (data: any[]) => {
                setSessions(data);
            });
        }

        return () => {
            if (socket) socket.off('sessions-list');
        };
    }, [socket]);

    const fetchRules = async () => {
        try {
            const token = localStorage.getItem('token');
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/autoreply`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRules(data);
            }
        } catch (error) {
            console.error('Failed to fetch rules', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (rule: AutoReplyRule) => {
        setEditId(rule._id);
        setKeyword(rule.keyword);
        setResponse(rule.response);
        setMatchType(rule.matchType);
        setSelectedSessionId(rule.sessionId || '');
        setReplyType(rule.replyType || 'text');
        setMediaUrl(rule.mediaUrl || '');
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');

            const url = editId ? (`${baseUrl}/api/autoreply/${editId}`) : (`${baseUrl}/api/autoreply`);
            const method = editId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    keyword,
                    response,
                    matchType,
                    sessionId: selectedSessionId || undefined,
                    replyType,
                    mediaUrl: replyType !== 'text' ? mediaUrl : undefined
                })
            });

            if (res.ok) {
                closeModal();
                fetchRules();
            } else {
                const text = await res.text();
                try {
                    const errData = JSON.parse(text);
                    alert(`خطأ: ${errData.error || 'فشل حفظ القاعدة'}`);
                } catch (e) {
                    alert(`خطأ في السيرفر: ${text}`);
                }
            }
        } catch (error) {
            alert(`خطأ في الشبكة: ${error}`);
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setEditId(null);
        setKeyword('');
        setResponse('');
        setMediaUrl('');
        setReplyType('text');
        setSelectedSessionId('');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('هل أنت متأكد من حذف هذه القاعدة؟')) return;
        try {
            const token = localStorage.getItem('token');
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/autoreply/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                setRules(rules.filter(r => r._id !== id));
            }
        } catch (error) {
            console.error('Failed to delete rule', error);
        }
    };

    const handleToggleRule = async (id: string, currentStatus: boolean) => {
        try {
            // Optimistic UI update
            setRules(rules.map(r => r._id === id ? { ...r, isActive: !currentStatus } : r));

            const token = localStorage.getItem('token');
            const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
            const res = await fetch(`${baseUrl}/api/autoreply/${id}/toggle`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ isActive: !currentStatus })
            });

            if (!res.ok) {
                // Revert on failure
                setRules(rules.map(r => r._id === id ? { ...r, isActive: currentStatus } : r));
                alert('فشل تغيير حالة القاعدة');
            }
        } catch (error) {
            console.error('Failed to toggle rule', error);
            // Revert on failure
            setRules(rules.map(r => r._id === id ? { ...r, isActive: currentStatus } : r));
        }
    };

    const getSessionName = (id?: string) => {
        if (!id) return 'كل الأجهزة (عام)';
        const session = sessions.find(s => s.id === id);
        return session ? `${session.name || 'جهاز'}` : 'جهاز غير معروف';
    };

    const getSessionStatusColor = (id?: string) => {
        if (!id) return 'bg-purple-50 text-purple-600 border-purple-200';
        const session = sessions.find(s => s.id === id);
        return session?.status === 'CONNECTED'
            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
            : 'bg-amber-50 text-amber-600 border-amber-200';
    };

    const getReplyTypeIcon = (type?: string) => {
        switch (type) {
            case 'image': return <ImageIcon className="w-3 h-3" />;
            case 'video': return <Video className="w-3 h-3" />;
            case 'document': return <FileText className="w-3 h-3" />;
            case 'audio': return <Mic className="w-3 h-3" />;
            default: return <MessageSquare className="w-3 h-3" />;
        }
    };

    const replyTypeLabel = (type?: string) => {
        switch (type) {
            case 'image': return 'صورة';
            case 'video': return 'فيديو';
            case 'document': return 'ملف';
            case 'audio': return 'صوت';
            default: return 'نص';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Bot className="w-8 h-8 text-emerald-500" />
                        الرد الآلي
                    </h1>
                    <p className="text-slate-500">إعداد ردود تلقائية على الرسائل الواردة حسب الكلمات المفتاحية</p>
                </div>
                <button
                    onClick={() => { closeModal(); setShowModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-white text-sm font-bold transition-all shadow-lg shadow-emerald-500/20"
                >
                    <Plus className="w-5 h-5" />
                    قاعدة جديدة
                </button>
            </div>

            {/* Rules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {rules.map((rule) => (
                    <div key={rule._id} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-300 hover:shadow-md transition-all group shadow-sm flex flex-col justify-between relative">

                        <div className="flex justify-between items-start mb-2">
                            <div className="flex flex-col gap-2 w-full">
                                <div className="flex items-center justify-between w-full gap-2">
                                    <h3 className="text-slate-800 font-bold truncate flex-1" title={rule.keyword}>
                                        <span className="text-emerald-500 text-sm font-bold ml-1">#</span>
                                        {rule.keyword}
                                    </h3>
                                    <div className="flex items-center gap-1 shrink-0 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleToggleRule(rule._id, rule.isActive)}
                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${rule.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                            title={rule.isActive ? 'إيقاف القاعدة' : 'تفعيل القاعدة'}
                                        >
                                            <span
                                                className={`pointer-events-none absolute left-0 inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${rule.isActive ? 'translate-x-[calc(100%+2px)]' : 'translate-x-[2px]'}`}
                                            />
                                        </button>
                                        <button
                                            onClick={() => handleEdit(rule)}
                                            className="text-slate-400 hover:text-blue-500 p-1 rounded-full hover:bg-blue-50 transition-colors"
                                            title="تعديل"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(rule._id)}
                                            className="text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors"
                                            title="حذف"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full border border-slate-200">
                                        {rule.matchType === 'exact' ? 'تطابق تام' : 'مرن'}
                                    </span>
                                    <div className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 max-w-full truncate ${getSessionStatusColor(rule.sessionId)}`}>
                                        <Smartphone className="w-2.5 h-2.5" />
                                        <span className="truncate">{getSessionName(rule.sessionId)}</span>
                                    </div>
                                    <div className="text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 flex items-center gap-1">
                                        {getReplyTypeIcon(rule.replyType)}
                                        <span>{replyTypeLabel(rule.replyType)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            {rule.mediaUrl && (
                                <div className="mb-1 text-[10px] text-blue-500 truncate opacity-80">
                                    ملف: {rule.mediaUrl}
                                </div>
                            )}
                            <div className="line-clamp-2" title={rule.response}>{rule.response}</div>
                        </div>
                    </div>
                ))}

                {rules.length === 0 && !loading && (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">
                        <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>لا توجد قواعد رد آلي بعد. أضف قاعدتك الأولى.</p>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
                    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-slate-800">{editId ? 'تعديل القاعدة' : 'إنشاء قاعدة رد آلي'}</h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                                <X size={22} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-500 mb-1.5">الجهاز</label>
                                <select
                                    value={selectedSessionId}
                                    onChange={(e) => setSelectedSessionId(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:border-emerald-500 focus:outline-none"
                                >
                                    <option value="">كل الأجهزة (قاعدة عامة)</option>
                                    {sessions.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.status === 'CONNECTED' ? 'متصل' : 'غير متصل'})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-500 mb-1.5">الكلمات المفتاحية</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:border-emerald-500 focus:outline-none pr-10"
                                        placeholder="مرحبا، اهلا، السلام عليكم"
                                    />
                                    <Terminal className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
                                </div>
                                <p className="text-xs text-slate-400 mt-1">افصل بين عدة كلمات بفاصلة (،).</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-500 mb-1.5">نوع المطابقة</label>
                                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => setMatchType('exact')}
                                        className={`flex-1 py-2 text-sm rounded-lg transition-colors font-bold ${matchType === 'exact' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        تطابق تام
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMatchType('contains')}
                                        className={`flex-1 py-2 text-sm rounded-lg transition-colors font-bold ${matchType === 'contains' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        مرن / يحتوي
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                    {matchType === 'contains' ? 'يتجاوز الأخطاء الإملائية (مثلاً "اهلا" تطابق "اهلاً").' : 'مطابقة دقيقة فقط.'}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-500 mb-1.5">نوع الرد</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {(['text', 'image', 'video', 'document', 'audio'] as const).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setReplyType(t)}
                                            className={`py-2 px-1 text-[11px] rounded-xl border transition-all flex flex-col items-center gap-1 ${replyType === t ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                                        >
                                            {getReplyTypeIcon(t)}
                                            {replyTypeLabel(t)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {replyType !== 'text' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-500 mb-1.5">رابط الملف المباشر (URL)</label>
                                    <input
                                        type="url"
                                        required
                                        value={mediaUrl}
                                        onChange={(e) => setMediaUrl(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:border-emerald-500 focus:outline-none text-left font-mono text-sm"
                                        placeholder={`https://example.com/file.${replyType === 'image' ? 'jpg' : 'mp4'}`}
                                        dir="ltr"
                                    />
                                    <p className="text-xs text-amber-500 mt-1">يجب أن يكون رابطاً مباشراً ومتاحاً للعموم.</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-slate-500 mb-1.5">
                                    {replyType === 'text' ? 'نص الرد' : 'تسمية توضيحية (اختياري)'}
                                </label>
                                <textarea
                                    required={replyType === 'text'}
                                    value={response}
                                    onChange={(e) => setResponse(e.target.value)}
                                    rows={replyType === 'text' ? 4 : 2}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 focus:border-emerald-500 focus:outline-none resize-none"
                                    placeholder={replyType === 'text' ? 'اكتب الرد التلقائي...' : 'أضف وصفاً للملف...'}
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2.5 text-slate-500 hover:text-slate-700 font-bold transition-colors"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                                >
                                    {editId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    {editId ? 'حفظ التغييرات' : 'إنشاء القاعدة'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AutoReply;
