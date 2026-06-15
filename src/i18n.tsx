import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'ar' | 'en';

// Shell/common translations. Page bodies can adopt t() incrementally.
const dict: Record<string, { ar: string; en: string }> = {
  dashboard: { ar: 'الرئيسية', en: 'Dashboard' },
  devices: { ar: 'الأجهزة المتصلة', en: 'Devices' },
  campaigns: { ar: 'إرسال الحملات', en: 'Campaigns' },
  scheduled: { ar: 'جدولة الحملات', en: 'Scheduled' },
  subscriptions: { ar: 'الاشتراكات', en: 'Subscriptions' },
  support: { ar: 'الدعم الفني', en: 'Support' },
  users: { ar: 'المستخدمين', en: 'Users' },
  settings: { ar: 'الإعدادات', en: 'Settings' },
  logout: { ar: 'تسجيل الخروج', en: 'Log out' },
  collapse_menu: { ar: 'طيّ القائمة', en: 'Collapse menu' },
  open_menu: { ar: 'فتح القائمة', en: 'Open menu' },

  // Login
  login_subtitle: { ar: 'لوحة التحكم — سجّل دخولك للمتابعة', en: 'Dashboard — sign in to continue' },
  username: { ar: 'اسم المستخدم', en: 'Username' },
  password: { ar: 'كلمة المرور', en: 'Password' },
  username_ph: { ar: 'اسم المستخدم أو البريد الإلكتروني', en: 'Username or email' },
  signin: { ar: 'دخول', en: 'Sign in' },
  rights: { ar: 'جميع الحقوق محفوظة', en: 'All rights reserved' },
};

interface Ctx { lang: Lang; setLang: (l: Lang) => void; toggle: () => void; t: (key: string) => string; dir: 'rtl' | 'ltr'; }
const LangContext = createContext<Ctx>({ lang: 'ar', setLang: () => { }, toggle: () => { }, t: (k) => k, dir: 'rtl' });

export const LangProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => ((localStorage.getItem('lang') as Lang) || 'ar'));
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem('lang', lang);
  }, [lang, dir]);

  const setLang = (l: Lang) => setLangState(l);
  const toggle = () => setLangState(l => (l === 'ar' ? 'en' : 'ar'));
  const t = (key: string) => (dict[key] ? dict[key][lang] : key);

  return <LangContext.Provider value={{ lang, setLang, toggle, t, dir }}>{children}</LangContext.Provider>;
};

export const useLang = () => useContext(LangContext);
