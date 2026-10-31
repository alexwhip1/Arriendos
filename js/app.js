'use strict';

// ===================== Datos =====================

const S = {
  settings: {
    ownerName: '', ownerId: '', ownerAddress: '', ownerPhone: '', ownerEmail: '',
    city: '', countryCode: '', textSize: 'normal', lastBackup: '', startedOn: '',
  },
  buildings: [],  // { id, name, address }
  units: [],      // { id, buildingId, name }
  contracts: [],  // { id, unitId, tenantName, tenantId, tenantPhone, tenantEmail, cosigner*, startDate, signDate, months, rent, deposit, payDay, notes, status, endedOn, files: [{ fileId, label, added }] }
  payments: [],   // { id, contractId, unitId, period, amount, date, method, note, fileId, receiptNo }
  template: '',
  seq: { receipt: 0 },
};
const KEYS = Object.keys(S);

const save = (...keys) => Promise.all(keys.map(k => DB.put('data', k, S[k])));

async function load() {
  for (const k of KEYS) {
    const v = await DB.get('data', k);
    if (v !== undefined) S[k] = k === 'settings' ? { ...S.settings, ...v } : v;
  }
  if (!S.template) S.template = T.DEFAULT_CONTRACT;
  if (!S.settings.startedOn) {
    S.settings.startedOn = U.todayISO();
    await save('settings');
  }
  if (!S.buildings.length) {
    // Primera vez: dos edificios, uno de 6 y otro de 5 apartamentos. Se pueden renombrar en Configuración.
    [['Edificio 1', 6], ['Edificio 2', 5]].forEach(([name, count]) => {
      const b = { id: U.uid(), name, address: '' };
      S.buildings.push(b);
      for (let i = 1; i <= count; i++) S.units.push({ id: U.uid(), buildingId: b.id, name: `Apto ${i}` });
    });
    await save(...KEYS);
  }
}

const unitById = id => S.units.find(u => u.id === id);
const buildingById = id => S.buildings.find(b => b.id === id);
const contractById = id => S.contracts.find(c => c.id === id);
const paymentById = id => S.payments.find(p => p.id === id);
const activeContract = unitId => S.contracts.find(c => c.unitId === unitId && c.status === 'activo');
const contractEnd = c => U.addDays(U.addMonths(c.startDate, Number(c.months) || 12), -1);
const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';

function unitLabel(u) {
  const b = u && buildingById(u.buildingId);
  return u ? `${u.name}${b ? ' · ' + b.name : ''}` : '';
}

// El contrato que ocupaba el apartamento en un mes dado.
function contractFor(unitId, period) {
  return S.contracts
    .filter(c => c.unitId === unitId && U.periodOf(c.startDate) <= period
      && (!c.endedOn || U.periodOf(c.endedOn) >= period))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

const paidFor = (contractId, period) => S.payments
  .filter(p => p.contractId === contractId && p.period === period)
  .reduce((sum, p) => sum + p.amount, 0);

function status(c, period) {
  if (!c) return { code: 'vacant', label: 'Desocupado', paid: 0, missing: 0 };
  const paid = paidFor(c.id, period);
  const missing = Math.max(0, c.rent - paid);
  if (missing === 0) return { code: 'paid', label: '✅ Pagado', paid, missing };
  // Meses anteriores a empezar a usar la aplicación: no se sabe si pagaron.
  if (paid === 0 && period < U.periodOf(S.settings.startedOn)) {
    return { code: 'none', label: 'Sin registro', paid, missing: 0 };
  }
  if (paid > 0) return { code: 'partial', label: `⚠️ Pagó una parte — faltan ${U.money(missing)}`, paid, missing };
  const cur = U.currentPeriod();
  const day = new Date().getDate();
  if (period < cur || (period === cur && day > Number(c.payDay))) {
    return { code: 'late', label: '❗ Atrasado', paid, missing };
  }
  if (period > cur) return { code: 'pending', label: 'Todavía no corresponde', paid, missing };
  return { code: 'pending', label: `⏳ Pendiente — paga hasta el día ${c.payDay}`, paid, missing };
}

function waLink(phone, text) {
  let digits = U.onlyDigits(phone);
  const cc = U.onlyDigits(S.settings.countryCode);
  if (cc && digits.length <= 10 && !String(phone).trim().startsWith('+')) digits = cc + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function reminderText(c, period) {
  const u = unitById(c.unitId);
  const owner = S.settings.ownerName ? `, le saluda ${S.settings.ownerName}` : '';
  return `Hola ${firstName(c.tenantName)}${owner}. Le recuerdo amablemente el pago del arriendo de ` +
    `${U.monthName(period)} del ${u ? u.name : 'apartamento'}, por ${U.money(c.rent)}. Muchas gracias.`;
}

function receiptText(p) {
  const c = contractById(p.contractId);
  const u = unitById(p.unitId);
  const sign = S.settings.ownerName ? `\n${S.settings.ownerName}` : '';
  return `Hola ${firstName(c && c.tenantName)}. Confirmo que recibí su pago de ${U.money(p.amount)} ` +
    `por el arriendo de ${U.monthName(p.period)} ${p.period.slice(0, 4)} del ${u ? u.name : 'apartamento'}, ` +
    `el ${U.dateLong(p.date)}. Comprobante N° ${String(p.receiptNo).padStart(4, '0')}. Muchas gracias.${sign}`;
}

async function storeFile(file) {
  const blob = await U.compressImage(file);
  const id = U.uid();
  const ext = blob === file ? '' : '.jpg';
  await DB.put('files', id, { name: file.name + ext, type: blob.type || file.type, blob, added: U.todayISO() });
  return id;
}

// ===================== Pantalla: utilidades =====================

const app = document.getElementById('app');
let actions = {};
let viewPeriod = U.currentPeriod();
let justSaved = null;
let objectUrls = [];

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  toast.shownAt = Date.now();
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 4000);
}

function ask(msg, yes = 'Sí', no = 'No') {
  const dlg = document.getElementById('dlg');
  document.getElementById('dlg-msg').textContent = msg;
  document.getElementById('dlg-yes').textContent = yes;
  document.getElementById('dlg-no').textContent = no;
  return new Promise(resolve => {
    const done = v => { dlg.close(); resolve(v); };
    document.getElementById('dlg-yes').onclick = () => done(true);
    document.getElementById('dlg-no').onclick = () => done(false);
    dlg.oncancel = e => { e.preventDefault(); done(false); };
    dlg.showModal();
  });
}

