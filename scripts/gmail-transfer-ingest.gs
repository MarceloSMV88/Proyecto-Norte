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
      if (!data || !data.amount) return;

      UrlFetchApp.fetch(ENDPOINT, {
        method: 'post', contentType: 'application/json',
        headers: { 'x-ingest-secret': SECRET },
        payload: JSON.stringify(data), muteHttpExceptions: true,
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
function parseChile(txt) {
  const idxDest = txt.search(/Datos\s+de\s+la\s+Transferencia/i);
  const dBlk = txt.search(/Datos\s+del\s+Destinatario/i) > -1
    ? txt.slice(txt.search(/Datos\s+del\s+Destinatario/i), idxDest > -1 ? idxDest : undefined) : txt;
  // Bloque "Datos de la Transferencia" (trae la cuenta de ORIGEN). NO usar fallback global (agarra la del destinatario).
  const txBlk = idxDest > -1 ? txt.slice(idxDest) : '';
  return {
    amount:        money(txt, /Monto[^$]*\$\s*([\d.]+)/i),
    date:          g(/(\d{1,2}\/\d{1,2}\/\d{4})/, txt),
    originMine:    true, // "usted ha efectuado una transferencia ... desde su Cuenta Corriente"
    originAccount: g(/desde su Cuenta Corriente\s*([\d.\-]+)/i, txt) || g(/Cuenta[:\s]*([\d.\-]{6,})/i, txBlk),
    originBank:    'Banco de Chile',
    destName:      g(/Nombre[:\s]*([^\n\r]+)/i, dBlk),
    destRut:       g(/Rut[:\s]*([\dkK.\-]+)/i, dBlk),
    destAccount:   g(/Cuenta[:\s]*([\d.\-]+)/i, dBlk),
    destBank:      g(/Banco[:\s]*([^\n\r]+)/i, dBlk),
    txnId:         g(/ID[:\s]*([A-Z0-9_]+)/i, txt),
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
