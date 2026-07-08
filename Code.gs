/**
 * Budget Mensual Dashboard — Backend en Google Apps Script
 * -------------------------------------------------------
 * Usa una Google Sheet como base de datos ligera y compartida.
 * Expone un Web App con:
 *   GET  ?action=ping             -> prueba de conexión
 *   GET  ?action=all              -> { ok, months: { "2026-07": {...}, ... } }
 *   GET  ?action=get&month=YYYY-MM-> { ok, month, data }
 *   GET  ?action=list             -> { ok, months: ["2026-07", ...] }
 *   POST { token, month, data }   -> guarda/actualiza un mes
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

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'all';

    if (action === 'ping') return json_({ ok: true, pong: true, time: new Date().toISOString() });
    if (action === 'get')  return json_({ ok: true, month: e.parameter.month, data: readMonth_(e.parameter.month) });
    if (action === 'list') return json_({ ok: true, months: listMonths_() });

    // por defecto: todos los meses
    return json_({ ok: true, months: readAll_() });
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
      var updatedAt = writeMonth_(body.month, body.data);
      return json_({ ok: true, month: body.month, updatedAt: updatedAt });
    }

    return json_({ ok: false, error: 'bad request' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ------------------------- helpers de hoja ------------------------- */

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 2).setValues([['mes', 'updatedAt']]);
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
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(month)) return i + 2;
  }
  return -1;
}

function writeMonth_(month, data) {
  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try {
    var sh = sheet_();
    var keys = Object.keys(data || {});
    var hdr = ensureHeaders_(sh, ['mes', 'updatedAt'].concat(keys));
    var updatedAt = new Date().toISOString();
    var record = {};
    keys.forEach(function (k) { record[k] = data[k]; });
    record.mes = month;
    record.updatedAt = updatedAt;

    var rowVals = hdr.map(function (h) { return (record[h] !== undefined ? record[h] : ''); });
    var r = rowIndexForMonth_(sh, month);
    if (r === -1) r = sh.getLastRow() + 1;
    sh.getRange(r, 1, 1, hdr.length).setValues([rowVals]);
    return updatedAt;
  } finally {
    lock.releaseLock();
  }
}

function readMonth_(month) {
  var sh = sheet_();
  var hdr = headers_(sh);
  var r = rowIndexForMonth_(sh, month);
  if (r === -1) return null;
  var vals = sh.getRange(r, 1, 1, hdr.length).getValues()[0];
  return rowToObj_(hdr, vals);
}

function readAll_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  var hdr = headers_(sh);
  var out = {};
  if (last < 2) return out;
  var vals = sh.getRange(2, 1, last - 1, hdr.length).getValues();
  vals.forEach(function (row) {
    var m = String(row[0] || '').trim();
    if (m) out[m] = rowToObj_(hdr, row);
  });
  return out;
}

function listMonths_() {
  return Object.keys(readAll_()).sort();
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

