import React, { useState, useEffect } from 'react';
import { Facebook, Power, Save, AlertCircle, CheckCircle, Copy, Check, MessageCircle, MessagesSquare, ChevronDown, Link2, KeyRound } from 'lucide-react';

interface FbConfig {
  pageId: string;
  pageName: string;
  verifyToken: string;
  hasToken: boolean;
  tokenHint: string;
  replyToMessages: boolean;
  replyToComments: boolean;
  isActive: boolean;
}

const apiBase = () => (import.meta.env.VITE_API_URL?.replace(/\/$/, '') || `${window.location.protocol}//${window.location.hostname}:3050`);
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const FacebookPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [cfg, setCfg] = useState<FbConfig>({ pageId: '', pageName: '', verifyToken: '', hasToken: false, tokenHint: '', replyToMessages: true, replyToComments: true, isActive: false });
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [copied, setCopied] = useState<string>('');

  const webhookUrl = `${apiBase()}/api/facebook/webhook`;

  const flash = (type: 'success' | 'error', text: string) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 5000); };
  const copy = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1800); };

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/sessions/${sessionId}/facebook`, { headers: authHeaders() });
        const data = res.ok ? await res.json() : null;
        if (data) setCfg({ ...data });
        else setCfg(c => ({ ...c, verifyToken: 'vt_' + Math.random().toString(36).slice(2, 10) }));
      } catch {
        setCfg(c => ({ ...c, verifyToken: 'vt_' + Math.random().toString(36).slice(2, 10) }));
      } finally { setLoading(false); }
    })();
  }, [sessionId]);

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const body: any = { ...cfg, sessionId };
      if (tokenInput.trim()) body.pageAccessToken = tokenInput.trim();
      const res = await fetch(`${apiBase()}/api/sessions/${sessionId}/facebook`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      if (res.ok) {
        flash('success', '✅ تم حفظ إعدادات صفحة فيسبوك');
        setTokenInput('');
        // refresh to get masked token state
        const r = await fetch(`${apiBase()}/api/sessions/${sessionId}/facebook`, { headers: authHeaders() });
        if (r.ok) { const d = await r.json(); if (d) setCfg(d); }
      } else { flash('error', `❌ ${(await res.json().catch(() => ({}))).error || 'فشل الحفظ'}`); }
    } catch (e: any) { flash('error', `❌ خطأ في الشبكة: ${e.message}`); } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

  const CopyField = ({ label, value, k, icon }: { label: string; value: string; k: string; icon: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">{icon}{label}</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-white p-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 break-all" dir="ltr">{value}</code>
        <button type="button" onClick={() => copy(value, k)} className="p-3 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-500 transition-colors shrink-0">
          {copied === k ? <Check size={18} /> : <Copy size={18} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Activate */}
      <div className={`flex items-center justify-between rounded-xl p-4 border ${cfg.isActive ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.isActive ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}><Facebook size={20} /></div>
          <div>
            <p className="font-bold text-slate-700">تفعيل الرد على فيسبوك</p>
            <p className="text-xs text-slate-400">{cfg.isActive ? 'مفعّل — يرد على رسائل وتعليقات الصفحة بنفس الذكاء الاصطناعي' : 'معطّل'}</p>
          </div>
        </div>
        <button onClick={() => setCfg({ ...cfg, isActive: !cfg.isActive })} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${cfg.isActive ? 'bg-blue-600' : 'bg-slate-300'}`}>
          <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${cfg.isActive ? 'translate-x-1' : 'translate-x-6'}`} />
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-sm font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}{message.text}
        </div>
      )}

      <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 flex items-start gap-2">
        <MessageCircle size={15} className="shrink-0 mt-0.5" />
        يرد بنفس إعدادات وقواعد معرفة <b>الذكاء الاصطناعي</b> الخاصة بهذا الجهاز (تبويب «الذكاء الاصطناعي»). تأكد أن البوت مفعّل و<code className="bg-white px-1 rounded">GROQ_API_KEY</code> مضبوط.
      </div>

      {/* Reply toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={() => setCfg({ ...cfg, replyToMessages: !cfg.replyToMessages })}
          className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${cfg.replyToMessages ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 text-slate-700"><MessagesSquare size={18} className={cfg.replyToMessages ? 'text-emerald-500' : 'text-slate-400'} /> <span className="font-bold text-sm">الرد على الرسائل (Messenger)</span></div>
          <div className={`relative inline-flex h-5 w-9 items-center rounded-full ${cfg.replyToMessages ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${cfg.replyToMessages ? 'translate-x-0.5' : 'translate-x-4'}`} /></div>
        </button>
        <button onClick={() => setCfg({ ...cfg, replyToComments: !cfg.replyToComments })}
          className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${cfg.replyToComments ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 text-slate-700"><MessageCircle size={18} className={cfg.replyToComments ? 'text-emerald-500' : 'text-slate-400'} /> <span className="font-bold text-sm">الرد على التعليقات</span></div>
          <div className={`relative inline-flex h-5 w-9 items-center rounded-full ${cfg.replyToComments ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${cfg.replyToComments ? 'translate-x-0.5' : 'translate-x-4'}`} /></div>
        </button>
      </div>

      {/* Connection */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Link2 size={16} className="text-blue-600" /> بيانات ربط الصفحة</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">معرّف الصفحة (Page ID)</label>
            <input value={cfg.pageId} onChange={e => setCfg({ ...cfg, pageId: e.target.value })} dir="ltr"
              className="w-full bg-white border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-sm" placeholder="1234567890" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">اسم الصفحة (اختياري)</label>
            <input value={cfg.pageName} onChange={e => setCfg({ ...cfg, pageName: e.target.value })}
              className="w-full bg-white border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-blue-500 text-sm" placeholder="متجري" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1.5"><KeyRound size={13} /> Page Access Token</label>
          <input type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} dir="ltr"
            className="w-full bg-white border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-sm"
            placeholder={cfg.hasToken ? `محفوظ (${cfg.tokenHint}) — اتركه فارغاً للإبقاء عليه` : 'الصق التوكن هنا'} />
          <p className="text-[11px] text-amber-600 mt-1">سرّي — لا تشاركه مع أحد. يُخزَّن على الخادم فقط.</p>
        </div>

        <CopyField label="رابط الـ Webhook (ضعه في Meta)" value={webhookUrl} k="url" icon={<Link2 size={13} />} />
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">Verify Token (نفس القيمة في Meta)</label>
          <div className="flex items-center gap-2">
            <input value={cfg.verifyToken} onChange={e => setCfg({ ...cfg, verifyToken: e.target.value })} dir="ltr"
              className="flex-1 bg-white border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-blue-500 font-mono text-sm" />
            <button type="button" onClick={() => copy(cfg.verifyToken, 'vt')} className="p-3 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-500 shrink-0">{copied === 'vt' ? <Check size={18} /> : <Copy size={18} />}</button>
          </div>
        </div>
      </div>

      {/* Setup steps */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button onClick={() => setShowSteps(s => !s)} className="w-full flex items-center justify-between p-4 text-sm font-bold text-slate-700">
          <span className="flex items-center gap-2"><Facebook size={16} className="text-blue-600" /> خطوات الربط مع Meta</span>
          <ChevronDown size={18} className={`transition-transform ${showSteps ? 'rotate-180' : ''}`} />
        </button>
        {showSteps && (
          <div className="px-5 pb-4 text-sm text-slate-600 space-y-2 leading-relaxed">
            <p>1. أنشئ تطبيقاً على <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">developers.facebook.com</a> (نوع Business) وأضف منتج <b>Messenger</b> و<b>Webhooks</b>.</p>
            <p>2. من Messenger ← Generate Token: اربط صفحتك واحصل على <b>Page Access Token</b> والصقه بالأعلى.</p>
            <p>3. في إعداد الـ Webhook: ضع <b>Callback URL</b> = الرابط بالأعلى، و<b>Verify Token</b> = القيمة بالأعلى، ثم Verify and Save.</p>
            <p>4. اشترك (Subscribe) في حقول: <code className="bg-slate-100 px-1 rounded">messages</code> للرسائل و<code className="bg-slate-100 px-1 rounded">feed</code> للتعليقات.</p>
            <p>5. فعّل التوجل بالأعلى واحفظ. الصلاحيات المطلوبة: <code className="bg-slate-100 px-1 rounded">pages_messaging</code> و<code className="bg-slate-100 px-1 rounded">pages_manage_engagement</code> و<code className="bg-slate-100 px-1 rounded">pages_read_engagement</code>.</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50">
          <Save size={18} />{saving ? 'جاري الحفظ...' : 'حفظ إعدادات فيسبوك'}
        </button>
      </div>
    </div>
  );
};

export default FacebookPanel;
