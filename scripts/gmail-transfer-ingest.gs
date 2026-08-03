/**
 * Norte — Ingesta de transferencias desde Gmail.
 * Lee correos de Santander, Banco de Chile y Banco Ripley, los parsea y los
 * envía a la Edge Function transfer-ingest. Marca cada correo como procesado.
 *
 * Setup: pega esto en script.google.com, corre procesarTransferencias() una vez
 * para autorizar Gmail, y agrega un activador por tiempo (cada 5-10 min).
 *
 * NOTA: el parseo es una primera versión basada en el layout de los correos.
 * Si algún campo no se captura bien, ajustar los regex de cada parser.
 */

const ENDPOINT = 'https://gfswrtyxgsxakkpgduda.supabase.co/functions/v1/transfer-ingest';
const SECRET   = 'bd7d9dfa18af488ca9b89e3335efedf56a9bdbb5892a4f96bd6dfde12874f29a';
const LABEL    = 'norte-procesado';
// Ojo: "Cargo en Cuenta" (Banco de Chile avisando un cargo de Servipag) NO se agrega a
// propósito — Servipag ya manda su propio comprobante con el detalle real (empresa/monto);
// procesar ambos duplicaría el gasto.
const SEARCH   = '((from:santander.cl OR from:bancochile.cl OR from:bancoripley.cl OR from:servipag.cl) '
               + 'subject:(transferencia OR Comprobante OR Transferencias OR Deuda OR Giro)) '
               + 'OR (from:metlife.cl subject:(dividendo)) '
               + 'OR (from:transaccionalcoopeuch.com subject:(Cuotas)) '
               + 'OR (from:bancoestado.cl subject:(Comprobante OR Transferencias)) '
               + 'OR (from:indexa.cl subject:("Aviso de Pagos")) '
               + 'OR (from:appcopec.com subject:("Comprobante de compra"))';

// Gate por MARCA DE TIEMPO (no por etiqueta de hilo). Santander agrupa TODAS las
// transferencias en un mismo hilo (mismo asunto "Comprobante Transferencia de fondos"); si
// gateáramos excluyendo hilos etiquetados, cada transferencia nueva que cae en un hilo ya
// procesado se perdería en silencio. En cambio guardamos el timestamp del último correo
// procesado (high-water mark) y solo procesamos correos MÁS NUEVOS que ese instante.
const HWM_KEY = 'norte_hwm';

/**
 * EJECUTAR UNA SOLA VEZ antes de activar el trigger (o tras pegar una versión nueva).
 * Fija la línea base en AHORA: solo se procesarán correos posteriores a este instante,
 * para no re-importar el pasado ni duplicar saldos ya cargados.
 */
function marcarBaseline() {
  PropertiesService.getScriptProperties().setProperty(HWM_KEY, String(Date.now()));
  // Etiqueta los hilos existentes solo para verlos identificados (ya NO controla el gating).
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search(SEARCH + ' newer_than:180d', 0, 200);
  threads.forEach(t => t.addLabel(label));
  Logger.log('Baseline HWM=' + Date.now() + ' · ' + threads.length + ' hilos etiquetados.');
}

