import React, { useState, useEffect } from 'react';
import { Brain, Cpu, BookOpen, Plus, Trash2, Save, AlertCircle, CheckCircle, MessageSquare, Settings2, Smartphone } from 'lucide-react';

interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
}

interface AIAgentConfig {
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
}

interface SessionLite {
  id: string;
  name: string;
  status: string;
}

const DEFAULT_CONFIG: AIAgentConfig = {
  name: 'AI Assistant',
  role: 'مساعد ذكي',
  about: '',
  welcomeMessage: 'مرحباً! كيف يمكنني مساعدتك اليوم؟',
  systemPrompt: 'أنت مساعد ذكي ومفيد.',
  temperature: 0.7,
  aiModel: 'llama-3.3-70b-versatile',
  isActive: false,
  fallbackToAI: true,
  knowledgeBase: []
};

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const AIAgent = () => {
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [config, setConfig] = useState<AIAgentConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'basic' | 'knowledge'>('basic');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  const models = [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — الأذكى (موصى به)' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — الأسرع' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
  ];

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Load the user's sessions for the device selector
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${baseUrl()}/api/sessions`, { headers: authHeaders() });
        if (res.ok) {
          const data: SessionLite[] = await res.json();
          setSessions(data);
          if (data.length > 0) {
            const connected = data.find(s => s.status === 'CONNECTED');
            setSelectedSessionId((connected || data[0]).id);
          } else {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
    })();
  }, []);

  // Load the selected device's agent config
  useEffect(() => {
    if (!selectedSessionId) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${baseUrl()}/api/aiagent?sessionId=${selectedSessionId}`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setConfig(data ? { ...DEFAULT_CONFIG, ...data } : { ...DEFAULT_CONFIG });
        } else {
          setConfig({ ...DEFAULT_CONFIG });
        }
      } catch (e) {
        setConfig({ ...DEFAULT_CONFIG });
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedSessionId]);

  const saveConfig = async () => {
    if (!selectedSessionId) return flash('error', '❌ اختر جهازاً أولاً');
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...config, sessionId: selectedSessionId })
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig({ ...DEFAULT_CONFIG, ...saved });
        flash('success', '✅ تم حفظ إعدادات هذا الجهاز بنجاح');
      } else {
        flash('error', `❌ خطأ: ${await res.text()}`);
      }
    } catch (error: any) {
      flash('error', `❌ خطأ في الشبكة: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!selectedSessionId) return flash('error', '❌ اختر جهازاً أولاً');
    const newStatus = !config.isActive;
    setConfig(prev => ({ ...prev, isActive: newStatus }));
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/toggle`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ isActive: newStatus, sessionId: selectedSessionId })
      });
      if (!res.ok) {
        setConfig(prev => ({ ...prev, isActive: !newStatus }));
        flash('error', `❌ فشل تغيير حالة البوت: ${await res.text()}`);
      }
    } catch (error) {
      setConfig(prev => ({ ...prev, isActive: !newStatus }));
    }
  };

  const addKnowledge = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    if (!selectedSessionId) return flash('error', '❌ اختر جهازاً أولاً');
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/knowledge`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ question: newQuestion.trim(), answer: newAnswer.trim(), sessionId: selectedSessionId })
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(prev => ({ ...prev, _id: saved._id, knowledgeBase: saved.knowledgeBase || [] }));
        setNewQuestion('');
        setNewAnswer('');
      } else {
        flash('error', `❌ فشل إضافة المعرفة: ${await res.text()}`);
      }
    } catch (error: any) {
      flash('error', `❌ خطأ في الشبكة: ${error.message}`);
    }
  };

  const deleteKnowledge = async (entryId: string) => {
    try {
      const res = await fetch(`${baseUrl()}/api/aiagent/knowledge/${entryId}?sessionId=${selectedSessionId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(prev => ({ ...prev, knowledgeBase: saved.knowledgeBase || [] }));
      }
    } catch (error) {
      console.error('Failed to delete knowledge', error);
    }
  };

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Brain className="w-8 h-8 text-emerald-500" />
            الذكاء الاصطناعي (AI Agent)
          </h1>
          <p className="text-slate-500">مساعد ذكي مستقل لكل جهاز — بقواعد معرفة وذاكرة محادثة خاصة به</p>
        </div>
        {selectedSessionId && (
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-slate-600 font-medium">تفعيل البوت:</span>
            <button
              onClick={toggleActive}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>
        )}
      </div>

      {/* Device Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
        <Smartphone size={20} className="text-emerald-500 shrink-0" />
        <span className="text-sm font-bold text-slate-600 shrink-0">الجهاز:</span>
        {sessions.length === 0 ? (
          <span className="text-sm text-slate-400">لا توجد أجهزة — أضف جهازاً من صفحة «الأجهزة» أولاً.</span>
        ) : (
          <select
            value={selectedSessionId}
            onChange={e => setSelectedSessionId(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:outline-none focus:border-emerald-500 font-bold text-slate-700"
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.status === 'CONNECTED' ? 'متصل' : 'غير متصل'})</option>
            ))}
          </select>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {!selectedSessionId ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          <Brain size={40} className="mx-auto mb-3 opacity-30" />
          اختر جهازاً لإعداد المساعد الذكي الخاص به.
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex gap-1 px-4 pt-3 border-b border-slate-100">
              {([['basic', 'إعدادات أساسية', <Settings2 size={16} />], ['knowledge', 'قواعد المعرفة', <BookOpen size={16} />]] as const).map(([id, label, icon]) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${activeTab === id ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  {icon}
                  {label}
                  {id === 'knowledge' && config.knowledgeBase.length > 0 && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full">{config.knowledgeBase.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Basic Settings Tab */}
            {activeTab === 'basic' && (
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1.5">اسم البوت</label>
                    <input
                      type="text"
                      value={config.name}
                      onChange={e => setConfig(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                      placeholder="AI Assistant"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1.5">الموديل</label>
                    <select
                      value={config.aiModel}
                      onChange={e => setConfig(prev => ({ ...prev, aiModel: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                    >
                      {models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      {!models.some(m => m.id === config.aiModel) && config.aiModel && (
                        <option value={config.aiModel}>{config.aiModel} (قديم)</option>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1.5">وظيفة البوت (Role)</label>
                  <input
                    type="text"
                    value={config.role}
                    onChange={e => setConfig(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                    placeholder="مساعد خدمة عملاء"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1.5">عن البوت / النشاط (About)</label>
                  <textarea
                    value={config.about}
                    onChange={e => setConfig(prev => ({ ...prev, about: e.target.value }))}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500 resize-none"
                    placeholder="نبذة عن شركتك أو نشاطك التجاري..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1.5">رسالة الترحيب</label>
                  <input
                    type="text"
                    value={config.welcomeMessage}
                    onChange={e => setConfig(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                    placeholder="مرحباً! كيف يمكنني مساعدتك؟"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-1.5">التعليمات الأساسية (System Prompt)</label>
                  <textarea
                    value={config.systemPrompt}
                    onChange={e => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500 resize-none text-sm"
                    placeholder="أنت مساعد ذكي ومفيد..."
                  />
                  <p className="text-xs text-slate-400 mt-1">تحكم في شخصية البوت وأسلوبه. قواعد المعرفة تُضاف تلقائياً.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1.5">درجة الإبداع: {config.temperature}</label>
                    <input
                      type="range" min="0" max="2" step="0.1"
                      value={config.temperature}
                      onChange={e => setConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                      className="w-full accent-emerald-500"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1"><span>دقيق</span><span>إبداعي</span></div>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <span className="text-sm text-slate-600 font-medium">الرد الذكي على كل الرسائل:</span>
                      <button
                        onClick={() => setConfig(prev => ({ ...prev, fallbackToAI: !prev.fallbackToAI }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.fallbackToAI ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.fallbackToAI ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Knowledge Base Tab */}
            {activeTab === 'knowledge' && (
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-500">أضف أسئلة وأجوبة ليتعلّم البوت عن نشاطك ويرد بدقة (خاصة بهذا الجهاز فقط).</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">السؤال</label>
                    <input
                      type="text"
                      value={newQuestion}
                      onChange={e => setNewQuestion(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                      placeholder="ما هي ساعات العمل؟"
                      onKeyDown={e => e.key === 'Enter' && addKnowledge()}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">الإجابة</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newAnswer}
                        onChange={e => setNewAnswer(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
                        placeholder="من 9 صباحاً حتى 5 مساءً"
                        onKeyDown={e => e.key === 'Enter' && addKnowledge()}
                      />
                      <button
                        onClick={addKnowledge}
                        disabled={!newQuestion.trim() || !newAnswer.trim()}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white p-3 rounded-xl transition-all disabled:opacity-40"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {config.knowledgeBase.length === 0 && (
                    <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                      <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm">لا توجد قواعد معرفة لهذا الجهاز بعد.</p>
                    </div>
                  )}
                  {config.knowledgeBase.map(entry => (
                    <div key={entry.id} className="flex gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <span className="text-emerald-500 font-bold mt-0.5">س:</span>
                          <p className="text-slate-700 font-medium text-sm">{entry.question}</p>
                        </div>
                        <div className="flex items-start gap-2 mt-1">
                          <span className="text-blue-500 font-bold mt-0.5">ج:</span>
                          <p className="text-slate-500 text-sm">{entry.answer}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteKnowledge(entry.id)}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all p-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-700 flex items-center gap-2 mb-3">
              <Cpu size={18} className="text-emerald-500" /> كيف يعمل؟
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-500">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><b className="text-emerald-600">1.</b> تصل رسالة من العميل لهذا الجهاز.</div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><b className="text-emerald-600">2.</b> يقرأ البوت سياق المحادثة + قواعد المعرفة الخاصة بالجهاز.</div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200"><b className="text-emerald-600">3.</b> يرد تلقائياً عبر Groq AI بشكل مناسب.</div>
            </div>
          </div>

          {/* Save */}
          <div className="flex justify-end sticky bottom-4">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={20} />
              {saving ? 'جاري الحفظ...' : 'حفظ إعدادات هذا الجهاز'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AIAgent;
