import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Lock, AlertCircle, Eye, EyeOff, Bot, BookOpen, Send, Users, BarChart3, Plug, Check, MessageCircle, Sparkles } from 'lucide-react';
import { useLang } from '../i18n';
import { BrandMark } from '../components/Logo';
import { CONTACTS } from '../lib/region';

interface LoginProps {
    onLogin: () => void;
    systemName: string;
}

const FEATURES = [
    { icon: Bot, text: 'رد آلي بالذكاء الاصطناعي على واتساب وفيسبوك' },
    { icon: BookOpen, text: 'قواعد معرفة بالنص والملفات والرسائل الصوتية' },
    { icon: Send, text: 'حملات جماعية وجدولة ذكية للرسائل' },
    { icon: Users, text: 'فئات العملاء واستهداف الحملات بدقة' },
    { icon: BarChart3, text: 'لوحة تحكم وتحليلات لحظية' },
    { icon: Plug, text: 'ربط برمجي (API) وتصدير Postman' },
];

const Login: React.FC<LoginProps> = ({ onLogin, systemName }) => {
    const { t, dir } = useLang();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [logoBroken, setLogoBroken] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            let API_URL = import.meta.env.VITE_API_URL || '';
            if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
            const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const text = await response.text();
            let data;
            try { data = JSON.parse(text); }
            catch { throw new Error(`Server Error (${response.status}): ${text.substring(0, 100)}`); }
            if (!response.ok) throw new Error(data.error || 'Authentication failed');
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            onLogin();
            navigate('/');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-slate-50" dir={dir}>
            {/* ===== Brand / features panel (desktop) — 2/3, centered content ===== */}
            <div className="hidden lg:flex lg:w-2/3 relative overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-800 text-white p-12 flex-col items-center justify-center text-center">
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-2xl" />
                <div className="absolute bottom-0 -right-20 w-80 h-80 bg-emerald-400/20 rounded-full blur-2xl" />

                <div className="relative w-full max-w-md flex flex-col items-center">
                    {/* Logo (bigger + clearer) */}
                    <div className="inline-flex items-center justify-center bg-white rounded-3xl p-6 shadow-2xl mb-7">
                        {!logoBroken
                            ? <img src="/logo.png" alt={systemName} onError={() => setLogoBroken(true)} className="max-h-36 w-auto object-contain" />
                            : <BrandMark className="w-28 h-28" />}
                    </div>
                    <h1 className="text-4xl font-extrabold tracking-tight">{systemName}</h1>
                    <p className="text-emerald-50/90 mt-3 leading-relaxed max-w-sm">منصّتك المتكاملة للرد الآلي بالذكاء الاصطناعي وإدارة حملات واتساب وفيسبوك باحتراف.</p>

                    {/* Features (centered) */}
                    <div className="space-y-3 my-9 w-full">
                        {FEATURES.map((f, i) => (
                            <div key={i} className="flex items-center justify-center gap-3">
                                <span className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0"><f.icon size={18} /></span>
                                <span className="text-sm text-emerald-50/95">{f.text}</span>
                            </div>
                        ))}
                    </div>

                    {/* Contacts (centered) */}
                    <div className="w-full">
                        <p className="text-xs font-bold text-emerald-100/80 mb-3 flex items-center justify-center gap-2"><MessageCircle size={14} /> للاشتراك والدعم تواصل معنا</p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                            {(['EG', 'SA'] as const).map(r => {
                                const c = CONTACTS[r];
                                return (
                                    <a key={r} href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-2.5 bg-white/10 hover:bg-white/20 transition-colors rounded-xl px-3.5 py-2.5 flex-1 text-right">
                                        <span className="text-xl">{c.flag}</span>
                                        <span className="leading-tight">
                                            <span className="block text-[11px] text-emerald-100/80">إدارة {c.label}</span>
                                            <span className="block text-sm font-bold" dir="ltr">{c.display}</span>
                                        </span>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== Form panel — 1/3 (left) ===== */}
            <div className="flex-1 lg:w-1/3 flex items-center justify-center p-4 relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-80 h-80 bg-emerald-100/50 rounded-full blur-3xl lg:hidden" />
                <div className="relative w-full max-w-md">
                    {/* Mobile logo */}
                    <div className="text-center mb-6 lg:hidden">
                        {!logoBroken
                            ? <img src="/logo.png" alt={systemName} onError={() => setLogoBroken(true)} className="mx-auto max-h-24 object-contain" />
                            : <div className="inline-flex bg-white rounded-2xl p-3 shadow-lg border border-emerald-100"><BrandMark className="w-14 h-14" /></div>}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xl shadow-slate-200/60">
                        <div className="mb-6">
                            <h2 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2"><Sparkles size={20} className="text-emerald-500" /> تسجيل الدخول</h2>
                            <p className="text-slate-500 text-sm mt-1">{t('login_subtitle')}</p>
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl mb-6 flex items-center gap-3">
                                <AlertCircle size={20} className="shrink-0" />
                                <span className="text-sm font-medium">{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">{t('username')}</label>
                                <div className="relative">
                                    <User className="absolute right-3 top-3.5 text-slate-400" size={20} />
                                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 pr-11 pl-4 py-3 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                                        placeholder={t('username_ph')} required />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1.5">{t('password')}</label>
                                <div className="relative">
                                    <Lock className="absolute right-3 top-3.5 text-slate-400" size={20} />
                                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 text-slate-800 pr-11 pl-11 py-3 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                                        placeholder="••••••••" required />
                                    <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute left-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </div>

                            <button type="submit" disabled={loading}
                                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25">
                                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><LogIn size={20} /><span>{t('signin')}</span></>}
                            </button>
                        </form>

                        {/* Mobile features + contacts */}
                        <div className="lg:hidden mt-6 pt-6 border-t border-slate-100">
                            <div className="grid grid-cols-1 gap-2 mb-4">
                                {FEATURES.slice(0, 4).map((f, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                                        <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3} /></span>
                                        {f.text}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                {(['EG', 'SA'] as const).map(r => {
                                    const c = CONTACTS[r];
                                    return (
                                        <a key={r} href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer"
                                            className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 rounded-xl py-2 text-xs font-bold">
                                            {c.flag} {c.label}
                                        </a>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <p className="text-center text-slate-400 text-xs mt-6">© {systemName} — {t('rights')}</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