function procesarTransferencias() {
  const props = PropertiesService.getScriptProperties();
  const hwm = Number(props.getProperty(HWM_KEY) || 0);
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search(SEARCH + ' newer_than:7d', 0, 50);
  let maxSeen = hwm;

  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      const ts = msg.getDate().getTime();
      if (ts <= hwm) return;            // ya procesado en una corrida anterior
      if (ts > maxSeen) maxSeen = ts;
      const from = msg.getFrom().toLowerCase();
      const body = msg.getPlainBody().replace(/ /g, ' ');
      let data = null;
      if (from.indexOf('santander') > -1)      data = parseSantander(body);
      else if (from.indexOf('bancochile') > -1) data = parseChile(body);
      else if (from.indexOf('ripley') > -1)     data = parseRipley(body);
      else if (from.indexOf('servipag') > -1)   data = parseServipag(body);
      else if (from.indexOf('metlife') > -1)    data = parseMetlifeDividendo(body);
      else if (from.indexOf('transaccionalcoopeuch') > -1) data = parseCoopeuchCuotas(body);
      else if (from.indexOf('bancoestado') > -1) {
        // Dos plantillas: "Transferencias - Cuentas Propias" (traspaso interno) y
        // "Comprobante pago de producto" (dividendo hipotecario Conchalí).
        data = /transferencia entre tus cuentas/i.test(body)
          ? parseBancoEstadoCtasPropias(body)
          : parseBancoEstadoPagoProducto(body);
      }
      // indexa.cl manda HTML puro (iso-8859-1, sin parte text/plain): getPlainBody() puede
      // venir vacío -> fallback al HTML crudo (el parser limpia tags/entidades él mismo).
      else if (from.indexOf('indexa') > -1)      data = parseAssetplanPago(body && body.trim() ? body : msg.getBody());
      // Copec: getPlainBody viene casi vacío ("Comprobante de compra Copec") -> siempre el HTML crudo.
      else if (from.indexOf('appcopec') > -1)    data = parseCopec(msg.getBody());
      if (!data) return;

      // Un parser puede devolver varios items (ej: "Comprobante de pago" con N cuentas pagadas)
      const items = Array.isArray(data) ? data : [data];
      items.forEach(d => {
        if (!d) return;
        // Si el parser matcheó el remitente pero no extrajo monto, se manda igual con el
        // cuerpo crudo: transfer-ingest lo registra en ingest_failures (bad_amount) en vez
        // de perderse en silencio con el hilo ya etiquetado como procesado.
        if (!d.amount) d = { kind: 'parse_failed', from: from, raw: (body || msg.getBody()).slice(0, 2000) };
        UrlFetchApp.fetch(ENDPOINT, {
          method: 'post', contentType: 'application/json',
          headers: { 'x-ingest-secret': SECRET },
          payload: JSON.stringify(d), muteHttpExceptions: true,
        });
      });
    });
    thread.addLabel(label);   // solo visibilidad; el gating es por timestamp (HWM)
  });

  props.setProperty(HWM_KEY, String(maxSeen));
  Logger.log('HWM actualizado a ' + maxSeen);
}

// Helpers
function g(re, src) { const m = src.match(re); return m ? m[1].trim() : ''; }
function money(src, re) { return g(re, src).replace(/\./g, ''); }

// ── Santander ──────────────────────────────────────────────
function parseSantander(txt) {
  // Plantilla "Comprobante pago deuda Nacional de Tarjeta de Credito" (abono cta cte -> TC)
  if (/deuda\s+nacional\s+de\s+tarjeta\s+de\s+cr[eé]dito/i.test(txt)) return parseSantanderPagoTC(txt);
  // Plantilla "Comprobante Pago de Cuentas" (multipago en línea, N cuentas por mail)
  if (/Datos\s+del\s+pago/i.test(txt)) return parseSantanderMultipago(txt);
  const amount = money(txt, /Monto\s+transferido[^$]*\$\s*([\d.]+)/i);
  const date   = g(/(\d{1,2}\/\d{1,2}\/\d{4})/, txt);
  const idxDest = txt.search(/Datos\s+de\s+destino/i);
  const oBlk = idxDest > -1 ? txt.slice(0, idxDest) : txt;
  const dBlk = idxDest > -1 ? txt.slice(idxDest)   : '';
  return {
    amount, date,
    originName:    g(/Nombre[:\s]*([^\n\r]+)/i, oBlk) || g(/nuestro cliente\s+([^\n\r,]+?)\s+realiz/i, txt),
    originRut:     g(/RUT[:\s]*([\dkK.\-]+)/i, oBlk),
    originAccount: g(/N[°ºo]?\s*de\s*cuenta[:\s]*([\d.\-]+)/i, oBlk),
    originBank:    g(/Banco[:\s]*([^\n\r]+)/i, oBlk),
    destName:      g(/Nombre[:\s]*([^\n\r]+)/i, dBlk),
    destRut:       g(/RUT[:\s]*([\dkK.\-]+)/i, dBlk),
    destAccount:   g(/N[°ºo]?\s*de\s*cuenta[:\s]*([\d.\-]+)/i, dBlk),
    destBank:      g(/Banco[:\s]*([^\n\r]+)/i, dBlk),
    destMine:      /a\s+tu\s+cuenta/i.test(txt),
    comment:       g(/Comentario[:\s]*([^\n\r]+)/i, dBlk) || g(/Comentario[:\s]*([^\n\r]+)/i, txt),
  };
}

