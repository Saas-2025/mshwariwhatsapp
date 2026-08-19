import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, Plus, Trash2, Save, AlertCircle, CheckCircle, Settings2, Power, FileText, Upload, KeyRound, Mic, Square, Play, Search, Edit2, Paperclip, Eye, X } from 'lucide-react';

export interface KnowledgeEntry { id: string; question: string; answer: string; hasAudio?: boolean; }
export interface KnowledgeDoc { id: string; name: string; content?: string; chars?: number; }
export interface GroqKeyView { id: string; label?: string; status?: string; lastError?: string; hint?: string; isActive?: boolean; }
export interface AIAgentConfig {
  _id?: string;
  name: string;
  role: string;
  about: string;
  welcomeMessage: string;
  systemPrompt: string;
  temperature: number;
  aiModel: string;
  isActive: boolean;
  fallbackToAI: boolean;
  knowledgeBase: KnowledgeEntry[];
  documents: KnowledgeDoc[];
  groqKeys?: GroqKeyView[];
}

const DEFAULT_CONFIG: AIAgentConfig = {
  name: 'AI Assistant',
  role: 'مساعد ذكي',
  about: '',
  welcomeMessage: 'مرحباً! كيف يمكنني مساعدتك اليوم؟',
  systemPrompt: 'أنت مساعد ذكي ومفيد.',
  temperature: 0.7,
  aiModel: 'llama-3.1-8b-instant',
  isActive: false,
  fallbackToAI: true,
  knowledgeBase: [],
  documents: [],
  groqKeys: []
};