function go(hash) {
  if (location.hash === '#' + hash) render();
  else location.hash = hash;
}

// Encabezado con botón grande para volver.
function pageHeader(title, back = '/') {
  const backBtn = back === null ? ''
    : back === 'history' ? '<button type="button" class="btn-back" data-act="historyBack">← Volver</button>'
      : `<a class="btn-back" href="#${back}">← Volver</a>`;
  return `<header class="top no-print">${backBtn}<h1>${U.esc(title)}</h1></header>`;
}

function field(label, name, value = '', opts = {}) {
  const { type = 'text', required = false, hint = '', attrs = '' } = opts;
  return `<label class="field"><span class="field-label">${U.esc(label)}${required ? ' <em>(obligatorio)</em>' : ''}</span>
    <input type="${type}" name="${name}" value="${U.esc(value)}" ${required ? 'required' : ''} ${attrs}>
    ${hint ? `<span class="hint">${U.esc(hint)}</span>` : ''}</label>`;
}

function moneyField(label, name, value, required = false) {
  return field(label, name, value ? U.thousands(value) : '', {
    required, attrs: 'inputmode="numeric" data-money autocomplete="off"', hint: 'Escriba solo el número, con o sin puntos. Ejemplo: 850.000',
  });
}

function selectField(label, name, options, value) {
  return `<label class="field"><span class="field-label">${U.esc(label)}</span>
    <select name="${name}">${options.map(([v, t]) =>
      `<option value="${U.esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${U.esc(t)}</option>`).join('')}
    </select></label>`;
}

function fileButton(name, label) {
  return `<div class="file-pick">
    <label class="btn btn-big btn-outline">${label}
      <input type="file" name="${name}" accept="image/*,application/pdf" hidden>
    </label>
    <div class="file-preview" data-preview="${name}"></div></div>`;
}

function bindFilePreview(form) {
  form.querySelectorAll('input[type=file]').forEach(input => {
    input.addEventListener('change', () => {
      const box = form.querySelector(`[data-preview="${input.name}"]`);
      const f = input.files[0];
      if (!f) { box.innerHTML = ''; return; }
      if (f.type.startsWith('image/')) {
        const url = URL.createObjectURL(f);
        objectUrls.push(url);
        box.innerHTML = `<img src="${url}" alt="Foto elegida"><p>✅ Foto lista: ${U.esc(f.name)}</p>`;
      } else {
        box.innerHTML = `<p>✅ Archivo listo: ${U.esc(f.name)}</p>`;
      }
    });
  });
}

function bindMoneyInputs(form) {
  form.querySelectorAll('[data-money]').forEach(inp => {
    inp.addEventListener('blur', () => {
      const n = U.parseMoney(inp.value);
      inp.value = n ? U.thousands(n) : '';
    });
  });
}

function printPage() { window.print(); }

function downloadWord(innerHTML, filename) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="utf-8"><title>${U.esc(filename)}</title>
    <style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5}p{text-align:justify}
    .blank{letter-spacing:1px}</style></head><body>${innerHTML}</body></html>`;
  U.download(new Blob(['\ufeff', doc], { type: 'application/msword' }), filename + '.doc');
}

// ===================== Inicio =====================

function viewHome() {
  const p = viewPeriod;
  const cur = U.currentPeriod();
  let occupied = 0, paidCount = 0, owed = 0, collected = 0;
  const late = [];

  const sections = S.buildings.map(b => {
    const cards = S.units.filter(u => u.buildingId === b.id).map(u => {
      const c = contractFor(u.id, p);
      const st = status(c, p);
      if (c) {
        occupied++;
        owed += st.missing;
        collected += st.paid;
        if (st.code === 'paid') paidCount++;
        if (st.code === 'late' || st.code === 'partial') late.push({ u, c, st });
      }
      return `<a class="unit-card st-${st.code}" href="#/u/${u.id}">
        <span class="unit-name">${U.esc(u.name)}</span>
        <span class="unit-tenant">${c ? U.esc(c.tenantName) : 'Sin arrendatario'}</span>
        ${c ? `<span class="unit-rent">${U.money(c.rent)}</span>` : ''}
        <span class="badge">${U.esc(st.label)}</span>
      </a>`;
    }).join('');
    return `<section class="building">
      <h2>${U.esc(b.name)}${b.address ? ` <small>${U.esc(b.address)}</small>` : ''}</h2>
      <div class="unit-grid">${cards || '<p>Este edificio no tiene apartamentos. Agréguelos en Configuración.</p>'}</div>
    </section>`;
  }).join('');

  const alerts = [];
  if (p === cur) {
    late.forEach(({ u, c, st }) => {
      alerts.push(`<li class="alert alert-red">
        <span><strong>${U.esc(u.name)}</strong> (${U.esc(c.tenantName)}) — ${st.code === 'late' ? 'no ha pagado' : U.esc(st.label)}</span>
        ${c.tenantPhone ? `<a class="btn btn-small btn-wa" target="_blank" rel="noopener" href="${waLink(c.tenantPhone, reminderText(c, p))}">Recordar por WhatsApp</a>` : ''}
      </li>`);
    });
    S.contracts.filter(c => c.status === 'activo').forEach(c => {
      const days = U.daysBetween(U.todayISO(), contractEnd(c));
      if (days <= 60) {
        const u = unitById(c.unitId);
        alerts.push(`<li class="alert alert-amber">
          <span>📅 El contrato de <strong>${U.esc(u ? u.name : '')}</strong> (${U.esc(c.tenantName)})
          ${days < 0 ? 'venció' : 'vence'} el ${U.dateLong(contractEnd(c))}</span>
          <a class="btn btn-small" href="#/contrato-renovar/${c.id}">Renovar</a>
        </li>`);
      }
    });
    const hasData = S.contracts.length > 0;
    const since = S.settings.lastBackup ? U.daysBetween(S.settings.lastBackup, U.todayISO()) : Infinity;
    if (hasData && since > 30) {
      alerts.push(`<li class="alert alert-amber"><span>💾 ${S.settings.lastBackup
        ? `Hace ${since} días que no guarda una copia de seguridad.` : 'Todavía no ha guardado una copia de seguridad.'}</span>
        <a class="btn btn-small" href="#/respaldo">Guardar copia</a></li>`);
    }
    if (!S.settings.ownerName) {
      alerts.push(`<li class="alert alert-blue"><span>👋 Para empezar, escriba sus datos (nombre, cédula, dirección) en Configuración. Así salen solos en los contratos.</span>
        <a class="btn btn-small" href="#/config">Ir a Configuración</a></li>`);
    }
  }

  app.innerHTML = `
    <header class="top home-top"><h1>🏠 Mis Arriendos</h1><p class="today">Hoy es ${U.dateLong(U.todayISO())}</p></header>
    <nav class="month-nav" aria-label="Cambiar de mes">
      <button type="button" class="btn" data-act="prev">◀ ${U.capitalize(U.monthName(U.shiftPeriod(p, -1)))}</button>
      <div class="month-current"><strong>${U.periodLabel(p)}</strong>
        ${p !== cur ? '<button type="button" class="btn btn-small" data-act="today">Volver a este mes</button>' : ''}</div>
      <button type="button" class="btn" data-act="next">${U.capitalize(U.monthName(U.shiftPeriod(p, 1)))} ▶</button>
    </nav>
    <div class="summary">
      <div><span>Pagaron</span><strong>${paidCount} de ${occupied}</strong></div>
      <div><span>Recibido</span><strong>${U.money(collected)}</strong></div>
      <div><span>Falta por recibir</span><strong>${U.money(owed)}</strong></div>
    </div>
    ${alerts.length ? `<ul class="alerts">${alerts.join('')}</ul>` : ''}
    <p class="tip">Toque un apartamento para registrar un pago o ver el contrato.</p>
    ${sections}
    <div class="bottom-actions">
      <a class="btn btn-big" href="#/config">⚙️ Configuración</a>
      <a class="btn btn-big" href="#/respaldo">💾 Copia de seguridad</a>
    </div>`;

  actions = {
    prev: () => { viewPeriod = U.shiftPeriod(viewPeriod, -1); render(); },
    next: () => { viewPeriod = U.shiftPeriod(viewPeriod, 1); render(); },
    today: () => { viewPeriod = U.currentPeriod(); render(); },
  };
}