// ── Banco de Chile ─────────────────────────────────────────
const MESES_ES = { enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
                   julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12' };

// dd/mm/yyyy directo, o fecha larga "viernes 03 de julio de 2026" -> "03/07/2026"
function fechaChile(txt) {
  const dmy = g(/(\d{1,2}\/\d{1,2}\/\d{4})/, txt);
  if (dmy) return dmy;
  const m = txt.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (m && MESES_ES[m[2].toLowerCase()]) return m[1] + '/' + MESES_ES[m[2].toLowerCase()] + '/' + m[3];
  return '';
}

const BANCOS = ['Banco Ripley','BancoEstado','Banco Estado','Banco Santander','Banco de Chile',
  'Banco Falabella','Banco BCI','Banco Itaú','Banco Itau','Banco Security','Banco Consorcio',
  'Banco Bice','Banco Internacional','Scotiabank','Santander','BCI','Coopeuch','Copeuch',
  'Mercado Pago','MercadoPago','Tenpo'];
function bancoEn(blk) {
  const low = blk.toLowerCase();
  for (const b of BANCOS) if (low.indexOf(b.toLowerCase()) > -1) return b;
  return '';
}

function parseChile(txt) {
  // Plantilla "Comprobante de pago" (pago de cuentas de servicio, N items por mail)
  if (/Resumen de Cuentas Pagadas/i.test(txt) || /Pago de tu\(?s\)? Cuenta/i.test(txt)) return parseChilePagoCuentas(txt);
  // Plantilla "Comprobante de Transferencia a terceros" (bloques Origen / Destino)
  if (/Transferencia a terceros/i.test(txt)) return parseChileTerceros(txt);
  // Plantilla "Giro con Tarjeta de Débito" (retiro de efectivo en cajero automático)
  if (/giro\s+en\s+Cajero/i.test(txt)) return parseChileGiroCajero(txt);
  const idxDest = txt.search(/Datos\s+de\s+la\s+Transferencia/i);
  const dBlk = txt.search(/Datos\s+del\s+Destinatario/i) > -1
    ? txt.slice(txt.search(/Datos\s+del\s+Destinatario/i), idxDest > -1 ? idxDest : undefined) : txt;
  // Bloque "Datos de la Transferencia" (trae la cuenta de ORIGEN). NO usar fallback global (agarra la del destinatario).
  const txBlk = idxDest > -1 ? txt.slice(idxDest) : '';
  return {
    amount:        money(txt, /Monto[^$]*\$\s*([\d.]+)/i),
    date:          fechaChile(txt),
    originMine:    true, // "usted ha efectuado una transferencia ... desde su Cuenta Corriente"
    originAccount: g(/desde su Cuenta Corriente\s*([\d.\-]+)/i, txt) || g(/Cuenta[:\s]*([\d.\-]{6,})/i, txBlk),
    originBank:    'Banco de Chile',
    destName:      g(/Nombre[:\s]*([^\n\r]+)/i, dBlk),
    destRut:       g(/Rut[:\s]*([\dkK.\-]+)/i, dBlk),
    destAccount:   g(/Cuenta[:\s]*([\d.\-]+)/i, dBlk),
    destBank:      g(/Banco[:\s]*([^\n\r]+)/i, dBlk),
    txnId:         g(/\bID[:\s]+([A-Z0-9_]{6,})/, txt),
    comment:       g(/Mensaje[:\s]*([^\n\r]+)/i, txt),
  };
}

// Plantilla "Comprobante de pago" (pago de N cuentas de servicio por la web del Chile).
// Bloques secuenciales: Empresa -> Identificador de la Cuenta -> Monto (uno por servicio).
// Devuelve un ARRAY de payloads kind:'pago_servicio' (uno por cuenta pagada).
function parseChilePagoCuentas(txt) {
  const date = fechaChile(txt);
  const originAccount = g(/Cuenta de Cargo[^\d]*([\d.\-]+)/i, txt);
  const items = [];
  const re = /Empresa[ \t]*[\r\n]*[ \t]*([^\n\r]+)[\s\S]*?Identificador de la Cuenta[ \t]*[\r\n]*[ \t]*([\dkK.\-]+)[\s\S]*?Monto[^$]*\$\s*([\d.]+)/gi;
  let m;
  while ((m = re.exec(txt)) !== null) {
    items.push({
      kind: 'pago_servicio',
      empresa: m[1].trim(),
      identificador: m[2].trim(),
      amount: m[3].replace(/\./g, ''),
      date: date,
      originAccount: originAccount,
    });
  }
  return items;
}

// Plantilla "Giro con Tarjeta de Débito" (retiro de efectivo en cajero, sin contraparte).
// cuerpo: "se ha realizado un giro en Cajero por $80.000 con cargo a Cuenta ****7004 el
// 24/07/2026 12:46." — no trae "empresa"/destinatario, solo el número de cuenta enmascarado
// (últimos dígitos) con cargo al que va el gasto.
function parseChileGiroCajero(txt) {
  return {
    kind:   'giro_cajero',
    amount: money(txt, /Cajero\s+por\s*\$\s*([\d.,]+)/i),
    date:   fechaChile(txt) || g(/el\s+(\d{1,2}\/\d{1,2}\/\d{4})/i, txt),
    last4:  g(/Cuenta\s*\*+(\d{3,6})/i, txt).slice(-4),
  };
}

// Plantilla "Comprobante de Transferencia a terceros".
// OJO: el orden etiqueta/valor del correo varía según el render, así que se extrae por
// PATRÓN dentro de cada bloque (Origen / Destino), no por posición de la etiqueta.
function parseChileTerceros(txt) {
  const iOri = txt.search(/\bOrigen\b/i);
  const iDes = txt.search(/\bDestino\b/i);
  const iMon = txt.search(/\bMonto\b/i);
  const oBlk = iOri > -1 && iDes > iOri ? txt.slice(iOri, iDes) : '';
  const dBlk = iDes > -1 ? txt.slice(iDes, iMon > iDes ? iMon : txt.length) : '';

  const destRut = g(/(\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK])\b/, dBlk);
  const dSinRut = destRut ? dBlk.replace(destRut, ' ') : dBlk;
  // Cuenta: formato Chile con guiones (00-164-23770-04) o corrida de 9-14 dígitos
  const cuenta = (blk) => g(/(\d{2}-\d{3}-\d{5}-\d{2})/, blk) || g(/\b(\d{9,14})\b/, blk);
  // Nombre: etiqueta con valor en la misma línea, o línea suelta que parece nombre de persona
  let destName = g(/Nombre y Apellido[: \t]*([A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}(?:[ \t]+[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,})+)/, dBlk);
  if (!destName) {
    for (const raw of dBlk.split(/[\r\n]+/)) {
      const L = raw.replace(/^Destino\s*/i, '').trim();
      if (/^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{5,60}$/.test(L) && L.split(/\s+/).length >= 2 &&
          !/cuenta|banco|rut|tipo|email|origen|nombre|apellido|corriente|vista|ahorro|transferencia/i.test(L)) {
        destName = L; break;
      }
    }
  }
  return {
    amount:        money(txt, /Monto[^$]*\$\s*([\d.]+)/i),
    date:          fechaChile(txt),
    originMine:    true,
    originAccount: cuenta(oBlk),
    originBank:    'Banco de Chile',
    destName:      destName,
    destRut:       destRut,
    destAccount:   cuenta(dSinRut),
    destBank:      bancoEn(dBlk),
    txnId:         g(/Transacci[óo]n[\s:]*[\r\n]*\s*([A-Z0-9]{10,})/i, txt) || g(/\bID[:\s]+([A-Z0-9_]{6,})/, txt),
    comment:       g(/Mensaje[:\s]*([^\n\r]+)/i, txt),
  };
}

