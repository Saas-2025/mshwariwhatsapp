import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Users, FileSpreadsheet, FileDown, X, Search, CheckSquare, Square } from 'lucide-react';
import { catColor, Category } from '../lib/categories';

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Recipient { remoteJid: string; number: string; name: string; categoryId: string; }

// Toolbar that adds recipients to a campaign from: existing conversations, a whole category,
// an imported Excel sheet, plus a downloadable sample. onAdd receives raw number strings.
const RecipientTools: React.FC<{ sessionId: string; onAdd: (numbers: string[]) => void }> = ({ sessionId, onAdd }) => {
    const [open, setOpen] = useState(false);
    const [recips, setRecips] = useState<Recipient[]>([]);
    const [cats, setCats] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);
    const [sel, setSel] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('');

    const openModal = async () => {
        if (!sessionId) { alert('اختر الجهاز المرسل أولاً'); return; }
        setOpen(true); setLoading(true); setSel(new Set()); setSearch(''); setCatFilter('');
        try {
            const [rRes, cRes] = await Promise.all([
                fetch(`${baseUrl()}/api/sessions/${sessionId}/recipients`, { headers: authH() }),
                fetch(`${baseUrl()}/api/sessions/${sessionId}/categories`, { headers: authH() }),
            ]);
            if (rRes.ok) setRecips(await rRes.json());
            if (cRes.ok) setCats(await cRes.json());
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    const catById = (id?: string) => cats.find(c => c._id === id);
    const filtered = recips.filter(r =>
        (!catFilter || r.categoryId === catFilter) &&
        (!search || (r.name || '').toLowerCase().includes(search.toLowerCase()) || r.number.includes(search)));
    const allSelected = filtered.length > 0 && filtered.every(r => sel.has(r.number));

    const toggle = (n: string) => setSel(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });
    const toggleAll = () => setSel(prev => {
        const s = new Set(prev);
        if (allSelected) filtered.forEach(r => s.delete(r.number)); else filtered.forEach(r => s.add(r.number));
        return s;
    });

    const addSelected = () => { if (sel.size) onAdd([...sel]); setOpen(false); };

    const onExcel = async (file: File) => {
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
            const nums: string[] = [];
            rows.forEach(r => (Array.isArray(r) ? r : []).forEach(cell => {
                const s = String(cell ?? '').replace(/\D/g, '');
                if (s.length >= 8) nums.push(s);
            }));
            const uniq = [...new Set(nums)];
            if (uniq.length) { onAdd(uniq); alert(`تم استيراد ${uniq.length} رقم من الملف`); }
            else alert('لم يتم العثور على أرقام صالحة في الملف');
        } catch { alert('تعذّر قراءة الملف. تأكد أنه ملف Excel صحيح.'); }
    };

    const downloadSample = () => {
        const data = [['الرقم', 'الاسم (اختياري)'], ['201001234567', 'أحمد'], ['966501234567', 'سارة'], ['201112223334', 'محمد']];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'الأرقام');
        XLSX.writeFile(wb, 'sample-numbers.xlsx');
    };

    return (
        <>
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={openModal}
                    className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                    <Users size={14} /> من المحادثات / الفئات
                </button>
                <label className="flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer transition-colors">
                    <FileSpreadsheet size={14} /> استيراد Excel
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { if (e.target.files?.[0]) onExcel(e.target.files[0]); e.target.value = ''; }} />
                </label>
                <button type="button" onClick={downloadSample}
                    className="flex items-center gap-1.5 bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 text-xs font-bold px-3 py-2 rounded-xl transition-colors">
                    <FileDown size={14} /> نموذج Excel
                </button>
            </div>

            {open && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" dir="rtl" onClick={() => setOpen(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2"><Users size={18} className="text-emerald-500" /> اختيار الأرقام من العملاء</h3>
                            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
                        </div>

                        <div className="p-3 border-b border-slate-100 space-y-2">
                            <div className="relative">
                                <Search size={15} className="absolute right-3 top-2.5 text-slate-400" />
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-9 pl-3 text-sm focus:outline-none focus:border-emerald-500" />
                            </div>
                            <div className="flex items-center gap-2">
                                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-600 focus:outline-none focus:border-emerald-500">
                                    <option value="">كل الفئات</option>
                                    {cats.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                </select>
                                <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl whitespace-nowrap">
                                    {allSelected ? <CheckSquare size={14} /> : <Square size={14} />} تحديد {catFilter ? 'الفئة' : 'الكل'}
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {loading ? (
                                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" /></div>
                            ) : filtered.length === 0 ? (
                                <p className="text-center text-slate-400 py-12 text-sm">{recips.length === 0 ? 'لا توجد محادثات سابقة لهذا الجهاز.' : 'لا توجد نتائج مطابقة.'}</p>
                            ) : filtered.map(r => {
                                const cat = catById(r.categoryId);
                                const checked = sel.has(r.number);
                                return (
                                    <button key={r.remoteJid} onClick={() => toggle(r.number)}
                                        className={`w-full flex items-center gap-3 p-3 border-b border-slate-50 text-right hover:bg-slate-50 transition-colors ${checked ? 'bg-emerald-50/60' : ''}`}>
                                        {checked ? <CheckSquare size={18} className="text-emerald-500 shrink-0" /> : <Square size={18} className="text-slate-300 shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                {cat && <span className={`w-2 h-2 rounded-full shrink-0 ${catColor(cat.color).dot}`} />}
                                                <span className="font-bold text-slate-700 text-sm truncate">{r.name || r.number}</span>
                                                {cat && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${catColor(cat.color).chip}`}>{cat.name}</span>}
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-mono" dir="ltr">{r.number}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-500">المحدد: <b className="text-emerald-600">{sel.size}</b></span>
                            <button onClick={addSelected} disabled={!sel.size}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm disabled:opacity-50">
                                إضافة المحدد ({sel.size})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default RecipientTools;
