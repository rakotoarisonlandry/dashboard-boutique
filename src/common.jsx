import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ───────────── API ───────────── */
const BASE = (import.meta.env.VITE_API_URL || 'https://api.robiacopilot.site').replace(/\/$/, '');
const TOKEN_KEY = 'robia-iot-session';
let token = '';
try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch { /* Private mode: memory only. */ }

export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  } catch { throw new Error('Connexion impossible. Vérifiez le réseau puis réessayez.'); }
  if (!response.ok) {
    let detail = '';
    try { const body = await response.json(); detail = Array.isArray(body?.message) ? body.message[0] : body?.message || ''; } catch { /* No JSON body. */ }
    if (response.status === 401) { if (token) window.dispatchEvent(new Event('robia:expired')); throw new Error('Session expirée ou identifiants incorrects.'); }
    if (response.status === 404) throw new Error(detail && detail !== 'Not Found' ? detail : 'Élément introuvable ou accès refusé pour ce compte.');
    if (response.status === 403) throw new Error('Accès refusé pour ce compte.');
    if (response.status === 409) throw new Error(detail || 'Cette action n’est plus possible. Les données ont été actualisées.');
    if (response.status === 400) throw new Error(detail || 'Informations invalides.');
    throw new Error('Le service est momentanément indisponible. Réessayez.');
  }
  return response.status === 204 ? null : response.json();
}
export const post = (path, data) => request(path, { method: 'POST', ...(data ? { body: JSON.stringify(data) } : {}) });
export const e = encodeURIComponent;

/* ───────────── Session ───────────── */
export function useSession() {
  const [user, setUser] = useState(() => { try { const saved = sessionStorage.getItem(`${TOKEN_KEY}-user`); return token && saved ? JSON.parse(saved) : null; } catch { return null; } });
  const logout = useCallback(() => {
    token = '';
    try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(`${TOKEN_KEY}-user`); } catch { /* ignore */ }
    setUser(null);
  }, []);
  useEffect(() => { window.addEventListener('robia:expired', logout); return () => window.removeEventListener('robia:expired', logout); }, [logout]);
  const login = async (email, password) => {
    const result = await post('/auth/login', { email, password });
    if (!result.accessToken) throw new Error('Réponse de connexion invalide.');
    token = result.accessToken;
    try { sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(`${TOKEN_KEY}-user`, JSON.stringify(result.user)); } catch { /* ignore */ }
    setUser(result.user);
  };
  return { user, login, logout };
}

/* ───────────── Icons (same set as the mobile app) ───────────── */
const paths = {
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z', calendar: 'M4 5h16v16H4ZM8 2v6m8-6v6M4 11h16', shop: 'M3 10h18l-2-7H5ZM4 10v11h16V10M9 21v-7h6v7',
  ticket: 'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Zm12 0v3m0 2v2m0 2v3', user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3',
  users: 'M9 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-8 15v-2a7 7 0 0 1 14 0v2M17 3a4 4 0 0 1 0 8m6 11v-2a7 7 0 0 0-4-6.3',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0', arrow: 'M4 12h16m-6-6 6 6-6 6', back: 'M20 12H4m6-6-6 6 6 6',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2', check: 'm5 12 4 4L20 5', close: 'm6 6 12 12M6 18 18 6', plus: 'M12 5v14M5 12h14',
  search: 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-2 6 6 6', bell: 'M5 17h14l-2-4V8A5 5 0 0 0 7 8v5Zm5 4h4', logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7', trash: 'M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14', key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-6M15 7h.01',
  download: 'M12 2v13m-5-5 5 5 5-5M4 17v5h16v-5', scan: 'M3 7V3h4m10 0h4v4m0 10v4h-4M7 21H3v-4M7 12h10', spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z', grid: 'M3 3h8v8H3Zm10 0h8v8h-8ZM3 13h8v8H3Zm10 0h8v8h-8Z', phone: 'M6 2h12v20H6ZM10 18h4',
};
export function Icon({ name, size = 20, stroke = 2 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.spark}/></svg>;
}

/* ───────────── Brand & layout ───────────── */
export function Brand() { return <div className="brand"><img src="/logo.png" alt=""/><strong>robia<span>.</span></strong></div>; }
export const initials = value => (value || 'R').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

export function Shell({ user, logout, role, nav, mobileNav, children }) {
  return <div className="shell">
    <aside className="sidebar">
      <Brand/>
      <div className="brand-sub">Robia IoT · {role}</div>
      {nav}
      <div className="sidebar-bottom">
        <span className="avatar">{initials(user?.name || user?.email)}</span>
        <div className="side-user"><strong>{user?.name || 'Compte Robia'}</strong><small>{user?.email}</small></div>
        <button className="icon-button" onClick={logout} title="Se déconnecter" aria-label="Se déconnecter"><Icon name="logout" size={18}/></button>
      </div>
    </aside>
    <main className="content">
      <header className="topbar"><Brand/>{mobileNav}<button className="icon-button" onClick={logout} aria-label="Se déconnecter"><Icon name="logout" size={18}/></button></header>
      <OfflineBanner/>
      {children}
    </main>
  </div>;
}