// Plantilla "Comprobante pago deuda Nacional de Tarjeta de Crédito" (abono desde cta cte a TC).
// Bloques ORIGEN (cuenta que se descuenta) y DESTINO (tarjeta que se abona).
function parseSantanderPagoTC(txt) {
  const amount = money(txt, /Monto\s+del\s+pago[:\s]*\$?\s*([\d.,]+)/i);
  const date = g(/fecha\s+(\d{1,2}\/\d{1,2}\/\d{4})/i, txt) || g(/(\d{1,2}\/\d{1,2}\/\d{4})/, txt);

  const iOrigen = txt.search(/ORIGEN/i);
  const iDestino = txt.search(/DESTINO/i);
  const origBlk = iOrigen > -1 ? txt.slice(iOrigen, iDestino > -1 ? iDestino : txt.length) : '';
  const destBlk = iDestino > -1 ? txt.slice(iDestino) : '';

  const originAccount = g(/(\d[\d.\-]{6,}\d)/, origBlk);
  // La tarjeta viene enmascarada (**** **** **** 2838): el último grupo de 4 dígitos del bloque destino.
  const last4Matches = destBlk.match(/\d{4}/g) || [];
  const last4 = last4Matches.length ? last4Matches[last4Matches.length - 1] : '';

  return { kind: 'pago_tc', amount, date, originAccount, last4 };
}

