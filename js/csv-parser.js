// ── Budget Tracker CSV Parser ─────────────────────────────────
// Auto-detects KBC and Beobank CSV export formats

// KBC exports a semicolon-delimited CSV with a BOM, typical columns:
// "Rekeningnummer";"Rubrieknaam";"Naam";"Mededeling";"Datum";"Bedrag";"Valuta";"BIC";"Naam tegenpartij";"Rekening tegenpartij";"BIC tegenpartij";"Saldo"
// Date format: DD/MM/YYYY, decimal: comma

// Beobank Credit Card exports:
// "Date";"Description";"Amount";"Currency"  OR
// "Datum";"Omschrijving";"Bedrag";"Valuta";"Saldo"

function parseCSV(text) {
  // Remove BOM if present
  text = text.replace(/^\uFEFF/, '').trim();

  // Detect delimiter
  const firstLine = text.split('\n')[0];
  const delim = firstLine.includes(';') ? ';' : ',';

  const lines = text.split('\n').filter(l => l.trim());
  const headers = splitCSVLine(lines[0], delim).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const rows = lines.slice(1).map(line => {
    const vals = splitCSVLine(line, delim).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  }).filter(r => Object.values(r).some(v => v));

  return { headers, rows };
}

function splitCSVLine(line, delim) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === delim && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function parseAmount(str) {
  if (!str) return null;
  // Handle European format: 1.234,56 or 1,234.56 or -234,56
  const cleaned = str.replace(/\s/g, '').replace(/[€$£]/g, '');
  // If comma is decimal separator (European)
  if (/^\-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(cleaned.replace(',', '.'));
}

function parseDate(str) {
  if (!str) return null;
  str = str.trim();
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${y}-${m}-${d}`;
  }
  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split('-');
    return `${y}-${m}-${d}`;
  }
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // MM/DD/YYYY (fallback)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [m, d, y] = str.split('/');
    return `${y}-${m}-${d}`;
  }
  return null;
}

// ── KBC Detection & Parse ──────────────────────────────────────
function isKBC(headers) {
  return headers.some(h => ['rekeningnummer', 'rubrieknaam', 'bic'].includes(h));
}

function parseKBC(rows) {
  return rows.map(r => {
    // Try multiple field name variants
    const dateStr = r['datum'] || r['date'] || r['valutadatum'] || '';
    const amountStr = r['bedrag'] || r['amount'] || r['montant'] || '';
    const desc = r['mededeling'] || r['naam tegenpartij'] || r['naam'] || r['description'] || r['omschrijving'] || '';
    const balanceStr = r['saldo'] || r['balance'] || '';
    const account = r['rekeningnummer'] || 'kbc';

    const amount = parseAmount(amountStr);
    const date = parseDate(dateStr);
    if (!date || amount === null || isNaN(amount)) return null;

    return {
      id: `kbc_${date}_${amount}_${Math.random().toString(36).slice(2,6)}`,
      date,
      description: desc.trim() || 'KBC Transaction',
      amount,
      balance: balanceStr ? parseAmount(balanceStr) : null,
      account: 'kbc',
      accountLabel: 'KBC',
      category: autoCategory(desc),
      source: 'csv',
    };
  }).filter(Boolean);
}

// ── Beobank Detection & Parse ─────────────────────────────────
function isBeobank(headers) {
  return headers.some(h => ['beobank', 'carte', 'card number', 'numero de carte'].includes(h))
    || (headers.includes('date') && headers.includes('description') && !headers.includes('rekeningnummer'));
}

function parseBeobank(rows, headers) {
  return rows.map(r => {
    const dateStr = r['date'] || r['datum'] || r['transaction date'] || r['date de transaction'] || '';
    const amountStr = r['amount'] || r['bedrag'] || r['montant'] || r['debit'] || r['credit'] || '';
    const desc = r['description'] || r['omschrijving'] || r['libelle'] || r['merchant'] || '';
    const balanceStr = r['saldo'] || r['balance'] || r['solde'] || '';

    // Some Beobank exports split debit/credit into separate columns
    let amount = parseAmount(amountStr);
    if (r['debit'] && r['credit']) {
      const debit  = parseAmount(r['debit'])  || 0;
      const credit = parseAmount(r['credit']) || 0;
      amount = credit > 0 ? credit : -debit;
    }

    const date = parseDate(dateStr);
    if (!date || amount === null || isNaN(amount)) return null;

    return {
      id: `beobank_${date}_${amount}_${Math.random().toString(36).slice(2,6)}`,
      date,
      description: desc.trim() || 'Beobank Transaction',
      amount,
      balance: balanceStr ? parseAmount(balanceStr) : null,
      account: 'beobank',
      accountLabel: 'Beobank',
      category: autoCategory(desc),
      source: 'csv',
    };
  }).filter(Boolean);
}

// ── Main parse entry point ────────────────────────────────────
function parseCSVFile(text, filenameHint = '') {
  const { headers, rows } = parseCSV(text);
  const fn = filenameHint.toLowerCase();

  let txs = [];
  let bank = 'unknown';

  // Force-detect by filename first
  if (fn.includes('kbc') || fn.includes('cbc')) {
    txs = parseKBC(rows);
    bank = 'kbc';
  } else if (fn.includes('beobank') || fn.includes('beo')) {
    txs = parseBeobank(rows, headers);
    bank = 'beobank';
  } else if (isKBC(headers)) {
    txs = parseKBC(rows);
    bank = 'kbc';
  } else if (isBeobank(headers, rows)) {
    txs = parseBeobank(rows, headers);
    bank = 'beobank';
  } else {
    // Generic fallback — try KBC format
    txs = parseKBC(rows);
    if (!txs.length) txs = parseBeobank(rows, headers);
    bank = 'generic';
  }

  return { txs, bank, rowCount: rows.length };
}

// ── CODA support (Belgian bank statement format) ──────────────
// Future: parse .coda files from KBC
function parseCODA(text) {
  // CODA is a fixed-width Belgian bank format — stub for future
  return { txs: [], bank: 'coda', rowCount: 0 };
}