// ===================== Apartamento =====================

function viewUnit(unitId) {
  const u = unitById(unitId);
  if (!u) return go('/');
  const c = activeContract(u.id);
  const cur = U.currentPeriod();
  const payments = S.payments.filter(p => p.unitId === u.id)
    .sort((a, b) => b.period.localeCompare(a.period) || b.date.localeCompare(a.date));
  const past = S.contracts.filter(x => x.unitId === u.id && x.status !== 'activo')
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  let body;
  if (c) {
    const st = status(c, cur);
    const end = contractEnd(c);
    const daysLeft = U.daysBetween(U.todayISO(), end);
    body = `
      <section class="panel st-${st.code}">
        <p class="big-name">${U.esc(c.tenantName)}</p>
        <p class="badge badge-big">${U.periodLabel(cur)}: ${U.esc(st.label)}</p>
        <dl class="facts">
          <dt>Arriendo mensual</dt><dd>${U.money(c.rent)}</dd>
          <dt>Paga hasta el día</dt><dd>${U.esc(c.payDay)} de cada mes</dd>
          <dt>Contrato</dt><dd>${U.dateShort(c.startDate)} al ${U.dateShort(end)}
            ${daysLeft < 0 ? '<strong class="red">(vencido)</strong>' : daysLeft <= 60 ? `<strong class="amber">(quedan ${daysLeft} días)</strong>` : ''}</dd>
          ${c.tenantId ? `<dt>Cédula</dt><dd>${U.esc(c.tenantId)}</dd>` : ''}
          ${c.tenantPhone ? `<dt>Teléfono</dt><dd>${U.esc(c.tenantPhone)}</dd>` : ''}
        </dl>
        ${c.tenantPhone ? `<div class="row-buttons">
          <a class="btn" href="tel:${U.esc(U.onlyDigits(c.tenantPhone))}">📞 Llamar</a>
          <a class="btn btn-wa" target="_blank" rel="noopener" href="${waLink(c.tenantPhone, reminderText(c, cur))}">💬 Recordar pago por WhatsApp</a>
        </div>` : ''}
      </section>
      <div class="actions">
        <a class="btn btn-big btn-primary" href="#/pagar/${c.id}">💵 Registrar un pago</a>
        <a class="btn btn-big" href="#/pagos/${u.id}">🧾 Ver pagos y recibos</a>
        <a class="btn btn-big" href="#/contrato/${c.id}">📄 Ver o imprimir el contrato</a>
        <a class="btn btn-big" href="#/documentos/${c.id}">📎 Documentos (contrato firmado, cédula)</a>
        <a class="btn btn-big" href="#/contrato-renovar/${c.id}">🔁 Renovar contrato</a>
        <a class="btn btn-big" href="#/contrato-editar/${c.id}">✏️ Corregir datos del arrendatario</a>
        <button type="button" class="btn btn-big btn-danger-outline" data-act="end">🚪 El arrendatario se va (terminar contrato)</button>
      </div>`;
  } else {
    body = `
      <section class="panel st-vacant">
        <p class="big-name">Este apartamento está desocupado</p>
        <p>Cuando llegue un nuevo arrendatario, toque el botón de abajo. Solo tendrá que escribir sus datos y el contrato se hace solo.</p>
      </section>
      <div class="actions">
        <a class="btn btn-big btn-primary" href="#/contrato-nuevo/${u.id}">➕ Nuevo arrendatario y contrato</a>
        ${payments.length ? `<a class="btn btn-big" href="#/pagos/${u.id}">🧾 Ver pagos anteriores</a>` : ''}
      </div>`;
  }

  const recent = payments.slice(0, 4).map(p => `
    <li><a href="#/comprobante/${p.id}"><span>${U.periodLabel(p.period)}</span><strong>${U.money(p.amount)}</strong>
      <span class="muted">pagado el ${U.dateShort(p.date)}</span></a></li>`).join('');

  app.innerHTML = `${pageHeader(unitLabel(u))}
    ${body}
    ${recent ? `<section class="block"><h2>Últimos pagos</h2><ul class="link-list">${recent}</ul></section>` : ''}
    ${past.length ? `<section class="block"><h2>Arrendatarios anteriores</h2><ul class="link-list">${past.map(x => `
      <li><a href="#/contrato/${x.id}"><span>${U.esc(x.tenantName)}</span>
      <span class="muted">${U.dateShort(x.startDate)} al ${U.dateShort(x.endedOn || contractEnd(x))}</span></a></li>`).join('')}</ul></section>` : ''}`;

  actions = {
    end: async () => {
      if (!await ask(`¿Seguro que ${c.tenantName} deja el ${u.name}? El contrato quedará guardado como terminado.`,
        'Sí, terminar contrato', 'No, volver')) return;
      c.status = 'terminado';
      c.endedOn = U.todayISO();
      await save('contracts');
      toast('Contrato terminado. El apartamento quedó desocupado.');
      render();
    },
  };
}

