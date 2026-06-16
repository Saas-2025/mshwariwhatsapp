/* Generates a self-contained, print-ready marketing brochure (HTML) with the logo embedded. */
const fs = require('fs');
const path = require('path');

const logoB64 = fs.readFileSync(path.join(__dirname, '..', 'public', 'logo.png')).toString('base64');
const LOGO = `data:image/png;base64,${logoB64}`;

const CONTACT_EG = '+20 109 395 7856';
const CONTACT_SA = '+966 53 485 9975';
const WA_EG = '201093957856';
const WA_SA = '966534859975';

const features = [
  ['🤖', 'رد آلي بالذكاء الاصطناعي', 'يرد على عملائك فوراً على واتساب وفيسبوك بأسلوب بشري وبلغتك.'],
  ['📚', 'قواعد معرفة متكاملة', 'علّم البوت من ملفاتك ونصوصك وردود صوتية جاهزة يرد بها.'],
  ['🎙️', 'يفهم الرسائل الصوتية', 'يحوّل صوت العميل إلى نص ويرد عليه من المعرفة أو الذكاء الاصطناعي.'],
  ['📣', 'حملات جماعية وجدولة', 'أرسل لآلاف العملاء بفواصل ذكية تحميك من الحظر، أو جدولها مسبقاً.'],
  ['🏷️', 'فئات العملاء', 'صنّف عملاءك واستهدف كل فئة بحملة مخصّصة لها.'],
  ['📊', 'لوحة تحكم وتحليلات', 'تابع المحادثات والردود والمبيعات والمشتركين لحظة بلحظة.'],
  ['🛎️', 'تدخل بشري وتنبيهات', 'يحوّل المحادثة لموظف بشري وقت الحاجة ويرسل له تنبيهاً فورياً.'],
  ['🔌', 'ربط برمجي (API)', 'اربط موقعك أو نظامك وأرسل الرسائل برمجياً + Postman جاهز.'],
  ['🛟', 'دعم فني متكامل', 'فريق دعم جاهز لمساعدتك في أي وقت عبر نظام تذاكر داخلي وواتساب.'],
];

const plans = [
  { name: 'مجانية', eg: '0', sa: '0', popular: false, items: ['جهاز واحد', '100 محادثة / شهر', '200 رسالة حملات', 'رد آلي بالذكاء الاصطناعي', 'قواعد معرفة أساسية'] },
  { name: 'احترافية', eg: '299', sa: '49', popular: true, items: ['3 أجهزة', '2000 محادثة / شهر', '10,000 رسالة حملات', 'تكامل فيسبوك', 'تحليلات متقدمة', 'دعم أولوية'] },
  { name: 'أعمال', eg: '799', sa: '129', popular: false, items: ['10 أجهزة', 'محادثات بلا حدود', 'حملات بلا حدود', 'ربط API للموقع', 'مستخدمون متعددون', 'دعم مخصّص'] },
];

const steps = [
  ['1', 'اربط واتساب', 'امسح كود QR من لوحة التحكم واربط جهازك في ثوانٍ.'],
  ['2', 'درّب الذكاء', 'أضف معلومات نشاطك وملفاتك ليرد البوت باسمك.'],
  ['3', 'فعّل الرد الآلي', 'وخليه يرد على عملائك 24/7 بدل ما تفوتك رسالة.'],
  ['4', 'تابع وحلّل', 'راقب المحادثات والمبيعات وأطلق حملاتك من مكان واحد.'],
];

const featureCards = features.map(f => `
  <div class="fcard">
    <div class="ficon">${f[0]}</div>
    <div><div class="ftitle">${f[1]}</div><div class="fdesc">${f[2]}</div></div>
  </div>`).join('');

