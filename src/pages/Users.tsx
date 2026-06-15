import React, { useState, useEffect } from 'react';
import { UserPlus, User, AlertCircle, Trash2, Edit2, Ban, CheckCircle, X, Shield, Search, MessageSquare, Send } from 'lucide-react';

const AVAILABLE_PERMISSIONS = [
    { id: 'devices', label: 'الأجهزة (وكل إعداداتها)' },
    { id: 'campaigns', label: 'إرسال الحملات' },
    { id: 'scheduled_campaigns', label: 'جدولة الحملات' },
];

interface FormShape {
    name: string;
    username: string;
    password: string;
    role: 'admin' | 'user';
    permissions: string[];
    maxSessions: number;
    isActive?: boolean;
}

// Shared role + permissions + limit controls (top-level so inputs keep focus on re-render)
const RoleControls = ({ form, setForm }: { form: FormShape; setForm: (f: FormShape) => void }) => (
    <>
        <div>
            <label className="block text-sm font-medium text-slate-500 mb-2">نوع الحساب</label>
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200 max-w-xs">
                <button type="button" onClick={() => setForm({ ...form, role: 'user' })}
                    className={`flex-1 py-2 text-sm rounded-lg font-bold transition-colors ${form.role === 'user' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500'}`}>
                    مستخدم عادي
                </button>
                <button type="button" onClick={() => setForm({ ...form, role: 'admin' })}
                    className={`flex-1 py-2 text-sm rounded-lg font-bold transition-colors flex items-center justify-center gap-1 ${form.role === 'admin' ? 'bg-purple-500 text-white shadow' : 'text-slate-500'}`}>
                    <Shield size={14} /> أدمن
                </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
                {form.role === 'admin' ? 'الأدمن يرى كل سيشنات النظام ويتحكم فيها بدون قيود.' : 'المستخدم يرى سيشناته فقط، بحد أقصى تحدده أنت.'}
            </p>
        </div>

        {form.role === 'user' && (
            <>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">الحد الأقصى للأجهزة (0 = بلا حد)</label>
                    <input type="number" min="0" value={form.maxSessions}
                        onChange={e => setForm({ ...form, maxSessions: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-40 bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-2">الصلاحيات المصرّح بها</label>
                    <div className="flex gap-3 flex-wrap">
                        {AVAILABLE_PERMISSIONS.map(perm => (
                            <label key={perm.id} className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                                <input type="checkbox" className="w-4 h-4 accent-emerald-500"
                                    checked={form.permissions.includes(perm.id)}
                                    onChange={e => setForm({ ...form, permissions: e.target.checked ? [...form.permissions, perm.id] : form.permissions.filter(p => p !== perm.id) })} />
                                <span className="text-sm">{perm.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </>
        )}
    </>
);

const Users = () => {
    const [users, setUsers] = useState<any[]>([]);

    const [createForm, setCreateForm] = useState<FormShape>({ name: '', username: '', password: '', role: 'user', permissions: [], maxSessions: 0 });
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [editForm, setEditForm] = useState<FormShape>({ name: '', username: '', password: '', role: 'user', isActive: true, permissions: [], maxSessions: 0 });

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');

    const filteredUsers = users.filter(u =>
        (roleFilter === 'all' || u.role === roleFilter) &&
        (!search || (u.name || '').toLowerCase().includes(search.toLowerCase()) || (u.username || '').toLowerCase().includes(search.toLowerCase()))
    );

    useEffect(() => { fetchUsers(); }, []);

    const getApiUrl = () => {
        let url = import.meta.env.VITE_API_URL || 'http://localhost:3050';
        if (url.endsWith('/')) url = url.slice(0, -1);
        return url;
    };

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${getApiUrl()}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setUsers(await res.json());
        } catch (err) { console.error(err); }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setSuccess(''); setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiUrl()}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(createForm),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to create user');
            setSuccess('تم إنشاء المستخدم بنجاح');
            setCreateForm({ name: '', username: '', password: '', role: 'user', permissions: [], maxSessions: 0 });
            fetchUsers();
        } catch (err: any) { setError(err.message); } finally { setLoading(false); }
    };

    const handleEditClick = (user: any) => {
        setEditingUser(user);
        setEditForm({
            name: user.name,
            username: user.username,
            password: '',
            role: user.role || 'user',
            isActive: user.isActive,
            permissions: user.permissions || [],
            maxSessions: user.maxSessions || 0,
        });
        setError(''); setSuccess('');
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiUrl()}/api/users/${editingUser._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(editForm),
            });
            if (!response.ok) throw new Error('Failed to update user');
            setSuccess('تم تحديث بيانات المستخدم');
            setEditingUser(null);
            fetchUsers();
        } catch (err: any) { setError(err.message); } finally { setLoading(false); }
    };

    const handleDeleteUser = async (id: string, name: string) => {
        if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${name}" نهائياً؟`)) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiUrl()}/api/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!response.ok) throw new Error('Failed to delete');
            fetchUsers();
            setSuccess(`تم حذف المستخدم ${name}`);
        } catch (err: any) { setError(err.message); }
    };

    const toggleSuspend = async (user: any) => {
        const action = user.isActive ? 'إيقاف' : 'تفعيل';
        if (!window.confirm(`هل تريد ${action} حساب "${user.name}"؟`)) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiUrl()}/api/users/${user._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...user, isActive: !user.isActive }),
            });
            if (!response.ok) throw new Error('Failed to update status');
            fetchUsers();
        } catch (err: any) { setError(err.message); }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">إدارة المستخدمين</h2>

            {error && <div className="bg-red-50 text-red-500 p-3 rounded-xl flex items-center gap-2"><AlertCircle size={16} /> {error}</div>}
            {success && <div className="bg-emerald-50 text-emerald-500 p-3 rounded-xl flex items-center gap-2"><CheckCircle size={16} /> {success}</div>}

            {/* Create */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2"><UserPlus size={20} className="text-emerald-500" /> إضافة مستخدم جديد</h3>
                <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input type="text" placeholder="الاسم" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} className="bg-slate-50 border border-slate-200 p-3 rounded-xl" required />
                        <input type="text" placeholder="اسم المستخدم" value={createForm.username} onChange={e => setCreateForm({ ...createForm, username: e.target.value })} className="bg-slate-50 border border-slate-200 p-3 rounded-xl" required />
                        <input type="password" placeholder="كلمة المرور" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} className="bg-slate-50 border border-slate-200 p-3 rounded-xl" required />
                    </div>
                    <RoleControls form={createForm} setForm={setCreateForm} />
                    <div className="flex justify-end">
                        <button type="submit" disabled={loading} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50">
                            {loading ? 'جاري الإضافة...' : 'إضافة المستخدم'}
                        </button>
                    </div>
                </form>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                    <div className="relative flex-1 max-w-xs">
                        <Search size={16} className="absolute right-3 top-3 text-slate-400" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو اسم المستخدم..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div className="inline-flex bg-slate-50 border border-slate-200 rounded-xl p-1">
                        {(['all', 'admin', 'user'] as const).map(r => (
                            <button key={r} onClick={() => setRoleFilter(r)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${roleFilter === r ? 'bg-emerald-500 text-white' : 'text-slate-500'}`}>
                                {r === 'all' ? 'الكل' : r === 'admin' ? 'أدمن' : 'مستخدم'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-slate-50 text-slate-500 text-sm">
                            <tr>
                                <th className="p-4">الاسم</th>
                                <th className="p-4">اسم المستخدم</th>
                                <th className="p-4">الحالة</th>
                                <th className="p-4">النوع</th>
                                <th className="p-4">حد الأجهزة</th>
                                <th className="p-4">المحادثات</th>
                                <th className="p-4">الرسائل</th>
                                <th className="p-4">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-700">
                            {filteredUsers.map((user) => (
                                <tr key={user._id} className="border-t border-slate-50 hover:bg-slate-50/50">
                                    <td className="p-4 font-bold flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><User size={16} /></div>
                                        {user.name}
                                    </td>
                                    <td className="p-4">{user.username}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{user.isActive ? 'نشط' : 'موقوف'}</span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-600'}`}>{user.role === 'admin' ? 'أدمن' : 'مستخدم'}</span>
                                    </td>
                                    <td className="p-4 text-sm">{user.role === 'admin' ? '∞' : (user.maxSessions ? user.maxSessions : 'بلا حد')}</td>
                                    <td className="p-4">
                                        <span className="inline-flex items-center gap-1 text-sm text-slate-600"><MessageSquare size={14} className="text-emerald-500" /> {user.conversationCount ?? 0}</span>
                                    </td>
                                    <td className="p-4">
                                        <span className="inline-flex items-center gap-1 text-sm text-slate-600"><Send size={14} className="text-blue-500" /> {user.messageCount ?? 0}</span>
                                    </td>
                                    <td className="p-4 flex gap-2">
                                        <button onClick={() => handleEditClick(user)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="تعديل"><Edit2 size={18} /></button>
                                        <button onClick={() => toggleSuspend(user)} className={`p-2 rounded-lg ${user.isActive ? 'text-amber-500 hover:bg-amber-50' : 'text-green-500 hover:bg-green-50'}`} title={user.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}>{user.isActive ? <Ban size={18} /> : <CheckCircle size={18} />}</button>
                                        <button onClick={() => handleDeleteUser(user._id, user.name)} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="حذف"><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                            {filteredUsers.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-400">لا يوجد مستخدمين مطابقين</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" dir="rtl">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold">تعديل المستخدم</h3>
                            <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600"><X /></button>
                        </div>
                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1">الاسم</label>
                                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-xl" required />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">اسم المستخدم</label>
                                <input type="text" value={editForm.username} onChange={e => setEditForm({ ...editForm, username: e.target.value })} className="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-xl" required />
                            </div>
                            <div>
                                <label className="block text-sm mb-1">كلمة المرور الجديدة (اختياري)</label>
                                <input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} className="w-full border border-slate-200 bg-slate-50 p-2.5 rounded-xl" placeholder="اتركها فارغة للإبقاء على القديمة" />
                            </div>

                            <RoleControls form={editForm} setForm={setEditForm} />

                            <div className="flex items-center gap-2 mt-2">
                                <input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })} className="w-5 h-5 accent-emerald-500" />
                                <label>حساب نشط</label>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button type="submit" className="flex-1 bg-emerald-500 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-600">حفظ التغييرات</button>
                                <button type="button" onClick={() => setEditingUser(null)} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-xl font-bold hover:bg-slate-200">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Users;
