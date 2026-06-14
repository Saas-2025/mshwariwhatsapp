import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Smartphone, RefreshCw, QrCode, CheckCircle2, Trash2, X, Code, Copy, Check, Bot,
  Share2, Info, Brain, MessageSquare, BarChart3, ChevronRight, Plus
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import AIAgentPanel from '../components/AIAgentPanel';
import ConversationsPanel from '../components/ConversationsPanel';
import AnalyticsPanel from '../components/AnalyticsPanel';

interface Session {
  id: string;
  name: string;
  status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' | 'connecting' | 'disconnected';
  qr?: string;
  phoneNumber?: string;
  webhookUrl?: string;
  webhookUrls?: string[];
  webhooks?: { name: string; url: string }[];
  autoReplyEnabled?: boolean;
}

type Tab = 'overview' | 'ai' | 'conversations' | 'analytics' | 'api' | 'webhook';

const apiBase = () => (import.meta.env.VITE_API_URL?.replace(/\/$/, '') || `${window.location.protocol}//${window.location.hostname}:3050`);
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const statusMeta = (status: Session['status']) => {
  switch (status) {
    case 'CONNECTED': return { label: 'متصل', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600', ring: 'bg-emerald-100 text-emerald-600' };
    case 'QR': return { label: 'بانتظار المسح', dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600', ring: 'bg-blue-100 text-blue-600' };
    case 'connecting': return { label: 'جاري الاتصال', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600', ring: 'bg-amber-100 text-amber-600' };
    case 'ERROR': return { label: 'خطأ في الاتصال', dot: 'bg-red-500', chip: 'bg-red-50 text-red-600', ring: 'bg-red-100 text-red-600' };
    default: return { label: 'غير متصل', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-500', ring: 'bg-slate-100 text-slate-400' };
  }
};

const SessionDetail: React.FC<{ socket: any }> = ({ socket }) => {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  const [webhookNameInput, setWebhookNameInput] = useState('');
  const [webhookUrlInput, setWebhookUrlInput] = useState('');
  const [webhooksList, setWebhooksList] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('list-sessions');

    const handleList = (list: Session[]) => {
      const found = list.find(s => s.id === sessionId);
      if (found) {
        setSession(prev => ({ ...found, qr: prev?.qr }));
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    };
    const handleUpdate = () => socket.emit('list-sessions');
    const handleStatus = ({ sessionId: sid, status }: any) => {
      if (sid === sessionId) setSession(prev => prev ? { ...prev, status } : prev);
    };
    const handleQr = ({ sessionId: sid, qr }: any) => {
      if (sid === sessionId) setSession(prev => prev ? { ...prev, qr: qr.replace('data:image/png;base64,', '') } : prev);
    };

    socket.on('sessions-list', handleList);
    socket.on('sessions-updated', handleUpdate);
    socket.on('session-status', handleStatus);
    socket.on('session-qr', handleQr);
    return () => {
      socket.off('sessions-list', handleList);
      socket.off('sessions-updated', handleUpdate);
      socket.off('session-status', handleStatus);
      socket.off('session-qr', handleQr);
    };
  }, [socket, sessionId]);

  // Initialize the webhook editor once per session
  useEffect(() => {
    if (!session) return;
    let initial: { name: string; url: string }[] = [];
    if (session.webhooks && session.webhooks.length) initial = session.webhooks;
    else if (session.webhookUrls && session.webhookUrls.length) initial = session.webhookUrls.map(url => ({ name: 'Webhook', url }));
    else if (session.webhookUrl) initial = [{ name: 'Default webhook', url: session.webhookUrl }];
    setWebhooksList(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const copy = (text: string, which: 'url' | 'token') => {
    navigator.clipboard.writeText(text);
    if (which === 'url') { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    else { setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000); }
  };

  const handleStart = () => socket?.emit('start-session', { sessionId });
  const handleLogout = () => {
    const msg = session?.status === 'CONNECTED' ? 'هل تريد تسجيل الخروج من هذا الجهاز؟' : 'هل تريد إعادة تعيين الجلسة؟';
    if (confirm(msg)) socket?.emit('logout', { sessionId });
  };
  const handleDelete = () => {
    if (confirm('هل أنت متأكد من حذف هذا الجهاز نهائياً؟')) {
      socket?.emit('delete-session', { sessionId });
      navigate('/devices');
    }
  };

  const toggleAutoReply = async () => {
    if (!session) return;
    const isEnabled = session.autoReplyEnabled !== false;
    setSession(prev => prev ? { ...prev, autoReplyEnabled: !isEnabled } : prev);
    try {
      const res = await fetch(`${apiBase()}/api/sessions/${sessionId}/toggle-autoreply`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ enabled: !isEnabled })
      });
      if (!res.ok) {
        setSession(prev => prev ? { ...prev, autoReplyEnabled: isEnabled } : prev);
        alert('فشل تغيير حالة التشغيل');
      }
    } catch {
      setSession(prev => prev ? { ...prev, autoReplyEnabled: isEnabled } : prev);
    }
  };

  const addWebhook = () => {
    if (!webhookUrlInput.trim()) return;
    if (webhooksList.some(w => w.url === webhookUrlInput.trim())) { alert('هذا الرابط مضاف بالفعل'); return; }
    setWebhooksList([...webhooksList, { name: webhookNameInput.trim() || 'Webhook', url: webhookUrlInput.trim() }]);
    setWebhookUrlInput(''); setWebhookNameInput('');
  };
  const removeWebhook = (url: string) => setWebhooksList(webhooksList.filter(w => w.url !== url));
  const saveWebhooks = async () => {
    try {
      const res = await fetch(`${apiBase()}/api/sessions/${sessionId}/webhook`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ webhookUrl: '', webhookUrls: [], webhooks: webhooksList })
      });
      if (res.ok) alert('تم حفظ روابط الويب هوك بنجاح');
      else { const d = await res.json(); alert('فشل الحفظ: ' + (d.details || d.error || 'خطأ')); }
    } catch (e: any) { alert('حدث خطأ: ' + (e.message || e)); }
  };

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-slate-500 mb-4">الجهاز غير موجود.</p>
        <button onClick={() => navigate('/devices')} className="bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-emerald-600">رجوع للأجهزة</button>
      </div>
    );
  }
  if (!session) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>;
  }

  const meta = statusMeta(session.status);
  const isOffline = !session.status || session.status === 'IDLE' || session.status === 'ERROR' || session.status === 'disconnected';

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'نظرة عامة', icon: <Info size={16} /> },
    { id: 'ai', label: 'الذكاء الاصطناعي', icon: <Brain size={16} /> },
    { id: 'conversations', label: 'سجل المحادثات', icon: <MessageSquare size={16} /> },
    { id: 'analytics', label: 'تحليل الردود', icon: <BarChart3 size={16} /> },
    { id: 'api', label: 'الربط البرمجي', icon: <Code size={16} /> },
    { id: 'webhook', label: 'Webhook', icon: <Share2 size={16} /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/devices')} className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 rounded-xl p-2 shadow-sm" title="رجوع">
          <ChevronRight size={20} />
        </button>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${meta.ring}`}>
          {session.status === 'CONNECTED' ? <CheckCircle2 size={26} /> : session.status === 'QR' ? <QrCode size={26} /> : <Smartphone size={26} />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-800 truncate">{session.name}</h1>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${meta.chip}`}>
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} /> {meta.label}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex gap-1 px-3 pt-2 border-b border-slate-100 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-bold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-6">
          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {session.status === 'QR' && session.qr ? (
                <div className="flex flex-col items-center bg-slate-50 rounded-2xl border border-slate-200 p-6">
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm"><QRCodeSVG value={session.qr} size={180} /></div>
                  <p className="text-sm text-slate-500 mt-3">افتح واتساب ← الأجهزة المرتبطة ← امسح الكود</p>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">الحالة</p>
                  <p className="font-bold text-slate-700 flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${meta.dot}`} />{meta.label}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">معرّف الجلسة</p>
                  <p className="font-mono text-sm text-slate-600 break-all" dir="ltr">{session.id}</p>
                </div>
              </div>

              {/* Master auto-reply toggle */}
              <div className={`flex items-center justify-between rounded-xl p-4 border ${session.autoReplyEnabled !== false ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${session.autoReplyEnabled !== false ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}><Bot size={20} /></div>
                  <div>
                    <p className="font-bold text-slate-700">التشغيل العام للردود</p>
                    <p className="text-xs text-slate-400">مفتاح رئيسي يوقف/يشغّل كل الردود الآلية لهذا الجهاز</p>
                  </div>
                </div>
                <button onClick={toggleAutoReply} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${session.autoReplyEnabled !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${session.autoReplyEnabled !== false ? 'translate-x-1' : 'translate-x-6'}`} />
                </button>
              </div>

              {/* Connection actions */}
              <div className="flex flex-wrap gap-3">
                {isOffline ? (
                  <button onClick={handleStart} className="flex-1 min-w-[140px] py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-500/20">ربط الجهاز</button>
                ) : session.status === 'CONNECTED' ? (
                  <button onClick={handleLogout} className="flex-1 min-w-[140px] py-3 bg-amber-50 text-amber-600 rounded-xl font-bold hover:bg-amber-100">تسجيل خروج</button>
                ) : (
                  <button onClick={handleLogout} className="flex-1 min-w-[140px] py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 flex items-center justify-center gap-2"><RefreshCw size={16} /> إعادة تعيين</button>
                )}
                <button onClick={handleDelete} className="flex-1 min-w-[140px] py-3 text-red-500 border border-red-200 rounded-xl font-bold hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center gap-2"><Trash2 size={16} /> حذف الجهاز</button>
              </div>
            </div>
          )}

          {activeTab === 'ai' && <AIAgentPanel sessionId={session.id} />}
          {activeTab === 'conversations' && <ConversationsPanel sessionId={session.id} />}
          {activeTab === 'analytics' && <AnalyticsPanel sessionId={session.id} />}

          {/* API */}
          {activeTab === 'api' && (
            <div className="space-y-5" dir="ltr">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Endpoint URL</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white p-3 rounded-lg border border-slate-200 font-mono text-sm text-slate-700 break-all">{`${apiBase()}/api/sessions/${session.id}/send`}</code>
                  <button onClick={() => copy(`${apiBase()}/api/sessions/${session.id}/send`, 'url')} className="p-3 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-emerald-500 hover:border-emerald-500 shrink-0">{copied ? <Check size={18} /> : <Copy size={18} />}</button>
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Authorization Token (Bearer)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white p-3 rounded-lg border border-slate-200 font-mono text-sm text-slate-700 break-all line-clamp-2">{localStorage.getItem('token') || 'Token not found'}</code>
                  <button onClick={() => copy(localStorage.getItem('token') || '', 'token')} className="p-3 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-emerald-500 hover:border-emerald-500 shrink-0">{tokenCopied ? <Check size={18} /> : <Copy size={18} />}</button>
                </div>
              </div>
              <div>
                <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">Text Message (JSON)</span>
                <pre className="mt-2 bg-slate-900 text-slate-50 p-4 rounded-xl text-xs font-mono overflow-x-auto">{`{
  "number": "201012345678",
  "type": "text",
  "content": "Hello via API!"
}`}</pre>
              </div>
            </div>
          )}

          {/* Webhook */}
          {activeTab === 'webhook' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">سيتم إرسال إشعار (POST) لكل الروابط عند وصول رسالة جديدة لهذا الجهاز.</p>
              <div className="flex gap-2">
                <input type="text" className="w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-sm" placeholder="اسم (n8n)" value={webhookNameInput} onChange={e => setWebhookNameInput(e.target.value)} />
                <input type="url" className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 text-left font-mono text-sm" placeholder="https://..." value={webhookUrlInput} onChange={e => setWebhookUrlInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWebhook(); } }} dir="ltr" />
                <button onClick={addWebhook} disabled={!webhookUrlInput.trim()} className="bg-emerald-500 text-white px-4 rounded-xl hover:bg-emerald-600 disabled:opacity-50"><Plus size={20} /></button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {webhooksList.length === 0 && <p className="text-center text-slate-400 py-6 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">لا توجد روابط مضافة.</p>}
                {webhooksList.map((w, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="flex flex-col flex-1 overflow-hidden">
                      <span className="text-xs font-bold text-slate-700 truncate">{w.name}</span>
                      <code className="text-[10px] font-mono text-slate-500 truncate mt-0.5" dir="ltr" title={w.url}>{w.url}</code>
                    </div>
                    <button onClick={() => removeWebhook(w.url)} className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <button onClick={saveWebhooks} className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/20">حفظ التغييرات ({webhooksList.length})</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionDetail;
