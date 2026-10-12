import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { isNative, nativePlatform } from './platform.js';

// Warna ikon status bar Android/iOS mengikuti tema aplikasi
export function applySystemBars(theme) {
  if (!isNative) return;
  SystemBars.setStyle({ style: theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => {});
}

// Tombol back Android: mundur satu halaman, atau keluar ke layar utama HP dari halaman awal
export function useAndroidBackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNative || nativePlatform !== 'android') return undefined;
    const atRoot = location.pathname === '/' || location.pathname === '/masuk';
    const handle = App.addListener('backButton', ({ canGoBack }) => {
      if (!atRoot && canGoBack) navigate(-1);
      else if (!atRoot) navigate('/', { replace: true });
      else App.minimizeApp().catch(() => App.exitApp());
    });
    handle.catch(() => {});
    return () => {
      handle.then((h) => h.remove()).catch(() => {});
    };
  }, [location.pathname, navigate]);
}

// Dipanggil saat aplikasi HP dibuka lagi dari latar belakang
export function onAppResume(callback) {
  const onVisible = () => {
    if (document.visibilityState === 'visible') callback();
  };
  document.addEventListener('visibilitychange', onVisible);
  let nativeHandle = null;
  if (isNative) {
    nativeHandle = App.addListener('resume', callback);
    nativeHandle.catch(() => {});
  }
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    nativeHandle?.then((h) => h.remove()).catch(() => {});
  };
}
