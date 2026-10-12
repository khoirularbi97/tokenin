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
  const socketText = SOCKET_TEXT[socket] || SOCKET_TEXT.connecting;
  return (
    <header className="app-header">
      <div className="stack" style={{ gap: 2 }}>
        <Link to="/" className="logo">
          <Logo />
        </Link>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      <div className="header-actions">
        <span className="pill" role="status" title={socketText}>
          <span className={`dot${socket === 'open' ? '' : ' warn'}`} aria-hidden="true" />
          <span className="long">{socketText}</span>
          <span className="short">{socket === 'open' ? 'Terhubung' : 'Menyambung'}</span>
        </span>
        <button type="button" className="pill" onClick={toggleTheme}>
          <span className="long">{theme === 'dark' ? 'Tema terang' : 'Tema gelap'}</span>
          <span className="short">{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
        </button>
        {back ? (
          <Link to={back} className="pill">
            <span className="long">Kembali ke semua meteran</span>
            <span className="short">Kembali</span>
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
