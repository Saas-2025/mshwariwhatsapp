/* Generates a self-contained, print-ready marketing brochure (HTML) with the logo embedded.
   Font: Cairo (Google Fonts). No emoji — inline SVG icons. Prices in SAR. */
const fs = require('fs');
const path = require('path');

const logoB64 = fs.readFileSync(path.join(__dirname, '..', 'public', 'logo.png')).toString('base64');
const LOGO = `data:image/png;base64,${logoB64}`;

const CONTACT_EG = '+20 109 395 7856';
const CONTACT_SA = '+966 53 485 9975';
const WA_EG = '201093957856';
const WA_SA = '966534859975';

const svg = (inner) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICONS = {
  chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  mic: svg('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>'),
  megaphone: svg('<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'),
  tag: svg('<path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/>'),
  chart: svg('<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>'),
  bell: svg('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
  plug: svg('<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>'),
  lifebuoy: svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" x2="9.17" y1="4.93" y2="9.17"/><line x1="14.83" x2="19.07" y1="14.83" y2="19.07"/><line x1="14.83" x2="19.07" y1="9.17" y2="4.93"/><line x1="9.17" x2="4.93" y1="14.83" y2="19.07"/>'),
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
};

const features = [
  ['chat', 'رد آلي بالذكاء الاصطناعي', 'يرد على عملائك فوراً على واتساب وفيسبوك بأسلوب بشري طبيعي وبلهجتك، ويفهم نية العميل ويجاوب على أسئلته دون تدخل منك.'],
  ['book', 'قواعد معرفة متكاملة', 'علّم البوت من ملفاتك (PDF / Word) ونصوصك وأسئلتك الشائعة، وحدّد ردوداً جاهزة — نصية أو صوتية أو بمرفقات — يرسلها عند الحاجة.'],
  ['mic', 'يفهم الرسائل الصوتية', 'يحوّل الرسالة الصوتية للعميل إلى نص، يفهمها، ويرد عليها من قاعدة المعرفة أو الذكاء الاصطناعي — تجربة طبيعية بالكامل.'],
  ['megaphone', 'حملات جماعية وجدولة ذكية', 'أرسل لآلاف العملاء بفواصل زمنية عشوائية تحميك من الحظر، أو وزّع الحملة تلقائياً على فترة، أو جدولها لوقت لاحق.'],
  ['tag', 'فئات العملاء واستهداف دقيق', 'صنّف عملاءك (VIP، جملة، متابعة...) وأرسل لكل فئة الحملة المناسبة لها، واستورد أرقامك من Excel بضغطة.'],
  ['chart', 'لوحة تحكم وتحليلات', 'تابع المحادثات والردود والحملات والمشتركين بالأرقام والرسوم البيانية، وصدّر تقاريرك إلى Excel و PDF.'],
  ['bell', 'تدخل بشري وتنبيهات', 'حين يحتاج العميل موظفاً، يوقف البوت رده تلقائياً ويرسل تنبيهاً فورياً للمشرف على واتساب بكل تفاصيل المحادثة.'],
  ['plug', 'ربط برمجي (API)', 'اربط موقعك أو نظامك وأرسل الرسائل برمجياً عبر واجهة REST بسيطة، مع مجموعة Postman جاهزة وتوثيق واضح.'],
  ['lifebuoy', 'دعم فني متكامل', 'فريق دعم جاهز لمساعدتك عبر نظام تذاكر داخلي وأرقام واتساب مباشرة في مصر والسعودية.'],
];

const whyCards = [
  ['لا تفوّت أي عميل', 'ردّ فوري على مدار الساعة حتى خارج أوقات العمل والإجازات — كل رسالة تتحوّل إلى فرصة بيع بدل ما تضيع.'],
  ['وفّر وقت فريقك', 'البوت يتولّى الأسئلة المتكررة والردود الروتينية، ويترك الحالات المعقّدة فقط لموظفيك — إنتاجية أعلى بتكلفة أقل.'],
  ['ضاعِف مبيعاتك', 'متابعة احترافية سريعة وحملات موجّهة لكل فئة عملاء ترفع معدّل التحويل وتبني علاقة دائمة مع عملائك.'],
];

const audience = ['المتاجر الإلكترونية', 'المطاعم والكافيهات', 'العيادات والمراكز الطبية', 'العقارات والتسويق', 'شركات الخدمات', 'التعليم والكورسات', 'السياحة والسفر', 'صالونات ومراكز التجميل'];

const plans = [
  { name: 'مجانية', price: 'مجاناً', sub: 'للبدء والتجربة', items: ['جهاز واحد', '100 محادثة / شهر', '200 رسالة حملات', 'رد آلي بالذكاء الاصطناعي', 'قواعد معرفة أساسية'] },
  { name: 'احترافية', price: '49 ر.س', sub: 'شهرياً · أو 490 ر.س سنوياً', popular: true, items: ['3 أجهزة', '2000 محادثة / شهر', '10,000 رسالة حملات', 'تكامل فيسبوك', 'تحليلات متقدمة', 'دعم بأولوية'] },
  { name: 'أعمال', price: '129 ر.س', sub: 'شهرياً · أو 1290 ر.س سنوياً', items: ['10 أجهزة', 'محادثات بلا حدود', 'حملات بلا حدود', 'ربط API للموقع', 'مستخدمون متعددون', 'دعم مخصّص'] },
];

const steps = [
  ['1', 'اربط واتساب', 'امسح كود QR من لوحة التحكم واربط رقمك الحالي في أقل من دقيقة — بدون أي إعداد تقني.'],
  ['2', 'درّب الذكاء الاصطناعي', 'أضف معلومات نشاطك وملفاتك وأسئلتك الشائعة ليرد البوت باسمك وبمعلوماتك الصحيحة.'],
  ['3', 'فعّل الرد الآلي', 'شغّل الرد التلقائي وخلّي البوت يجاوب عملاءك 24/7 على واتساب وفيسبوك بدل ما تفوتك رسالة.'],
  ['4', 'تابِع وحلّل وأطلق حملات', 'راقب المحادثات والمبيعات من لوحة واحدة، وأطلق حملاتك الموجّهة لكل فئة عملاء.'],
];

const faqs = [
  ['هل أحتاج خبرة تقنية؟', 'لا إطلاقاً. الإعداد بسيط عبر مسح كود QR، وكل شيء يُدار من لوحة تحكم عربية سهلة.'],
  ['هل يعمل على رقمي الحالي؟', 'نعم، يرتبط برقم واتساب الخاص بنشاطك مباشرة دون تغيير الرقم.'],
  ['هل بياناتي ومحادثاتي آمنة؟', 'نعم، محادثاتك خاصة بك ولا تُشارك، ويمكنك حتى تعطيل حفظ المحادثات لأي جهاز.'],
  ['هل أستطيع التدخل يدوياً؟', 'بالتأكيد — يمكنك إيقاف رد البوت لعميل معيّن والرد بنفسك، أو تحويل المحادثة لموظف فوراً.'],
  ['كيف أبدأ؟', 'تواصل معنا عبر واتساب وسنقوم بتفعيل حسابك وشرح المنصة لك خلال دقائق.'],
];

const featureCards = features.map(f => `
  <div class="fcard">
    <div class="ficon">${ICONS[f[0]]}</div>
    <div><div class="ftitle">${f[1]}</div><div class="fdesc">${f[2]}</div></div>
  </div>`).join('');

const whyHtml = whyCards.map(w => `<div class="why"><div class="wtitle">${w[0]}</div><div class="wdesc">${w[1]}</div></div>`).join('');
const audienceHtml = audience.map(a => `<div class="aud">${ICONS.check}<span>${a}</span></div>`).join('');
const planCards = plans.map(p => `
  <div class="plan ${p.popular ? 'pop' : ''}">
    ${p.popular ? '<div class="badge">الأكثر اختياراً</div>' : ''}
    <div class="pname">${p.name}</div>
    <div class="price">${p.price}</div>
    <div class="psub">${p.sub}</div>
    <ul>${p.items.map(i => `<li>${i}</li>`).join('')}</ul>
  </div>`).join('');
const stepCards = steps.map(s => `<div class="step"><div class="snum">${s[0]}</div><div><div class="stitle">${s[1]}</div><div class="sdesc">${s[2]}</div></div></div>`).join('');
const faqHtml = faqs.map(q => `<div class="faq"><div class="q">${q[0]}</div><div class="a">${q[1]}</div></div>`).join('');

const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>SaaSBot — بروشور الخدمة</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--g:#1b8354;--gd:#0f3d2a;--gl:#10b981}
  html,body{font-family:'Cairo','Segoe UI',Tahoma,sans-serif;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.6}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;overflow:hidden;padding:16mm 15mm}
  .page+.page{page-break-before:always}
  .hero{background:linear-gradient(135deg,#0f3d2a,#1b8354 60%,#157049);color:#fff;border-radius:24px;padding:30px 28px;text-align:center;position:relative;overflow:hidden}
  .hero::after{content:'';position:absolute;width:260px;height:260px;background:rgba(255,255,255,.07);border-radius:50%;top:-110px;left:-80px}
  .logo-wrap{display:inline-flex;background:#fff;border-radius:20px;padding:12px 16px;box-shadow:0 12px 30px rgba(0,0,0,.18);margin-bottom:12px}
  .logo-wrap img{height:88px;display:block}
  .hero h1{font-size:38px;font-weight:900;letter-spacing:-1px}
  .hero .tag{font-size:16px;color:#d1fae5;margin-top:4px;font-weight:600}
  .hero .lead{font-size:13.5px;color:#ecfdf5;max-width:580px;margin:12px auto 0;line-height:1.8}
  .hero .chips{display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap}
  .chip{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:6px 15px;font-size:12.5px;font-weight:700}
  .sec-title{font-size:21px;color:var(--gd);font-weight:800;margin:24px 0 3px;display:flex;align-items:center;gap:10px}
  .sec-title::before{content:'';width:6px;height:22px;background:var(--g);border-radius:6px;display:inline-block}
  .sec-sub{color:#64748b;font-size:12.5px;margin-bottom:14px}
  .why-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
  .why{background:#f8fbf9;border:1px solid #e8efe9;border-radius:16px;padding:16px 15px;border-top:3px solid var(--g)}
  .wtitle{font-weight:800;color:#0f3d2a;font-size:15px;margin-bottom:6px}
  .wdesc{color:#5b6b62;font-size:12px;line-height:1.7}
  .aud-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .aud{display:flex;align-items:center;gap:9px;background:#f8fbf9;border:1px solid #e8efe9;border-radius:12px;padding:11px 14px;font-weight:700;font-size:13.5px;color:#334155}
  .aud svg{color:var(--g);flex-shrink:0}
  .features{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .fcard{display:flex;gap:12px;align-items:flex-start;border:1px solid #e8efe9;background:#f8fbf9;border-radius:16px;padding:13px 14px}
  .ficon{width:44px;height:44px;border-radius:12px;background:var(--g);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ftitle{font-weight:800;color:#0f3d2a;font-size:14.5px}
  .fdesc{color:#5b6b62;font-size:11.5px;line-height:1.65;margin-top:3px}
  .steps{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .step{display:flex;gap:12px;align-items:flex-start;background:#f8fbf9;border:1px solid #e8efe9;border-radius:16px;padding:13px}
  .snum{width:34px;height:34px;border-radius:11px;background:var(--g);color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px}
  .stitle{font-weight:800;color:#0f3d2a;font-size:14px}
  .sdesc{color:#5b6b62;font-size:11.5px;line-height:1.65;margin-top:2px}
  .plans{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;align-items:stretch}
  .plan{border:1.5px solid #e2e8f0;border-radius:20px;padding:22px 16px 18px;position:relative;background:#fff;display:flex;flex-direction:column}
  .plan.pop{border-color:var(--g);box-shadow:0 10px 26px rgba(27,131,84,.16)}
  .badge{position:absolute;top:-12px;right:50%;transform:translateX(50%);background:linear-gradient(90deg,var(--g),#157049);color:#fff;font-size:11px;font-weight:800;padding:5px 14px;border-radius:999px;white-space:nowrap}
  .pname{font-weight:800;color:#0f3d2a;font-size:18px}
  .price{font-size:30px;font-weight:900;color:var(--g);line-height:1;margin-top:8px}
  .psub{font-size:11.5px;color:#64748b;margin:5px 0 12px;border-bottom:1px dashed #e2e8f0;padding-bottom:12px}
  .plan ul{list-style:none;display:flex;flex-direction:column;gap:7px}
  .plan li{font-size:12.5px;color:#334155;padding-right:22px;position:relative}
  .plan li::before{content:'✓';position:absolute;right:0;top:0;color:var(--g);font-weight:900;background:#ecfdf5;width:16px;height:16px;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center}
  .faqs{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px}
  .faq{background:#f8fbf9;border:1px solid #e8efe9;border-radius:14px;padding:13px 15px}
  .faq .q{font-weight:800;color:#0f3d2a;font-size:13.5px;margin-bottom:4px}
  .faq .a{color:#5b6b62;font-size:12px;line-height:1.65}
  .cta{margin-top:24px;background:linear-gradient(135deg,#0f3d2a,#1b8354);border-radius:22px;padding:26px;color:#fff;text-align:center}
  .cta h2{font-size:23px;font-weight:900}
  .cta p{color:#d1fae5;font-size:13px;margin-top:6px}
  .contacts{display:flex;gap:14px;justify-content:center;margin-top:18px;flex-wrap:wrap}
  .ct{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:16px;padding:14px 22px;min-width:220px}
  .ct .lbl{font-size:12px;color:#d1fae5;font-weight:700}
  .ct .num{font-size:19px;font-weight:900;direction:ltr;margin-top:3px}
  .foot{text-align:center;color:#94a3b8;font-size:11px;margin-top:16px}
  @page{size:A4;margin:0}
</style></head><body>

<!-- PAGE 1 -->
<div class="page">
  <div class="hero">
    <div class="logo-wrap"><img src="${LOGO}" alt="SaaSBot"/></div>
    <h1>SaaSBot</h1>
    <div class="tag">يرد بالذكاء الاصطناعي على واتساب وفيسبوك</div>
    <div class="lead">منصّة عربية متكاملة لأتمتة محادثات عملائك وزيادة مبيعاتك. تربط واتساب وفيسبوك بذكاء اصطناعي يرد بلهجتك، ويدير حملاتك وعملاءك من لوحة تحكم واحدة سهلة — بدون أي خبرة تقنية.</div>
    <div class="chips"><span class="chip">رد فوري على مدار الساعة</span><span class="chip">واتساب وفيسبوك</span><span class="chip">يزيد مبيعاتك</span><span class="chip">بدون خبرة تقنية</span></div>
  </div>

  <div class="sec-title">لماذا SaaSBot؟</div>
  <div class="sec-sub">ثلاثة أسباب تجعل أعمالك تنمو أسرع.</div>
  <div class="why-grid">${whyHtml}</div>

  <div class="sec-title">لمن هذه المنصّة؟</div>
  <div class="sec-sub">مناسبة لأي نشاط يتواصل مع عملائه عبر واتساب أو فيسبوك.</div>
  <div class="aud-grid">${audienceHtml}</div>
</div>

<!-- PAGE 2 -->
<div class="page">
  <div class="sec-title">المميزات الكاملة</div>
  <div class="sec-sub">كل ما تحتاجه لإدارة عملائك وحملاتك ودعمك من مكان واحد.</div>
  <div class="features">${featureCards}</div>

  <div class="sec-title">كيف يعمل؟</div>
  <div class="sec-sub">من الصفر إلى أول رد آلي في دقائق معدودة.</div>
  <div class="steps">${stepCards}</div>
</div>

<!-- PAGE 3 -->
<div class="page">
  <div class="sec-title">باقات تناسب الجميع</div>
  <div class="sec-sub">ابدأ مجاناً وارقَ في أي وقت. الأسعار بالريال السعودي وغير شاملة ضريبة القيمة المضافة.</div>
  <div class="plans">${planCards}</div>

  <div class="sec-title">أسئلة شائعة</div>
  <div class="sec-sub">إجابات سريعة لأكثر ما يسأل عنه عملاؤنا.</div>
  <div class="faqs">${faqHtml}</div>

  <div class="cta">
    <h2>ابدأ مجاناً اليوم</h2>
    <p>تواصل معنا الآن لتفعيل حسابك أو لعرض توضيحي مباشر للمنصّة.</p>
    <div class="contacts">
      <div class="ct"><div class="lbl">إدارة مصر — واتساب</div><div class="num">${CONTACT_EG}</div></div>
      <div class="ct"><div class="lbl">إدارة السعودية — واتساب</div><div class="num">${CONTACT_SA}</div></div>
    </div>
  </div>
  <div class="foot">© SaaSBot — جميع الحقوق محفوظة • wa.me/${WA_EG} • wa.me/${WA_SA}</div>
</div>

</body></html>`;

const out = path.join(__dirname, 'saasbot-brochure.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Brochure written to', out, '(' + Math.round(html.length / 1024) + ' KB)');
