import React, { useState, useEffect } from 'react';
import { Check, Smartphone, MessageSquare, Megaphone, CalendarClock, Sparkles, Crown, Star, X, MessageCircle } from 'lucide-react';
import { detectRegion, regionPrice, CONTACTS, Region } from '../lib/region';

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');
const fmt = (n: number) => (Number(n) > 0 ? Number(n).toLocaleString('en-US') : 'بلا حدود');

const Subscriptions = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [region, setRegion] = useState<Region>('EG');
  const [loading, setLoading] = useState(true);
  const [contactPlan, setContactPlan] = useState<any | null>(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    (async () => {
      try {
        setRegion(await detectRegion());
        const [pRes, meRes] = await Promise.all([
          fetch(`${baseUrl()}/api/plans`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${baseUrl()}/api/me`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (pRes.ok) setPlans(await pRes.json());
        if (meRes.ok) { const me = await meRes.json(); setCurrentPlanId(me.planId || ''); }
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, []);

  // WhatsApp deep-link with a prefilled message for the chosen plan
  const waLink = (phone: string, plan: any) => {
    const p = regionPrice(plan, region, cycle);
    const priceTxt = p.amount > 0 ? ` (${p.amount.toLocaleString('en-US')} ${p.currency} / ${cycle === 'monthly' ? 'شهرياً' : 'سنوياً'})` : '';
    const text = encodeURIComponent(`السلام عليكم، أرغب في الاشتراك في باقة "${plan.name}"${priceTxt}.`);
    return `https://wa.me/${phone}?text=${text}`;
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center max-w-2xl mx-auto pt-2">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full text-sm font-bold mb-4">
          <Sparkles size={16} /> باقات الاشتراك
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800">اختر الباقة المناسبة لأعمالك</h2>
        <p className="text-slate-500 mt-3">كل الباقات تشمل الذكاء الاصطناعي وقواعد المعرفة. ارقَ في أي وقت كلما كبر عملك.</p>

        {/* Billing toggle */}
        <div className="inline-flex items-center bg-white border border-slate-200 rounded-2xl p-1.5 mt-6 shadow-sm">
          <button onClick={() => setCycle('monthly')}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${cycle === 'monthly' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
            شهري
          </button>
          <button onClick={() => setCycle('yearly')}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${cycle === 'yearly' ? 'bg-emerald-500 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}>
            سنوي
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${cycle === 'yearly' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600'}`}>وفّر حتى شهرين</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" /></div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">لا توجد باقات متاحة حالياً.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
          {plans.map((p) => {
            const isCurrent = currentPlanId && p._id === currentPlanId;
            const m = regionPrice(p, region, 'monthly');
            const y = regionPrice(p, region, 'yearly');
            const price = cycle === 'monthly' ? m.amount : y.amount;
            const currency = cycle === 'monthly' ? m.currency : y.currency;
            const isFree = Number(price) <= 0;
            const monthlyEquiv = cycle === 'yearly' && y.amount > 0 ? Math.round(y.amount / 12) : null;
            const yearlySaving = m.amount > 0 && y.amount > 0 ? (m.amount * 12 - y.amount) : 0;

            const limits = [
              { icon: <Smartphone size={16} />, label: 'الأجهزة المرتبطة', value: fmt(p.maxSessions) },
              { icon: <MessageSquare size={16} />, label: 'المحادثات / شهر', value: fmt(p.maxConversations) },
              { icon: <Megaphone size={16} />, label: 'رسائل الحملات / شهر', value: fmt(p.maxCampaignMessages) },
              { icon: <CalendarClock size={16} />, label: 'الحملات المجدولة', value: fmt(p.maxScheduled) },
            ];

            return (
              <div key={p._id}
                className={`relative bg-white rounded-3xl border shadow-sm flex flex-col transition-all hover:-translate-y-1 hover:shadow-lg
                  ${p.popular ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-emerald-100' : 'border-slate-200'}`}>

                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-l from-emerald-500 to-emerald-600 text-white text-xs font-extrabold px-4 py-1.5 rounded-full shadow flex items-center gap-1">
                    <Star size={13} className="fill-white" /> الأكثر اختياراً
                  </div>
                )}

                <div className="p-7 pb-5 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                      {p.popular && <Crown size={18} className="text-amber-400" />}
                      {p.name}
                    </h3>
                    {isCurrent && (
                      <span className="bg-emerald-100 text-emerald-700 text-[11px] font-extrabold px-2.5 py-1 rounded-full">باقتك الحالية</span>
                    )}
                  </div>

                  <div className="flex items-end gap-1.5">
                    {isFree ? (
                      <span className="text-4xl font-extrabold text-slate-800">مجاناً</span>
                    ) : (
                      <>
                        <span className="text-4xl font-extrabold text-slate-800">{Number(price).toLocaleString('en-US')}</span>
                        <span className="text-slate-500 font-bold mb-1">{currency}</span>
                        <span className="text-slate-400 text-sm mb-1.5">/ {cycle === 'monthly' ? 'شهرياً' : 'سنوياً'}</span>
                      </>
                    )}
                  </div>
                  {cycle === 'yearly' && !isFree && monthlyEquiv && (
                    <p className="text-xs text-slate-400 mt-1">أي ما يعادل {monthlyEquiv.toLocaleString('en-US')} {currency} شهرياً</p>
                  )}
                  {cycle === 'yearly' && yearlySaving > 0 && (
                    <p className="text-xs text-emerald-600 font-bold mt-1">توفّر {yearlySaving.toLocaleString('en-US')} {currency} سنوياً</p>
                  )}
                </div>

                {/* Limits */}
                <div className="p-7 pt-5 space-y-3">
                  {limits.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-500">
                        <span className="text-emerald-500">{l.icon}</span> {l.label}
                      </span>
                      <span className="font-extrabold text-slate-700">{l.value}</span>
                    </div>
                  ))}
                </div>

                {/* Features */}
                {(p.features || []).length > 0 && (
                  <div className="px-7 pb-5 space-y-2.5 flex-1">
                    <div className="h-px bg-slate-100 mb-4" />
                    {p.features.map((f: string, i: number) => (
                      <div key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                        <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                          <Check size={13} strokeWidth={3} />
                        </span>
                        {f}
                      </div>
                    ))}
                  </div>
                )}

                {/* CTA */}
                <div className="p-7 pt-3 mt-auto">
                  {isCurrent ? (
                    <button disabled className="w-full py-3 rounded-xl font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default">
                      باقتك الحالية ✓
                    </button>
                  ) : (
                    <button
                      onClick={() => setContactPlan(p)}
                      className={`w-full py-3 rounded-xl font-bold transition-all ${p.popular
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                      اشترك الآن
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-slate-400 pt-2">الأسعار غير شاملة ضريبة القيمة المضافة. الترقية والتخصيص متاحان عبر إدارة النظام.</p>

      {/* Subscribe / contact modal */}
      {contactPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" dir="rtl" onClick={() => setContactPlan(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md p-7 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setContactPlan(null)} className="absolute top-5 left-5 text-slate-400 hover:text-slate-600"><X /></button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3"><MessageCircle size={26} /></div>
              <h3 className="text-xl font-extrabold text-slate-800">الاشتراك في باقة {contactPlan.name}</h3>
              <p className="text-slate-500 text-sm mt-1">تواصل مع إدارة البرنامج لتفعيل اشتراكك عبر واتساب</p>
            </div>

            <div className="space-y-3">
              {(['EG', 'SA'] as Region[]).map(r => {
                const c = CONTACTS[r];
                return (
                  <a key={r} href={waLink(c.phone, contactPlan)} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all group">
                    <span className="flex items-center gap-3">
                      <span className="text-2xl">{c.flag}</span>
                      <span>
                        <span className="block font-bold text-slate-800">إدارة {c.label}</span>
                        <span className="block text-sm text-slate-500" dir="ltr">{c.display}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm bg-emerald-100 group-hover:bg-emerald-500 group-hover:text-white px-3 py-2 rounded-xl transition-all">
                      <MessageCircle size={16} /> واتساب
                    </span>
                  </a>
                );
              })}
            </div>

            <p className="text-center text-xs text-slate-400 mt-5">سيتم فتح محادثة واتساب برسالة جاهزة عن الباقة المختارة.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
