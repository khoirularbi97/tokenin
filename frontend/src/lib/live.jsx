import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { api, getToken, getWsUrl } from './api.js';
import { useAuth } from './auth.jsx';
import { load } from './storage.js';
import { kwh as fmtKwh } from './format.js';
import { notify } from './notify.js';
import { onAppResume } from './native.js';

// Data langsung dari server: meteran, perintah (job), foto terakhir, status koneksi
const LiveContext = createContext(null);

const initial = { devices: {}, order: [], jobs: {}, photos: {}, socket: 'connecting', loaded: false };

function upsertJob(list = [], job) {
  const idx = list.findIndex((j) => j.id === job.id);
  if (idx === -1) return [job, ...list].sort((a, b) => b.id - a.id).slice(0, 50);
  const copy = list.slice();
  copy[idx] = { ...copy[idx], ...job };
  return copy;
}

function reducer(state, action) {
  switch (action.type) {
    case 'devices': {
      const devices = {};
      for (const d of action.devices) devices[d.id] = d;
      return { ...state, devices, order: action.devices.map((d) => d.id), loaded: true };
    }
    case 'device': {
      const d = action.device;
      const order = state.order.includes(d.id) ? state.order : [...state.order, d.id];
      return { ...state, devices: { ...state.devices, [d.id]: { ...state.devices[d.id], ...d } }, order };
    }
    case 'removeDevice': {
      const devices = { ...state.devices };
      delete devices[action.id];
      return { ...state, devices, order: state.order.filter((id) => id !== action.id) };
    }
    case 'patchDevice': {
      const current = state.devices[action.id];
      if (!current) return state;
      return { ...state, devices: { ...state.devices, [action.id]: { ...current, ...action.patch } } };
    }
    case 'online': {
      const devices = { ...state.devices };
      for (const id of Object.keys(devices)) {
        devices[id] = { ...devices[id], online: action.ids.includes(Number(id)) };
      }
      return { ...state, devices };
    }
    case 'jobs':
      return { ...state, jobs: { ...state.jobs, [action.deviceId]: action.jobs } };
    case 'job':
      return {
        ...state,
        jobs: { ...state.jobs, [action.job.deviceId]: upsertJob(state.jobs[action.job.deviceId], action.job) },
      };
    case 'photo':
      return { ...state, photos: { ...state.photos, [action.deviceId]: action.photo } };
    case 'socket':
      return { ...state, socket: action.status };
    default:
      return state;
  }
}

export function LiveProvider({ children }) {
  const { logout } = useAuth();
  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshDevices = useCallback(async () => {
    const data = await api('/devices');
    dispatch({ type: 'devices', devices: data.devices });
    return data.devices;
  }, []);

  useEffect(() => {
    refreshDevices().catch(() => {});
  }, [refreshDevices]);

  // Koneksi WebSocket dengan sambung ulang otomatis
  useEffect(() => {
    let ws;
    let closed = false;
    let retry = 0;
    let retryTimer;
    let pingTimer;
    let pongTimer;

    function notifyLow(deviceId, value) {
      if (load('tokenin-notify') !== '1') return;
      const name = stateRef.current.devices[deviceId]?.name || 'Meteran';
      notify('Sisa kWh menipis', `${name}: ${fmtKwh(value)}`, `kwh-${deviceId}`);
    }

    function connect() {
      dispatch({ type: 'socket', status: retry === 0 ? 'connecting' : 'reconnecting' });
      const socket = new WebSocket(getWsUrl());
      ws = socket;
      socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: getToken() }));
      socket.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'pong') {
          clearTimeout(pongTimer);
        } else if (msg.type === 'ready') {
          retry = 0;
          dispatch({ type: 'socket', status: 'open' });
          dispatch({ type: 'online', ids: msg.online });
          clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'ping' }));
          }, 25000);
        } else if (msg.type === 'device') {
          if (!stateRef.current.devices[msg.deviceId]) refreshDevices().catch(() => {});
          dispatch({ type: 'patchDevice', id: msg.deviceId, patch: { online: msg.online, rssi: msg.rssi ?? null } });
        } else if (msg.type === 'job') {
          dispatch({ type: 'job', job: msg.job });
        } else if (msg.type === 'photo') {
          dispatch({ type: 'photo', deviceId: msg.photo.deviceId, photo: msg.photo });
        } else if (msg.type === 'kwh') {
          dispatch({
            type: 'patchDevice',
            id: msg.deviceId,
            patch: { lastKwh: msg.kwh, lastKwhAt: new Date().toISOString() },
          });
          if (msg.low) notifyLow(msg.deviceId, msg.kwh);
        }
      };
      socket.onclose = (event) => {
        // Abaikan socket lama yang sudah digantikan koneksi baru
        if (closed || socket !== ws) return;
        clearInterval(pingTimer);
        if (event.code === 4001) {
          logout();
          return;
        }
        dispatch({ type: 'socket', status: 'reconnecting' });
        retry += 1;
        const delay = Math.min(15000, 1000 * 2 ** Math.min(retry, 4));
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    // HP sering memutus koneksi saat aplikasi di latar belakang.
    // Saat dibuka lagi, sambung ulang langsung dan muat ulang data tanpa menunggu jeda retry.
    const stopResume = onAppResume(() => {
      if (closed) return;
      refreshDevices().catch(() => {});
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        clearTimeout(retryTimer);
        retry = 0;
        connect();
      } else if (ws.readyState === WebSocket.OPEN) {
        // Koneksi terlihat terbuka tapi bisa saja sudah mati. Cek dengan ping.
        const suspect = ws;
        suspect.send(JSON.stringify({ type: 'ping' }));
        clearTimeout(pongTimer);
        pongTimer = setTimeout(() => {
          if (ws !== suspect || closed) return;
          ws = null;
          suspect.close();
          retry = 0;
          connect();
        }, 5000);
      }
    });

    return () => {
      closed = true;
      stopResume();
      clearTimeout(retryTimer);
      clearTimeout(pongTimer);
      clearInterval(pingTimer);
      ws?.close();
    };
  }, [logout, refreshDevices]);

  const actions = useMemo(
    () => ({
      refreshDevices,
      setDevice: (device) => dispatch({ type: 'device', device }),
      removeDevice: (id) => dispatch({ type: 'removeDevice', id }),
      setJob: (job) => dispatch({ type: 'job', job }),
      async loadJobs(deviceId) {
        const data = await api(`/devices/${deviceId}/jobs?limit=20`);
        dispatch({ type: 'jobs', deviceId, jobs: data.jobs });
      },
      async loadPhoto(deviceId) {
        const data = await api(`/devices/${deviceId}/photos/latest`);
        dispatch({ type: 'photo', deviceId, photo: data.photo });
      },
    }),
    [refreshDevices]
  );

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

// Perintah yang sedang berjalan untuk satu meteran, kalau ada
export function activeJob(jobs = []) {
  return jobs.find((j) => !j.finishedAt) || null;
}
