import React from 'react';
import { NavLink } from 'react-router-dom';
import { Send, Users, Settings, LogOut, Smartphone, X, Calendar, ChevronRight, Globe, LayoutDashboard, CreditCard, LifeBuoy } from 'lucide-react';
import { useLang } from '../../i18n';
import { BrandMark } from '../Logo';

interface SidebarProps {
    onLogout: () => void;
    isOpen: boolean;
    onClose: () => void;
    systemName: string;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, isOpen, onClose, systemName, collapsed, onToggleCollapse }) => {
    const { t, lang, toggle } = useLang();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const isAdmin = user.role === 'admin';

    const allLinks: { to: string; icon: React.ReactNode; label: string; permission?: string }[] = [
        { to: '/devices', icon: <Smartphone size={20} />, label: t('devices'), permission: 'devices' },
        { to: '/campaigns', icon: <Send size={20} />, label: t('campaigns'), permission: 'campaigns' },
        { to: '/scheduled-campaigns', icon: <Calendar size={20} />, label: t('scheduled'), permission: 'scheduled_campaigns' },
    ];

    const links = allLinks.filter(link => {
        if (isAdmin) return true;
        // Strict Permission Check:
        // If user has 'permissions' array defined (even if empty), we respect it.
        // We only allow "fall-through" if permissions is UNDEFINED (true legacy).
        if (user.permissions === undefined || user.permissions === null) return true;

        return user.permissions.includes(link.permission);
    });

    // Home/dashboard is always visible (no permission gate)
    links.unshift({ to: '/', icon: <LayoutDashboard size={20} />, label: t('dashboard') });

    // Subscriptions — visible to everyone
    links.push({ to: '/subscriptions', icon: <CreditCard size={20} />, label: t('subscriptions') });

    // Technical support — visible to everyone
    links.push({ to: '/support', icon: <LifeBuoy size={20} />, label: t('support') });

    if (isAdmin) {
        links.push({ to: '/users', icon: <Users size={20} />, label: t('users') });
        links.push({ to: '/settings', icon: <Settings size={20} />, label: t('settings') });
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div className={`
                fixed top-0 right-0 h-screen w-64 bg-emerald-900 text-emerald-100/80
                flex flex-col border-l border-emerald-800 z-50 shadow-2xl
                transition-transform duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : 'translate-x-full'}
                ${collapsed ? 'md:translate-x-full' : 'md:translate-x-0'} md:shadow-none
            `}>
                <div className="p-6 border-b border-emerald-800 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center shrink-0"><BrandMark className="w-7 h-7" /></span>
                        {systemName}
                    </h1>
                    <div className="flex items-center gap-1">
                        {/* Collapse (desktop) */}
                        <button
                            onClick={onToggleCollapse}
                            title={t('collapse_menu')}
                            className="hidden md:block text-emerald-200 hover:text-white p-1 rounded-lg hover:bg-emerald-800 transition-colors"
                        >
                            <ChevronRight size={22} />
                        </button>
                        {/* Close (mobile) */}
                        <button
                            onClick={onClose}
                            className="md:hidden text-emerald-200 hover:text-white p-1 rounded-lg hover:bg-emerald-800 transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="p-4 border-b border-emerald-800 bg-emerald-800/40">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                            ${isAdmin ? 'bg-amber-400 text-emerald-900' : 'bg-white text-emerald-700'}`}>
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-white font-medium truncate">{user.name}</p>
                            <p className="text-xs text-emerald-200/70 truncate">{user.email}</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                    {links.map((link) => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            end={link.to === '/'}
                            onClick={() => onClose()} // Close on navigate on mobile
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                    ? 'bg-white/15 text-white font-bold shadow-sm'
                                    : 'hover:bg-emerald-800 hover:text-white'
                                }`
                            }
                        >
                            {link.icon}
                            <span>{link.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-emerald-800 space-y-2">
                    <button
                        onClick={toggle}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-emerald-100/90 hover:bg-emerald-800 hover:text-white transition-all font-bold"
                    >
                        <Globe size={20} />
                        <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-red-200 hover:bg-red-500/20 hover:text-white transition-all font-bold"
                    >
                        <LogOut size={20} />
                        <span>{t('logout')}</span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
