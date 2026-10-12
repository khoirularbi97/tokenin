import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';
import { useTheme } from '../lib/theme.js';
import { useLive } from '../lib/live.jsx';
import { useAuth } from '../lib/auth.jsx';

const SOCKET_TEXT = {
  open: 'Server terhubung',
  connecting: 'Menghubungkan ke server',
  reconnecting: 'Menyambung ulang ke server',
};

export default function Header({ subtitle, back }) {
  const [theme, toggleTheme] = useTheme();
  const { socket } = useLive();
  const { logout } = useAuth();
  return (
    <header className="app-header">
      <div className="stack" style={{ gap: 2 }}>
        <Link to="/" className="logo">
          <Logo />
        </Link>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      <div className="header-actions">
        <span className="pill" role="status">
          <span className={`dot${socket === 'open' ? '' : ' warn'}`} aria-hidden="true" />
          {SOCKET_TEXT[socket] || SOCKET_TEXT.connecting}
        </span>
        <button type="button" className="pill" onClick={toggleTheme}>
          {theme === 'dark' ? 'Tema terang' : 'Tema gelap'}
        </button>
        {back ? (
          <Link to={back} className="pill">
            Kembali ke semua meteran
          </Link>
        ) : (
          <button type="button" className="pill" onClick={logout}>
            Keluar
          </button>
        )}
      </div>
    </header>
  );
}
