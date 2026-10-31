'use strict';

// Funciones pequeñas de formato: dinero, fechas y números en letras.
const U = (() => {
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const pad = n => String(n).padStart(2, '0');

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function thousands(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  const money = n => '$ ' + thousands(n);
  const parseMoney = s => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;

  const capitalize = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  // Fechas como texto 'AAAA-MM-DD' en hora local, para evitar líos de zona horaria.
  function toISO(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const todayISO = () => toISO(new Date());

  function parseISO(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function dateLong(iso) {
    if (!iso) return '';
    const d = parseISO(iso);
    return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
  }

  function dateShort(iso) {
    if (!iso) return '';
    const d = parseISO(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function addMonths(iso, n) {
    const d = parseISO(iso);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toISO(d);
  }

  function addDays(iso, n) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function daysBetween(fromIso, toIso) {
    return Math.round((parseISO(toIso) - parseISO(fromIso)) / 86400000);
  }

  // Un "periodo" es un mes: 'AAAA-MM'.
  const periodOf = iso => String(iso).slice(0, 7);
  const currentPeriod = () => periodOf(todayISO());

  function shiftPeriod(p, n) {
    return periodOf(addMonths(p + '-01', n));
  }

  function periodLabel(p) {
    const [y, m] = p.split('-').map(Number);
    return `${capitalize(MONTHS[m - 1])} ${y}`;
  }

  const monthName = p => MONTHS[Number(p.split('-')[1]) - 1];

  // ---- Números en letras (español) ----
  const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
    'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
    'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function below1000(x) {
    if (x === 100) return 'cien';
    const h = Math.floor(x / 100), r = x % 100;
    const rest = r < 30 ? UNITS[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ' y ' + UNITS[r % 10] : '');
    return [HUNDREDS[h], rest].filter(Boolean).join(' ');
  }

  // "uno" se acorta delante de "mil" y "millones": veintiún mil, treinta y un millones.
  const shorten = s => s.endsWith('veintiuno') ? s.slice(0, -9) + 'veintiún'
    : s.endsWith('uno') ? s.slice(0, -1) : s;

  function belowMillion(x) {
    const th = Math.floor(x / 1000), r = x % 1000;
    const parts = [];
    if (th === 1) parts.push('mil');
    else if (th > 1) parts.push(shorten(below1000(th)) + ' mil');
    if (r) parts.push(below1000(r));
    return parts.join(' ');
  }

  function words(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n === 0) return 'cero';
    const mi = Math.floor(n / 1e6), r = n % 1e6;
    const parts = [];
    if (mi === 1) parts.push('un millón');
    else if (mi > 1) parts.push(shorten(belowMillion(mi)) + ' millones');
    if (r) parts.push(belowMillion(r));
    return parts.join(' ');
  }

  function moneyWords(n) {
    n = Math.round(Number(n) || 0);
    const w = shorten(words(n));
    const de = n >= 1e6 && n % 1e6 === 0 ? ' de' : '';
    return (w + de + (n === 1 ? ' peso' : ' pesos')).toUpperCase();
  }

  // Achica las fotos del celular para que no ocupen tanto espacio.
  async function compressImage(file, maxSide = 1600, quality = 0.8) {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
      return blob && blob.size < file.size ? blob : file;
    } catch {
      return file;
    }
  }

  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function dataURLToBlob(url) {
    return (await fetch(url)).blob();
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeFilename(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  const onlyDigits = s => String(s ?? '').replace(/\D/g, '');
  // Sin tildes ni símbolos: algunos navegadores no aceptan nombres de archivo con "é" o "ñ".
  const safeFilename = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w .()-]+/g, '').replace(/\s+/g, ' ').trim();

  return {
    MONTHS, uid, esc, thousands, money, parseMoney, capitalize, toISO, todayISO, parseISO,
    dateLong, dateShort, addMonths, addDays, daysBetween, periodOf, currentPeriod, shiftPeriod,
    periodLabel, monthName, words, moneyWords, compressImage, blobToDataURL, dataURLToBlob,
    download, onlyDigits, safeFilename,
  };
})();
