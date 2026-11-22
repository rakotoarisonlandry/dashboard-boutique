import { useEffect, useState } from 'react';

const BASE = (import.meta.env.VITE_API_URL || 'https://api.robiacopilot.site').replace(/\/$/, '');
let token = '';
export async function request(path, options = {}) {
  let response;
  try { response = await fetch(`${BASE}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } }); }
  catch { throw new Error('Connexion impossible. Vérifiez le réseau et la configuration du serveur.'); }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Session expirée ou identifiants incorrects.');
    if (response.status === 403 || response.status === 404) throw new Error('Accès refusé ou élément introuvable pour ce compte.');
    if (response.status === 409) throw new Error('Cette action ne peut plus être effectuée. Actualisez les données.');
    throw new Error('Le service ne peut pas traiter cette demande. Réessayez.');
  }
  return response.status === 204 ? null : response.json();
}
export const post = (path, data) => request(path, { method: 'POST', ...(data ? { body: JSON.stringify(data) } : {}) });
export function useSession() {
  const [user, setUser] = useState(null);
  const login = async (email, password) => { const result = await post('/auth/login', { email, password }); if (!result.accessToken) throw new Error('Réponse de connexion invalide.'); token = result.accessToken; setUser(result.user); };
  const logout = () => { token = ''; setUser(null); };
  return { user, login, logout };
}
export function Login({ title, login }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <div className="login-page"><div className="login-brand"><Brand/><p>Une meilleure expérience,<br/><strong>à chaque rendez-vous.</strong></p><span>Robia IoT · Madagascar</span></div><main className="login-main"><form className="login-card" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await login(email, password); } catch (err) { setError(err.message); } finally { setBusy(false); } }}><div className="eyebrow">ESPACE SÉCURISÉ</div><h1>{title}</h1><p>Connectez-vous avec votre compte Robia pour continuer.</p><label>Adresse e-mail<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)}/></label><label>Mot de passe<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}/></label>{error && <p className="alert" role="alert">{error}</p>}<button disabled={busy} className="primary">{busy ? 'Connexion…' : 'Se connecter'}</button><small>Vos accès sont définis par le propriétaire de votre organisation.</small></form></main></div>;
}
export function Brand() { return <div className="brand"><img src="/logo.png" alt=""/><div><strong>ROBIA <span>IoT</span></strong><small>SIMPLIFIER LE QUOTIDIEN</small></div></div>; }
export function Shell({ user, logout, role, children }) { return <div className="shell"><aside className="sidebar"><Brand/><div className="side-label">ESPACE {role.toUpperCase()}</div><div className="side-current"><span className="nav-icon">▦</span> Tableau de bord</div><div className="sidebar-bottom"><span className="avatar">{(user?.name || user?.email || 'R').charAt(0).toUpperCase()}</span><div className="side-user"><strong>{user?.name || 'Compte Robia'}</strong><small>{user?.email}</small></div><button onClick={logout} className="logout">Déconnexion</button></div></aside><main className="content"><header className="topbar"><div><span className="eyebrow">ROBIA IOT</span><span className="top-divider">/</span><span>{role}</span></div><button className="mobile-logout" onClick={logout}>Déconnexion</button><span className="top-user">{user?.name || user?.email}</span></header>{children}</main></div>; }
export function Notice({ text, kind = 'error' }) { return text ? <div className={`notice ${kind}`} role="status">{text}</div> : null; }
export function useClockRefresh(callback, interval = 10000) { useEffect(() => { const id = setInterval(() => { if (document.visibilityState === 'visible') callback(); }, interval); const focus = () => { if (document.visibilityState === 'visible') callback(); }; document.addEventListener('visibilitychange', focus); return () => { clearInterval(id); document.removeEventListener('visibilitychange', focus); }; }, [callback, interval]); }
export const formatDate = value => value ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Antananarivo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
