import React, { useState, useEffect } from 'react';
import { Tags, Plus, Trash2, Save, X } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_COLOR_KEYS, catColor, Category } from '../lib/categories';

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const jsonH = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const ColorDots: React.FC<{ value: string; onChange: (c: string) => void }> = ({ value, onChange }) => (
    <div className="flex items-center gap-1.5">
        {CATEGORY_COLOR_KEYS.map(k => (
            <button key={k} type="button" onClick={() => onChange(k)}
                className={`w-6 h-6 rounded-full ${CATEGORY_COLORS[k].solid} transition-transform ${value === k ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-110'}`} title={k} />
        ))}
    </div>
);

const CategoriesPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
    const [cats, setCats] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('emerald');
    const [editId, setEditId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('emerald');

    const load = async () => {
        try {
            const res = await fetch(`${baseUrl()}/api/sessions/${sessionId}/categories`, { headers: authH() });
            if (res.ok) setCats(await res.json());
        } catch { /* ignore */ } finally { setLoading(false); }
    };
    useEffect(() => { load(); }, [sessionId]);

    const add = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        const res = await fetch(`${baseUrl()}/api/sessions/${sessionId}/categories`, {
            method: 'POST', headers: jsonH(), body: JSON.stringify({ name: newName.trim(), color: newColor, order: cats.length + 1 })
        });
        if (res.ok) { setNewName(''); setNewColor('emerald'); load(); }
    };

    const startEdit = (c: Category) => { setEditId(c._id); setEditName(c.name); setEditColor(c.color || 'emerald'); };

    const saveEdit = async () => {
        if (!editId) return;
        const res = await fetch(`${baseUrl()}/api/sessions/${sessionId}/categories/${editId}`, {
            method: 'PUT', headers: jsonH(), body: JSON.stringify({ name: editName.trim(), color: editColor })
        });
        if (res.ok) { setEditId(null); load(); }
    };

    const del = async (c: Category) => {
        if (!confirm(`حذف الفئة "${c.name}"؟ سيتم إزالتها من العملاء المصنّفين بها.`)) return;
        const res = await fetch(`${baseUrl()}/api/sessions/${sessionId}/categories/${c._id}`, { method: 'DELETE', headers: authH() });
        if (res.ok) setCats(prev => prev.filter(x => x._id !== c._id));
    };

    return (
        <div className="max-w-2xl">
            <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2"><Tags size={20} className="text-emerald-500" /> فئات العملاء</h3>
                <p className="text-sm text-slate-500 mt-1">صنّف عملاءك (مثلاً: VIP، جملة، متابعة) ثم استهدف كل فئة في الحملات والجدولة.</p>
            </div>

            {/* Add */}
            <form onSubmit={add} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5 space-y-3">
                <div className="flex gap-2">
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="اسم الفئة الجديدة..."
                        className="flex-1 bg-white border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500" />
                    <button type="submit" disabled={!newName.trim()} className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 rounded-xl text-sm disabled:opacity-50"><Plus size={16} /> إضافة</button>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">اللون:</span>
                    <ColorDots value={newColor} onChange={setNewColor} />
                </div>
            </form>

            {/* List */}
            {loading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" /></div>
            ) : cats.length === 0 ? (
                <p className="text-center text-slate-400 py-10 text-sm">لا توجد فئات بعد. أضف أول فئة من الأعلى.</p>
            ) : (
                <div className="space-y-2">
                    {cats.map(c => (
                        <div key={c._id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                            {editId === c._id ? (
                                <>
                                    <input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 p-2 rounded-lg text-sm focus:outline-none focus:border-emerald-500" />
                                    <ColorDots value={editColor} onChange={setEditColor} />
                                    <button onClick={saveEdit} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="حفظ"><Save size={18} /></button>
                                    <button onClick={() => setEditId(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg" title="إلغاء"><X size={18} /></button>
                                </>
                            ) : (
                                <>
                                    <span className={`w-3.5 h-3.5 rounded-full ${catColor(c.color).dot}`} />
                                    <span className="flex-1 font-bold text-slate-700">{c.name}</span>
                                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${catColor(c.color).chip}`}>{c.name}</span>
                                    <button onClick={() => startEdit(c)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="تعديل"><Tags size={16} /></button>
                                    <button onClick={() => del(c)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="حذف"><Trash2 size={16} /></button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CategoriesPanel;
