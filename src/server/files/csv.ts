/**
 * CSV in and out (spec §9.5). Exported cells that start like a formula are prefixed with an apostrophe so
 * spreadsheet apps show them as text instead of running them (CSV/formula injection).
 */

export type Cell = string | number | boolean | null | undefined | Date;

const FORMULA_START = /^[=+\-@\t\r]/;

export function neutralize(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

function cellText(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return neutralize(v);
}

function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens Urdu names and symbols correctly. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const lines = [header.map((h) => quote(neutralize(h))), ...rows.map((r) => r.map((c) => quote(cellText(c))))];
  return '﻿' + lines.map((l) => l.join(',')).join('\r\n') + '\r\n';
}

export function csvResponse(fileName: string, csv: string): Response {
  const safe = fileName.replace(/[^\w.-]+/g, '-');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safe}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Parses CSV text (quotes, escaped quotes, CRLF/LF). Stops with an error past `maxRows` or `maxCols`. */
export function parseCsv(text: string, limits: { maxRows: number; maxCols: number; maxCell: number }): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  const pushCell = () => {
    if (cell.length > limits.maxCell) throw new Error(`A cell in row ${rows.length + 1} is too long`);
    row.push(cell);
    cell = '';
    if (row.length > limits.maxCols) throw new Error(`Row ${rows.length + 1} has too many columns`);
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    if (rows.length > limits.maxRows) throw new Error(`The file has more than ${limits.maxRows} rows`);
  };
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') pushCell();
    else if (ch === '\n') pushRow();
    else if (ch === '\r') {
      if (src[i + 1] !== '\n') pushRow();
    } else cell += ch;
    i++;
  }
  if (cell !== '' || row.length) pushRow();
  return rows;
}
