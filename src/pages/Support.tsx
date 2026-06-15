import React, { useState, useEffect, useRef } from 'react';
import { LifeBuoy, Plus, Paperclip, Send, X, CheckCircle, AlertCircle, MessageSquare, Lock, Crown, RefreshCw, ShieldCheck, ShieldAlert, ArrowRight } from 'lucide-react';

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const token = () => localStorage.getItem('token');

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.readAsDataURL(file); });

const fmtTime = (at: number) => {
  const d = new Date(at * 1000);
  return `${d.toLocaleDateString('ar-EG')} ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;
};

const statusInfo = (s: string) =>
  s === 'open' ? { t: 'مفتوحة', c: 'bg-amber-100 text-amber-700' }
    : s === 'answered' ? { t: 'تم الرد', c: 'bg-blue-100 text-blue-700' }
      : { t: 'مغلقة', c: 'bg-slate-200 text-slate-600' };

const MAX_FILE = 8 * 1024 * 1024; // 8MB

const Support = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'admin';

  const [tickets, setTickets] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [mode, setMode] = useState<'none' | 'new'>('none');
  const [filter, setFilter] = useState<'all' | 'open' | 'answered' | 'closed'>('all');
  const [loadingList, setLoadingList] = useState(true);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const [newForm, setNewForm] = useState({ subject: '', message: '' });
  const [newFile, setNewFile] = useState<File | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const fetchTickets = async () => {
    try {
      const res = await fetch(`${baseUrl()}/api/support/tickets`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) setTickets(await res.json());
    } catch { /* ignore */ } finally { setLoadingList(false); }
  };
  useEffect(() => { fetchTickets(); }, []);
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [active]);

  const openTicket = async (id: string) => {
    setMode('none'); setErr(''); setOk('');
    try {
      const res = await fetch(`${baseUrl()}/api/support/tickets/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (res.ok) setActive(await res.json());
    } catch { /* ignore */ }
  };

  const pickFile = (f: File | null, setter: (f: File | null) => void) => {
    if (f && f.size > MAX_FILE) { setErr('حجم المرفق يجب ألا يتجاوز 8 ميجابايت'); return; }
    setErr(''); setter(f);
  };

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setOk(''); setSending(true);
    try {
      const body: any = { subject: newForm.subject, message: newForm.message };
      if (newFile) { body.fileName = newFile.name; body.fileType = newFile.type; body.fileData = await fileToBase64(newFile); }
      const res = await fetch(`${baseUrl()}/api/support/tickets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذّر إنشاء التذكرة');
      setOk('تم إرسال تذكرتك للدعم الفني');
      setNewForm({ subject: '', message: '' }); setNewFile(null);
      await fetchTickets();
      openTicket(data._id);
    } catch (e: any) { setErr(e.message); } finally { setSending(false); }
  };

  const sendReply = async () => {
    if (!active || (!replyText.trim() && !replyFile)) return;
    setSending(true); setErr('');
    try {
      const body: any = { text: replyText };
      if (replyFile) { body.fileName = replyFile.name; body.fileType = replyFile.type; body.fileData = await fileToBase64(replyFile); }
      const res = await fetch(`${baseUrl()}/api/support/tickets/${active._id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'تعذّر الإرسال'); }
      setReplyText(''); setReplyFile(null);
      await openTicket(active._id);
      fetchTickets();
    } catch (e: any) { setErr(e.message); } finally { setSending(false); }
  };

  const closeTicket = async (reopen = false) => {
    if (!active) return;
    if (!reopen && !window.confirm('هل تريد إغلاق هذه التذكرة؟')) return;
    try {
      const res = await fetch(`${baseUrl()}/api/support/tickets/${active._id}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ reopen }),
      });
      if (res.ok) { await openTicket(active._id); fetchTickets(); }
    } catch { /* ignore */ }
  };

  const openAttachment = async (ticketId: string, idx: number) => {
    try {
      const res = await fetch(`${baseUrl()}/api/support/tickets/${ticketId}/messages/${idx}/attachment`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { /* ignore */ }
  };

  const shownTickets = isAdmin && filter !== 'all' ? tickets.filter(t => t.status === filter) : tickets;

  const FileChip = ({ file, onClear }: { file: File; onClear: () => void }) => (
    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg px-2.5 py-1.5 w-fit">
      <Paperclip size={13} /> <span className="max-w-[180px] truncate">{file.name}</span>
      <button type="button" onClick={onClear} className="text-emerald-500 hover:text-red-500"><X size={13} /></button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><LifeBuoy size={24} className="text-emerald-500" /> الدعم الفني</h2>
          <p className="text-slate-500 text-sm">{isAdmin ? 'كل تذاكر الدعم الواردة من المستخدمين' : 'افتح تذكرة وتواصل مع فريق الدعم مباشرة'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoadingList(true); fetchTickets(); }} className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl" title="تحديث"><RefreshCw size={18} /></button>
          {!isAdmin && (
            <button onClick={() => { setMode('new'); setActive(null); setErr(''); setOk(''); }}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl transition-all text-sm">
              <Plus size={16} /> تذكرة جديدة
            </button>
          )}
        </div>
      </div>

      {err && <div className="bg-red-50 text-red-500 p-3 rounded-xl text-sm font-bold flex items-center gap-2"><AlertCircle size={16} /> {err}</div>}
      {ok && <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl text-sm font-bold flex items-center gap-2"><CheckCircle size={16} /> {ok}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ===== Tickets list ===== */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {isAdmin && (
            <div className="p-2 border-b border-slate-100 flex gap-1">
              {(['all', 'open', 'answered', 'closed'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter === f ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {f === 'all' ? 'الكل' : statusInfo(f).t}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto max-h-[70vh] custom-scrollbar">
            {loadingList ? (
              <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" /></div>
            ) : shownTickets.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-12">لا توجد تذاكر.</p>
            ) : shownTickets.map(t => {
              const si = statusInfo(t.status);
              return (
                <button key={t._id} onClick={() => openTicket(t._id)}
                  className={`w-full text-right p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors ${active?._id === t._id ? 'bg-emerald-50/60' : ''}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-slate-800 text-sm truncate">{t.subject}</span>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${si.c}`}>{si.t}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2 flex-wrap text-[11px] mb-1">
                      <span className="text-slate-600 font-medium">{t.userName}</span>
                      {t.userActive ? <span className="text-emerald-600">● نشط</span> : <span className="text-red-500">● موقوف</span>}
                      <span className={`px-1.5 py-0.5 rounded ${t.subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{t.subscribed ? t.planName : 'غير مشترك'}</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 truncate">{t.lastFrom === 'admin' ? 'الدعم: ' : ''}{t.lastPreview || '—'}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== Detail / new ticket ===== */}
        <div className="lg:col-span-2">
          {mode === 'new' ? (
            <form onSubmit={submitNew} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2"><MessageSquare size={18} className="text-emerald-500" /> تذكرة دعم جديدة</h3>
              <div>
                <label className="block text-sm font-medium text-slate-500 mb-1">الموضوع</label>
                <input value={newForm.subject} onChange={e => setNewForm({ ...newForm, subject: e.target.value })} required
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="مثال: مشكلة في ربط الجهاز" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500 mb-1">تفاصيل المشكلة</label>
                <textarea value={newForm.message} onChange={e => setNewForm({ ...newForm, message: e.target.value })} rows={6} required
                  className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500 resize-y" placeholder="اشرح المشكلة بالتفصيل..." />
              </div>
              {newFile && <FileChip file={newFile} onClear={() => setNewFile(null)} />}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-emerald-600">
                  <Paperclip size={18} /> إرفاق ملف
                  <input type="file" className="hidden" onChange={e => pickFile(e.target.files?.[0] || null, setNewFile)} />
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMode('none')} className="px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm">إلغاء</button>
                  <button type="submit" disabled={sending} className="px-5 py-2.5 rounded-xl font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-sm flex items-center gap-2">
                    <Send size={15} /> {sending ? 'جاري الإرسال...' : 'إرسال'}
                  </button>
                </div>
              </div>
            </form>
          ) : active ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[70vh]">
              {/* Header */}
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <button onClick={() => setActive(null)} className="lg:hidden text-slate-400"><ArrowRight size={18} /></button>
                      <h3 className="font-bold text-slate-800 truncate">{active.subject}</h3>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo(active.status).c}`}>{statusInfo(active.status).t}</span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                        <span className="font-bold text-slate-700">{active.userName}</span>
                        <span className="text-slate-400">({active.username})</span>
                        {active.userActive
                          ? <span className="flex items-center gap-1 text-emerald-600"><ShieldCheck size={13} /> حساب نشط</span>
                          : <span className="flex items-center gap-1 text-red-500"><ShieldAlert size={13} /> موقوف</span>}
                        <span className={`px-2 py-0.5 rounded-full font-bold ${active.subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {active.subscribed ? `مشترك: ${active.planName}` : 'غير مشترك'}
                        </span>
                      </div>
                    )}
                  </div>
                  {active.status !== 'closed'
                    ? <button onClick={() => closeTicket(false)} className="shrink-0 flex items-center gap-1 text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl"><Lock size={14} /> إغلاق</button>
                    : <button onClick={() => closeTicket(true)} className="shrink-0 text-xs font-bold text-emerald-600 hover:bg-emerald-50 px-3 py-2 rounded-xl">إعادة فتح</button>}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40 custom-scrollbar">
                {(active.messages || []).map((m: any) => {
                  const mine = isAdmin ? m.from === 'admin' : m.from === 'user';
                  return (
                    <div key={m.idx} className={`max-w-[80%] ${mine ? 'self-end ms-auto' : 'me-auto'} w-fit`}>
                      <div className={`rounded-2xl p-3 ${mine ? 'bg-emerald-500 text-white rounded-tl-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-tr-sm'}`}>
                        <div className={`text-[10px] font-bold mb-1 ${mine ? 'text-emerald-100' : 'text-slate-400'}`}>{m.from === 'admin' ? 'الدعم الفني' : (isAdmin ? active.userName : 'أنت')}</div>
                        {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                        {m.hasAttachment && (
                          <button onClick={() => openAttachment(active._id, m.idx)}
                            className={`flex items-center gap-2 mt-2 text-xs font-bold px-2.5 py-1.5 rounded-lg ${mine ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                            <Paperclip size={13} /> <span className="max-w-[160px] truncate">{m.fileName || 'مرفق'}</span>
                          </button>
                        )}
                        <div className={`text-[10px] mt-1 ${mine ? 'text-emerald-100/80' : 'text-slate-400'}`}>{fmtTime(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={msgEndRef} />
              </div>

              {/* Reply box */}
              {active.status === 'closed' ? (
                <div className="p-4 border-t border-slate-100 text-center text-sm text-slate-400 flex items-center justify-center gap-2"><Lock size={14} /> هذه التذكرة مغلقة</div>
              ) : (
                <div className="p-3 border-t border-slate-100 space-y-2">
                  {replyFile && <FileChip file={replyFile} onClear={() => setReplyFile(null)} />}
                  <div className="flex items-end gap-2">
                    <label className="p-2.5 text-slate-400 hover:text-emerald-600 cursor-pointer" title="إرفاق ملف">
                      <Paperclip size={20} />
                      <input type="file" className="hidden" onChange={e => pickFile(e.target.files?.[0] || null, setReplyFile)} />
                    </label>
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={1}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-emerald-500 resize-none max-h-32"
                      placeholder="اكتب ردك..." />
                    <button onClick={sendReply} disabled={sending || (!replyText.trim() && !replyFile)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white p-3 rounded-xl disabled:opacity-50"><Send size={18} /></button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 h-[70vh] flex flex-col items-center justify-center text-slate-400 gap-3">
              <LifeBuoy size={40} className="text-slate-300" />
              <p className="text-sm">{isAdmin ? 'اختر تذكرة لعرض تفاصيلها والرد عليها' : 'اختر تذكرة أو افتح تذكرة جديدة للتواصل مع الدعم'}</p>
              {!isAdmin && <button onClick={() => setMode('new')} className="text-emerald-600 font-bold text-sm flex items-center gap-1"><Plus size={16} /> تذكرة جديدة</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Support;
