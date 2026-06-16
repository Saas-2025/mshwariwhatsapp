# بروشور SaaSBot التسويقي

ملفات البروشور التسويقي الاحترافي (صفحتان A4، RTL، باللوجو وبيانات التواصل).

## الملفات
- `saasbot-brochure.pdf` — البروشور جاهز للإرسال/الطباعة.
- `saasbot-brochure.html` — المصدر (اللوجو مدمج base64، يفتح في أي متصفح).
- `build-brochure.cjs` — مولّد الملف (عدّل المميزات/الأسعار/الأرقام بداخله ثم أعد التوليد).

## إعادة التوليد بعد أي تعديل
```bash
node marketing/build-brochure.cjs
```
ثم لتحويله PDF (يتطلب Chrome/Edge):
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu --no-pdf-header-footer "--print-to-pdf=marketing\saasbot-brochure.pdf" "file:///D:/projects/whatsapp%20api/whatsappapi/marketing/saasbot-brochure.html"
```
أو افتح `saasbot-brochure.html` في المتصفح واطبع → حفظ كـ PDF (مع تفعيل «رسومات الخلفية»).
