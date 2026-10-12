import { Capacitor } from '@capacitor/core';

// Satu kode untuk semua platform. Modul ini memberi tahu kita sedang berjalan di mana.
export const isNative = Capacitor.isNativePlatform(); // aplikasi Android / iOS
export const nativePlatform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
export const desktop = typeof window !== 'undefined' ? window.tokeninDesktop || null : null; // aplikasi Electron
export const isDesktop = Boolean(desktop);
export const isApp = isNative || isDesktop;

export const platformName = isDesktop
  ? `desktop-${desktop.platform}`
  : isNative
    ? nativePlatform
    : 'web';
