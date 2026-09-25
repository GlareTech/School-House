import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { api, setCsrf } from './api';
import { Admin } from './Admin';
import { Student } from './Student';
import {BrandImage} from './BrandImage';
import {PublicSite} from './PublicSite';
import {PlatformAdmin} from './PlatformAdmin';
import './style.css';
import './extras.css';
import './progress-report.css';
import './saas.css';
function App() {
  if(location.pathname.startsWith('/platform'))return <PlatformAdmin/>;
  const [user, setUser] = useState(null), [settings, setSettings] = useState({schoolName:'Schoolhouse',tagline:'Your school. Connected.',autosaveSeconds:5,kioskFullscreen:true}), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { Promise.allSettled([api('/config/public'),api('/auth/me')]).then(([c,u]) => { if(c.status==='fulfilled'){setSettings(c.value);document.documentElement.style.setProperty('--primary',c.value.primaryColor);document.documentElement.style.setProperty('--accent',c.value.accentColor);document.title=c.value.schoolName;} if(u.status==='fulfilled'){setUser(u.value.user);setCsrf(u.value.csrf);} }).finally(() => setLoading(false)); }, []);
  async function login(e) {
    e.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try { const data = await api('/auth/login', { method: 'POST', body: values }); setCsrf(data.csrf); setUser(data.user); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); setUser(null); setCsrf(''); }
    catch (err) { setError(err.message); }
  }
  if (loading) return <div className="loading">Opening Schoolhouse…</div>;
  if (!user) return <PublicSite onLogin={login} loginError={error} loginBusy={busy}/>;
  return <>{error && <div role="alert" className="error">{error}</div>}{user.role === 'STUDENT' ? <Student user={user} settings={settings} logout={logout}/> : <Admin user={user} settings={settings} logout={logout}/>}</>;
}
class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <main className="loading"><h1>Something went wrong</h1><p>Reload to reconnect. The server retains acknowledged exam answers.</p><button onClick={() => location.reload()}>Reload</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
