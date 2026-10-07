// Display identities only. Raw process names remain the keys for filtering,
// watchlists, traffic history, and connection ownership.
import { BRAND_ART } from './artwork/manifest.js';
export const brands = {
  firefox: ['Firefox', 'firefox'],
  claude: ['Claude', 'claude'],
  anthropic: ['Anthropic', 'anthropic'],
  codex: ['Codex', 'openai'],
  openai: ['OpenAI', 'openai'],
  chatgpt: ['ChatGPT', 'openai'],
  youtube: ['YouTube', 'youtube'],
  spotify: ['Spotify', 'spotify'],
  onedrive: ['OneDrive', 'onedrive'],
  slack: ['Slack', 'slack'],
  vscode: ['Visual Studio Code', 'visual-studio-code'],
  github: ['GitHub', 'github'],
  figma: ['Figma', 'figma'],
  chrome: ['Chrome', 'google-chrome'],
  edge: ['Microsoft Edge', 'microsoft-edge'],
  discord: ['Discord', 'discord'],
  steam: ['Steam', 'steam'],
  teams: ['Microsoft Teams', 'microsoft-teams'],
  outlook: ['Outlook', 'microsoft-outlook'],
  zoom: ['Zoom', 'zoom'],
  dropbox: ['Dropbox', 'dropbox'],
  microsoft: ['Microsoft', 'microsoft'],
  google: ['Google', 'google'],
  cloudflare: ['Cloudflare', 'cloudflare']
};
const aliases = { code:'vscode', 'code - insiders':'vscode', 'claude code':'claude', msedge:'edge', 'ms-teams':'teams', 'msedgewebview2':'edge' };
export function appIdentity(name) {
  const raw = String(name ?? '').replace(/\.exe$/i, '');
  const key = raw.toLowerCase();
  const brand = aliases[key] || key;
  return brands[brand] ? { key:brand, label:brands[brand][0], logo:brands[brand][1] } : { key, label:raw.charAt(0).toUpperCase()+raw.slice(1), logo:null };
}
export const appName = name => appIdentity(name).label;
const matches = (name, domain) => name === domain || name.endsWith('.'+domain);
const domains = [
  ['googlevideo.com','youtube-video','YouTube · video CDN','youtube'],
  ['tv.youtube.com','youtube-tv','YouTube TV','youtube'],
  ['youtube.com','youtube'], ['ytimg.com','youtube'], ['youtubei.googleapis.com','youtube'],
  ['spotify.com','spotify'], ['scdn.co','spotify'],
  ['chatgpt.com','chatgpt'], ['openai.com','openai'], ['oaistatic.com','openai'], ['oaiusercontent.com','openai'],
  ['claude.ai','claude'], ['anthropic.com','anthropic'],
  ['onedrive.live.com','onedrive'], ['1drv.com','onedrive'], ['onedrive.com','onedrive'],
  ['slack.com','slack'], ['slack-edge.com','slack'],
  ['github.com','github'], ['githubusercontent.com','github'], ['githubassets.com','github'],
  ['figma.com','figma'], ['discord.com','discord'], ['discord.gg','discord'], ['discordapp.com','discord'],
  ['steampowered.com','steam'], ['steamcommunity.com','steam'],
  ['teams.microsoft.com','teams'], ['outlook.com','outlook'], ['zoom.us','zoom'], ['dropbox.com','dropbox'],
  ['microsoftonline.com','microsoft'], ['microsoft.com','microsoft'], ['windowsupdate.com','microsoft'],
  ['mozilla.org','firefox'], ['mozilla.com','firefox'],
  ['google.com','google'], ['googleapis.com','google'], ['gstatic.com','google'], ['cloudflare.com','cloudflare']
];
export function hostnameIdentity(hostname) {
  const name = String(hostname).toLowerCase().replace(/\.$/, '');
  const rule = domains.find(([domain])=>matches(name,domain));
  if (!rule) return { key:name, label:name, logo:null };
  const [,key,label,brand=key] = rule;
  return { key, label:label || brands[brand][0], logo:brands[brand][1] };
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function brandBadge(identity, className = '') {
  const art = Object.hasOwn(BRAND_ART, identity.logo) ? BRAND_ART[identity.logo] : null;
  let content = `<span class="brand-monogram">${escape(identity.label.charAt(0).toUpperCase() || '?')}</span>`;
  if (art) {
    // Normalize transparent padding without resampling the generated pixels.
    const [x, y, w, h] = art.frames[0];
    const side = Math.max(w, h) * 1.06;
    const view = [x + w/2 - side/2, y + h/2 - side/2, side, side].join(' ');
    content = `<svg class="watercolor-brand" width="24" height="24" viewBox="${view}" focusable="false"><image href="/artwork/brands/${escape(identity.logo)}.png" width="${art.size[0]}" height="${art.size[1]}"/></svg>`;
  }
  return `<span class="app-badge brand-badge ${escape(className)}" aria-hidden="true">${content}</span>`;
}
