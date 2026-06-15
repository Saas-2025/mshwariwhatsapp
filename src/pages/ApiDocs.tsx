import React, { useState, useEffect } from 'react';
import { Logo } from '../components/Logo';
import { CONTACTS } from '../lib/region';
import { Copy, Check, KeyRound, RefreshCw, Download, FileText, Server, ShieldCheck, AlertTriangle, MessageCircle, Eye, EyeOff, Plug, BookOpen } from 'lucide-react';

const apiBase = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const token = () => localStorage.getItem('token');
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

const CodeBlock: React.FC<{ code: string; onCopy: () => void; copied: boolean }> = ({ code, onCopy, copied }) => (
  <div className="relative group">
    <pre dir="ltr" className="bg-slate-900 text-emerald-200 text-xs md:text-sm rounded-xl p-4 pr-12 overflow-x-auto custom-scrollbar leading-relaxed whitespace-pre-wrap break-words font-mono">{code}</pre>
    <button onClick={onCopy} className="absolute top-2.5 left-2.5 text-slate-400 hover:text-white bg-slate-800/80 p-1.5 rounded-lg transition-colors">
      {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
    </button>
  </div>
);

const ApiDocs = () => {
  const BASE = apiBase();
  const [apiKey, setApiKey] = useState('');
  const [loadingKey, setLoadingKey] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/account/api-key`, { headers: authHeaders() });
        if (res.ok) setApiKey((await res.json()).apiKey || '');
      } catch { /* ignore */ } finally { setLoadingKey(false); }
    })();
  }, []);

  const generateKey = async () => {
    if (apiKey && !window.confirm('توليد مفتاح جديد سيوقف المفتاح الحالي فوراً في أي تطبيق يستخدمه. متابعة؟')) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/account/api-key/regenerate`, { method: 'POST', headers: authHeaders() });
      if (res.ok) { setApiKey((await res.json()).apiKey); setReveal(true); }
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  const copy = (text: string, id: string) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1800); };

  const KEY = apiKey || 'YOUR_API_KEY';
  const maskedKey = apiKey ? apiKey.slice(0, 7) + '•'.repeat(20) + apiKey.slice(-4) : '';

  const endpoints = [
    {
      method: 'GET', path: '/api/sessions', title: 'عرض الأجهزة (الجلسات)',
      desc: 'إرجاع كل الأجهزة المرتبطة بحسابك وحالة كل جهاز (متصل / غير متصل).',
      curl: `curl -X GET "${BASE}/api/sessions" \\\n  -H "x-api-key: ${KEY}"`,
    },
    {
      method: 'POST', path: '/api/sessions/{SESSION_ID}/messages', title: 'إرسال رسالة أو ملف',
      desc: 'إرسال رسالة نصية أو وسائط (صورة/فيديو/ملف) عبر جهاز محدد. استبدل SESSION_ID بمعرّف الجهاز.',
      curl: `curl -X POST "${BASE}/api/sessions/SESSION_ID/messages" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${KEY}" \\\n  -d '{"to": "201001234567", "text": "مرحباً بك 👋"}'`,
    },
    {
      method: 'POST', path: '/api/ai/ask', title: 'سؤال الذكاء الاصطناعي (لموقعك)',
      desc: 'استخدم نفس ذكاء الجلسة على موقعك الإلكتروني. المصادقة هنا بمفتاح الجلسة (wsk_) من تبويب «الربط» داخل صفحة الجهاز — وليس مفتاح الحساب.',
      curl: `curl -X POST "${BASE}/api/ai/ask" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: SESSION_AI_KEY" \\\n  -d '{"message": "ما هي مواعيد العمل؟"}'`,
    },
  ];

  const messageFields = [
    { f: 'to', t: 'String / Array', r: '✅', d: 'رقم المستلم بكود الدولة (أو مصفوفة أرقام للإرسال الجماعي)' },
    { f: 'text', t: 'String', r: '⚠️', d: 'نص الرسالة (مطلوب إن لم تكن وسائط)' },
    { f: 'media_url', t: 'String', r: '—', d: 'رابط مباشر للملف المرفق' },
    { f: 'media_type', t: 'String', r: '—', d: 'image, video, audio, document' },
    { f: 'caption', t: 'String', r: '—', d: 'نص مرافق للملف المرفق' },
  ];

  const errorCodes = [
    { c: '401', n: 'UNAUTHORIZED', cause: 'لم يُرسل مفتاح API', fix: 'أضف ترويسة x-api-key' },
    { c: '403', n: 'INVALID_API_KEY', cause: 'المفتاح غير صحيح', fix: 'انسخ المفتاح كاملاً من هذه الصفحة' },
    { c: '400', n: 'MISSING_RECIPIENT', cause: 'حقل to مفقود أو فارغ', fix: 'أرسل حقل to بشكل صحيح' },
    { c: '400', n: 'EMPTY_MESSAGE', cause: 'لا يوجد نص أو وسائط', fix: 'أرسل text أو media_url' },
    { c: '400', n: 'SESSION_NOT_CONNECTED', cause: 'الجهاز غير متصل', fix: 'امسح كود QR لربط الجهاز' },
    { c: '404', n: 'SESSION_NOT_FOUND', cause: 'معرّف الجلسة غير صحيح', fix: 'تأكد من SESSION_ID في الرابط' },
  ];

  // ---- Postman collection ----
  const buildPostman = () => ({
    info: { name: 'SaaSBot WhatsApp API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'تكامل واتساب وفيسبوك عبر SaaSBot' },
    auth: { type: 'apikey', apikey: [{ key: 'key', value: 'x-api-key', type: 'string' }, { key: 'value', value: '{{apiKey}}', type: 'string' }, { key: 'in', value: 'header', type: 'string' }] },
    variable: [
      { key: 'baseUrl', value: BASE },
      { key: 'apiKey', value: apiKey || 'YOUR_API_KEY' },
      { key: 'sessionId', value: 'SESSION_ID' },
    ],
    item: [
      { name: 'List sessions', request: { method: 'GET', header: [], url: { raw: '{{baseUrl}}/api/sessions', host: ['{{baseUrl}}'], path: ['api', 'sessions'] } } },
      {
        name: 'Send message', request: {
          method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }],
          body: { mode: 'raw', raw: JSON.stringify({ to: '201001234567', text: 'مرحباً بك' }, null, 2) },
          url: { raw: '{{baseUrl}}/api/sessions/{{sessionId}}/messages', host: ['{{baseUrl}}'], path: ['api', 'sessions', '{{sessionId}}', 'messages'] }
        }
      },
      {
        name: 'Send media', request: {
          method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }],
          body: { mode: 'raw', raw: JSON.stringify({ to: '201001234567', media_url: 'https://example.com/file.jpg', media_type: 'image', caption: 'صورة' }, null, 2) },
          url: { raw: '{{baseUrl}}/api/sessions/{{sessionId}}/messages', host: ['{{baseUrl}}'], path: ['api', 'sessions', '{{sessionId}}', 'messages'] }
        }
      },
    ],
  });

  const downloadPostman = () => {
    const blob = new Blob([JSON.stringify(buildPostman(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'saasbot-whatsapp-api.postman_collection.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // ---- Printable DOC (HTML -> new window -> print/PDF) ----
  const openDoc = () => {
    const origin = window.location.origin;
    const rows = endpoints.map(e => `
      <div class="ep">
        <div class="ep-h"><span class="m m-${e.method}">${e.method}</span><code>${e.path}</code></div>
        <p>${e.desc}</p>
        <pre>${e.curl.replace(/</g, '&lt;')}</pre>
      </div>`).join('');
    const errRows = errorCodes.map(x => `<tr><td>${x.c}</td><td><code>${x.n}</code></td><td>${x.cause}</td><td>${x.fix}</td></tr>`).join('');
    const fieldRows = messageFields.map(x => `<tr><td><code>${x.f}</code></td><td>${x.t}</td><td>${x.r}</td><td>${x.d}</td></tr>`).join('');
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>توثيق SaaSBot API</title>
<style>
  *{box-sizing:border-box} body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1e293b;margin:0;padding:40px;background:#fff;line-height:1.7}
  .wrap{max-width:880px;margin:0 auto}
  header{text-align:center;border-bottom:3px solid #1b8354;padding-bottom:20px;margin-bottom:24px}
  header img{max-height:120px}
  h1{color:#0f3d2a;font-size:26px;margin:10px 0 4px} .sub{color:#64748b}
  h2{color:#1b8354;border-right:4px solid #1b8354;padding-right:10px;margin-top:30px;font-size:19px}
  code{background:#f1f5f9;padding:2px 6px;border-radius:5px;font-family:Consolas,monospace;direction:ltr;display:inline-block}
  pre{background:#0f172a;color:#7ef0b0;padding:14px;border-radius:10px;overflow-x:auto;direction:ltr;font-size:12.5px;white-space:pre-wrap;word-break:break-word}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px} th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:right} th{background:#f0fdf4;color:#166534}
  .key{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;direction:ltr;font-family:Consolas,monospace;font-size:12px;word-break:break-all}
  .ep{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:12px 0}
  .ep-h{display:flex;gap:10px;align-items:center;margin-bottom:6px}
  .m{font-weight:bold;font-size:11px;padding:3px 9px;border-radius:6px;color:#fff} .m-GET{background:#10b981}.m-POST{background:#3b82f6}.m-PUT{background:#f59e0b}.m-DELETE{background:#ef4444}
  .contacts{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px}
  .ct{flex:1;min-width:220px;border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#f8fafc}
  .ct b{display:block;color:#0f3d2a} .ct a{color:#1b8354;direction:ltr;display:inline-block;text-decoration:none;font-weight:bold}
  footer{margin-top:30px;text-align:center;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:16px}
  @media print{ .noprint{display:none} body{padding:0} }
</style></head><body><div class="wrap">
  <header>
    <img src="${origin}/logo.png" onerror="this.style.display='none'"/>
    <h1>توثيق واجهة برمجة التطبيقات (API)</h1>
    <div class="sub">الربط البرمجي مع نظام SaaSBot — واتساب وفيسبوك بالذكاء الاصطناعي</div>
  </header>

  <button class="noprint" onclick="window.print()" style="background:#1b8354;color:#fff;border:0;padding:10px 18px;border-radius:10px;font-weight:bold;cursor:pointer;margin-bottom:16px">🖨️ طباعة / حفظ PDF</button>

  <h2>الرابط الأساسي والمصادقة</h2>
  <p>الرابط الأساسي (Base URL):</p>
  <div class="key">${BASE}</div>
  <p style="margin-top:12px">مفتاح API الخاص بك (يُرسل في كل طلب):</p>
  <div class="key">${apiKey || 'أنشئ مفتاحك من داخل لوحة التحكم — صفحة الربط البرمجي'}</div>
  <p style="margin-top:12px">طرق إرسال المفتاح المدعومة:</p>
  <table><tr><th>الطريقة</th><th>المثال</th></tr>
    <tr><td>ترويسة مخصّصة (موصى بها)</td><td><code>x-api-key: ${KEY}</code></td></tr>
    <tr><td>Bearer Token</td><td><code>Authorization: Bearer ${KEY}</code></td></tr>
    <tr><td>Query (للاختبار)</td><td><code>?api_key=${KEY}</code></td></tr>
  </table>

  <h2>نقاط النهاية (Endpoints)</h2>
  ${rows}

  <h2>حقول إرسال الرسالة</h2>
  <table><tr><th>الحقل</th><th>النوع</th><th>إلزامي</th><th>الوصف</th></tr>${fieldRows}</table>
  <p>⚠️ التزم بأسماء الحقول: الرقم باسم <code>to</code> (وليس phone/number)، والنص باسم <code>text</code> (وليس message/body).</p>

  <h2>أكواد الأخطاء الشائعة</h2>
  <table><tr><th>HTTP</th><th>error_code</th><th>السبب</th><th>الحل</th></tr>${errRows}</table>

  <h2>التواصل والاشتراك</h2>
  <div class="contacts">
    <div class="ct"><b>${CONTACTS.EG.flag} إدارة مصر</b><a href="https://wa.me/${CONTACTS.EG.phone}">${CONTACTS.EG.display}</a></div>
    <div class="ct"><b>${CONTACTS.SA.flag} إدارة السعودية</b><a href="https://wa.me/${CONTACTS.SA.phone}">${CONTACTS.SA.display}</a></div>
  </div>

  <footer>© SaaSBot — جميع الحقوق محفوظة. هذا المستند خاص بحاملي مفتاح API.</footer>
</div></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="bg-gradient-to-l from-emerald-700 via-emerald-600 to-emerald-500 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden">
        <div className="absolute -left-10 -top-10 w-44 h-44 bg-white/10 rounded-full" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shrink-0 p-1"><Logo className="max-h-14 object-contain" markClassName="w-12 h-12" /></span>
            <div>
              <h2 className="text-2xl font-extrabold flex items-center gap-2"><Plug size={22} /> الربط البرمجي (API)</h2>
              <p className="text-emerald-50 text-sm mt-1">اربط نظامك أو موقعك بواتساب وفيسبوك عبر واجهة REST بسيطة.</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={downloadPostman} className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm backdrop-blur">
              <Download size={16} /> Postman
            </button>
            <button onClick={openDoc} className="flex items-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-bold px-4 py-2.5 rounded-xl transition-colors text-sm">
              <FileText size={16} /> تحميل التوثيق
            </button>
          </div>
        </div>
      </div>

      {/* API key */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><KeyRound size={18} className="text-emerald-500" /> مفتاح API الخاص بك</h3>
        {loadingKey ? (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500" /></div>
        ) : apiKey ? (
          <div className="space-y-3">
            <div className="flex items-stretch gap-2">
              <div dir="ltr" className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-sm text-slate-700 overflow-x-auto whitespace-nowrap custom-scrollbar">
                {reveal ? apiKey : maskedKey}
              </div>
              <button onClick={() => setReveal(r => !r)} className="px-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500" title={reveal ? 'إخفاء' : 'إظهار'}>{reveal ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              <button onClick={() => copy(apiKey, 'key')} className="px-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl" title="نسخ">{copied === 'key' ? <Check size={18} /> : <Copy size={18} />}</button>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle size={13} /> تعامل مع المفتاح كأنه كلمة مرور — لا تشاركه علناً.</p>
              <button onClick={generateKey} disabled={busy} className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-red-600 disabled:opacity-50"><RefreshCw size={14} /> توليد مفتاح جديد</button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-slate-500 text-sm mb-4">لم تُنشئ مفتاح API بعد. أنشئ واحداً للبدء في الربط.</p>
            <button onClick={generateKey} disabled={busy} className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-3 rounded-xl disabled:opacity-50">
              <KeyRound size={18} /> {busy ? 'جاري الإنشاء...' : 'إنشاء مفتاح API'}
            </button>
          </div>
        )}

        <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Server size={13} /> الرابط الأساسي (Base URL)</p>
            <div className="flex items-center gap-2">
              <code dir="ltr" className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 overflow-x-auto">{BASE}</code>
              <button onClick={() => copy(BASE, 'base')} className="text-slate-400 hover:text-emerald-600">{copied === 'base' ? <Check size={16} /> : <Copy size={16} />}</button>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><ShieldCheck size={13} /> ترويسة المصادقة</p>
            <code dir="ltr" className="block bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 overflow-x-auto">x-api-key: {KEY}</code>
          </div>
        </div>
      </div>

      {/* Auth methods */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-500" /> طرق المصادقة</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-slate-500 border-b border-slate-100"><tr><th className="p-2">الطريقة</th><th className="p-2">المثال</th></tr></thead>
            <tbody className="text-slate-600">
              <tr className="border-b border-slate-50"><td className="p-2 font-bold">Header (موصى بها)</td><td className="p-2"><code dir="ltr" className="text-xs">x-api-key: {KEY}</code></td></tr>
              <tr className="border-b border-slate-50"><td className="p-2 font-bold">Bearer Token</td><td className="p-2"><code dir="ltr" className="text-xs">Authorization: Bearer {KEY}</code></td></tr>
              <tr><td className="p-2 font-bold">Query (اختبار)</td><td className="p-2"><code dir="ltr" className="text-xs">?api_key={KEY}</code></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Endpoints */}
      <div className="space-y-4">
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><BookOpen size={20} className="text-emerald-500" /> نقاط النهاية</h3>
        {endpoints.map((e, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className={`text-xs font-extrabold px-2.5 py-1 rounded-lg ${METHOD_COLORS[e.method]}`}>{e.method}</span>
              <code dir="ltr" className="text-sm text-slate-700 font-bold">{e.path}</code>
            </div>
            <p className="text-sm text-slate-500 mb-3">{e.title} — {e.desc}</p>
            <CodeBlock code={e.curl} onCopy={() => copy(e.curl, `ep${i}`)} copied={copied === `ep${i}`} />
          </div>
        ))}
      </div>

      {/* Message fields */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-700 mb-4">حقول إرسال الرسالة</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-slate-500 border-b border-slate-100"><tr><th className="p-2">الحقل</th><th className="p-2">النوع</th><th className="p-2">إلزامي</th><th className="p-2">الوصف</th></tr></thead>
            <tbody className="text-slate-600">
              {messageFields.map((x, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="p-2"><code dir="ltr" className="text-xs text-emerald-700">{x.f}</code></td>
                  <td className="p-2 text-xs">{x.t}</td><td className="p-2">{x.r}</td><td className="p-2 text-xs">{x.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-amber-600 mt-3 flex items-center gap-1"><AlertTriangle size={13} /> التزم بالأسماء: الرقم <code className="mx-1" dir="ltr">to</code> (ليس phone)، والنص <code className="mx-1" dir="ltr">text</code> (ليس message).</p>
      </div>

      {/* Error codes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-700 mb-4">أكواد الأخطاء</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-slate-500 border-b border-slate-100"><tr><th className="p-2">HTTP</th><th className="p-2">error_code</th><th className="p-2">السبب</th><th className="p-2">الحل</th></tr></thead>
            <tbody className="text-slate-600">
              {errorCodes.map((x, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="p-2 font-bold">{x.c}</td><td className="p-2"><code dir="ltr" className="text-xs">{x.n}</code></td>
                  <td className="p-2 text-xs">{x.cause}</td><td className="p-2 text-xs">{x.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contacts */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><MessageCircle size={18} className="text-emerald-500" /> التواصل والاشتراك</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['EG', 'SA'] as const).map(r => {
            const c = CONTACTS[r];
            return (
              <a key={r} href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all">
                <span className="flex items-center gap-3">
                  <span className="text-2xl">{c.flag}</span>
                  <span><span className="block font-bold text-slate-800">إدارة {c.label}</span><span className="block text-sm text-slate-500" dir="ltr">{c.display}</span></span>
                </span>
                <span className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm bg-emerald-100 px-3 py-2 rounded-xl"><MessageCircle size={16} /> واتساب</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ApiDocs;
