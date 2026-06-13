import React, { useState, useEffect } from 'react';
import { Bot, Brain, Cpu, BookOpen, Plus, Trash2, Save, Power, AlertCircle, CheckCircle, MessageSquare, Settings2 } from 'lucide-react';

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

const DEFAULT_CONFIG: AIAgentConfig = {
  name: 'AI Assistant',
  role: 'مساعد ذكي',
  about: '',
  welcomeMessage: 'مرحباً! كيف يمكنني مساعدتك اليوم؟',
  systemPrompt: 'أنت مساعد ذكي ومفيد.',
  temperature: 0.7,
  aiModel: 'llama3-70b-8192',
  isActive: false,
  fallbackToAI: false,
  knowledgeBase: []
};

const AIAgent = () => {
  const [config, setConfig] = useState<AIAgentConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/aiagent`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data) setConfig(data);
      }
    } catch (error) {
      console.error('Failed to fetch AI agent config', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/aiagent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(saved);
        setMessage({ type: 'success', text: '✅ تم حفظ إعدادات الذكاء الاصطناعي بنجاح' });
      } else {
        const err = await res.text();
        setMessage({ type: 'error', text: `❌ خطأ: ${err}` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: `❌ خطأ في الشبكة: ${error.message}` });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const toggleActive = async () => {
    const newStatus = !config.isActive;
    setConfig(prev => ({ ...prev, isActive: newStatus }));
    try {
      const token = localStorage.getItem('token');
      const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
      await fetch(`${baseUrl}/api/aiagent/toggle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: newStatus })
      });
    } catch (error) {
      setConfig(prev => ({ ...prev, isActive: !newStatus }));
    }
  };

  const addKnowledge = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      const token = localStorage.getItem('token');
      const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/aiagent/knowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ question: newQuestion.trim(), answer: newAnswer.trim() })
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(saved);
        setNewQuestion('');
        setNewAnswer('');
      }
    } catch (error) {
      console.error('Failed to add knowledge', error);
    }
  };

  const deleteKnowledge = async (entryId: string) => {
    try {
      const token = localStorage.getItem('token');
      const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/aiagent/knowledge/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const saved = await res.json();
        setConfig(saved);
      }
    } catch (error) {
      console.error('Failed to delete knowledge', error);
    }
  };

  const models = ['llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Brain className="w-8 h-8 text-emerald-500" />
            الذكاء الاصطناعي (AI Agent)
          </h1>
          <p className="text-slate-500">إعدادات المساعد الذكي للرد التلقائي على الرسائل</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-slate-600 font-medium">تفعيل البوت:</span>
            <button
              onClick={toggleActive}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          {message.text}
        </div>
      )}

      {/* Main Settings */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <Settings2 size={20} className="text-emerald-500" />
            الإعدادات الأساسية
          </h2>
        </div>
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
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1.5">وظيفتك (Role)</label>
            <input
              type="text"
              value={config.role}
              onChange={e => setConfig(prev => ({ ...prev, role: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500"
              placeholder="مساعد ذكي"
            />
            <p className="text-xs text-slate-400 mt-1">يعرّف البوت للعملاء: "أنا مساعد ذكي لـ..."</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-500 mb-1.5">عن البوت (About)</label>
            <textarea
              value={config.about}
              onChange={e => setConfig(prev => ({ ...prev, about: e.target.value }))}
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500 resize-none"
              placeholder="أنا مساعد آلي أقدم الدعم الفني والإجابة على الاستفسارات..."
            />
            <p className="text-xs text-slate-400 mt-1">وصف مختصر عن البوت ووظيفته</p>
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
            <label className="block text-sm font-medium text-slate-500 mb-1.5">
              التعليمات الأساسية (System Prompt)
            </label>
            <textarea
              value={config.systemPrompt}
              onChange={e => setConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500 resize-none font-mono text-sm"
              placeholder="أنت مساعد ذكي ومفيد..."
            />
            <p className="text-xs text-slate-400 mt-1">هذه التعليمات تحكم سلوك البوت بالكامل. ستتم إضافة قواعد المعرفة تلقائياً.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-1.5">درجة الإبداع (Temperature)</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={e => setConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-emerald-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>دقيق {config.temperature}</span>
                <span>إبداعي</span>
              </div>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-sm text-slate-600 font-medium">تفعيل الرد بالذكاء الاصطناعي:</span>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, fallbackToAI: !prev.fallbackToAI }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.fallbackToAI ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${config.fallbackToAI ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>
            </div>
          </div>
          {config.fallbackToAI && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-sm flex items-center gap-2">
              <MessageSquare size={16} />
              سيتم الرد تلقائياً على أي رسالة لا تطابق قواعد الرد الآلي باستخدام الذكاء الاصطناعي
            </div>
          )}
        </div>
      </div>

      {/* Knowledge Base */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <BookOpen size={20} className="text-emerald-500" />
            قواعد المعرفة
          </h2>
          <p className="text-sm text-slate-500 mt-1">أضف أسئلة وأجوبة لتعليم البوت عن عملك وخدماتك</p>
        </div>

        <div className="p-6 space-y-4">
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
                  placeholder="ساعات العمل من 9 صباحاً..."
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
                <p className="text-sm">لا توجد قواعد معرفة بعد. أضف أسئلة وأجوبة لتعليم البوت.</p>
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
      </div>

      {/* How it works */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
            <Cpu size={20} className="text-emerald-500" />
            كيف يعمل النظام؟
          </h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-emerald-500 font-bold text-lg mb-1">1</div>
              <h3 className="font-bold text-slate-700 text-sm mb-1">استقبال الرسالة</h3>
              <p className="text-xs text-slate-500">يتم استقبال رسالة واتساب من العميل</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-emerald-500 font-bold text-lg mb-1">2</div>
              <h3 className="font-bold text-slate-700 text-sm mb-1">البحث في القواعد</h3>
              <p className="text-xs text-slate-500">يبحث أولاً في قواعد الرد الآلي (Keywords). إذا وجد تطابق، يرسل الرد المحدد.</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-emerald-500 font-bold text-lg mb-1">3</div>
              <h3 className="font-bold text-slate-700 text-sm mb-1">الذكاء الاصطناعي</h3>
              <p className="text-xs text-slate-500">إذا لم يجد تطابقاً والـ AI مفعّل، يرسل الرسالة إلى Groq API مع قواعد المعرفة ويُعيد الرد الذكي.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end sticky bottom-4">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>
    </div>
  );
};

export default AIAgent;
