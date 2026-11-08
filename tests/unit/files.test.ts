import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { neutralize, parseCsv, toCsv } from '@/server/files/csv';
import { DEFAULT_LIMITS, SpreadsheetError, excelSerialToIso, readXlsx, writeXlsx, zip } from '@/server/files/xlsx';

const LIMITS = { maxRows: 100, maxCols: 30, maxCell: 500 };

/** A one-sheet workbook whose sheet XML we control. */
function workbook(sheetXml: string, extra: { name: string; data: Buffer }[] = []) {
  const b = (s: string) => Buffer.from(s);
  return zip([
    {
      name: 'xl/workbook.xml',
      data: b('<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: b('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    },
    { name: 'xl/worksheets/sheet1.xml', data: b(sheetXml) },
    ...extra,
  ]);
}

describe('xlsx (spec §9.5)', () => {
  it('round-trips a template with headers, Unicode and escaping', () => {
    const buf = writeXlsx([
      {
        name: 'Students',
        rows: [
          ['Student name', 'Class'],
          ['عائشہ <Khan> & Co', '8'],
        ],
        boldFirstRow: true,
      },
    ]);
    expect(readXlsx(buf)).toEqual([
      ['Student name', 'Class'],
      ['عائشہ <Khan> & Co', '8'],
    ]);
  });

  it('reads shared strings, numbers and gaps between columns', () => {
    const sheet =
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>42</v></c></row></sheetData></worksheet>';
    const shared = {
      name: 'xl/sharedStrings.xml',
      data: Buffer.from('<sst><si><r><t>Ali</t></r><r><t xml:space="preserve"> Raza</t></r></si></sst>'),
    };
    expect(readXlsx(workbook(sheet, [shared]))).toEqual([['Ali Raza', '', '42']]);
  });

  it('rejects formula cells', () => {
    const sheet =
      '<worksheet><sheetData><row r="1"><c r="B1"><f>HYPERLINK("http://x")</f><v>1</v></c></row></sheetData></worksheet>';
    expect(() => readXlsx(workbook(sheet))).toThrow(/B1 has a formula/);
  });

  it('rejects DTDs and entity declarations (no XXE / billion laughs)', () => {
    const sheet =
      '<!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&a;</t></is></c></row></sheetData></worksheet>';
    expect(() => readXlsx(workbook(sheet))).toThrow(SpreadsheetError);
  });

  it('stops a zip bomb while inflating, whatever sizes the archive claims', () => {
    const bomb = Buffer.alloc(40 * 1024 * 1024, 0x20);
    const buf = workbook('<worksheet/>', [{ name: 'xl/sharedStrings.xml', data: bomb }]);
    expect(buf.length).toBeLessThan(DEFAULT_LIMITS.maxFileBytes);
    expect(() => readXlsx(buf)).toThrow(/too large once unpacked/);
  });

  it('rejects files that are not workbooks, encrypted or too large', () => {
    expect(() => readXlsx(Buffer.from('hello world, this is not a zip file at all'))).toThrow(SpreadsheetError);
    expect(() => readXlsx(Buffer.alloc(DEFAULT_LIMITS.maxFileBytes + 1))).toThrow(/larger than 2 MB/);
    const enc = workbook('<worksheet/>');
    // Set the "encrypted" flag on the first central-directory entry (its offset is in the end record).
    const first = enc.readUInt32LE(enc.length - 22 + 16);
    enc.writeUInt16LE(enc.readUInt16LE(first + 8) | 1, first + 8);
    expect(() => readXlsx(enc)).toThrow(/Password-protected/);
  });

  it('caps rows', () => {
    const rows = Array.from({ length: 30 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join(
      '',
    );
    expect(() =>
      readXlsx(workbook(`<worksheet><sheetData>${rows}</sheetData></worksheet>`), { ...DEFAULT_LIMITS, maxRows: 10 }),
    ).toThrow(/more than 10 rows/);
  });

  it('converts Excel date serials', () => {
    expect(excelSerialToIso(41779)).toBe('2014-05-20');
    expect(excelSerialToIso(-1)).toBeNull();
  });

  it('a deflate stream is what we expect from zlib', () => {
    expect(zlib.inflateRawSync(zlib.deflateRawSync(Buffer.from('ok'))).toString()).toBe('ok');
  });
});

describe('csv', () => {
  it('neutralises formula-like cells on export (CSV injection)', () => {
    for (const v of ['=1+1', '+92 300', '-2', '@SUM(A1)', '\tx', '\rx']) expect(neutralize(v)).toBe(`'${v}`);
    expect(neutralize('Ayesha')).toBe('Ayesha');
    const csv = toCsv(
      ['Name', 'Note'],
      [
        ['=HYPERLINK("http://evil")', 'a,b'],
        ['Ali "AJ" Raza', null],
      ],
    );
    expect(csv).toBe('﻿Name,Note\r\n"\'=HYPERLINK(""http://evil"")","a,b"\r\n"Ali ""AJ"" Raza",\r\n');
  });

  it('parses quotes, escaped quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\n', LIMITS)).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('enforces row and column limits', () => {
    expect(() => parseCsv('a\n'.repeat(200), LIMITS)).toThrow(/more than 100 rows/);
    expect(() => parseCsv(Array(40).fill('x').join(','), LIMITS)).toThrow(/too many columns/);
  });
});