// ===================== Registrar pago =====================

function viewPay(contractId) {
  const c = contractById(contractId);
  if (!c) return go('/');
  const u = unitById(c.unitId);
  const cur = U.currentPeriod();
  const startP = U.periodOf(c.startDate);
  const from = startP > U.shiftPeriod(cur, -12) ? startP : U.shiftPeriod(cur, -12);
  const periods = [];
  for (let p = from; p <= U.shiftPeriod(cur, 2); p = U.shiftPeriod(p, 1)) periods.push(p);
  const tracked = U.periodOf(S.settings.startedOn);
  const firstUnpaid = periods.find(p => p >= tracked && p <= U.shiftPeriod(cur, 1) && paidFor(c.id, p) < c.rent) || cur;
  const missing = p => Math.max(0, c.rent - paidFor(c.id, p));

  app.innerHTML = `${pageHeader('Registrar un pago', '/u/' + u.id)}
    <p class="lead">${U.esc(c.tenantName)} — ${U.esc(unitLabel(u))}</p>
    <form id="f" class="form" novalidate>
      ${selectField('¿Qué mes está pagando?', 'period', periods.map(p => [p,
        U.periodLabel(p) + (missing(p) === 0 ? ' (ya pagado)' : paidFor(c.id, p) ? ' (pagó una parte)' : '')]), firstUnpaid)}
      ${moneyField('¿Cuánto pagó?', 'amount', missing(firstUnpaid) || c.rent, true)}
      ${field('Fecha en que pagó', 'date', U.todayISO(), { type: 'date', required: true })}
      <fieldset class="field"><legend class="field-label">¿Cómo pagó?</legend>
        <div class="choices">${['Efectivo', 'Transferencia', 'Depósito', 'Otro'].map((m, i) => `
          <label class="choice"><input type="radio" name="method" value="${m}" ${i === 0 ? 'checked' : ''}> ${m}</label>`).join('')}
        </div></fieldset>
      <div class="field"><span class="field-label">Foto del recibo o comprobante <em>(opcional)</em></span>
        ${fileButton('file', '📷 Tomar foto o elegir archivo')}</div>
      ${field('Nota (opcional)', 'note', '', { hint: 'Por ejemplo: "pagó con transferencia del hijo"' })}
      <button type="submit" class="btn btn-big btn-primary">✅ Guardar pago</button>
      <a class="btn btn-big" href="#/u/${u.id}">Cancelar</a>
    </form>`;

  const f = document.getElementById('f');
  bindFilePreview(f);
  bindMoneyInputs(f);
  f.period.addEventListener('change', () => { f.amount.value = U.thousands(missing(f.period.value) || c.rent); });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const amount = U.parseMoney(f.amount.value);
    if (!amount) return toast('Escriba cuánto pagó.');
    if (!f.date.value) return toast('Escriba la fecha del pago.');
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const file = f.file.files[0];
      S.seq.receipt = (S.seq.receipt || 0) + 1;
      const p = {
        id: U.uid(), contractId: c.id, unitId: c.unitId, period: f.period.value, amount,
        date: f.date.value, method: f.method.value, note: f.note.value.trim(),
        fileId: file ? await storeFile(file) : null, receiptNo: S.seq.receipt,
      };
      S.payments.push(p);
      await save('payments', 'seq');
      justSaved = p.id;
      go('/comprobante/' + p.id);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = '✅ Guardar pago';
      toast('No se pudo guardar. Intente de nuevo.');
    }
  });
}

// ===================== Comprobante =====================

function viewReceipt(paymentId) {
  const p = paymentById(paymentId);
  if (!p) return go('/');
  const c = contractById(p.contractId);
  const u = unitById(p.unitId);
  const b = u && buildingById(u.buildingId);
  const fresh = justSaved === p.id;
  justSaved = null;
  const phone = c && c.tenantPhone;

  app.innerHTML = `${pageHeader('Comprobante de pago', '/u/' + p.unitId)}
    ${fresh ? `<div class="success no-print">✅ ¡Pago guardado! Si quiere, envíele el comprobante al arrendatario.</div>` : ''}
    <div class="actions no-print">
      ${phone ? `<a class="btn btn-big btn-wa" target="_blank" rel="noopener" href="${waLink(phone, receiptText(p))}">💬 Enviar comprobante por WhatsApp</a>` : ''}
      <button type="button" class="btn btn-big" data-act="print">🖨️ Imprimir comprobante</button>
      ${p.fileId ? `<a class="btn btn-big" href="#/archivo/${p.fileId}">🖼️ Ver foto del recibo</a>` : ''}
      <a class="btn btn-big ${fresh ? 'btn-primary' : ''}" href="#/">🏠 Volver al inicio</a>
    </div>
    <article class="paper">${T.receiptHTML(S, p, c || {}, u, b)}</article>
    <div class="actions no-print">
      <button type="button" class="btn btn-danger-outline" data-act="del">🗑️ Borrar este pago (si fue un error)</button>
    </div>`;

  actions = {
    print: printPage,
    del: async () => {
      if (!await ask(`¿Borrar el pago de ${U.money(p.amount)} de ${U.periodLabel(p.period)}?`, 'Sí, borrar', 'No')) return;
      S.payments = S.payments.filter(x => x.id !== p.id);
      await save('payments');
      if (p.fileId) await DB.del('files', p.fileId);
      toast('Pago borrado.');
      go('/u/' + p.unitId);
    },
  };
}

