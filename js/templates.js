'use strict';

// Plantilla del contrato y del comprobante de pago.
// Los campos entre {{ }} se reemplazan solos con los datos del arrendatario.
// Un bloque {{#CODEUDOR}} ... {{/CODEUDOR}} solo aparece si hay codeudor.
const T = (() => {
  const FIELDS = [
    ['CIUDAD', 'Ciudad donde se firma'],
    ['FECHA_HOY', 'Fecha de hoy'],
    ['ARRENDADOR_NOMBRE', 'Nombre del dueño'],
    ['ARRENDADOR_DOCUMENTO', 'Cédula del dueño'],
    ['ARRENDADOR_DIRECCION', 'Dirección del dueño'],
    ['ARRENDADOR_TELEFONO', 'Teléfono del dueño'],
    ['ARRENDATARIO_NOMBRE', 'Nombre del arrendatario'],
    ['ARRENDATARIO_DOCUMENTO', 'Cédula del arrendatario'],
    ['ARRENDATARIO_TELEFONO', 'Teléfono del arrendatario'],
    ['ARRENDATARIO_CORREO', 'Correo del arrendatario'],
    ['CODEUDOR_NOMBRE', 'Nombre del codeudor'],
    ['CODEUDOR_DOCUMENTO', 'Cédula del codeudor'],
    ['CODEUDOR_TELEFONO', 'Teléfono del codeudor'],
    ['INMUEBLE', 'Apartamento (ej: Apto 101)'],
    ['EDIFICIO', 'Nombre del edificio'],
    ['DIRECCION_INMUEBLE', 'Dirección del edificio'],
    ['CANON', 'Valor del arriendo en números'],
    ['CANON_LETRAS', 'Valor del arriendo en letras'],
    ['DIA_PAGO', 'Día de pago de cada mes'],
    ['DEPOSITO', 'Depósito / garantía en números'],
    ['DEPOSITO_LETRAS', 'Depósito / garantía en letras'],
    ['FECHA_INICIO', 'Fecha de inicio'],
    ['FECHA_FIN', 'Fecha de término'],
    ['DURACION_MESES', 'Duración en meses'],
  ];

  const DEFAULT_CONTRACT = `**CONTRATO DE ARRENDAMIENTO DE VIVIENDA**

En {{CIUDAD}}, a {{FECHA_HOY}}, comparecen:

Por una parte, **{{ARRENDADOR_NOMBRE}}**, cédula de identidad N° {{ARRENDADOR_DOCUMENTO}}, con domicilio en {{ARRENDADOR_DIRECCION}}, en adelante "EL ARRENDADOR".

Por otra parte, **{{ARRENDATARIO_NOMBRE}}**, cédula de identidad N° {{ARRENDATARIO_DOCUMENTO}}, teléfono {{ARRENDATARIO_TELEFONO}}, en adelante "EL ARRENDATARIO".

Ambas partes acuerdan celebrar el presente contrato de arrendamiento, que se regirá por las siguientes cláusulas:

**PRIMERA. OBJETO.** EL ARRENDADOR da en arriendo a EL ARRENDATARIO el inmueble ubicado en {{DIRECCION_INMUEBLE}}, {{EDIFICIO}}, {{INMUEBLE}}, que EL ARRENDATARIO declara recibir en buen estado de conservación y funcionamiento.

**SEGUNDA. DESTINACIÓN.** El inmueble será destinado exclusivamente a vivienda de EL ARRENDATARIO y su familia. No podrá subarrendarse ni cederse este contrato sin autorización escrita de EL ARRENDADOR.

**TERCERA. VALOR DEL ARRIENDO.** El valor mensual del arriendo es de {{CANON}} ({{CANON_LETRAS}}), que EL ARRENDATARIO pagará por mes anticipado dentro de los primeros {{DIA_PAGO}} días de cada mes. EL ARRENDADOR entregará un comprobante por cada pago recibido.

**CUARTA. REAJUSTE.** El valor del arriendo se reajustará cada doce (12) meses de acuerdo con la variación del Índice de Precios al Consumidor (IPC) del año anterior, o en el porcentaje máximo que permita la ley.

**QUINTA. DURACIÓN.** El contrato tendrá una duración de {{DURACION_MESES}} meses, desde el {{FECHA_INICIO}} hasta el {{FECHA_FIN}}. Si ninguna de las partes avisa por escrito su intención de terminarlo con al menos treinta (30) días de anticipación, se renovará automáticamente por un período igual.

**SEXTA. DEPÓSITO DE GARANTÍA.** EL ARRENDATARIO entrega en este acto la suma de {{DEPOSITO}} ({{DEPOSITO_LETRAS}}) como garantía. Esta suma será devuelta al término del contrato, descontando deudas de arriendo, servicios o daños que no correspondan al uso normal del inmueble.

**SÉPTIMA. SERVICIOS Y GASTOS.** Serán de cargo de EL ARRENDATARIO los consumos de luz, agua, gas, internet y demás servicios, así como los gastos comunes o de administración, que deberá pagar puntualmente.

**OCTAVA. OBLIGACIONES DEL ARRENDATARIO.** EL ARRENDATARIO se obliga a: (a) pagar el arriendo en la fecha acordada; (b) cuidar el inmueble y hacer las reparaciones menores por su uso; (c) no hacer modificaciones sin permiso escrito; (d) respetar las normas de convivencia del edificio; (e) permitir visitas de inspección avisadas con anticipación.

**NOVENA. MEJORAS.** Las mejoras que EL ARRENDATARIO haga con autorización quedarán a beneficio del inmueble, salvo acuerdo escrito en contrario.

**DÉCIMA. TERMINACIÓN.** El atraso en el pago del arriendo por más de treinta (30) días, o el incumplimiento de cualquiera de las obligaciones de este contrato, permitirá a EL ARRENDADOR darlo por terminado y solicitar la restitución del inmueble.

**DÉCIMA PRIMERA. RESTITUCIÓN.** Al término del contrato, EL ARRENDATARIO entregará el inmueble desocupado, limpio, en el mismo estado en que lo recibió salvo el desgaste normal, y con las cuentas de servicios pagadas.
{{#CODEUDOR}}
**DÉCIMA SEGUNDA. CODEUDOR.** Presente en este acto **{{CODEUDOR_NOMBRE}}**, cédula de identidad N° {{CODEUDOR_DOCUMENTO}}, teléfono {{CODEUDOR_TELEFONO}}, quien se constituye en codeudor solidario de todas las obligaciones de EL ARRENDATARIO.
{{/CODEUDOR}}
Para constancia, se firma en dos ejemplares del mismo tenor, en {{CIUDAD}}, a {{FECHA_HOY}}.



_______________________________
**EL ARRENDADOR**
{{ARRENDADOR_NOMBRE}}
C.I. {{ARRENDADOR_DOCUMENTO}}



_______________________________
**EL ARRENDATARIO**
{{ARRENDATARIO_NOMBRE}}
C.I. {{ARRENDATARIO_DOCUMENTO}}
{{#CODEUDOR}}


_______________________________
**CODEUDOR**
{{CODEUDOR_NOMBRE}}
C.I. {{CODEUDOR_DOCUMENTO}}
{{/CODEUDOR}}`;

  function contractValues(s, contract, unit, building) {
    const end = U.addDays(U.addMonths(contract.startDate, Number(contract.months) || 12), -1);
    return {
      CIUDAD: s.settings.city,
      FECHA_HOY: U.dateLong(contract.signDate || U.todayISO()),
      ARRENDADOR_NOMBRE: s.settings.ownerName,
      ARRENDADOR_DOCUMENTO: s.settings.ownerId,
      ARRENDADOR_DIRECCION: s.settings.ownerAddress,
      ARRENDADOR_TELEFONO: s.settings.ownerPhone,
      ARRENDATARIO_NOMBRE: contract.tenantName,
      ARRENDATARIO_DOCUMENTO: contract.tenantId,
      ARRENDATARIO_TELEFONO: contract.tenantPhone,
      ARRENDATARIO_CORREO: contract.tenantEmail,
      CODEUDOR: contract.cosignerName ? 'si' : '',
      CODEUDOR_NOMBRE: contract.cosignerName,
      CODEUDOR_DOCUMENTO: contract.cosignerId,
      CODEUDOR_TELEFONO: contract.cosignerPhone,
      INMUEBLE: unit ? unit.name : '',
      EDIFICIO: building ? building.name : '',
      DIRECCION_INMUEBLE: building ? building.address : '',
      CANON: U.money(contract.rent),
      CANON_LETRAS: U.moneyWords(contract.rent),
      DIA_PAGO: contract.payDay,
      DEPOSITO: U.money(contract.deposit),
      DEPOSITO_LETRAS: U.moneyWords(contract.deposit),
      FECHA_INICIO: U.dateLong(contract.startDate),
      FECHA_FIN: U.dateLong(end),
      DURACION_MESES: `${contract.months} (${U.words(contract.months)})`,
    };
  }

  // Convierte la plantilla en HTML listo para imprimir.
  // Los datos que falten quedan como una raya para completarlos a mano.
  function fill(template, values) {
    const BLANK = '\u0000';
    let text = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
      (_, key, body) => (values[key] ? body : ''));
    text = text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const v = values[key];
      return v === undefined || v === null || v === '' ? BLANK : String(v);
    });
    return U.esc(text)
      .split(/\n{2,}/)
      .map(p => (p.startsWith('___') ? '<p class="sign">' : '<p>') + p
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\u0000/g, '<span class="blank">________________</span>')
        .replace(/\n/g, '<br>') + '</p>')
      .join('\n');
  }

  function receiptHTML(s, payment, contract, unit, building) {
    const n = String(payment.receiptNo || 0).padStart(4, '0');
    return `
      <h1 class="paper-title">COMPROBANTE DE PAGO DE ARRIENDO</h1>
      <p class="receipt-no">N° ${n}</p>
      <table class="receipt-table">
        <tr><th>Fecha de pago</th><td>${U.esc(U.dateLong(payment.date))}</td></tr>
        <tr><th>Recibí de</th><td>${U.esc(contract.tenantName)} — C.I. ${U.esc(contract.tenantId || '')}</td></tr>
        <tr><th>La suma de</th><td><strong>${U.money(payment.amount)}</strong><br>${U.esc(U.moneyWords(payment.amount))}</td></tr>
        <tr><th>Por concepto de</th><td>Arriendo del mes de ${U.esc(U.periodLabel(payment.period))}</td></tr>
        <tr><th>Inmueble</th><td>${U.esc(unit ? unit.name : '')}, ${U.esc(building ? building.name : '')}${building && building.address ? ', ' + U.esc(building.address) : ''}</td></tr>
        <tr><th>Forma de pago</th><td>${U.esc(payment.method || '')}</td></tr>
        ${payment.note ? `<tr><th>Nota</th><td>${U.esc(payment.note)}</td></tr>` : ''}
      </table>
      <div class="signature">
        <p>_______________________________<br>
        <strong>${U.esc(s.settings.ownerName || 'EL ARRENDADOR')}</strong><br>
        ${s.settings.ownerId ? 'C.I. ' + U.esc(s.settings.ownerId) : ''}</p>
      </div>`;
  }

  return { FIELDS, DEFAULT_CONTRACT, contractValues, fill, receiptHTML };
})();
