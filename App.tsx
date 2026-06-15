import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './src/components/Layout/Sidebar';
import Login from './src/pages/Login';
import Users from './src/pages/Users';

import Devices from './src/pages/Devices';
import Campaigns from './src/pages/Campaigns';
import ScheduledCampaigns from './src/pages/ScheduledCampaigns';
import SessionDetail from './src/pages/SessionDetail';
import Dashboard from './src/pages/Dashboard';
import Settings from './src/pages/Settings';
import Subscriptions from './src/pages/Subscriptions';
import Support from './src/pages/Support';
import ApiDocs from './src/pages/ApiDocs';
import { Menu } from 'lucide-react';
import { useLang } from './src/i18n';
import { BrandMark } from './src/components/Logo';

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('token');
  });
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'qr' | 'connected' | 'error'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);
  const [systemName, setSystemName] = useState('SaaSBot');

  useEffect(() => {
    // Fetch System Settings
    let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3050';
    if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);
    fetch(`${apiUrl}/api/settings`)
      .then(res => res.json())
      .then(data => {
        if (data.systemName) {
          setSystemName(data.systemName);
          document.title = data.systemName;
        }
      })
      .catch(err => console.error('Failed to fetch settings:', err));

    // Wake up backend on initial load (Render Free Tier Sleep)
    fetch(`${apiUrl}/api/health-check`)
      .then(() => console.log('Backend woken up'))
      .catch(() => console.log('Backend waking up...'));

    const token = localStorage.getItem('token');
    if (isAuthenticated && token) {
      const newSocket = io(apiUrl, {
        auth: { token }
      });
      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Socket connected');
        setStatus('connected');
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setStatus('disconnected');
      });

      newSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setStatus('error');
        if (err.message === 'Authentication error') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('isLoggedIn');
          setIsAuthenticated(false);
        }
      });

      newSocket.on('session-status', ({ status }: any) => {
        // Global status listener
      });

      return () => {
        newSocket.disconnect();
      };
    }
  }, [isAuthenticated]);

  const handleAppLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('isLoggedIn');
    if (socket) socket.disconnect();
  };

  // Layout for authenticated pages
  const DashboardLayout = () => {
    if (!isAuthenticated) return <Navigate to="/login" replace />;

    const { dir, t } = useLang();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1');
    const toggleCollapsed = () => setCollapsed(c => {
      const n = !c;
      localStorage.setItem('sidebarCollapsed', n ? '1' : '0');
      return n;
    });

    return (
      <div className="flex bg-slate-50 min-h-screen font-sans" dir={dir}>
        <Sidebar
          onLogout={handleAppLogout}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          systemName={systemName}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />

        <main className={`flex-1 transition-all duration-300 overflow-hidden ${collapsed ? 'md:mr-0' : 'md:mr-64'}`}>
          {/* Mobile Header */}
          <div className="md:hidden bg-emerald-900 text-white p-4 flex justify-between items-center sticky top-0 z-30 shadow-md">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0"><BrandMark className="w-6 h-6" /></span>
              {systemName}
            </h1>
            <button onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
          </div>

          {/* Desktop: reopen button shown when the menu is collapsed */}
          {collapsed && (
            <button
              onClick={toggleCollapsed}
              title={t('open_menu')}
              className="hidden md:flex fixed top-4 right-4 z-40 bg-emerald-900 text-white p-2.5 rounded-xl shadow-lg hover:bg-emerald-800 transition-colors"
            >
              <Menu size={20} />
            </button>
          )}

          <div className="p-4 md:p-8 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    );
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login systemName={systemName} onLogin={() => {
          setIsAuthenticated(true);
        }} />} />

        <Route element={<DashboardLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/devices" element={<Devices socket={socket} />} />
          <Route path="/devices/:sessionId" element={<SessionDetail socket={socket} />} />
          <Route path="/campaigns" element={<Campaigns socket={socket} />} />
          <Route path="/scheduled-campaigns" element={<ScheduledCampaigns />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/support" element={<Support />} />
          <Route path="/api" element={<ApiDocs />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