// ===================== Lista de pagos =====================

function viewPayments(unitId) {
  const u = unitById(unitId);
  if (!u) return go('/');
  const list = S.payments.filter(p => p.unitId === u.id)
    .sort((a, b) => b.period.localeCompare(a.period) || b.date.localeCompare(a.date));
  const total = list.reduce((s, p) => s + p.amount, 0);

  app.innerHTML = `${pageHeader('Pagos de ' + unitLabel(u), '/u/' + u.id)}
    ${list.length ? `<p class="lead">${list.length} pagos registrados · Total ${U.money(total)}</p>
    <ul class="pay-list">${list.map(p => {
      const c = contractById(p.contractId);
      return `<li class="pay-item">
        <div><strong>${U.periodLabel(p.period)}</strong> — ${U.money(p.amount)}<br>
        <span class="muted">${U.esc(c ? c.tenantName : '')} · pagó el ${U.dateShort(p.date)} · ${U.esc(p.method || '')}</span></div>
        <div class="row-buttons">
          <a class="btn" href="#/comprobante/${p.id}">🧾 Comprobante</a>
          ${p.fileId ? `<a class="btn" href="#/archivo/${p.fileId}">🖼️ Foto del recibo</a>` : ''}
        </div></li>`;
    }).join('')}</ul>` : '<p class="lead">Todavía no hay pagos registrados.</p>'}`;
}

// ===================== Ver archivo =====================

async function viewFile(fileId) {
  app.innerHTML = `${pageHeader('Archivo', 'history')}<p>Cargando…</p>`;
  const f = await DB.get('files', fileId);
  if (!f) {
    app.innerHTML = `${pageHeader('Archivo', 'history')}<p class="lead">No se encontró el archivo.</p>`;
    return;
  }
  const url = URL.createObjectURL(f.blob);
  objectUrls.push(url);
  const isImg = (f.type || '').startsWith('image/');
  app.innerHTML = `${pageHeader(f.name || 'Archivo', 'history')}
    <div class="actions"><button type="button" class="btn btn-big" data-act="dl">⬇️ Descargar</button></div>
    ${isImg ? `<img class="file-view" src="${url}" alt="${U.esc(f.name)}">`
      : `<iframe class="file-view" src="${url}" title="${U.esc(f.name)}"></iframe>`}`;
  actions = { dl: () => U.download(f.blob, f.name || 'archivo') };
}

// ===================== Contrato: formulario =====================

function viewContractForm({ unitId, editId, renewId }) {
  let c, u, title, back;
  if (editId) {
    c = { ...contractById(editId) };
    title = 'Corregir datos';
  } else if (renewId) {
    const old = contractById(renewId);
    c = { ...old, id: undefined, files: [], startDate: U.addDays(contractEnd(old), 1), signDate: U.todayISO() };
    title = 'Renovar contrato';
  } else {
    // Nuevo arrendatario: se copian las condiciones del último contrato del apartamento.
    const last = S.contracts.filter(x => x.unitId === unitId).sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    c = {
      unitId, startDate: U.todayISO(), signDate: U.todayISO(), months: last ? last.months : 12,
      rent: last ? last.rent : '', deposit: last ? last.deposit : '', payDay: last ? last.payDay : 5,
    };
    title = 'Nuevo arrendatario';
  }
  if (!c || !c.unitId) return go('/');
  u = unitById(c.unitId);
  back = editId || renewId ? '/u/' + c.unitId : '/u/' + unitId;

  app.innerHTML = `${pageHeader(title, back)}
    <p class="lead">${U.esc(unitLabel(u))}</p>
    ${renewId ? '<p class="tip">Revise el valor del arriendo (por si lo va a subir) y la fecha de inicio. Lo demás ya está escrito.</p>' : ''}
    ${!editId && !renewId ? '<p class="tip">Escriba los datos del nuevo arrendatario. El contrato se arma solo con estos datos.</p>' : ''}
    <form id="f" class="form" novalidate>
      <fieldset><legend>👤 Arrendatario</legend>
        ${field('Nombre completo', 'tenantName', c.tenantName, { required: true, attrs: 'autocomplete="off"' })}
        ${field('Cédula', 'tenantId', c.tenantId, { attrs: 'autocomplete="off"' })}
        ${field('Teléfono / celular', 'tenantPhone', c.tenantPhone, { type: 'tel', hint: 'Para llamar o mandar WhatsApp' })}
        ${field('Correo electrónico (opcional)', 'tenantEmail', c.tenantEmail, { type: 'email' })}
      </fieldset>
      <fieldset><legend>📄 Condiciones</legend>
        ${moneyField('Arriendo mensual', 'rent', c.rent, true)}
        ${moneyField('Depósito o garantía', 'deposit', c.deposit)}
        ${selectField('Paga hasta el día', 'payDay', Array.from({ length: 31 }, (_, i) => [i + 1, `${i + 1} de cada mes`]), c.payDay)}
        ${field('Fecha de inicio', 'startDate', c.startDate, { type: 'date', required: true })}
        ${selectField('Duración', 'months', [6, 12, 18, 24, 36].map(m => [m, `${m} meses`]), c.months)}
        ${field('Fecha en que se firma', 'signDate', c.signDate || U.todayISO(), { type: 'date' })}
      </fieldset>
      <details ${c.cosignerName ? 'open' : ''}><summary>👥 Codeudor (opcional — toque para abrir)</summary>
        ${field('Nombre del codeudor', 'cosignerName', c.cosignerName)}
        ${field('Cédula del codeudor', 'cosignerId', c.cosignerId)}
        ${field('Teléfono del codeudor', 'cosignerPhone', c.cosignerPhone, { type: 'tel' })}
      </details>
      ${field('Notas (opcional)', 'notes', c.notes)}
      <button type="submit" class="btn btn-big btn-primary">✅ Guardar ${editId ? 'cambios' : 'y ver el contrato'}</button>
      <a class="btn btn-big" href="#${back}">Cancelar</a>
    </form>`;

  const f = document.getElementById('f');
  bindMoneyInputs(f);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const val = n => f[n].value.trim();
    const data = {
      tenantName: val('tenantName'), tenantId: val('tenantId'), tenantPhone: val('tenantPhone'),
      tenantEmail: val('tenantEmail'), cosignerName: val('cosignerName'), cosignerId: val('cosignerId'),
      cosignerPhone: val('cosignerPhone'), notes: val('notes'),
      rent: U.parseMoney(f.rent.value), deposit: U.parseMoney(f.deposit.value),
      payDay: Number(f.payDay.value), months: Number(f.months.value),
      startDate: f.startDate.value, signDate: f.signDate.value || U.todayISO(),
    };
    if (!data.tenantName) return toast('Falta el nombre del arrendatario.');
    if (!data.rent) return toast('Falta el valor del arriendo.');
    if (!data.startDate) return toast('Falta la fecha de inicio.');

    let id;
    if (editId) {
      Object.assign(contractById(editId), data);
      id = editId;
    } else {
      if (renewId) {
        const old = contractById(renewId);
        old.status = 'terminado';
        old.endedOn = U.addDays(data.startDate, -1);
      }
      id = U.uid();
      S.contracts.push({ ...data, id, unitId: c.unitId, status: 'activo', endedOn: null, files: [] });
    }
    await save('contracts');
    toast(editId ? 'Cambios guardados.' : 'Contrato listo. Revíselo e imprímalo.');
    go('/contrato/' + id);
  });
}