const MODELS = [
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — سريع وموثوق (افتراضي)' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B — الأقوى (إن كان متاحاً لحسابك)' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B — متوازن' },
];

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const AIAgentPanel: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [config, setConfig] = useState<AIAgentConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'basic' | 'knowledge'>('basic');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [newKey, setNewKey] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  // Voice answer recording
  const [recState, setRecState] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [recQuestion, setRecQuestion] = useState('');
  const [recCaption, setRecCaption] = useState('');
  const [recSecs, setRecSecs] = useState(0);
  const [recUrl, setRecUrl] = useState('');
  const [savingVoice, setSavingVoice] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const recTimerRef = useRef<any>(null);
  // Search / edit / attachment
  const [kbSearch, setKbSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState('');
  const [editA, setEditA] = useState('');
  const [attQuestion, setAttQuestion] = useState('');
  const [attCaption, setAttCaption] = useState('');
  const [attFileName, setAttFileName] = useState('');
  const [attBusy, setAttBusy] = useState(false);
  const attFileRef = useRef<HTMLInputElement>(null);

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${baseUrl()}/api/aiagent?sessionId=${sessionId}`, { headers: authHeaders() });
        const data = res.ok ? await res.json() : null;
        setConfig(data ? { ...DEFAULT_CONFIG, ...data } : { ...DEFAULT_CONFIG });
      } catch {
        setConfig({ ...DEFAULT_CONFIG });
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...config, sessionId })
      });
      if (res.ok) {
        setConfig({ ...DEFAULT_CONFIG, ...(await res.json()) });
        flash('success', '✅ تم حفظ إعدادات هذا الجهاز');
      } else {
        flash('error', `❌ خطأ: ${await res.text()}`);
      }
    } catch (e: any) {
      flash('error', `❌ خطأ في الشبكة: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    const newStatus = !config.isActive;
    setConfig(prev => ({ ...prev, isActive: newStatus }));
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/toggle`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ isActive: newStatus, sessionId })
      });
      if (!res.ok) {
        setConfig(prev => ({ ...prev, isActive: !newStatus }));
        flash('error', `❌ فشل تغيير حالة البوت: ${await res.text()}`);
      }
    } catch {
      setConfig(prev => ({ ...prev, isActive: !newStatus }));
    }
  };

  const addKnowledge = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/knowledge`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ question: newQuestion.trim(), answer: newAnswer.trim(), sessionId })
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(prev => ({ ...prev, _id: saved._id, knowledgeBase: saved.knowledgeBase || [] }));
        setNewQuestion(''); setNewAnswer('');
      } else {
        flash('error', `❌ فشل إضافة المعرفة: ${await res.text()}`);
      }
    } catch (e: any) {
      flash('error', `❌ خطأ في الشبكة: ${e.message}`);
    }
  };

  const deleteKnowledge = async (entryId: string) => {
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/knowledge/${entryId}?sessionId=${sessionId}`, {
        method: 'DELETE', headers: authHeaders()
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(prev => ({ ...prev, knowledgeBase: saved.knowledgeBase || [] }));
      }
    } catch { /* ignore */ }
  };

  const uploadDocument = async (file: File) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { flash('error', '❌ حجم الملف أكبر من 12MB'); return; }
    setUploading(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error('read error'));
        r.readAsDataURL(file);
      });
      const res = await fetch(`${baseUrl()}/api/aiagent/document`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ sessionId, name: file.name, mimeType: file.type, dataBase64 })
      });
      if (res.ok) {
        const { agent, truncated } = await res.json();
        setConfig(prev => ({ ...prev, _id: agent._id, documents: agent.documents || [] }));
        flash('success', truncated ? '✅ تم رفع الملف (اكتفينا بأول جزء كبير منه)' : '✅ تم رفع الملف وقراءته بنجاح');
      } else {
        const err = await res.json().catch(() => ({}));
        flash('error', `❌ ${err.error || 'فشل رفع الملف'}`);
      }
    } catch (e: any) {
      flash('error', `❌ خطأ في الشبكة: ${e.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const deleteDocument = async (docId: string) => {
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/document/${docId}?sessionId=${sessionId}`, {
        method: 'DELETE', headers: authHeaders()
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(prev => ({ ...prev, documents: saved.documents || [] }));
      }
    } catch { /* ignore */ }
  };

  const reloadKeys = async () => {
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent?sessionId=${sessionId}`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({ ...prev, _id: data?._id || prev._id, groqKeys: data?.groqKeys || [] }));
      }
    } catch { /* ignore */ }
  };

  const addGroqKey = async () => {
    if (!newKey.trim()) return;
    setKeyBusy(true);
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/groqkey`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ sessionId, key: newKey.trim(), label: newKeyLabel.trim() })
      });
      if (res.ok) { setNewKey(''); setNewKeyLabel(''); await reloadKeys(); }
      else flash('error', `❌ ${(await res.json().catch(() => ({}))).error || 'فشل إضافة المفتاح'}`);
    } catch (e: any) { flash('error', `❌ ${e.message}`); } finally { setKeyBusy(false); }
  };

  const deleteGroqKey = async (id: string) => {
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/groqkey/${id}?sessionId=${sessionId}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) await reloadKeys();
    } catch { /* ignore */ }
  };

  const keyStatusBadge = (status?: string) => {
    switch (status) {
      case 'ok': return { label: 'شغّال', cls: 'bg-emerald-100 text-emerald-600' };
      case 'exhausted': return { label: 'تجاوز الحد', cls: 'bg-amber-100 text-amber-700' };
      case 'invalid': return { label: 'غير صالح', cls: 'bg-red-100 text-red-600' };
      case 'error': return { label: 'خطأ', cls: 'bg-red-100 text-red-600' };
      default: return { label: 'لم يُختبر', cls: 'bg-slate-100 text-slate-500' };
    }
  };

  // --- Voice answer recording ---
  const stopRecording = () => { if (recRef.current && recRef.current.state === 'recording') recRef.current.stop(); };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = (window as any).MediaRecorder?.isTypeSupported?.('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus'
        : (window as any).MediaRecorder?.isTypeSupported?.('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        blobRef.current = blob;
        setRecUrl(URL.createObjectURL(blob));
        setRecState('recorded');
        stream.getTracks().forEach(t => t.stop());
        if (recTimerRef.current) clearInterval(recTimerRef.current);
      };
      recRef.current = rec;
      rec.start();
      setRecState('recording');
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs(s => { if (s >= 60) { stopRecording(); return s; } return s + 1; }), 1000);
    } catch {
      flash('error', '❌ تعذّر الوصول للميكروفون. اسمح بالإذن وحاول مرة أخرى.');
    }
  };

  const resetRec = () => { setRecState('idle'); setRecUrl(''); blobRef.current = null; setRecSecs(0); };

  const saveVoice = async () => {
    if (!recQuestion.trim() || !blobRef.current) { flash('error', '❌ اكتب السؤال/الكلمات وسجّل الصوت أولاً'); return; }
    setSavingVoice(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(blobRef.current!);
      });
      const res = await fetch(`${baseUrl()}/api/aiagent/voice`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ sessionId, question: recQuestion.trim(), answer: recCaption.trim(), audio: dataUrl, audioMime: blobRef.current!.type })
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(prev => ({ ...prev, _id: saved._id, knowledgeBase: saved.knowledgeBase || [] }));
        setRecQuestion(''); setRecCaption(''); resetRec();
        flash('success', '✅ تم حفظ الإجابة الصوتية');
      } else flash('error', `❌ ${(await res.json().catch(() => ({}))).error || 'فشل الحفظ'}`);
    } catch (e: any) { flash('error', `❌ ${e.message}`); } finally { setSavingVoice(false); }
  };

  const playEntryAudio = async (entryId: string) => {
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/knowledge/${entryId}/audio?sessionId=${sessionId}`, { headers: authHeaders() });
      if (res.ok) { const { audio } = await res.json(); new Audio(audio).play().catch(() => { }); }
    } catch { /* ignore */ }
  };

  const previewMedia = async (entryId: string) => {
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/knowledge/${entryId}/media?sessionId=${sessionId}`, { headers: authHeaders() });
      if (res.ok) { const { media } = await res.json(); window.open(media, '_blank'); }
    } catch { /* ignore */ }
  };

  const addAttachment = async () => {
    const file = attFileRef.current?.files?.[0];
    if (!attQuestion.trim() || !file) { flash('error', '❌ اكتب السؤال واختر ملفاً'); return; }
    if (file.size > 5 * 1024 * 1024) { flash('error', '❌ الملف أكبر من 5MB'); return; }
    setAttBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file);
      });
      const mediaType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document';
      const res = await fetch(`${baseUrl()}/api/aiagent/attachment`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ sessionId, question: attQuestion.trim(), answer: attCaption.trim(), media: dataUrl, mediaType, fileName: file.name })
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(prev => ({ ...prev, _id: saved._id, knowledgeBase: saved.knowledgeBase || [] }));
        setAttQuestion(''); setAttCaption(''); setAttFileName('');
        if (attFileRef.current) attFileRef.current.value = '';
        flash('success', '✅ تم حفظ الإجابة بمرفق');
      } else flash('error', `❌ ${(await res.json().catch(() => ({}))).error || 'فشل الحفظ'}`);
    } catch (e: any) { flash('error', `❌ ${e.message}`); } finally { setAttBusy(false); }
  };

  const startEdit = (e: any) => { setEditId(e.id); setEditQ(e.question || ''); setEditA(e.answer || ''); };
  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/knowledge/${id}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ sessionId, question: editQ, answer: editA })
      });
      if (res.ok) { const saved = await res.json(); setConfig(prev => ({ ...prev, knowledgeBase: saved.knowledgeBase || [] })); setEditId(null); }
      else flash('error', `❌ ${(await res.json().catch(() => ({}))).error || 'فشل التعديل'}`);
    } catch (e: any) { flash('error', `❌ ${e.message}`); }
  };

  const kbFiltered = (config.knowledgeBase || []).filter(e =>
    !kbSearch || (e.question || '').toLowerCase().includes(kbSearch.toLowerCase()) || (e.answer || '').toLowerCase().includes(kbSearch.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Activate toggle */}
      <div className={`flex items-center justify-between rounded-xl p-4 border ${config.isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.isActive ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
            <Power size={20} />
          </div>
          <div>
            <p className="font-bold text-slate-700">تفعيل البوت لهذا الجهاز</p>
            <p className="text-xs text-slate-400">{config.isActive ? 'مفعّل — يرد تلقائياً بالذكاء الاصطناعي' : 'معطّل'}</p>
          </div>
        </div>
        <button
          onClick={toggleActive}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${config.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${config.isActive ? 'translate-x-1' : 'translate-x-6'}`} />
        </button>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-sm font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-100">
        {([['basic', 'إعدادات أساسية', <Settings2 size={15} />], ['knowledge', 'قواعد المعرفة', <BookOpen size={15} />]] as const).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {icon}{label}
            {id === 'knowledge' && config.knowledgeBase.length > 0 && (
              <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">{config.knowledgeBase.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Basic */}
      {activeTab === 'basic' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1.5">اسم البوت</label>
              <input type="text" value={config.name} onChange={e => setConfig(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="AI Assistant" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1.5">الموديل</label>
              <select value={config.aiModel} onChange={e => setConfig(p => ({ ...p, aiModel: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500">
                {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                {!MODELS.some(m => m.id === config.aiModel) && config.aiModel && <option value={config.aiModel}>{config.aiModel} (قديم)</option>}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1.5">وظيفة البوت (Role)</label>
            <input type="text" value={config.role} onChange={e => setConfig(p => ({ ...p, role: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="مساعد خدمة عملاء" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1.5">عن النشاط (About)</label>
            <textarea value={config.about} onChange={e => setConfig(p => ({ ...p, about: e.target.value }))} rows={2}
              className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500 resize-none" placeholder="نبذة عن نشاطك التجاري..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1.5">رسالة الترحيب</label>
            <input type="text" value={config.welcomeMessage} onChange={e => setConfig(p => ({ ...p, welcomeMessage: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1.5">التعليمات الأساسية (System Prompt)</label>
            <textarea value={config.systemPrompt} onChange={e => setConfig(p => ({ ...p, systemPrompt: e.target.value }))} rows={4}
              className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500 resize-none text-sm" />
            <p className="text-xs text-slate-400 mt-1">تتحكم في شخصية البوت. قواعد المعرفة تُضاف تلقائياً.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1.5">درجة الإبداع: {config.temperature}</label>
            <input type="range" min="0" max="2" step="0.1" value={config.temperature}
              onChange={e => setConfig(p => ({ ...p, temperature: parseFloat(e.target.value) }))} className="w-full accent-emerald-500" />
            <div className="flex justify-between text-xs text-slate-400 mt-1"><span>دقيق</span><span>إبداعي</span></div>
          </div>

          {/* Groq API keys pool (automatic failover) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound size={16} className="text-emerald-500" />
              <h4 className="text-sm font-bold text-slate-700">مفاتيح Groq API (تبديل تلقائي)</h4>
            </div>
            <p className="text-xs text-slate-400 mb-3">أضف أكثر من مفتاح. لو واحد وصل الحد، النظام ينتقل تلقائياً للي بعده لحد ما يرد على العميل. المفتاح اللي «يعمل الآن» بيظهر بعلامة خضرا.</p>

            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} placeholder="اسم (اختياري)"
                className="sm:w-32 bg-white border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500" />
              <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="gsk_..." dir="ltr" type="password"
                className="flex-1 bg-white border border-slate-200 p-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-emerald-500"
                onKeyDown={e => e.key === 'Enter' && addGroqKey()} />
              <button type="button" onClick={addGroqKey} disabled={!newKey.trim() || keyBusy}
                className="bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-50">
                <Plus size={16} /> إضافة
              </button>
            </div>

            <div className="space-y-2">
              {(!config.groqKeys || config.groqKeys.length === 0) && (
                <p className="text-xs text-slate-400 text-center py-3 bg-white rounded-lg border border-dashed border-slate-200">
                  لا توجد مفاتيح — سيُستخدم مفتاح النظام الافتراضي إن وُجد.
                </p>
              )}
              {(config.groqKeys || []).map((k, idx) => {
                const b = keyStatusBadge(k.status);
                return (
                  <div key={k.id} className={`flex items-center gap-2 p-2.5 rounded-lg border bg-white ${k.isActive ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'}`}>
                    <span className="text-xs font-bold text-slate-400 w-5 text-center">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-700 truncate">{k.label || 'مفتاح'}</span>
                        <code className="text-[10px] font-mono text-slate-400" dir="ltr">{k.hint}</code>
                        {k.isActive && <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">يعمل الآن</span>}
                      </div>
                      {k.lastError && <p className="text-[10px] text-red-400 truncate">{k.lastError}</p>}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${b.cls}`}>{b.label}</span>
                    <button type="button" onClick={() => deleteGroqKey(k.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Knowledge */}
      {activeTab === 'knowledge' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">أسئلة وأجوبة خاصة بهذا الجهاز ليرد البوت بدقة.</p>

          {/* File feeding */}
          <div className="border-2 border-dashed border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-slate-600">
                <FileText size={20} className="text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold">تغذية بملفات</p>
                  <p className="text-xs text-slate-400">PDF · Word · TXT · MD · JSON — يقرأ البوت تفاصيلها ويرد منها</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".txt,.md,.json,.csv,.pdf,.docx" className="hidden"
                onChange={e => e.target.files && e.target.files[0] && uploadDocument(e.target.files[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-50 shrink-0">
                {uploading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> جاري الرفع...</>
                  : <><Upload size={16} /> رفع ملف</>}
              </button>
            </div>

            {config.documents && config.documents.length > 0 && (
              <div className="mt-3 space-y-2">
                {config.documents.map(d => (
                  <div key={d.id} className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-slate-200">
                    <FileText size={16} className="text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-700 truncate">{d.name}</p>
                      <p className="text-[10px] text-slate-400">{(d.chars || d.content?.length || 0).toLocaleString()} حرف</p>
                    </div>
                    <button type="button" onClick={() => deleteDocument(d.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Voice answer recording */}
          <div className="border-2 border-dashed border-amber-200 bg-amber-50/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Mic size={18} className="text-amber-500" />
              <div>
                <p className="text-sm font-bold text-slate-700">إجابة صوتية (بصوتك)</p>
                <p className="text-xs text-slate-400">سجّل صوت، ولما العميل يسأل سؤالاً مطابقاً يوصله الريكورد كرسالة صوتية</p>
              </div>
            </div>
            <input value={recQuestion} onChange={e => setRecQuestion(e.target.value)} placeholder="السؤال / الكلمات المفتاحية (افصل بفاصلة)"
              className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-500 mb-2" />
            <div className="flex items-center gap-3 flex-wrap">
              {recState === 'idle' && (
                <button type="button" onClick={startRecording} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                  <Mic size={16} /> ابدأ التسجيل
                </button>
              )}
              {recState === 'recording' && (
                <button type="button" onClick={stopRecording} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl animate-pulse">
                  <Square size={14} /> إيقاف ({recSecs}ث)
                </button>
              )}
              {recState === 'recorded' && (
                <>
                  <audio src={recUrl} controls className="h-9" />
                  <button type="button" onClick={resetRec} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-2">إعادة</button>
                  <button type="button" onClick={saveVoice} disabled={savingVoice || !recQuestion.trim()} className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-50">
                    <Save size={15} /> {savingVoice ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                </>
              )}
            </div>
            {recState === 'recorded' && (
              <input value={recCaption} onChange={e => setRecCaption(e.target.value)} placeholder="نص مرافق اختياري (يُرسل بعد الصوت)"
                className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-amber-500 mt-2" />
            )}
          </div>

          {/* Attachment answer */}
          <div className="border-2 border-dashed border-purple-200 bg-purple-50/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Paperclip size={18} className="text-purple-500" />
              <div>
                <p className="text-sm font-bold text-slate-700">إجابة بمرفق (صورة/فيديو/ملف)</p>
                <p className="text-xs text-slate-400">يُرسل المرفق للعميل لما يسأل سؤالاً مطابقاً</p>
              </div>
            </div>
            <input value={attQuestion} onChange={e => setAttQuestion(e.target.value)} placeholder="السؤال / الكلمات المفتاحية (افصل بفاصلة)"
              className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-purple-500 mb-2" />
            <input value={attCaption} onChange={e => setAttCaption(e.target.value)} placeholder="تعليق مرافق اختياري (caption)"
              className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-sm focus:outline-none focus:border-purple-500 mb-2" />
            <div className="flex items-center gap-2 flex-wrap">
              <input ref={attFileRef} type="file" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={e => setAttFileName(e.target.files && e.target.files[0] ? e.target.files[0].name : '')} />
              <button type="button" onClick={() => attFileRef.current?.click()} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-slate-50">
                <Upload size={16} /> اختر ملف
              </button>
              {attFileName && <span className="text-xs text-slate-500 truncate max-w-[160px]">{attFileName}</span>}
              <button type="button" onClick={addAttachment} disabled={attBusy || !attQuestion.trim() || !attFileName}
                className="flex items-center gap-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-50">
                <Save size={15} /> {attBusy ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>

          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="flex-1 h-px bg-slate-100" /> أو أضف سؤال وجواب نصّي <span className="flex-1 h-px bg-slate-100" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="text" value={newQuestion} onChange={e => setNewQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKnowledge()}
              className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="السؤال: ما هي ساعات العمل؟" />
            <div className="flex gap-2">
              <input type="text" value={newAnswer} onChange={e => setNewAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKnowledge()}
                className="flex-1 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="الإجابة: من 9 لـ 5" />
              <button onClick={addKnowledge} disabled={!newQuestion.trim() || !newAnswer.trim()}
                className="bg-emerald-500 hover:bg-emerald-600 text-white p-2.5 rounded-xl transition-all disabled:opacity-40"><Plus size={20} /></button>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute right-3 top-3 text-slate-400" />
            <input value={kbSearch} onChange={e => setKbSearch(e.target.value)} placeholder="بحث في قواعد المعرفة..."
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pr-9 pl-3 text-sm focus:outline-none focus:border-emerald-500" />
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {kbFiltered.length === 0 && (
              <div className="text-center py-6 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-sm">
                <BookOpen size={28} className="mx-auto mb-2 opacity-40" /> {kbSearch ? 'لا نتائج للبحث.' : 'لا توجد قواعد معرفة بعد.'}
              </div>
            )}
            {kbFiltered.map(entry => (
              <div key={entry.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 group">
                {editId === entry.id ? (
                  <div className="space-y-2">
                    <input value={editQ} onChange={e => setEditQ(e.target.value)} className="w-full bg-white border border-slate-200 p-2 rounded-lg text-sm" placeholder="السؤال / الكلمات المفتاحية" />
                    <textarea value={editA} onChange={e => setEditA(e.target.value)} rows={2} className="w-full bg-white border border-slate-200 p-2 rounded-lg text-sm resize-none" placeholder="الإجابة / التعليق" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditId(null)} className="text-xs text-slate-500 px-3 py-1.5 flex items-center gap-1"><X size={13} /> إلغاء</button>
                      <button onClick={() => saveEdit(entry.id)} className="text-xs bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"><Save size={13} /> حفظ</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2"><span className="text-emerald-500 font-bold text-sm">س:</span><p className="text-slate-700 font-medium text-sm">{entry.question}</p></div>
                      <div className="flex items-start gap-2 mt-1">
                        <span className="text-blue-500 font-bold text-sm">ج:</span>
                        {entry.hasAudio ? (
                          <button type="button" onClick={() => playEntryAudio(entry.id)} className="flex items-center gap-1.5 text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-bold">
                            <Play size={13} /> 🎤 تشغيل الرد الصوتي{entry.answer ? ` — ${entry.answer}` : ''}
                          </button>
                        ) : (entry as any).hasMedia ? (
                          <button type="button" onClick={() => previewMedia(entry.id)} className="flex items-center gap-1.5 text-purple-600 bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg text-xs font-bold">
                            <Eye size={13} /> 📎 معاينة المرفق{entry.answer ? ` — ${entry.answer}` : ''}
                          </button>
                        ) : (
                          <p className="text-slate-500 text-sm">{entry.answer}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => startEdit(entry)} className="text-slate-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all p-1" title="تعديل"><Edit2 size={15} /></button>
                      <button onClick={() => deleteKnowledge(entry.id)} className="text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all p-1" title="حذف"><Trash2 size={15} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button onClick={saveConfig} disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 disabled:opacity-50">
          <Save size={18} />{saving ? 'جاري الحفظ...' : 'حفظ إعدادات الجهاز'}
        </button>
      </div>
    </div>
  );
};

export default AIAgentPanel;
