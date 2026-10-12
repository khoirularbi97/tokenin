import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './platform.js';

// Notifikasi lintas platform: Android/iOS memakai notifikasi native,
// desktop (Electron) dan web memakai Notification API bawaan browser.

export async function notifySupported() {
  return isNative || 'Notification' in window;
}

export async function requestNotifyPermission() {
  if (isNative) {
    const status = await LocalNotifications.requestPermissions();
    return status.display === 'granted';
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

function numericId(tag) {
  let hash = 0;
  for (const ch of String(tag)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % 2147483647 || 1;
}

export async function notify(title, body, tag) {
  try {
    if (isNative) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: numericId(tag),
            title,
            body,
            // Tampil segera, tanpa meminta izin alarm tepat waktu ke pengguna
            isExactNotification: false,
            foreground: true,
          },
        ],
      });
      return;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
    }
  } catch {
    /* notifikasi gagal tidak boleh mengganggu aplikasi */
  }
}