// ===================== Contrato: ver e imprimir =====================

function viewContract(contractId) {
  const c = contractById(contractId);
  if (!c) return go('/');
  const u = unitById(c.unitId);
  const b = u && buildingById(u.buildingId);
  const html = T.fill(S.template, T.contractValues(S, c, u, b));
  const missing = (html.match(/class="blank"/g) || []).length;

  app.innerHTML = `${pageHeader('Contrato de ' + c.tenantName, '/u/' + c.unitId)}
    ${c.status !== 'activo' ? '<p class="tip no-print">Este contrato ya terminó. Se guarda solo como registro.</p>' : ''}
    ${missing ? `<p class="tip no-print">ℹ️ Hay ${missing} datos en blanco (se ven como una raya). Puede completarlos en
      ${S.settings.ownerName ? '' : '<a href="#/config">Configuración</a> o '}<a href="#/contrato-editar/${c.id}">Corregir datos</a>, o escribirlos a mano después de imprimir.</p>` : ''}
    <div class="actions no-print">
      <button type="button" class="btn btn-big btn-primary" data-act="print">🖨️ Imprimir o guardar como PDF</button>
      <button type="button" class="btn btn-big" data-act="word">⬇️ Descargar para Word</button>
      <a class="btn btn-big" href="#/documentos/${c.id}">📎 Subir el contrato firmado</a>
    </div>
    <article class="paper contract">${html}</article>
    <p class="tip no-print">¿Quiere cambiar el texto de todos los contratos? Vaya a <a href="#/plantilla">Configuración → Texto del contrato</a>.</p>`;

  actions = {
    print: printPage,
    word: () => downloadWord(html, `Contrato ${u ? u.name : ''} - ${c.tenantName}`),
  };
}

// ===================== Documentos del contrato =====================

function viewDocs(contractId) {
  const c = contractById(contractId);
  if (!c) return go('/');
  c.files = c.files || [];

  app.innerHTML = `${pageHeader('Documentos de ' + c.tenantName, '/u/' + c.unitId)}
    ${c.files.length ? `<ul class="pay-list">${c.files.map((d, i) => `
      <li class="pay-item"><div><strong>${U.esc(d.label)}</strong><br><span class="muted">subido el ${U.dateShort(d.added)}</span></div>
      <div class="row-buttons"><a class="btn" href="#/archivo/${d.fileId}">👁️ Ver</a>
      <button type="button" class="btn btn-danger-outline" data-act="del" data-i="${i}">🗑️ Borrar</button></div></li>`).join('')}</ul>`
      : '<p class="lead">Todavía no hay documentos guardados.</p>'}
    <form id="f" class="form">
      <h2>Agregar un documento</h2>
      ${selectField('¿Qué documento es?', 'label', [['Contrato firmado', 'Contrato firmado'],
        ['Cédula del arrendatario', 'Cédula del arrendatario'], ['Cédula del codeudor', 'Cédula del codeudor'],
        ['Inventario / acta de entrega', 'Inventario / acta de entrega'], ['Otro documento', 'Otro documento']], 'Contrato firmado')}
      ${fileButton('file', '📷 Tomar foto o elegir archivo')}
      <button type="submit" class="btn btn-big btn-primary">✅ Guardar documento</button>
    </form>`;

  const f = document.getElementById('f');
  bindFilePreview(f);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const file = f.file.files[0];
    if (!file) return toast('Primero tome la foto o elija el archivo.');
    c.files.push({ fileId: await storeFile(file), label: f.label.value, added: U.todayISO() });
    await save('contracts');
    toast('Documento guardado.');
    render();
  });
  actions = {
    del: async el => {
      const d = c.files[Number(el.dataset.i)];
      if (!await ask(`¿Borrar "${d.label}"?`, 'Sí, borrar', 'No')) return;
      c.files.splice(Number(el.dataset.i), 1);
      await save('contracts');
      await DB.del('files', d.fileId);
      render();
    },
  };
}

// ===================== Configuración =====================

