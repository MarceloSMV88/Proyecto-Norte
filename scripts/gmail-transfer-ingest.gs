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
const SEARCH   = '(from:santander.cl OR from:bancochile.cl OR from:bancoripley.cl) '
               + 'subject:(transferencia OR Comprobante OR Transferencias)';

/**
 * EJECUTAR UNA SOLA VEZ antes de activar el trigger.
 * Marca todos los correos de transferencia EXISTENTES como procesados (sin enviarlos),
 * para que no se re-importen y dupliquen los saldos ya cargados manualmente.
 */
function marcarBaseline() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search(SEARCH + ' -label:' + LABEL + ' newer_than:180d', 0, 200);
  threads.forEach(t => t.addLabel(label));
  Logger.log('Baseline: ' + threads.length + ' hilos marcados como procesados.');
}

function procesarTransferencias() {
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search(SEARCH + ' -label:' + LABEL + ' newer_than:7d', 0, 30);

  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      const from = msg.getFrom().toLowerCase();
      const body = msg.getPlainBody().replace(/ /g, ' ');
      let data = null;
      if (from.indexOf('santander') > -1)      data = parseSantander(body);
      else if (from.indexOf('bancochile') > -1) data = parseChile(body);
      else if (from.indexOf('ripley') > -1)     data = parseRipley(body);
      if (!data) return;

      // Un parser puede devolver varios items (ej: "Comprobante de pago" con N cuentas pagadas)
      const items = Array.isArray(data) ? data : [data];
      items.forEach(d => {
        if (!d || !d.amount) return;
        UrlFetchApp.fetch(ENDPOINT, {
          method: 'post', contentType: 'application/json',
          headers: { 'x-ingest-secret': SECRET },
          payload: JSON.stringify(d), muteHttpExceptions: true,
        });
      });
    });
    thread.addLabel(label);
  });
}

// Helpers
function g(re, src) { const m = src.match(re); return m ? m[1].trim() : ''; }
function money(src, re) { return g(re, src).replace(/\./g, ''); }

// ── Santander ──────────────────────────────────────────────
function parseSantander(txt) {
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
