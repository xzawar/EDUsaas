import zlib from 'node:zlib';

/**
 * Minimal, defensive .xlsx reader/writer (spec §9.5). We read only what an import needs: the first worksheet's
 * cell values. Hardening:
 *  - size caps on the archive, every entry and the total decompressed bytes (zip bombs are cut off while
 *    inflating, whatever the archive claims);
 *  - no ZIP64, no encryption, bounded entry count;
 *  - XML with a DOCTYPE/ENTITY is rejected (no entity expansion, no external entities);
 *  - formula cells are rejected (the person must paste values);
 *  - row/column/cell-length caps before values are used.
 */

export class SpreadsheetError extends Error {}

export type ReadLimits = {
  maxFileBytes: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxRows: number;
  maxCols: number;
  maxCell: number;
};

export const DEFAULT_LIMITS: ReadLimits = {
  maxFileBytes: 2 * 1024 * 1024,
  maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  maxRows: 2000,
  maxCols: 30,
  maxCell: 500,
};

type Entry = { name: string; method: number; flags: number; compSize: number; size: number; offset: number };

function readEntries(buf: Buffer): Map<string, Entry> {
  // End of central directory: last 22..(22+65535) bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpreadsheetError('This file isn’t a valid Excel workbook');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new SpreadsheetError('This workbook format isn’t supported');
  if (count > 200) throw new SpreadsheetError('This workbook has too many parts');
  if (cdOffset + cdSize > buf.length) throw new SpreadsheetError('This file is damaged');
  const entries = new Map<string, Entry>();
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new SpreadsheetError('This file is damaged');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (flags & 0x1) throw new SpreadsheetError('Password-protected workbooks can’t be imported');
    if (compSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff)
      throw new SpreadsheetError('This workbook format isn’t supported');
    entries.set(name, { name, method, flags, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extract(buf: Buffer, e: Entry, budget: { left: number }, maxEntryBytes: number): Buffer {
  const p = e.offset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) throw new SpreadsheetError('This file is damaged');
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const data = buf.subarray(start, start + e.compSize);
  if (data.length !== e.compSize) throw new SpreadsheetError('This file is damaged');
  const limit = Math.min(maxEntryBytes, budget.left);
  let out: Buffer;
  if (e.method === 0) out = Buffer.from(data);
  else if (e.method === 8) {
    try {
      out = zlib.inflateRawSync(data, { maxOutputLength: limit + 1 });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE' || err instanceof RangeError)
        throw new SpreadsheetError('This workbook is too large once unpacked');
      throw new SpreadsheetError('This file is damaged');
    }
  } else throw new SpreadsheetError('This workbook uses an unsupported compression');
  if (out.length > limit) throw new SpreadsheetError('This workbook is too large once unpacked');
  budget.left -= out.length;
  return out;
}

function safeXml(buf: Buffer): string {
  const xml = buf.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new SpreadsheetError('This workbook contains unsupported content');
  return xml;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENT[e.toLowerCase()] ?? '';
  });
}

const textOf = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]!)).join('');

function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Reads the first worksheet as rows of trimmed strings. Numeric cells come back as their stored number text. */
export function readXlsx(buf: Buffer, limits: ReadLimits = DEFAULT_LIMITS): string[][] {
  if (buf.length > limits.maxFileBytes) throw new SpreadsheetError('The file is larger than 2 MB');
  const entries = readEntries(buf);
  const budget = { left: limits.maxTotalBytes };
  const get = (name: string) => {
    const e = entries.get(name);
    return e ? safeXml(extract(buf, e, budget, limits.maxEntryBytes)) : null;
  };

  const workbook = get('xl/workbook.xml');
  if (!workbook) throw new SpreadsheetError('This file isn’t a valid Excel workbook');
  const firstSheetRel = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = get('xl/_rels/workbook.xml.rels') ?? '';
  let target = firstSheetRel
    ? (new RegExp(`<Relationship\\b[^>]*Id="${firstSheetRel}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ??
      new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheetRel}"`).exec(rels)?.[1])
    : undefined;
  target = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target}`) : 'xl/worksheets/sheet1.xml';
  const sheet = get(target);
  if (!sheet) throw new SpreadsheetError('The workbook has no worksheet');

  const sharedXml = get('xl/sharedStrings.xml');
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!)) : [];

  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const attrs = rm[1] ?? rm[3] ?? '';
    const rowNo = Number(/\br="(\d+)"/.exec(attrs)?.[1] ?? rows.length + 1);
    if (rowNo > limits.maxRows + 1) throw new SpreadsheetError(`The file has more than ${limits.maxRows} rows`);
    const cells: string[] = [];
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cAttrs = cm[1]!;
      const inner = cm[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(cAttrs)?.[1];
      if (/<f[\s>/]/.test(inner))
        throw new SpreadsheetError(`Cell ${ref ?? ''} has a formula. Paste values only and try again.`);
      const col = ref ? colIndex(ref) : cells.length;
      if (col >= limits.maxCols) throw new SpreadsheetError('The sheet has too many columns');
      const type = /\bt="([^"]+)"/.exec(cAttrs)?.[1] ?? 'n';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(inner);
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v !== undefined ? unescapeXml(v) : '';
      value = value.trim();
      if (value.length > limits.maxCell) throw new SpreadsheetError(`Cell ${ref ?? ''} is too long`);
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    while (rows.length < rowNo - 1) rows.push([]);
    rows[rowNo - 1] = cells;
  }
  return rows;
}

/** Excel stores dates as days since 1899-12-30 (with the 1900 leap-year bug baked in). */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

// ── Writer (templates) ──────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds a ZIP archive (deflate). Exported for tests that craft hostile workbooks. */
export function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = zlib.deflateRawSync(f.data);
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export type SheetSpec = { name: string; rows: string[][]; widths?: number[]; boldFirstRow?: boolean };

/** Writes a simple workbook of text cells (inline strings; style 1 = bold header). */
export function writeXlsx(sheets: SheetSpec[]): Buffer {
  const sheetXml = (s: SheetSpec) => {
    const cols = s.widths?.length
      ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const rows = s.rows
      .map(
        (r, ri) =>
          `<row r="${ri + 1}">${r
            .map(
              (v, ci) =>
                `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${ri === 0 && s.boldFirstRow ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`,
            )
            .join('')}</row>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const b = (s: string) => Buffer.from(s, 'utf8');
  const files = [
    {
      name: '[Content_Types].xml',
      data: b(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('')}</Types>`,
      ),
    },
    {
      name: '_rels/.rels',
      data: b(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: b(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
          .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('')}</sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: b(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join(
            '',
          )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: 'xl/styles.xml',
      data: b(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
      ),
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: b(sheetXml(s)) })),
  ];
  return zip(files);
}

export function xlsxResponse(fileName: string, data: Buffer): Response {
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName.replace(/[^\w.-]+/g, '-')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