function viewSettings() {
  const s = S.settings;
  const sizes = [['normal', 'Normal'], ['grande', 'Grande'], ['muy-grande', 'Muy grande']];

  app.innerHTML = `${pageHeader('Configuración')}
    <section class="block"><h2>Tamaño de la letra</h2>
      <div class="row-buttons">${sizes.map(([k, t]) =>
        `<button type="button" class="btn ${s.textSize === k ? 'btn-primary' : ''}" data-act="size" data-size="${k}">${t}</button>`).join('')}</div>
    </section>

    <form id="owner" class="form block">
      <h2>Mis datos (salen en los contratos y comprobantes)</h2>
      ${field('Mi nombre completo', 'ownerName', s.ownerName)}
      ${field('Mi cédula', 'ownerId', s.ownerId)}
      ${field('Mi dirección', 'ownerAddress', s.ownerAddress)}
      ${field('Mi teléfono', 'ownerPhone', s.ownerPhone, { type: 'tel' })}
      ${field('Mi correo (opcional)', 'ownerEmail', s.ownerEmail, { type: 'email' })}
      ${field('Ciudad', 'city', s.city, { hint: 'La ciudad donde se firman los contratos' })}
      ${field('Código de país para WhatsApp', 'countryCode', s.countryCode, { attrs: 'inputmode="numeric"', hint: 'Ejemplo: 57 para Colombia, 56 para Chile. Se agrega solo a los celulares.' })}
      <button type="submit" class="btn btn-big btn-primary">✅ Guardar mis datos</button>
    </form>

    <form id="props" class="form block">
      <h2>Edificios y apartamentos</h2>
      ${S.buildings.map(b => `<fieldset class="building-edit"><legend>${U.esc(b.name)}</legend>
        ${field('Nombre del edificio', 'b-name-' + b.id, b.name)}
        ${field('Dirección del edificio', 'b-addr-' + b.id, b.address, { hint: 'Sale en el contrato' })}
        <p class="field-label">Apartamentos</p>
        ${S.units.filter(u => u.buildingId === b.id).map(u => `<div class="inline-row">
          <input type="text" name="u-name-${u.id}" value="${U.esc(u.name)}" aria-label="Nombre del apartamento">
          <button type="button" class="btn btn-small btn-danger-outline" data-act="delUnit" data-id="${u.id}">Quitar</button></div>`).join('')}
        <div class="row-buttons">
          <button type="button" class="btn btn-small" data-act="addUnit" data-id="${b.id}">➕ Agregar apartamento</button>
          <button type="button" class="btn btn-small btn-danger-outline" data-act="delBuilding" data-id="${b.id}">Quitar edificio</button>
        </div></fieldset>`).join('')}
      <button type="button" class="btn" data-act="addBuilding">➕ Agregar otro edificio</button>
      <button type="submit" class="btn btn-big btn-primary">✅ Guardar edificios</button>
    </form>

    <section class="block"><h2>Más opciones</h2>
      <div class="actions">
        <a class="btn btn-big" href="#/plantilla">📝 Texto del contrato</a>
        <a class="btn btn-big" href="#/respaldo">💾 Copia de seguridad</a>
      </div>
    </section>`;

  const owner = document.getElementById('owner');
  owner.addEventListener('submit', async e => {
    e.preventDefault();
    ['ownerName', 'ownerId', 'ownerAddress', 'ownerPhone', 'ownerEmail', 'city', 'countryCode']
      .forEach(k => { S.settings[k] = owner[k].value.trim(); });
    await save('settings');
    toast('Sus datos quedaron guardados.');
  });

  const props = document.getElementById('props');
  const readProps = () => {
    S.buildings.forEach(b => {
      b.name = props['b-name-' + b.id].value.trim() || b.name;
      b.address = props['b-addr-' + b.id].value.trim();
    });
    S.units.forEach(u => {
      const inp = props['u-name-' + u.id];
      if (inp) u.name = inp.value.trim() || u.name;
    });
  };
  const saveProps = async msg => {
    await save('buildings', 'units');
    if (msg) toast(msg);
    render();
  };
  props.addEventListener('submit', async e => { e.preventDefault(); readProps(); await saveProps('Edificios guardados.'); });

  const hasHistory = unitId => S.contracts.some(c => c.unitId === unitId);
  actions = {
    size: async el => { S.settings.textSize = el.dataset.size; applyTextSize(); await save('settings'); render(); },
    addUnit: async el => {
      readProps();
      const n = S.units.filter(u => u.buildingId === el.dataset.id).length + 1;
      S.units.push({ id: U.uid(), buildingId: el.dataset.id, name: `Apto ${n}` });
      await saveProps();
    },
    delUnit: async el => {
      if (hasHistory(el.dataset.id)) return toast('Este apartamento tiene contratos guardados, no se puede quitar.');
      readProps();
      S.units = S.units.filter(u => u.id !== el.dataset.id);
      await saveProps('Apartamento quitado.');
    },
    addBuilding: async () => {
      readProps();
      S.buildings.push({ id: U.uid(), name: `Edificio ${S.buildings.length + 1}`, address: '' });
      await saveProps();
    },
    delBuilding: async el => {
      const units = S.units.filter(u => u.buildingId === el.dataset.id);
      if (units.some(u => hasHistory(u.id))) return toast('Este edificio tiene contratos guardados, no se puede quitar.');
      if (!await ask('¿Quitar este edificio y sus apartamentos?', 'Sí, quitar', 'No')) return;
      readProps();
      S.buildings = S.buildings.filter(b => b.id !== el.dataset.id);
      S.units = S.units.filter(u => u.buildingId !== el.dataset.id);
      await saveProps('Edificio quitado.');
    },
  };
}

function applyTextSize() {
  document.documentElement.dataset.size = S.settings.textSize || 'normal';
}

// ===================== Plantilla del contrato =====================

function viewTemplate() {
  app.innerHTML = `${pageHeader('Texto del contrato', '/config')}
    <p class="tip">Este es el texto que se usa para <strong>todos</strong> los contratos. Las palabras entre {{ }} se cambian
      solas por los datos de cada arrendatario. Para agregar un dato, toque el lugar del texto y luego el botón del dato.</p>
    <form id="f" class="form">
      <textarea name="tpl" rows="22" spellcheck="true">${U.esc(S.template)}</textarea>
      <details><summary>Datos que puede usar (toque para abrir)</summary>
        <div class="chips">${T.FIELDS.map(([k, label]) =>
          `<button type="button" class="chip" data-act="ins" data-k="${k}">${U.esc(label)}</button>`).join('')}</div>
      </details>
      <button type="submit" class="btn btn-big btn-primary">✅ Guardar texto</button>
      <button type="button" class="btn btn-big btn-danger-outline" data-act="reset">↩️ Volver al texto original</button>
    </form>`;

  const f = document.getElementById('f');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    S.template = f.tpl.value;
    await save('template');
    toast('Texto del contrato guardado.');
  });
  actions = {
    ins: el => {
      const ta = f.tpl, tag = `{{${el.dataset.k}}}`;
      const pos = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, pos) + tag + ta.value.slice(ta.selectionEnd ?? pos);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = pos + tag.length;
    },
    reset: async () => {
      if (!await ask('¿Volver al texto original? Se perderán los cambios que haya hecho al texto.', 'Sí, volver al original', 'No')) return;
      S.template = T.DEFAULT_CONTRACT;
      await save('template');
      render();
    },
  };
}

