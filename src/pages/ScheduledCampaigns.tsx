import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, Pause, Play, Trash2, RefreshCw, Edit2, FileText, X, Search, FileSpreadsheet } from 'lucide-react';
import RecipientTools from '../components/RecipientTools';
import { exportExcel, exportPDF } from '../lib/exporters';

const getApiUrl = () => {
    let url = import.meta.env.VITE_API_URL || 'http://localhost:3050';
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
};

const EMPTY_FORM = {
    title: '', sessionId: '', messageType: 'text', content: '', caption: '', recipientsText: '',
    scheduledTime: '', scheduledEndTime: '', minDelay: 3, maxDelay: 10, schedulingMode: 'fixed' as 'fixed' | 'window'
};

const statusLabel = (s: string) => s === 'pending' ? 'مجدول' : s === 'active' ? 'جاري الإرسال' : s === 'completed' ? 'مكتمل' : s === 'paused' ? 'متوقف مؤقتاً' : s === 'failed' ? 'فشل' : s;
const statusColor = (s: string) => s === 'pending' ? 'bg-yellow-100 text-yellow-700' : s === 'active' ? 'bg-blue-100 text-blue-700' : s === 'completed' ? 'bg-emerald-100 text-emerald-700' : s === 'paused' ? 'bg-orange-100 text-orange-700' : s === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700';