// Plantilla "Comprobante Pago de Cuentas" (multipago en línea del sitio de Santander:
// N cuentas de servicio pagadas en una sola operación). Tabla "Datos del pago" con
// Compañía | N° Cliente | Fecha de venc. | Monto, una fila por cuenta.
// "Medio de pago: Cuenta Corriente" = siempre la Cta Cte del propio Santander (el banco
// que envía el mail) -> originBank fijo, no depende de extraer un N° de cuenta.
function parseSantanderMultipago(txt) {
  const date = g(/fecha\s+(\d{1,2}-\d{1,2}-\d{4})/i, txt).replace(/-/g, '/');
  const iDatos = txt.search(/Datos\s+del\s+pago/i);
  const blk = iDatos > -1 ? txt.slice(iDatos) : txt;
  const items = [];
  const re = /([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9 ]*?)\s+([\w-]{4,})\s+\d{4}-\d{2}-\d{2}\s+\$\s*([\d.,]+)/g;
  let m;
  while ((m = re.exec(blk)) !== null) {
    items.push({
      kind: 'pago_servicio',
      empresa: m[1].trim(),
      identificador: m[2].trim(),
      amount: m[3].replace(/\./g, ''),
      date: date,
      originBank: 'Santander',
    });
  }
  return items;
}

// ── Coopeuch (cuotas de participación) ──────────────────────
// Descuenta la cuenta Coopeuch identificada por el last4 de "Cuenta de Pago" y abona
// "Copeuch - Cuotas Parcipación" (siempre la misma cuenta destino, fija).
function parseCoopeuchCuotas(txt) {
  const amount = money(txt, /Monto\s+a\s+Pagar[\s\S]{0,30}?\$\s*([\d.,]+)/i);
  const dm = txt.match(/Fecha\s+de\s+pago[\s\S]{0,30}?(\d{1,2})-(\d{1,2})-(\d{4})/i);
  const date = dm ? `${dm[1]}/${dm[2]}/${dm[3]}` : '';
  const last4 = g(/CUENTA\s+VISTA\s+X+(\d{4})/i, txt);
  return { kind: 'coopeuch_cuotas', amount, date, last4 };
}