// ===================== Copia de seguridad =====================

async function buildBackup() {
  const files = {};
  for (const k of await DB.keys('files')) {
    const f = await DB.get('files', k);
    files[k] = { name: f.name, type: f.type, added: f.added, data: await U.blobToDataURL(f.blob) };
  }
  const data = {};
  KEYS.forEach(k => { data[k] = S[k]; });
  const json = JSON.stringify({ app: 'mis-arriendos', version: 1, exportedAt: new Date().toISOString(), data, files });
  return new File([json], `respaldo-arriendos-${U.todayISO()}.json`, { type: 'application/json' });
}

async function restoreBackup(file) {
  const backup = JSON.parse(await file.text());
  if (backup.app !== 'mis-arriendos' || !backup.data) throw new Error('No es una copia de Mis Arriendos');
  await DB.clear('data');
  await DB.clear('files');
  for (const [k, f] of Object.entries(backup.files || {})) {
    await DB.put('files', k, { name: f.name, type: f.type, added: f.added, blob: await U.dataURLToBlob(f.data) });
  }
  for (const k of KEYS) if (backup.data[k] !== undefined) await DB.put('data', k, backup.data[k]);
  try { sessionStorage.setItem('restored', '1'); } catch { /* sin aviso, no importa */ }
  location.replace(location.pathname);
}

function viewBackup() {
  const last = S.settings.lastBackup;
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] }));

  app.innerHTML = `${pageHeader('Copia de seguridad')}
    <section class="panel">
      <p>Toda la información se guarda <strong>en este aparato</strong>. Si el aparato se pierde o se daña, se pierde todo.</p>
      <p>Por eso, <strong>una vez al mes</strong> guarde una copia y envíela a su correo o a un familiar.</p>
      <p class="lead">${last ? `Última copia: ${U.dateLong(last)}` : 'Todavía no ha guardado ninguna copia.'}</p>
    </section>
    <div class="actions">
      ${canShare ? '<button type="button" class="btn btn-big btn-primary" data-act="share">📤 Enviar copia por correo o WhatsApp</button>' : ''}
      <button type="button" class="btn btn-big ${canShare ? '' : 'btn-primary'}" data-act="save">💾 Guardar copia en este aparato</button>
    </div>
    <section class="block"><h2>Recuperar información</h2>
      <p>Si cambió de aparato, aquí puede cargar una copia guardada. <strong>Esto reemplaza todo lo que hay ahora.</strong></p>
      <label class="btn btn-big btn-outline">📥 Cargar una copia guardada
        <input type="file" id="restore" accept="application/json,.json" hidden></label>
    </section>`;

  const done = async () => {
    S.settings.lastBackup = U.todayISO();
    await save('settings');
    toast('Copia de seguridad lista.');
    render();
  };
  actions = {
    save: async () => { U.download(await buildBackup(), `respaldo-arriendos-${U.todayISO()}.json`); await done(); },
    share: async () => {
      const file = await buildBackup();
      try {
        await navigator.share({ files: [file], title: 'Copia de Mis Arriendos' });
        await done();
      } catch (err) {
        if (err.name !== 'AbortError') toast('No se pudo enviar. Use "Guardar copia en este aparato".');
      }
    },
  };
  document.getElementById('restore').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!await ask('¿Reemplazar toda la información actual con esta copia?', 'Sí, recuperar copia', 'No')) return;
    try {
      await restoreBackup(file);
    } catch (err) {
      console.error(err);
      toast('Ese archivo no es una copia válida de Mis Arriendos.');
    }
  });
}

// ===================== Navegación =====================

const ROUTES = [
  [/^\/?$/, viewHome],
  [/^\/u\/(\w+)$/, viewUnit],
  [/^\/pagar\/(\w+)$/, viewPay],
  [/^\/pagos\/(\w+)$/, viewPayments],
  [/^\/comprobante\/(\w+)$/, viewReceipt],
  [/^\/archivo\/(\w+)$/, viewFile],
  [/^\/contrato\/(\w+)$/, viewContract],
  [/^\/contrato-nuevo\/(\w+)$/, id => viewContractForm({ unitId: id })],
  [/^\/contrato-editar\/(\w+)$/, id => viewContractForm({ editId: id })],
  [/^\/contrato-renovar\/(\w+)$/, id => viewContractForm({ renewId: id })],
  [/^\/documentos\/(\w+)$/, viewDocs],
  [/^\/config$/, viewSettings],
  [/^\/plantilla$/, viewTemplate],
  [/^\/respaldo$/, viewBackup],
];

function render() {
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
  actions = {};
  const path = decodeURIComponent(location.hash.slice(1));
  for (const [re, view] of ROUTES) {
    const m = path.match(re);
    if (m) { view(...m.slice(1)); return; }
  }
  go('/');
}

app.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'historyBack') { history.length > 1 ? history.back() : go('/'); return; }
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); await fn(el); }
});

window.addEventListener('hashchange', () => {
  // Un aviso de la pantalla anterior no debe quedar encima de la nueva.
  if (Date.now() - (toast.shownAt || 0) > 1500) document.getElementById('toast').hidden = true;
  render();
  window.scrollTo(0, 0);
});

(async () => {
  try {
    await load();
    applyTextSize();
    render();
    try {
      if (sessionStorage.getItem('restored')) {
        sessionStorage.removeItem('restored');
        toast('✅ Copia recuperada. Toda la información está de vuelta.');
      }
    } catch { /* sin aviso, no importa */ }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = '<p class="lead">No se pudo abrir la aplicación. Cierre y vuelva a abrir el navegador.</p>';
  }
})();
