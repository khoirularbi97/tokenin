import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Meter3D from '../components/Meter3D.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useTheme } from '../lib/theme.js';

export default function Login() {
  const { loggedIn, login } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');
  const slowTimer = useRef();

  useEffect(() => () => clearTimeout(slowTimer.current), []);

  if (loggedIn) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    // Render versi gratis bisa butuh waktu untuk bangun dari tidur
    slowTimer.current = setTimeout(() => setSlow(true), 4000);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      clearTimeout(slowTimer.current);
      setSlow(false);
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <div className="login-inner">
        <Meter3D lcd="0000 0000" />
        <form className="panel login-card" onSubmit={onSubmit}>
          <div className="stack" style={{ gap: 6 }}>
            <h1 style={{ fontFamily: 'inherit' }}>
              <Logo size={30} dot={8} />
            </h1>
            <div className="muted" style={{ fontSize: 15 }}>
              Masuk untuk mengelola meteran kamu dari mana saja.
            </div>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Kata sandi</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-text" role="alert">{error}</div>}
          {slow && (
            <div className="muted" role="status">
              Server sedang dinyalakan. Ini bisa sampai satu menit pada akses pertama.
            </div>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Sedang masuk' : 'Masuk'}
          </button>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Lupa kata sandi? Hubungi admin.</span>
            <button type="button" className="pill" onClick={toggleTheme}>
              {theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