export function Login({ title, subtitle, login }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false); const [sent, setSent] = useState(false);
  return <div className="login-page">
    <div className="login-brand"><Brand/><h2>Chaque visite en boutique,<br/><span>sans file d’attente.</span></h2><p>Robia IoT · Madagascar</p></div>
    <main className="login-main"><form className="login-card" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setSent(false);
      try { if (forgot) { await post('/auth/forgot-password', { email }); setSent(true); } else await login(email, password); }
      catch (err) { setError(err.message); } finally { setBusy(false); }
    }}>
      <span className="eyebrow">Espace sécurisé</span>
      <h1>{forgot ? 'Mot de passe oublié' : title}</h1>
      <p>{forgot ? 'Saisissez l’adresse de votre compte Robia.' : subtitle}</p>
      <label>Adresse e-mail<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="vous@exemple.mg"/></label>
      {!forgot && <label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}/></label>}
      {error && <div className="notice" role="alert" style={{ marginTop: 16, marginBottom: 0 }}>{error}</div>}
      {sent && <div className="notice success" role="status" style={{ marginTop: 16, marginBottom: 0 }}>Si ce compte existe, un e-mail vient de vous être envoyé.</div>}
      <button disabled={busy} className="btn primary">{busy ? 'Patientez…' : forgot ? 'Envoyer les instructions' : 'Se connecter'}</button>
      <button type="button" className="link-button" onClick={() => { setForgot(!forgot); setError(''); setSent(false); }}>{forgot ? '← Retour à la connexion' : 'Mot de passe oublié ?'}</button>
    </form></main>
  </div>;
}

/* ───────────── Feedback ───────────── */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems(current => [...current, { id, text, kind }]);
    setTimeout(() => setItems(current => current.filter(item => item.id !== id)), 4200);
  }, []);
  return <ToastContext.Provider value={push}>{children}<div className="toasts" role="status" aria-live="polite">{items.map(item => <div key={item.id} className={`toast ${item.kind}`}><span className="t-dot"/>{item.text}</div>)}</div></ToastContext.Provider>;
}

/**
 * Accessible dialog: Escape closes, focus moves inside on open and returns
 * to the previous element on close, Tab stays inside the dialog.
 */
export function Modal({ onClose, wide = false, as: Tag = 'div', label, children, ...props }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onClose = () => closeRef.current();
    const previous = document.activeElement;
    const node = ref.current;
    const focusables = () => [...node.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, [href]')];
    (node.querySelector('[autofocus]') || focusables()[0] || node).focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const items = focusables(); if (!items.length) return;
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; previous?.focus?.(); };
  }, []);
  return <div className="backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <Tag ref={ref} tabIndex={-1} className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} {...props}>{children}</Tag>
  </div>;
}

