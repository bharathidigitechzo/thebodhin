/** Certificate as a print-ready A4-landscape HTML page (used to make the PDF on phones; same design as CertificateView). */
import type { CertTemplate } from './growth2';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const hex = (s: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(s) ? s : fallback);

export interface CertData { t: CertTemplate; learner: string; course: string; academy: string; date: string; certId: string; verify: string; primary: string; accent: string }

export function certHtml(d: CertData) {
  const primary = hex(d.primary, '#0B3B73');
  const ac = hex(d.t.accent ?? d.accent, '#D99A1E');
  const modern = d.t.layout === 'modern', minimal = d.t.layout === 'minimal', custom = d.t.layout === 'custom' || !!d.t.customBackgroundUri;
  const initials = d.academy.split(' ').map((w) => w[0] ?? '').join('').slice(0, 3);
  const certify = esc(d.t.certifyText?.trim() || 'This is to certify that');
  const bgStyle = d.t.customBackgroundUri ? `background-image:url('${esc(d.t.customBackgroundUri)}');background-size:cover;background-position:center;` : '';
  const bgOverlay = d.t.customBackgroundUri ? `<div style="position:absolute;inset:0;background:rgba(255,253,248,0.85);z-index:0;"></div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:297mm;height:210mm;padding:9mm;background:#FFFDF8;border:3mm solid ${minimal ? '#E5E7EB' : ac};position:relative;${bgStyle}}
.band{position:absolute;left:0;top:0;bottom:0;width:8mm;background:${primary};z-index:1}
.inner{height:100%;padding:12mm 16mm;${minimal || custom ? '' : `border:0.4mm solid ${ac}55;`}display:flex;flex-direction:column;justify-content:space-between;text-align:center;position:relative;z-index:2}
.top{display:flex;justify-content:space-between;align-items:center;color:#6B7280;font-size:11pt}
.logo{width:16mm;height:16mm;border-radius:50%;background:${primary};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11pt}
.badge{display:inline-block;padding:1mm 3mm;border-radius:3mm;border:0.3mm solid ${ac};background:${ac}20;color:${ac};font-size:8pt;font-weight:600;margin-top:1mm}
h1{margin:0;color:${primary};font-size:30pt;letter-spacing:1.5pt}
.muted{color:#6B7280;font-size:13pt;margin:0}
.name{font-size:36pt;margin:0;font-family:${modern ? 'Helvetica,Arial,sans-serif' : 'Georgia,serif'}}
.course{font-size:20pt;font-weight:700;margin:0}
.rule{height:0.8mm;width:26mm;background:${ac};margin:0 auto}
.bottom{display:flex;justify-content:space-between;align-items:flex-end;font-size:10pt;text-align:left}
.sign-box{display:flex;gap:8mm;justify-content:center}
.sign{text-align:center}.sign i{font-size:16pt}.sign hr{width:36mm;border:0;border-top:0.3mm solid #9CA3AF;margin:1mm auto}
.sign-img{height:10mm;display:block;margin:0 auto 1mm auto}
.small{color:#6B7280;font-size:9pt}
</style></head><body><div class="page">${bgOverlay}${modern && !d.t.customBackgroundUri ? '<div class="band"></div>' : ''}<div class="inner">
<div class="top">${d.t.showLogo ? `<div class="logo">${esc(initials)}</div>` : '<span></span>'}<div style="text-align:right"><span>${esc(d.academy)}</span>${d.t.badgeText ? `<div><span class="badge">${esc(d.t.badgeText)}</span></div>` : ''}</div></div>
<h1>${esc(d.t.title)}</h1>
<p class="muted">${certify}</p>
<p class="name">${esc(d.learner)}</p>
<p class="muted">${esc(d.t.line)}</p>
<p class="course">${esc(d.course)}</p>
<div class="rule"></div>
<div class="bottom">
<div>${d.t.showDate !== false ? `<div class="small">Issued</div><b>${esc(d.date)}</b>` : ''}</div>
<div class="sign-box">
  <div class="sign">${d.t.customSignatureUri ? `<img src="${esc(d.t.customSignatureUri)}" class="sign-img">` : `<i>${esc(d.t.signName)}</i>`}<hr><div class="small">${esc(d.t.signTitle)}</div></div>
  ${d.t.signName2 ? `<div class="sign"><i>${esc(d.t.signName2)}</i><hr><div class="small">${esc(d.t.signTitle2 || 'Co-instructor')}</div></div>` : ''}
</div>
<div style="text-align:right"><div class="small">Certificate ID</div><b>${esc(d.certId)}</b>${d.t.showQr ? `<div class="small">Verify: ${esc(d.verify)}</div>` : ''}</div>
</div></div></div></body></html>`;
}

/** Safe file name for the saved PDF. */
export const certFileName = (learner: string, course: string) => `${`${learner}-${course}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'certificate'}.pdf`;
