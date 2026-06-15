import React, { useState, useEffect } from 'react';
import { Lock, AlertCircle, CheckCircle, Globe, CreditCard, Plus, Trash2, Save, Star } from 'lucide-react';

const apiBase = () => (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const authToken = () => localStorage.getItem('token');

const emptyDraft = () => ({ name: 'باقة جديدة', priceMonthly: 0, priceYearly: 0, currency: 'ج.م', maxSessions: 1, maxConversations: 0, maxCampaignMessages: 0, maxScheduled: 0, features: [], popular: false, order: 99, isActive: true });

const NUM_FIELDS: { key: string; label: string }[] = [
    { key: 'priceMonthly', label: 'السعر شهرياً' },
    { key: 'priceYearly', label: 'السعر سنوياً' },
    { key: 'maxSessions', label: 'عدد الأجهزة (0=∞)' },
    { key: 'maxConversations', label: 'حد المحادثات/شهر (0=∞)' },
    { key: 'maxCampaignMessages', label: 'حد رسائل الحملات/شهر (0=∞)' },
    { key: 'maxScheduled', label: 'حد الحملات المجدولة (0=∞)' },
    { key: 'order', label: 'الترتيب' },
];

// Admin-only subscription plans editor
const PlansManager = () => {
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState('');
    const [msg, setMsg] = useState('');

    const load = async () => {
        try {
            const res = await fetch(`${apiBase()}/api/plans/all`, { headers: { Authorization: `Bearer ${authToken()}` } });
            if (res.ok) setPlans((await res.json()).map((p: any) => ({ ...p, _features: (p.features || []).join('\n') })));
        } catch { /* ignore */ } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const update = (id: string, patch: any) => setPlans(ps => ps.map(p => (p._id === id ? { ...p, ...patch } : p)));

    const save = async (p: any) => {
        setSavingId(p._id); setMsg('');
        const body: any = { ...p, features: (p._features || '').split('\n').map((s: string) => s.trim()).filter(Boolean) };
        delete body._features;
        try {
            const res = await fetch(`${apiBase()}/api/plans/${p._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
                body: JSON.stringify(body),
            });
            if (res.ok) { setMsg(`تم حفظ باقة "${p.name}"`); setTimeout(() => setMsg(''), 2500); }
        } catch { /* ignore */ } finally { setSavingId(''); }
    };

    const addPlan = async () => {
        try {
            const res = await fetch(`${apiBase()}/api/plans`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
                body: JSON.stringify(emptyDraft()),
            });
            if (res.ok) load();
        } catch { /* ignore */ }
    };

    const del = async (p: any) => {
        if (!window.confirm(`حذف الباقة "${p.name}" نهائياً؟`)) return;
        try {
            const res = await fetch(`${apiBase()}/api/plans/${p._id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken()}` } });
            if (res.ok) setPlans(ps => ps.filter(x => x._id !== p._id));
        } catch { /* ignore */ }
    };

    return (
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                    <CreditCard size={20} className="text-emerald-500" /> إدارة باقات الاشتراك
                </h3>
                <button onClick={addPlan} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl transition-all text-sm">
                    <Plus size={16} /> إضافة باقة
                </button>
            </div>

            {msg && <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl mb-4 text-sm font-bold flex items-center gap-2"><CheckCircle size={16} /> {msg}</div>}

            {loading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" /></div>
            ) : plans.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">لا توجد باقات. اضغط "إضافة باقة" لإنشاء أول باقة.</p>
            ) : (
                <div className="space-y-5">
                    {plans.map(p => (
                        <div key={p._id} className={`rounded-2xl border p-5 ${p.popular ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                                <input value={p.name} onChange={e => update(p._id, { name: e.target.value })}
                                    className="flex-1 min-w-[180px] bg-white border border-slate-200 p-2.5 rounded-xl font-bold focus:outline-none focus:border-emerald-500" placeholder="اسم الباقة" />
                                <input value={p.currency} onChange={e => update(p._id, { currency: e.target.value })}
                                    className="w-24 bg-white border border-slate-200 p-2.5 rounded-xl text-center focus:outline-none focus:border-emerald-500" placeholder="العملة" />
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                {NUM_FIELDS.map(f => (
                                    <div key={f.key}>
                                        <label className="block text-[11px] font-medium text-slate-500 mb-1">{f.label}</label>
                                        <input type="number" min="0" value={p[f.key] ?? 0}
                                            onChange={e => update(p._id, { [f.key]: Math.max(0, parseInt(e.target.value) || 0) })}
                                            className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500" />
                                    </div>
                                ))}
                            </div>

                            <div className="mb-4">
                                <label className="block text-[11px] font-medium text-slate-500 mb-1">المميزات (ميزة في كل سطر)</label>
                                <textarea value={p._features} onChange={e => update(p._id, { _features: e.target.value })} rows={3}
                                    className="w-full bg-white border border-slate-200 p-3 rounded-xl text-sm focus:outline-none focus:border-emerald-500 resize-y"
                                    placeholder={'رد آلي بالذكاء الاصطناعي\nتكامل فيسبوك\nدعم أولوية'} />
                            </div>

                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                                        <input type="checkbox" checked={!!p.popular} onChange={e => update(p._id, { popular: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
                                        <Star size={14} className="text-amber-400" /> الأكثر اختياراً
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600">
                                        <input type="checkbox" checked={p.isActive !== false} onChange={e => update(p._id, { isActive: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
                                        مُفعّلة (تظهر للعملاء)
                                    </label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => save(p)} disabled={savingId === p._id}
                                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all disabled:opacity-50">
                                        <Save size={15} /> {savingId === p._id ? 'جاري الحفظ...' : 'حفظ'}
                                    </button>
                                    <button onClick={() => del(p)} className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="حذف الباقة"><Trash2 size={18} /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const Settings = () => {
    const [formData, setFormData] = useState({
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [systemName, setSystemName] = useState('');
    const [initialSystemName, setInitialSystemName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);


    const [settingsLoading, setSettingsLoading] = useState(false);
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = currentUser.role === 'admin';

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                let API_URL = import.meta.env.VITE_API_URL || '';
                if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
                const res = await fetch(`${API_URL}/api/settings`);
                const data = await res.json();
                if (data.systemName) {
                    setSystemName(data.systemName);
                    setInitialSystemName(data.systemName);
                }
            } catch (error) {
                console.error('Failed to fetch settings', error);
            }
        };
        fetchSettings();
    }, []);

    const handleSystemNameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setSuccess('');
        setSettingsLoading(true);

        try {
            let API_URL = import.meta.env.VITE_API_URL || '';
            if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ systemName }),
            });

            if (!response.ok) throw new Error('Failed to update settings');

            setSuccess('تم تحديث اسم النظام بنجاح (يرجى تحديث الصفحة)');
            setInitialSystemName(systemName);
            // Reload to reflect changes globally
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSettingsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setSuccess('');

        if (formData.newPassword !== formData.confirmPassword) {
            setError('كلمة المرور الجديدة غير متطابقة');
            return;
        }

        if (formData.newPassword.length < 6) {
            setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            return;
        }

        setLoading(true);

        try {
            let API_URL = import.meta.env.VITE_API_URL || '';
            if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);

            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/api/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    oldPassword: formData.oldPassword,
                    newPassword: formData.newPassword
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'فشل تغيير كلمة المرور');
            }

            setSuccess('تم تغيير كلمة المرور بنجاح');
            setFormData({ oldPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">إعدادات الحساب</h2>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-2xl">
                <h3 className="text-lg font-bold text-slate-700 mb-6 flex items-center gap-2">
                    <Lock size={20} className="text-emerald-500" />
                    تغيير كلمة المرور
                </h3>

                {error && (
                    <div className="bg-red-50 text-red-500 p-3 rounded-xl mb-6 text-sm font-bold flex items-center gap-2">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}
                {success && (
                    <div className="bg-emerald-50 text-emerald-500 p-3 rounded-xl mb-6 text-sm font-bold flex items-center gap-2">
                        <CheckCircle size={16} /> {success}
                    </div>
                )}



                {/* System Name Settings */}
                <form onSubmit={handleSystemNameSubmit} className="mb-10 pb-10 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-700 mb-6 flex items-center gap-2">
                        <Globe size={20} className="text-emerald-500" />
                        إعدادات النظام
                    </h3>
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-500 mb-1">اسم النظام</label>
                            <input
                                type="text"
                                value={systemName}
                                onChange={(e) => setSystemName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                                placeholder="Gateway WA"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={settingsLoading || systemName === initialSystemName}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 h-[50px]"
                        >
                            {settingsLoading ? '...' : 'حفظ'}
                        </button>
                    </div>
                </form>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">كلمة المرور الحالية</label>
                        <input
                            type="password"
                            value={formData.oldPassword}
                            onChange={(e) => setFormData({ ...formData, oldPassword: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">كلمة المرور الجديدة</label>
                        <input
                            type="password"
                            value={formData.newPassword}
                            onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">تأكيد كلمة المرور الجديدة</label>
                        <input
                            type="password"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                            required
                        />
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50"
                        >
                            {loading ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
                        </button>
                    </div>
                </form>
            </div>

            {isAdmin && <PlansManager />}
        </div>
    );
};

export default Settings;