const planCards = plans.map(p => `
  <div class="plan ${p.popular ? 'pop' : ''}">
    ${p.popular ? '<div class="badge">الأكثر اختياراً</div>' : ''}
    <div class="pname">${p.name}</div>
    <div class="price"><span class="amt">${p.eg === '0' ? 'مجاناً' : p.eg}</span>${p.eg === '0' ? '' : '<span class="cur">ج.م<small>/شهر</small></span>'}</div>
    <div class="price-sa">${p.sa === '0' ? 'للعملاء بالخارج: مجاناً' : 'بالسعودية: <b>' + p.sa + ' ر.س</b> / شهر'}</div>
    <ul>${p.items.map(i => `<li>${i}</li>`).join('')}</ul>
  </div>`).join('');

const stepCards = steps.map(s => `
  <div class="step"><div class="snum">${s[0]}</div><div><div class="stitle">${s[1]}</div><div class="sdesc">${s[2]}</div></div></div>`).join('');

const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>SaaSBot — بروشور الخدمة</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--g:#1b8354;--gd:#0f3d2a;--gl:#10b981}
  html,body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;overflow:hidden;padding:18mm 16mm}
  .page+.page{page-break-before:always}
  /* Hero */
  .hero{background:linear-gradient(135deg,#0f3d2a,#1b8354 60%,#157049);color:#fff;border-radius:26px;padding:34px 30px;text-align:center;position:relative;overflow:hidden}
  .hero::after{content:'';position:absolute;width:280px;height:280px;background:rgba(255,255,255,.08);border-radius:50%;top:-120px;left:-90px}
  .logo-wrap{display:inline-flex;background:#fff;border-radius:22px;padding:14px 18px;box-shadow:0 12px 30px rgba(0,0,0,.18);margin-bottom:14px}
  .logo-wrap img{height:96px;display:block}
  .hero h1{font-size:40px;letter-spacing:-1px}
  .hero .tag{font-size:17px;color:#d1fae5;margin-top:6px}
  .hero .lead{font-size:14px;color:#ecfdf5;max-width:560px;margin:14px auto 0;line-height:1.7}
  .hero .chips{display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap}
  .chip{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:7px 16px;font-size:13px;font-weight:bold}
  /* Section */
  .sec-title{font-size:22px;color:var(--gd);font-weight:800;margin:26px 0 4px;display:flex;align-items:center;gap:10px}
  .sec-title::before{content:'';width:6px;height:24px;background:var(--g);border-radius:6px;display:inline-block}
  .sec-sub{color:#64748b;font-size:13px;margin-bottom:16px}
  /* Features */
  .features{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .fcard{display:flex;gap:12px;align-items:flex-start;border:1px solid #e8efe9;background:#f8fbf9;border-radius:16px;padding:13px 14px}
  .ficon{width:42px;height:42px;border-radius:12px;background:#ecfdf5;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
  .ftitle{font-weight:800;color:#0f3d2a;font-size:14.5px}
  .fdesc{color:#5b6b62;font-size:12px;line-height:1.6;margin-top:2px}
  /* Plans */
  .plans{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;align-items:stretch}
  .plan{border:1.5px solid #e2e8f0;border-radius:20px;padding:20px 16px;position:relative;background:#fff;display:flex;flex-direction:column}
  .plan.pop{border-color:var(--g);box-shadow:0 10px 26px rgba(27,131,84,.16)}
  .badge{position:absolute;top:-12px;right:50%;transform:translateX(50%);background:linear-gradient(90deg,var(--g),#157049);color:#fff;font-size:11px;font-weight:800;padding:5px 14px;border-radius:999px;white-space:nowrap}
  .pname{font-weight:800;color:#0f3d2a;font-size:18px;margin-bottom:8px}
  .price{display:flex;align-items:flex-end;gap:6px}
  .price .amt{font-size:32px;font-weight:900;color:var(--g);line-height:1}
  .price .cur{font-size:13px;color:#475569;font-weight:bold;padding-bottom:3px}
  .price .cur small{color:#94a3b8;font-weight:normal}
  .price-sa{font-size:12px;color:#475569;margin:6px 0 12px;border-bottom:1px dashed #e2e8f0;padding-bottom:12px}
  .plan ul{list-style:none;display:flex;flex-direction:column;gap:7px}
  .plan li{font-size:12.5px;color:#334155;padding-right:22px;position:relative}
  .plan li::before{content:'✓';position:absolute;right:0;top:0;color:var(--g);font-weight:900;background:#ecfdf5;width:16px;height:16px;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center}
  /* Steps */
  .steps{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .step{display:flex;gap:12px;align-items:flex-start;background:#f8fbf9;border:1px solid #e8efe9;border-radius:16px;padding:13px}
  .snum{width:36px;height:36px;border-radius:12px;background:var(--g);color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .stitle{font-weight:800;color:#0f3d2a;font-size:14px}
  .sdesc{color:#5b6b62;font-size:12px;line-height:1.6;margin-top:2px}
  /* Contact / CTA */
  .cta{margin-top:26px;background:linear-gradient(135deg,#0f3d2a,#1b8354);border-radius:22px;padding:26px;color:#fff;text-align:center}
  .cta h2{font-size:24px}
  .cta p{color:#d1fae5;font-size:13.5px;margin-top:6px}
  .contacts{display:flex;gap:14px;justify-content:center;margin-top:18px;flex-wrap:wrap}
  .ct{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:16px;padding:14px 20px;min-width:210px}
  .ct .lbl{font-size:12px;color:#d1fae5}
  .ct .num{font-size:19px;font-weight:900;direction:ltr;margin-top:2px}
  .foot{text-align:center;color:#94a3b8;font-size:11px;margin-top:18px}
  @page{size:A4;margin:0}
</style></head><body>

<!-- PAGE 1 -->
<div class="page">
  <div class="hero">
    <div class="logo-wrap"><img src="${LOGO}" alt="SaaSBot"/></div>
    <h1>SaaSBot</h1>
    <div class="tag">يرد بالذكاء الاصطناعي على واتساب وفيسبوك</div>
    <div class="lead">منصّة سعودية–مصرية متكاملة لأتمتة محادثات عملائك ومبيعاتك. وفّر وقت فريقك، وخليك متاح 24/7، وحوّل كل رسالة إلى فرصة بيع — بدون أي خبرة تقنية.</div>
    <div class="chips"><span class="chip">⚡ رد فوري 24/7</span><span class="chip">💬 واتساب + فيسبوك</span><span class="chip">📈 يزيد مبيعاتك</span><span class="chip">🔒 آمن وخاص</span></div>
  </div>

  <div class="sec-title">مميزات المنصّة</div>
  <div class="sec-sub">كل ما تحتاجه لإدارة عملائك وحملاتك من مكان واحد.</div>
  <div class="features">${featureCards}</div>
</div>

<!-- PAGE 2 -->
<div class="page">
  <div class="sec-title">باقات تناسب الجميع</div>
  <div class="sec-sub">ابدأ مجاناً وارقَ في أي وقت. الأسعار لمصر والسعودية (غير شاملة الضريبة).</div>
  <div class="plans">${planCards}</div>

  <div class="sec-title">كيف يعمل؟</div>
  <div class="sec-sub">من الصفر إلى أول رد آلي في دقائق.</div>
  <div class="steps">${stepCards}</div>

  <div class="cta">
    <h2>ابدأ مجاناً اليوم 🚀</h2>
    <p>تواصل معنا الآن لتفعيل حسابك أو لعرض توضيحي مباشر.</p>
    <div class="contacts">
      <div class="ct"><div class="lbl">🇪🇬 إدارة مصر — واتساب</div><div class="num">${CONTACT_EG}</div></div>
      <div class="ct"><div class="lbl">🇸🇦 إدارة السعودية — واتساب</div><div class="num">${CONTACT_SA}</div></div>
    </div>
  </div>
  <div class="foot">© SaaSBot — جميع الحقوق محفوظة • wa.me/${WA_EG} • wa.me/${WA_SA}</div>
</div>

</body></html>`;

const out = path.join(__dirname, 'saasbot-brochure.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Brochure written to', out, '(' + Math.round(html.length / 1024) + ' KB)');
