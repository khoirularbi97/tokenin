import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { LiveProvider } from './lib/live.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import AddDevice from './pages/AddDevice.jsx';

function Protected() {
  const { loggedIn } = useAuth();
  if (!loggedIn) return <Navigate to="/masuk" replace />;
  return (
    <LiveProvider>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/meteran/baru" element={<AddDevice />} />
        <Route path="/meteran/:id" element={<DeviceDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LiveProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/masuk" element={<Login />} />
      <Route path="/*" element={<Protected />} />
    </Routes>
  );
}
