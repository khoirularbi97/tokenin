const numberFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function kwh(value) {
  return value === null || value === undefined ? '-- kWh' : `${numberFmt.format(value)} kWh`;
}

export function dateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function time(value) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function groupToken(digits) {
  return (digits.match(/.{1,4}/g) || []).join(' ');
}

export const jobStatusLabel = {
  queued: 'Menunggu alat',
  checking: 'Mengecek sisa kWh',
  pressing: 'Menekan tombol',
  done: 'Selesai',
  failed: 'Gagal',
};