// ── BancoEstado (pago de dividendo hipotecario Depto Conchalí, cuota fija mensual) ─────────
// cuerpo (pares etiqueta/valor): "Producto: Crédito Hipotecario N° 884406380 · Cuota: 187 ·
// Monto pagado: $142.285 · Desde: CuentaRUT N° 16798718 · N° Transacción: ... · Fecha y hora: dd/mm/yyyy hh:mm:ss"
// "empresa" queda fijo (igual criterio que MetLife) — identifica siempre esta fuente/propiedad
// para la regla de categoría, sin depender de parsear un nombre de producto variable.
// OJO créditos hipotecarios por propiedad: BancoEstado→Depto Conchalí, Banco Chile→Independencia,
// MetLife→Estación Central (no asumir por el nombre del banco sin confirmar con el usuario).
function parseBancoEstadoPagoProducto(txt) {
  const monto = money(txt, /Monto\s+pagado[:\s]*\$\s*([\d.,]+)/i);
  const dm = txt.match(/Fecha\s+y\s+hora[:\s]*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const date = dm ? `${dm[1]}/${dm[2]}/${dm[3]}` : '';
  const credito = g(/Cr[eé]dito\s+Hipotecario\s+N[°º]\s*(\d+)/i, txt);
  const cuentaRut = g(/CuentaRUT\s+N[°º]\s*(\d+)/i, txt);
  return {
    kind: 'pago_servicio',
    empresa: 'BancoEstado - Dividendo Conchalí',
    identificador: credito,
    amount: monto,
    date: date,
    originAccount: cuentaRut,
  };
}

// ── BancoEstado — "Transferencias - Cuentas Propias" (traspaso interno, ej. CuentaRUT → Ahorro Premium) ──
// asunto "Transferencias - Cuentas Propias", cuerpo con pares etiqueta/valor:
//   "Has realizado una transferencia entre tus cuentas" · Monto $200.000 · Hacia 33961660195 ·
//   Desde 16798718 · Mensaje · Fecha y hora 08/07/2026 23:26:58 · N° transacción 8094763
// OJO: BancoEstado escribe la CuentaRUT SIN dígito verificador — transfer-ingest v13 la
// matchea igual (fallback ignorando el último dígito, ahora también en la rama genérica).
// Va por la rama genérica: ambas cuentas propias => 'transfer' con 2 patas.
function parseBancoEstadoCtasPropias(raw) {
  // Misma limpieza que Assetplan: getPlainBody convierte negritas en asteriscos y parte
  // líneas — se quitan tags/entidades/asteriscos y se colapsan saltos antes de parsear.
  const txt = raw.replace(/<[^>]+>/g, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&deg;/gi, '°')
    .replace(/\*/g, ' ').replace(/[\r\n]+/g, ' ');
  const dm = txt.match(/Fecha\s+y\s+hora[\s:]*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  return {
    amount:        g(/Monto[\s:]*\$\s*([\d.,]+)/i, txt).replace(/\./g, ''),
    date:          dm ? dm[1] + '/' + dm[2] + '/' + dm[3] : '',
    originMine:    true,
    destMine:      true,
    originAccount: g(/Desde[\s:]*(\d{6,})/i, txt),
    destAccount:   g(/Hacia[\s:]*(\d{6,})/i, txt),
    originBank:    'BancoEstado',
    destBank:      'BancoEstado',
    txnId:         g(/N[°º]\s*transacci[oó]n[\s:]*(\d+)/i, txt),
    comment:       g(/Mensaje[\s:]*([^\n\r]*?)\s*Fecha\s+y\s+hora/i, txt),
  };
}

// ── Servipag (pago de cuentas de servicio vía servipag.cl, cualquier banco como medio de pago) ──
// Plantilla con 2 tablas ANCHAS (fila de encabezados + fila de valores, no pares etiqueta/valor):
//   Resumen de pago:  Nombre | Fecha | Hora transacción | Número de consulta | Valor | Forma de pago
//   Detalle de pago:  Empresa | Nombre | Identificador de cuenta | Valor | Código autorización de pago
// "Forma de pago" trae solo el NOMBRE del banco (no la cuenta) -> se manda como originBank
// para que transfer-ingest matchee la cuenta por nombre de banco.
function parseServipag(txt) {
  const iDetalle = txt.search(/Detalle\s+de\s+pago/i);
  const resumenBlk = iDetalle > -1 ? txt.slice(0, iDetalle) : txt;
  const detalleBlk = iDetalle > -1 ? txt.slice(iDetalle) : '';

  const date = g(/(\d{1,2}\/\d{1,2}\/\d{4})/, resumenBlk);
  // Forma de pago: texto alfabético después del monto, en la fila de valores del resumen.
  const originBank = g(/\$\s*[\d.,]+\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)*)/, resumenBlk);

  // Detalle: tras los 5 encabezados viene la fila de valores: Empresa Nombre Identificador Valor Código
  const m = detalleBlk.match(/Empresa[\s\S]*?Identificador\s+de\s+cuenta[\s\S]*?Valor[\s\S]*?C[oó]digo\s+autorizaci[oó]n[\s\S]*?pago[\s\S]*?([A-Za-zÁÉÍÓÚÑáéíóúñ0-9().\-\/ ]+?)\s+(\d{5,})\s*\$\s*([\d.,]+)/i);
  return {
    kind: 'pago_servicio',
    empresa: m ? m[1].trim() : '',
    identificador: m ? m[2].trim() : '',
    amount: m ? m[3].replace(/\./g, '') : '',
    date: date,
    originBank: originBank,
  };
}

