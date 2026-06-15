import * as XLSX from 'xlsx';
import { CONTACTS } from './region';

// Export rows to a real .xlsx file (downloads immediately).
export function exportExcel(filename: string, sheetName: string, headers: string[], rows: (string | number)[][]) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30) || 'Sheet1');
    XLSX.writeFile(wb, filename);
}

// Open a styled, printable RTL document (with logo + contacts) so the user can save as PDF.
export function exportPDF(title: string, headers: string[], rows: (string | number)[][], subtitle = '') {
    const origin = window.location.origin;
    const thead = headers.map(h => `<th>${h}</th>`).join('');
    const tbody = rows.map(r => `<tr>${r.map(c => `<td>${String(c ?? '').replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('');
    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
<style>
  *{box-sizing:border-box} body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1e293b;margin:0;padding:36px;line-height:1.6}
  .wrap{max-width:1000px;margin:0 auto}
  header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1b8354;padding-bottom:14px;margin-bottom:18px}
  header img{max-height:64px}
  h1{color:#0f3d2a;font-size:22px;margin:0} .sub{color:#64748b;font-size:13px;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}
  th,td{border:1px solid #e2e8f0;padding:8px 10px;text-align:right} th{background:#f0fdf4;color:#166534;font-weight:bold}
  tr:nth-child(even) td{background:#f8fafc}
  .contacts{margin-top:22px;display:flex;gap:14px;flex-wrap:wrap;color:#475569;font-size:12px}
  .contacts b{color:#0f3d2a} .contacts a{color:#1b8354;direction:ltr;text-decoration:none;font-weight:bold}
  footer{margin-top:18px;text-align:center;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;padding-top:12px}
  @media print{ .noprint{display:none} body{padding:0} }
</style></head><body><div class="wrap">
  <header>
    <div><h1>${title}</h1>${subtitle ? `<div class="sub">${subtitle}</div>` : ''}</div>
    <img src="${origin}/logo.png" onerror="this.style.display='none'"/>
  </header>
  <button class="noprint" onclick="window.print()" style="background:#1b8354;color:#fff;border:0;padding:9px 16px;border-radius:9px;font-weight:bold;cursor:pointer;margin-bottom:14px">🖨️ طباعة / حفظ PDF</button>
  <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
  <div class="contacts">
    <span>للتواصل:</span>
    <span><b>${CONTACTS.EG.flag} مصر</b> <a href="https://wa.me/${CONTACTS.EG.phone}">${CONTACTS.EG.display}</a></span>
    <span><b>${CONTACTS.SA.flag} السعودية</b> <a href="https://wa.me/${CONTACTS.SA.phone}">${CONTACTS.SA.display}</a></span>
  </div>
  <footer>© SaaSBot — تم التصدير من لوحة التحكم</footer>
</div></body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
}
