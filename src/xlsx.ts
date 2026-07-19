// Minimal, dependency-free .xlsx (OOXML) writer for simple tabular data.
// Produces a real workbook: the required XML parts packed into a STORE (no
// compression) ZIP with correct CRC32s, so Excel opens it without warnings.

type Cell = string | number | null;
export interface XlsxTable {
  title?: string;
  headers: string[];
  rows: Cell[][];
}

// ── CRC32 (for ZIP entries) ───────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

// ── STORE-only ZIP ────────────────────────────────────────────────────────────
function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: number[] = [];
  const central: number[] = [];
  const push16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const push32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const pushBytes = (a: number[], b: Uint8Array) => {
    for (let i = 0; i < b.length; i++) a.push(b[i]);
  };

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const offset = chunks.length;

    // local file header
    push32(chunks, 0x04034b50);
    push16(chunks, 20); // version needed
    push16(chunks, 0); // flags
    push16(chunks, 0); // method: store
    push16(chunks, 0); // mod time
    push16(chunks, 0); // mod date
    push32(chunks, crc);
    push32(chunks, f.data.length); // compressed size
    push32(chunks, f.data.length); // uncompressed size
    push16(chunks, nameBytes.length);
    push16(chunks, 0); // extra length
    pushBytes(chunks, nameBytes);
    pushBytes(chunks, f.data);

    // central directory record
    push32(central, 0x02014b50);
    push16(central, 20); // version made by
    push16(central, 20); // version needed
    push16(central, 0);
    push16(central, 0); // method: store
    push16(central, 0);
    push16(central, 0);
    push32(central, crc);
    push32(central, f.data.length);
    push32(central, f.data.length);
    push16(central, nameBytes.length);
    push16(central, 0); // extra
    push16(central, 0); // comment
    push16(central, 0); // disk number
    push16(central, 0); // internal attrs
    push32(central, 0); // external attrs
    push32(central, offset);
    pushBytes(central, nameBytes);
  }

  const cdOffset = chunks.length;
  pushBytes(chunks, new Uint8Array(central));
  const cdSize = central.length;

  // end of central directory
  const eocd: number[] = [];
  push32(eocd, 0x06054b50);
  push16(eocd, 0);
  push16(eocd, 0);
  push16(eocd, files.length);
  push16(eocd, files.length);
  push32(eocd, cdSize);
  push32(eocd, cdOffset);
  push16(eocd, 0);
  pushBytes(chunks, new Uint8Array(eocd));

  return new Uint8Array(chunks);
}

// ── XLSX parts ────────────────────────────────────────────────────────────────
function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function colRef(col: number): string {
  let s = '';
  let n = col + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function cellXml(ref: string, value: Cell): string {
  if (value === null || value === undefined || value === '') return `<c r="${ref}"/>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(value))}</t></is></c>`;
}

// Stack all tables into one worksheet (title row, header row, data rows, blank).
function sheetXml(tables: XlsxTable[]): string {
  const rows: string[] = [];
  let r = 0;
  const addRow = (cells: Cell[]) => {
    r += 1;
    const cs = cells.map((c, i) => cellXml(colRef(i) + r, c)).join('');
    rows.push(`<row r="${r}">${cs}</row>`);
  };
  tables.forEach((t, i) => {
    if (i > 0) {
      r += 1; // blank spacer row
    }
    if (t.title) addRow([t.title]);
    addRow(t.headers);
    t.rows.forEach(addRow);
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rows.join('')}</sheetData></worksheet>`
  );
}

const contentTypes =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>';

const rootRels =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const workbookRels =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '</Relationships>';

function workbookXml(sheetName: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEsc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );
}

// Build a .xlsx Blob from stacked tables. sheetName is clamped to Excel's rules.
export function buildXlsx(tables: XlsxTable[], sheetName = 'Results'): Blob {
  const safeName = (sheetName || 'Results').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Results';
  const files = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml(safeName)) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml(tables)) },
  ];
  const bytes = zip(files);
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
