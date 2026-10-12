// Pasang tema sebelum halaman tampil supaya tidak berkedip putih
try {
  var t = localStorage.getItem('tokenin-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