const ScheduledCampaigns = () => {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editId, setEditId] = useState<string | null>(null);
    const [viewCampaign, setViewCampaign] = useState<any | null>(null);
    const [sessions, setSessions] = useState<any[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'paused' | 'completed'>('all');
    const [formData, setFormData] = useState({ ...EMPTY_FORM });

    useEffect(() => { fetchCampaigns(); fetchSessions(); }, []);

    const fetchCampaigns = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${getApiUrl()}/api/scheduled-campaigns`, { headers: { Authorization: `Bearer ${token}` } });
            setCampaigns(await res.json());
        } catch (e) { console.error('Failed to fetch campaigns', e); } finally { setLoading(false); }
    };

    const fetchSessions = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${getApiUrl()}/api/sessions`, { headers: { Authorization: `Bearer ${token}` } });
            setSessions(await res.json());
        } catch (e) { console.error('Failed to fetch sessions', e); }
    };

    const resetForm = () => { setFormData({ ...EMPTY_FORM }); setEditId(null); };

    const addNumbers = (nums: string[]) => setFormData(f => {
        const existing = f.recipientsText.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
        return { ...f, recipientsText: [...new Set([...existing, ...nums])].join('\n') };
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const numbers = formData.recipientsText.split(/[\n,]+/).map(n => n.trim()).filter(n => n.length >= 10);
            const recipients = numbers.map(n => ({ number: n }));
            let { minDelay, maxDelay } = formData;

            if (formData.schedulingMode === 'window' && formData.scheduledEndTime) {
                const start = new Date(formData.scheduledTime).getTime();
                const end = new Date(formData.scheduledEndTime).getTime();
                if (end <= start) throw new Error('وقت الانتهاء يجب أن يكون بعد وقت البدء');
                const avgDelay = ((end - start) / 1000) / (recipients.length || 1);
                minDelay = Math.max(1, Math.floor(avgDelay * 0.7));
                maxDelay = Math.max(minDelay + 1, Math.ceil(avgDelay * 1.3));
            }

            const payload: any = { ...formData, scheduledTime: new Date(formData.scheduledTime).toISOString(), minDelay, maxDelay };
            if (editId) {
                const current = campaigns.find(c => c._id === editId);
                if (current && current.status === 'paused') delete payload.recipients;
                else payload.recipients = recipients;
            } else {
                payload.recipients = recipients;
            }

            const method = editId ? 'PUT' : 'POST';
            const url = editId ? `${getApiUrl()}/api/scheduled-campaigns/${editId}` : `${getApiUrl()}/api/scheduled-campaigns`;
            const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error((await response.json()).error || 'Failed to save campaign');

            resetForm();
            fetchCampaigns();
        } catch (error: any) { alert(error.message); }
    };

    const handleEdit = (campaign: any) => {
        setEditId(campaign._id);
        const date = new Date(campaign.scheduledTime);
        const localIso = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setFormData({
            title: campaign.title, sessionId: campaign.sessionId, messageType: campaign.messageType,
            content: campaign.content || '', caption: campaign.caption || '',
            recipientsText: campaign.recipients.map((r: any) => r.number).join('\n'),
            scheduledTime: localIso, scheduledEndTime: '', minDelay: campaign.minDelay, maxDelay: campaign.maxDelay, schedulingMode: 'fixed'
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleAction = async (id: string, action: 'pause' | 'resume' | 'delete') => {
        try {
            const token = localStorage.getItem('token');
            if (action === 'delete') {
                await fetch(`${getApiUrl()}/api/scheduled-campaigns/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            } else {
                const status = action === 'pause' ? 'paused' : 'active';
                await fetch(`${getApiUrl()}/api/scheduled-campaigns/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
            }
            fetchCampaigns();
        } catch (e) { console.error(e); }
    };

    const q = search.trim().toLowerCase();
    const shown = campaigns.filter(c =>
        (statusFilter === 'all' || c.status === statusFilter) &&
        (!q || (c.title || '').toLowerCase().includes(q)));

    const expHeaders = ['اسم الحملة', 'التوقيت', 'المستلمون', 'تم الإرسال', 'فشل', 'الحالة'];
    const expRows = () => shown.map(c => [c.title, new Date(c.scheduledTime).toLocaleString('en-GB'), c.recipients.length, c.progress?.sent || 0, c.progress?.failed || 0, statusLabel(c.status)]);

    const recipientsCount = formData.recipientsText.split(/[\n,]+/).map(n => n.trim()).filter(Boolean).length;

    return (
        <div className="space-y-5">
            <h2 className="text-2xl font-bold text-slate-800">الحملات المجدولة</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* ===== Form (1/3 — right) ===== */}
                <div className="lg:col-span-1 lg:sticky lg:top-4">
                    <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">{editId ? <><Edit2 size={18} className="text-blue-500" /> تعديل الحملة</> : <><Plus size={18} className="text-emerald-500" /> جدولة حملة جديدة</>}</h3>
                            {editId && <button type="button" onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-red-500">إلغاء التعديل</button>}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">اسم الحملة</label>
                            <input type="text" required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500" placeholder="مثال: عرض الجمعة" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">الجهاز المرسل</label>
                            <select required value={formData.sessionId} onChange={e => setFormData({ ...formData, sessionId: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500">
                                <option value="">اختر الجهاز...</option>
                                {sessions.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">توقيت الإرسال</label>
                            <input type="datetime-local" required value={formData.scheduledTime} onChange={e => setFormData({ ...formData, scheduledTime: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500" />
                        </div>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <label className="block text-xs font-bold text-slate-600 mb-2">طريقة الجدولة</label>
                            <div className="flex gap-3 mb-2 text-sm">
                                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="schedMode" checked={formData.schedulingMode === 'fixed'} onChange={() => setFormData({ ...formData, schedulingMode: 'fixed' })} className="accent-emerald-500" /> فاصل ثابت</label>
                                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="schedMode" checked={formData.schedulingMode === 'window'} onChange={() => setFormData({ ...formData, schedulingMode: 'window' })} className="accent-emerald-500" /> توزيع خلال فترة</label>
                            </div>
                            {formData.schedulingMode === 'fixed' ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <div><label className="block text-[11px] text-slate-500 mb-1">أقل فاصل (ث)</label><input type="number" min="1" value={formData.minDelay} onChange={e => setFormData({ ...formData, minDelay: parseInt(e.target.value) })} className="w-full border border-slate-200 p-2 rounded-lg bg-white text-sm" /></div>
                                    <div><label className="block text-[11px] text-slate-500 mb-1">أقصى فاصل (ث)</label><input type="number" min="1" value={formData.maxDelay} onChange={e => setFormData({ ...formData, maxDelay: parseInt(e.target.value) })} className="w-full border border-slate-200 p-2 rounded-lg bg-white text-sm" /></div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-[11px] text-slate-500 mb-1">الانتهاء في</label>
                                    <input type="datetime-local" required={formData.schedulingMode === 'window'} value={formData.scheduledEndTime} onChange={e => setFormData({ ...formData, scheduledEndTime: e.target.value })} className="w-full border border-slate-200 p-2 rounded-lg bg-white text-sm" />
                                    <p className="text-[11px] text-blue-500 mt-1">توزيع {recipientsCount} رسالة بالتساوي بين البدء والنهاية.</p>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">نوع الرسالة</label>
                            <div className="flex gap-3 mb-2 text-sm">
                                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="msgType" checked={formData.messageType === 'text'} onChange={() => setFormData({ ...formData, messageType: 'text' })} className="accent-emerald-500" /> نص</label>
                                <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="msgType" checked={formData.messageType === 'image'} onChange={() => setFormData({ ...formData, messageType: 'image' })} className="accent-emerald-500" /> صورة</label>
                            </div>
                            {formData.messageType !== 'text' && (
                                <input type="url" value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} placeholder="https://example.com/image.jpg"
                                    className="w-full border border-slate-200 p-2.5 rounded-xl text-sm mb-2 text-left" />
                            )}
                            <textarea value={formData.messageType === 'text' ? formData.content : formData.caption}
                                onChange={e => formData.messageType === 'text' ? setFormData({ ...formData, content: e.target.value }) : setFormData({ ...formData, caption: e.target.value })}
                                className="w-full border border-slate-200 p-2.5 rounded-xl h-20 text-sm focus:outline-none focus:border-emerald-500" placeholder="اكتب رسالتك... يمكنك استخدام {{id}}" />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-bold text-slate-500">أرقام المستلمين {recipientsCount > 0 && <span className="text-emerald-600">({recipientsCount})</span>}</label>
                            </div>
                            <div className="mb-2"><RecipientTools sessionId={formData.sessionId} onAdd={addNumbers} /></div>
                            <textarea required value={formData.recipientsText} onChange={e => setFormData({ ...formData, recipientsText: e.target.value })}
                                className="w-full border border-slate-200 p-2.5 rounded-xl h-28 font-mono text-sm focus:outline-none focus:border-emerald-500" placeholder={`201000000001\n201000000002`} />
                        </div>

                        <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all">
                            {editId ? 'حفظ التغييرات' : 'حفظ وجدولة'}
                        </button>
                    </form>
                </div>

                {/* ===== List (2/3 — left) ===== */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                        <div className="relative flex-1 sm:max-w-xs">
                            <Search size={16} className="absolute right-3 top-2.5 text-slate-400" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الحملة..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-sm focus:outline-none focus:border-emerald-500" />
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="inline-flex bg-slate-50 border border-slate-200 rounded-xl p-1 overflow-x-auto">
                                {(['all', 'pending', 'active', 'paused', 'completed'] as const).map(s => (
                                    <button key={s} onClick={() => setStatusFilter(s)}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${statusFilter === s ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                                        {s === 'all' ? 'الكل' : statusLabel(s)}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => exportExcel('scheduled-campaigns.xlsx', 'الحملات المجدولة', expHeaders, expRows())} disabled={!shown.length} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-40" title="تصدير Excel"><FileSpreadsheet size={16} /></button>
                            <button onClick={() => exportPDF('الحملات المجدولة', expHeaders, expRows(), `عدد الحملات: ${shown.length}`)} disabled={!shown.length} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-40" title="تصدير PDF"><FileText size={16} /></button>
                            <button onClick={() => { setLoading(true); fetchCampaigns(); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg" title="تحديث"><RefreshCw size={16} /></button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-12 text-slate-500">جاري التحميل...</div>
                    ) : shown.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                            <Calendar size={44} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-slate-500 font-medium">{campaigns.length === 0 ? 'لا توجد حملات مجدولة — أنشئ واحدة من الفورم.' : 'لا توجد حملات مطابقة.'}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {shown.map(camp => (
                                <div key={camp._id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 md:items-center">
                                    <div className="flex-1 space-y-2 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-bold text-slate-800 truncate">{camp.title}</h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusColor(camp.status)}`}>{statusLabel(camp.status)}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                                            <span className="flex items-center gap-1"><Clock size={14} /> {new Date(camp.scheduledTime).toLocaleString('en-GB')}</span>
                                            <span>•</span>
                                            <span>{camp.recipients.length} مستلم</span>
                                        </div>
                                        {(camp.status === 'active' || camp.status === 'completed' || camp.status === 'paused') && (
                                            <div className="w-full max-w-xs space-y-1">
                                                <div className="flex justify-between text-[11px] text-slate-500"><span>تم: {camp.progress?.sent || 0}</span><span>فشل: {camp.progress?.failed || 0}</span></div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${((camp.progress?.sent || 0) / (camp.recipients.length || 1)) * 100}%` }} /></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => setViewCampaign(camp)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg" title="عرض التقرير"><FileText size={18} /></button>
                                        {(camp.status === 'pending' || camp.status === 'paused') && <button onClick={() => handleEdit(camp)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="تعديل"><Edit2 size={18} /></button>}
                                        {camp.status === 'active' && <button onClick={() => handleAction(camp._id, 'pause')} className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg" title="إيقاف"><Pause size={18} /></button>}
                                        {(camp.status === 'paused' || camp.status === 'pending') && <button onClick={() => handleAction(camp._id, 'resume')} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg" title={camp.status === 'pending' ? 'بدء الآن' : 'استئناف'}><Play size={18} /></button>}
                                        <button onClick={() => { if (confirm('حذف هذه الحملة؟')) handleAction(camp._id, 'delete'); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="حذف"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Report Modal */}
            {viewCampaign && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileText size={22} className="text-emerald-500" /> تقرير: {viewCampaign.title}</h3>
                            <button onClick={() => setViewCampaign(null)} className="text-slate-400 hover:text-red-500"><X size={22} /></button>
                        </div>
                        <div className="p-5 overflow-y-auto flex-1">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100"><p className="text-slate-500 text-xs mb-1">الإجمالي</p><p className="text-xl font-bold text-slate-800">{viewCampaign.recipients.length}</p></div>
                                <div className="bg-emerald-50 p-3 rounded-xl text-center border border-emerald-100"><p className="text-emerald-600 text-xs mb-1">تم الإرسال</p><p className="text-xl font-bold text-emerald-700">{viewCampaign.progress?.sent || 0}</p></div>
                                <div className="bg-red-50 p-3 rounded-xl text-center border border-red-100"><p className="text-red-600 text-xs mb-1">فشل</p><p className="text-xl font-bold text-red-700">{viewCampaign.progress?.failed || 0}</p></div>
                                <div className="bg-yellow-50 p-3 rounded-xl text-center border border-yellow-100"><p className="text-yellow-600 text-xs mb-1">قيد الانتظار</p><p className="text-xl font-bold text-yellow-700">{viewCampaign.recipients.length - ((viewCampaign.progress?.sent || 0) + (viewCampaign.progress?.failed || 0))}</p></div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                                <table className="w-full text-right text-sm">
                                    <thead className="bg-slate-50 text-slate-600 font-bold"><tr><th className="p-3">الرقم</th><th className="p-3">الحالة</th><th className="p-3">التفاصيل</th></tr></thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {viewCampaign.recipients.map((r: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-3 font-mono text-slate-600" dir="ltr">{r.number}</td>
                                                <td className="p-3"><span className={`px-2 py-1 rounded text-xs font-bold ${r.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : r.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.status === 'sent' ? 'تم' : r.status === 'failed' ? 'فشل' : 'انتظار'}</span></td>
                                                <td className="p-3 text-xs text-red-500">{r.status === 'failed' ? (r.error || 'خطأ') : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScheduledCampaigns;
