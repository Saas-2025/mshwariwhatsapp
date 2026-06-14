import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, User, Lock, AlertCircle, Bot, Eye, EyeOff } from 'lucide-react';

interface LoginProps {
    onLogin: () => void;
    systemName: string;
}

const Login: React.FC<LoginProps> = ({ onLogin, systemName }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
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
            console.log('Login Response:', response.status, text);

            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('JSON Parse Error:', e);
                throw new Error(`Server Error (${response.status}): ${text.substring(0, 100)}`);
            }

            if (!response.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

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
        <div
            className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/40 to-slate-100"
            dir="rtl"
        >
            {/* Soft decorative blobs */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-200/40 rounded-full blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-100/50 rounded-full blur-3xl" />

            <div className="relative w-full max-w-md">
                {/* Brand */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30 mb-4">
                        <Bot className="w-9 h-9 text-white" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">{systemName}</h1>
                    <p className="text-slate-500 mt-1">لوحة التحكم — سجّل دخولك للمتابعة</p>
                </div>

                {/* Card */}
                <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xl shadow-slate-200/60">
                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl mb-6 flex items-center gap-3">
                            <AlertCircle size={20} className="shrink-0" />
                            <span className="text-sm font-medium">{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">اسم المستخدم</label>
                            <div className="relative">
                                <User className="absolute right-3 top-3.5 text-slate-400" size={20} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 pr-11 pl-4 py-3 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                                    placeholder="اسم المستخدم أو البريد الإلكتروني"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1.5">كلمة المرور</label>
                            <div className="relative">
                                <Lock className="absolute right-3 top-3.5 text-slate-400" size={20} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 pr-11 pl-11 py-3 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(s => !s)}
                                    className="absolute left-3 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <LogIn size={20} />
                                    <span>دخول</span>
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center text-slate-400 text-xs mt-6">
                    © {systemName} — جميع الحقوق محفوظة
                </p>
            </div>
        </div>
    );
};

export default Login;
