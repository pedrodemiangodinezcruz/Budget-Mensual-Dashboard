/**
 * Budget Mensual Dashboard — Backend en Google Apps Script
 * -------------------------------------------------------
 * Usa una Google Sheet como base de datos ligera y compartida.
 * Expone un Web App con:
 *   GET  ?action=ping              -> prueba de conexión
 *   GET  ?action=all               -> { ok, months:{...}, updatedAt:{ "2026-07": iso, ... } }
 *   GET  ?action=get&month=YYYY-MM -> { ok, month, data, updatedAt }
 *   GET  ?action=list              -> { ok, months:["2026-07", ...] }
 *   POST { token, month, data, baseUpdatedAt, force }
 *        -> guarda/actualiza un mes. Si baseUpdatedAt no coincide con el
 *           updatedAt del servidor (y sin force:true), responde
 *           { ok:false, conflict:true, serverUpdatedAt, data } para no
 *           sobrescribir cambios de la otra persona.
 *   POST { token, action:"saveAll", months:{...} } -> guarda varios meses
 *
 * Estructura de la hoja "Meses" (una fila por mes, encabezados dinámicos):
 *   mes | updatedAt | incomeDemian | incomeAna | rent | services | groceries |
 *   netflix | disney | ants | social | personalCare | investPct | pctDemian |
 *   pctAna | weeklyTarget | emergencyGoal | emergencyCurrent | emergencyDemian |
 *   emergencyAna | w1 | w2 | w3 | w4
 * (Si el frontend envía un campo nuevo, se agrega la columna automáticamente.)
 *
 * SEGURIDAD (léelo):
 *  - El Web App se publica con acceso "Cualquier usuario". La URL /exec es una
 *    "URL con capacidad": quien la tenga puede leer. La escritura se protege con
 *    un token opcional guardado en Propiedades del script (ACCESS_TOKEN).
 *  - No pongas la URL ni el token en un repositorio público: en el frontend se
 *    configuran desde la UI y se guardan en localStorage del navegador.
 */

var SHEET_NAME = 'Meses';
var TOKEN_PROP = 'ACCESS_TOKEN'; // opcional: Project Settings > Script properties
var TZ = 'America/Mexico_City'; // zona horaria para normalizar meses

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'all';

    if (action === 'ping') return json_({ ok: true, pong: true, time: new Date().toISOString() });
    if (action === 'get') {
      var gm = normMonth_(e.parameter.month);
      return json_({ ok: true, month: gm, data: readMonth_(gm), updatedAt: readUpdatedAt_(gm) });
    }
    if (action === 'list') return json_({ ok: true, months: listMonths_() });

    // por defecto: todos los meses + marcas de tiempo
    var all = readAll_();
    return json_({ ok: true, months: all.months, updatedAt: all.updatedAt });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);

    if (!checkToken_(body.token)) return json_({ ok: false, error: 'unauthorized' });

    if (body.action === 'saveAll' && body.months) {
      var keys = Object.keys(body.months);
      keys.forEach(function (m) { writeMonth_(m, body.months[m]); });
      return json_({ ok: true, saved: keys.length });
    }

    if (body.month && body.data) {
      var month = normMonth_(body.month);

      // Detección de conflicto: si el servidor cambió respecto a la base del cliente
      var serverUpdatedAt = readUpdatedAt_(month);
      if (!body.force && serverUpdatedAt && body.baseUpdatedAt && serverUpdatedAt !== body.baseUpdatedAt) {
        return json_({ ok: false, conflict: true, serverUpdatedAt: serverUpdatedAt, data: readMonth_(month) });
      }

      var updatedAt = writeMonth_(month, body.data);
      return json_({ ok: true, month: month, updatedAt: updatedAt });
    }

    return json_({ ok: false, error: 'bad request' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ------------------------- helpers de hoja ------------------------- */

// Normaliza cualquier valor a "YYYY-MM" (robusto ante fechas y strings raros)
function normMonth_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM');
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, TZ, 'yyyy-MM');
  return s;
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 2).setValues([['mes', 'updatedAt']]);
    sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@'); // col A como texto (evita que 2026-07 se vuelva fecha)
  }
  return sh;
}

function headers_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 2) {
    sh.getRange(1, 1, 1, 2).setValues([['mes', 'updatedAt']]);
    return ['mes', 'updatedAt'];
  }
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function ensureHeaders_(sh, keys) {
  var hdr = headers_(sh);
  var missing = keys.filter(function (k) { return hdr.indexOf(k) === -1; });
  if (missing.length) {
    sh.getRange(1, hdr.length + 1, 1, missing.length).setValues([missing]);
    hdr = hdr.concat(missing);
  }
  return hdr;
}

function rowIndexForMonth_(sh, month) {
  var target = normMonth_(month);
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (normMonth_(col[i][0]) === target) return i + 2;
  }
  return -1;
}

function writeMonth_(month, data) {
  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try {
    var sh = sheet_();
    var m = normMonth_(month);
    var keys = Object.keys(data || {});
    var hdr = ensureHeaders_(sh, ['mes', 'updatedAt'].concat(keys));
    var updatedAt = new Date().toISOString();
    var record = {};
    keys.forEach(function (k) { record[k] = data[k]; });
    record.mes = m;
    record.updatedAt = updatedAt;

    var rowVals = hdr.map(function (h) { return (record[h] !== undefined ? record[h] : ''); });
    var r = rowIndexForMonth_(sh, m);
    if (r === -1) r = sh.getLastRow() + 1;
    sh.getRange(r, 1).setNumberFormat('@'); // fuerza la celda "mes" como texto
    sh.getRange(r, 1, 1, hdr.length).setValues([rowVals]);
    return updatedAt;
  } finally {
    lock.releaseLock();
  }
}

function readMonth_(month) {
  return readAll_().months[normMonth_(month)] || null;
}

function readUpdatedAt_(month) {
  return readAll_().updatedAt[normMonth_(month)] || '';
}

function readAll_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  var hdr = headers_(sh);
  var months = {}, updatedAt = {};
  if (last < 2) return { months: months, updatedAt: updatedAt };
  var uIdx = hdr.indexOf('updatedAt');
  var vals = sh.getRange(2, 1, last - 1, hdr.length).getValues();
  vals.forEach(function (row) {
    var m = normMonth_(row[0]);
    if (m) {
      months[m] = rowToObj_(hdr, row);
      updatedAt[m] = (uIdx >= 0 && row[uIdx]) ? String(row[uIdx]) : '';
    }
  });
  return { months: months, updatedAt: updatedAt };
}

function listMonths_() {
  return Object.keys(readAll_().months).sort();
}

function rowToObj_(hdr, vals) {
  var o = {};
  hdr.forEach(function (h, i) {
    if (h && h !== 'mes' && h !== 'updatedAt') {
      o[h] = (vals[i] === '' || vals[i] === null || vals[i] === undefined) ? '' : String(vals[i]);
    }
  });
  return o;
}

function checkToken_(token) {
  var need = PropertiesService.getScriptProperties().getProperty(TOKEN_PROP);
  if (!need) return true; // sin token configurado => se permite (uso personal)
  return String(token || '') === String(need);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