// ── MetLife (pago de dividendo hipotecario) ─────────────────
// Tabla "RESUMEN": pares etiqueta/valor (Nombre, RUT, Monto total pagado, ID transacción, Fecha de pago).
// Tabla "DETALLE": ANCHA (Crédito | N° de dividendo | Fecha de vencimiento + fila de valores).
// El "empresa" queda fijo (identifica siempre esta fuente para la regla de categoría METLIFE
// y no depende de parsear un nombre variable).
function parseMetlifeDividendo(txt) {
  const amount = money(txt, /Monto\s+total\s+pagado[\s\S]{0,30}?\$\s*([\d.,]+)/i);
  const date = g(/Fecha\s+de\s+pago[\s\S]{0,30}?(\d{1,2}\/\d{1,2}\/\d{4})/i, txt);
  const det = txt.match(/Cr[eé]dito[\s\S]*?N[°º]\s*de\s+dividendo[\s\S]*?Fecha\s+de\s+vencimiento[\s\S]*?([A-Za-z0-9]+)\s+([A-Za-z0-9]+)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const dividendoNum = det ? det[2] : '';
  return {
    kind: 'pago_servicio',
    empresa: 'Metlife - Dividendo Estación Central',
    identificador: dividendoNum,
    amount: amount,
    date: date,
  };
}

// ── Assetplan (arriendos percibidos por los deptos, vía Banco Internacional / indexa.cl) ──
// Remitente "Banco Internacional Informa" <Produccion@indexa.cl>, asunto
// "Internacional SAM FO - Aviso de Pagos - Exitoso". Cuerpo de un solo párrafo:
//   "Por instrucción de la empresa ASSETPLAN RECAUDACION SPA hemos realizado un pago
//    electrónico a la cuenta 62610654 de Banco Santander para realizar un pago por
//    $ 237.977 con fecha efectiva 7 de julio del 2026."
// Es un INGRESO (arriendo). Va por la rama genérica de transfer-ingest: destino = cuenta
// propia (match por número de cuenta), origen = tercero (Assetplan) => clasifica 'ingreso'.
// OJO: la fecha viene larga y con "del" ("7 de julio del 2026") — fechaChile() solo cubre
// "de", por eso el regex propio acepta ambas.
// Verificado (2026-07-07): Santander NO manda notificación de app por estos pagos
// electrónicos — este mail es la única fuente, sin riesgo de duplicar con notif-ingest.
function parseAssetplanPago(raw) {
  // Puede llegar texto plano O el HTML crudo (fallback del dispatch): se limpian tags y
  // se decodifican las entidades (&oacute; etc.) acá mismo, sin depender de getPlainBody.
  // OJO (visto con el payload real en ingest_failures): getPlainBody convierte las negritas
  // <strong> en ASTERISCOS ("pago por *$ 237.977*") y parte las líneas a mitad de frase —
  // se quitan los * y se colapsan los saltos de línea antes de parsear.
  const txt = raw.replace(/<[^>]+>/g, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/\*/g, ' ').replace(/[\r\n]+/g, ' ');
  const empresa = g(/instrucci[oó]n de la empresa\s+([^\n\r]+?)\s+hemos/i, txt) || 'Assetplan';
  const m = txt.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+del?\s+(\d{4})/i);
  const date = m && MESES_ES[m[2].toLowerCase()]
    ? m[1] + '/' + MESES_ES[m[2].toLowerCase()] + '/' + m[3] : '';
  return {
    amount:      money(txt, /pago por\s*\$\s*([\d.,]+)/i),
    date:        date,
    originName:  empresa,
    destAccount: g(/a la cuenta\s+([\d.\-]+)/i, txt),
    destBank:    g(/cuenta\s+[\d.\-]+\s+de\s+(Banco\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+|[A-Za-zÁÉÍÓÚÑáéíóúñ]+)/i, txt) || 'Santander',
    destMine:    true,
    comment:     'Arriendo Assetplan',
  };
}

