import { appIdentity, brandBadge } from './brands.js';
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration = seconds => seconds>=3600?`${(seconds/3600).toFixed(1)} h`:`${(seconds/60).toFixed(1)} min`;
export function watercolorWishlist(report) {
  if(!report)return '<section class="watercolor-wishlist"><h3>Watercolor wishlist</h3><p>Waiting for the companion’s first observation.</p></section>';
  const date = at => at===null?'Unavailable':new Date(at).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'});
  return `<section class="watercolor-wishlist"><h3>Watercolor wishlist</h3><p>Top 10 apps missing watercolor artwork, ranked by observed network time. ${esc(date(report.startedAt))} – ${esc(date(report.endsAt))} · ${report.complete?'Collection complete':'Collecting'}</p>
    ${report.error?`<p class="notice error-notice">${esc(report.error)}</p>`:''}
    <ol>${report.top10.map(a=>`<li>${brandBadge(appIdentity(a.process))}<span><strong>${esc(a.name)}</strong><small>${esc(a.process)}</small></span><b>${duration(a.activeSeconds)}</b></li>`).join('')}</ol>
    ${!report.top10.length?'<p>No eligible apps observed yet. The list grows as apps connect.</p>':''}
    <p>Counts established TCP connection time and measured TCP/UDP transfer intervals. Multiple processes and overlapping observations count once per app. Sleep and stopped collection leave gaps.</p>
    <details><summary>Saved locally for future artwork</summary><code>${esc(report.file)}</code><p>The list updates while the companion runs and is retained after the month ends.</p></details></section>`;
}