/** In-page confirmation (never window.confirm). */
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolver = useRef(null);
  const confirm = useCallback(options => new Promise(resolve => { resolver.current = resolve; setState(options); }), []);
  const close = useCallback(value => { resolver.current?.(value); resolver.current = null; setState(null); }, []);
  const cancel = useCallback(() => close(false), [close]);
  const dialog = state && <Modal onClose={cancel} label={state.title}>
    <span className="eyebrow">{state.eyebrow || 'Confirmation'}</span>
    <h2>{state.title}</h2>
    {state.text && <p>{state.text}</p>}
    <div className="dialog-actions">
      <button className="btn ghost" onClick={cancel}>{state.cancel || 'Annuler'}</button>
      <button className={`btn ${state.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => close(true)}>{state.confirm || 'Confirmer'}</button>
    </div>
  </Modal>;
  return [confirm, dialog];
}

/* ───────────── Real time ───────────── */
function parseSse(block) {
  let type = 'message'; const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try { return { type, data: JSON.parse(data.join('\n')) }; } catch { return null; }
}

/**
 * Live stream of appointment changes for owners and agents.
 * EventSource cannot send the Authorization header, so the stream is read
 * with fetch. Reconnects with backoff. Returns 'live' | 'connecting'.
 */
export function useLiveStream(onEvent) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [status, setStatus] = useState('connecting');
  useEffect(() => {
    let stopped = false; let controller = null; let timer = null; let attempt = 0; let wakeUp = null;
    const loop = async () => {
      while (!stopped) {
        try {
          controller = new AbortController();
          const response = await fetch(`${BASE}/appointments/agent/events`, { headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
          if (response.status === 401) { window.dispatchEvent(new Event('robia:expired')); return; }
          if (!response.ok || !response.body) throw new Error(String(response.status));
          attempt = 0; setStatus('live');
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done || stopped) break;
            buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
            let end;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const event = parseSse(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
              if (event && event.type !== 'ping') handler.current(event);
            }
          }
        } catch { /* Network drop or server restart: retry below. */ }
        if (stopped) break;
        setStatus('connecting');
        attempt += 1;
        await new Promise(resolve => { wakeUp = resolve; timer = setTimeout(resolve, Math.min(30000, 1000 * 2 ** Math.min(attempt, 5))); });
        wakeUp = null;
      }
    };
    void loop();
    // Back online: reconnect now instead of waiting for the backoff.
    const wake = () => { if (wakeUp) { clearTimeout(timer); attempt = 0; wakeUp(); } };
    window.addEventListener('online', wake);
    return () => { stopped = true; controller?.abort(); clearTimeout(timer); wakeUp?.(); window.removeEventListener('online', wake); };
  }, []);
  return status;
}

export function LiveBadge({ status }) {
  return <span className={`live ${status === 'live' ? '' : 'stale'}`} title={status === 'live' ? 'Les changements apparaissent instantanément.' : 'Reconnexion au direct en cours…'}>{status === 'live' ? 'En direct' : 'Reconnexion…'}</span>;
}

/** Desktop notification + short chime, so a new request is noticed even in another tab. */
export function useAlerts() {
  const supported = typeof Notification !== 'undefined';
  const [permission, setPermission] = useState(() => supported ? Notification.permission : 'denied');
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('robia-sound') !== 'off'; } catch { return true; } });
  const audio = useRef(null);
  const chime = useCallback(() => {
    try {
      audio.current = audio.current || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audio.current; const now = ctx.currentTime;
      [880, 1320].forEach((frequency, index) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.frequency.value = frequency; osc.type = 'sine';
        gain.gain.setValueAtTime(0.0001, now + index * 0.15); gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.15 + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.15 + 0.35);
        osc.connect(gain).connect(ctx.destination); osc.start(now + index * 0.15); osc.stop(now + index * 0.15 + 0.4);
      });
    } catch { /* Audio unavailable. */ }
  }, []);
  const notify = useCallback((title, body) => {
    if (sound) chime();
    if (supported && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try { const note = new Notification(title, { body, icon: '/logo.png', tag: 'robia-iot' }); note.onclick = () => { window.focus(); note.close(); }; } catch { /* ignore */ }
    }
  }, [chime, sound, supported]);
  const enable = async () => { if (supported) setPermission(await Notification.requestPermission()); chime(); };
  const toggleSound = () => setSound(value => { try { localStorage.setItem('robia-sound', value ? 'off' : 'on'); } catch { /* ignore */ } return !value; });
  return { notify, enable, permission, supported, sound, toggleSound };
}

export function AlertsControl({ alerts }) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    {alerts.supported && alerts.permission === 'default' && <button className="btn soft small" onClick={() => void alerts.enable()}><Icon name="bell" size={16}/>Activer les alertes</button>}
    <button className="icon-button" onClick={alerts.toggleSound} title={alerts.sound ? 'Couper le son des alertes' : 'Activer le son des alertes'} aria-label={alerts.sound ? 'Couper le son des alertes' : 'Activer le son des alertes'} aria-pressed={alerts.sound} style={alerts.sound ? { color: 'var(--orange)' } : {}}><Icon name={alerts.sound ? 'bell' : 'close'} size={17}/></button>
  </div>;
}

/* ───────────── Connectivity, title, export ───────────── */
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
export function OfflineBanner() {
  const online = useOnline();
  return online ? null : <div className="offline" role="alert">Hors connexion : les données affichées peuvent être anciennes. Reconnexion automatique dès le retour du réseau.</div>;
}
export function useDocumentTitle(title) {
  useEffect(() => { document.title = title; }, [title]);
}
/** CSV with a BOM so Excel opens accents correctly. */
export function downloadCsv(filename, rows) {
  const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map(row => row.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function timeAgo(timestamp, now) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'à l’instant';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `il y a ${hours} h` : `il y a ${Math.round(hours / 24)} j`;
}

export function Stat({ icon, label, value, caption, hero = false }) {
  return <div className={`stat ${hero ? 'hero' : ''}`}><div className="stat-icon"><Icon name={icon} size={22}/></div><div><div className="stat-label">{label}</div><strong>{value}</strong><small>{caption}</small></div></div>;
}
export function Empty({ icon = 'spark', title, text, children }) {
  return <div className="empty"><div className="icon-tile"><Icon name={icon} size={28}/></div><h3>{title}</h3>{text && <p>{text}</p>}{children}</div>;
}

/* ───────────── Time (Madagascar, UTC+3) ───────────── */
export const TZ = 'Indian/Antananarivo';
export const formatDate = value => value ? new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export const formatTime = value => value ? new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
export const formatDay = (value, options = { weekday: 'long', day: 'numeric', month: 'long' }) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...options }).format(new Date(value));
/** YYYY-MM-DD of a date in Madagascar. */
export const dayKey = date => new Date(new Date(date).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
export const addDays = (key, count) => new Date(Date.parse(`${key}T12:00:00+03:00`) + count * 86400000);

export function useClockRefresh(callback, interval = 10000) {
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') callback(); }, interval);
    const focus = () => { if (document.visibilityState === 'visible') callback(); };
    document.addEventListener('visibilitychange', focus);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', focus); };
  }, [callback, interval]);
}
export function useNow(interval = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(id); }, [interval]);
  return now;
}