// ── Copec (carga de combustible vía App Copec, mail info@appcopec.com) ──
// El comprobante viene como HTML (getPlainBody trae casi nada, solo "Comprobante de compra
// Copec") -> se parsea el HTML crudo. El cargo real es el "Total" (hay un Subtotal mayor y un
// Descuento); "El total de tu compra fue: $X" ya trae ese total, y [^$]* corta antes del
// primer $ (no agarra el subtotal). El mail NO dice la tarjeta -> se manda SIN cuenta a
// propósito (el usuario puede cambiar de tarjeta, así que le asigna la cuenta a mano desde
// Movimientos). Va como pago_servicio con empresa 'COPEC' -> la regla COPEC->Transporte lo
// categoriza; transfer-ingest lo inserta con account_id null al no venir cuenta ni banco.
function parseCopec(raw) {
  const txt = raw.replace(/<[^>]+>/g, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&deg;/gi, '°')
    .replace(/[\r\n]+/g, ' ');
  return {
    kind: 'pago_servicio',
    empresa: 'COPEC',
    amount: money(txt, /total de tu compra fue[^$]*\$\s*([\d.]+)/i),
    date: g(/Fecha[:\s]*(\d{4}-\d{2}-\d{2})/i, txt),
  };
}

// ── Banco Ripley ───────────────────────────────────────────
function parseRipley(txt) {
  // "Nuestro cliente NAME ha realizado una transferencia ... a su cuenta del DESTBANK."
  const destBank = g(/a su cuenta del\s+([^\n\r.]+)/i, txt);
  return {
    amount:     money(txt, /Monto\s+Transferido[:\s]*\$\s*([\d.]+)/i),
    date:       g(/(\d{1,2}\/\d{1,2}\/\d{4})/, txt),
    originName: g(/Nuestro cliente\s+([^\n\r]+?)\s+ha realizado/i, txt),
    originBank: g(/Banco\s+de\s+Origen[:\s]*([^\n\r]+)/i, txt) || 'Banco Ripley',
    originMine: true,
    destBank:   destBank,
    destMine:   /a su cuenta/i.test(txt), // "su cuenta" = tuya
    txnId:      g(/N[úu]mero de Transacci[óo]n[:\s]*([\d]+)/i, txt),
    comment:    g(/Comentario[:\s]*([^\n\r]+)/i, txt),
  };
}
