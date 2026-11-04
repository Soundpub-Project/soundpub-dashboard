import { parseMoney } from '../finance/money.js';

export const LEGACY_ROYALTY_REQUIRED_COLUMNS = [
  'period', 'isrc', 'platform', 'country', 'sales_unit', 'net_revenue',
] as const;

export interface LegacyRoyaltyCsvRow {
  sourceRowNumber: number;
  period: string;
  isrc: string;
  upc: string;
  title?: string;
  artist?: string;
  labelName?: string;
  platform: string;
  country: string;
  salesType?: string;
  salesUnit: number;
  netMinor: bigint;
}

export interface LegacyRoyaltyCsvIssue {
  row: number;
  field: string;
  code: string;
  message: string;
}

export interface LegacyRoyaltyCsvResult {
  rows: LegacyRoyaltyCsvRow[];
  issues: LegacyRoyaltyCsvIssue[];
  headers: string[];
}

function parseDocument(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && field.length === 0) quoted = true;
    else if (character === ',') {
      row.push(field.trim());
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('CSV_UNCLOSED_QUOTE');
  row.push(field.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

function optional(values: string[], index: number): string | undefined {
  const value = index < 0 ? '' : values[index]?.trim() ?? '';
  return value || undefined;
}

function decimalMoney(value: string): bigint {
  const normalized = value.startsWith('+') ? value.slice(1) : value;
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(normalized)) throw new Error('INVALID_NET_REVENUE');
  return parseMoney(normalized);
}

export function parseLegacyRoyaltyCsv(input: string): LegacyRoyaltyCsvResult {
  const issues: LegacyRoyaltyCsvIssue[] = [];
  let document: string[][];
  try {
    document = parseDocument(input.replace(/^\uFEFF/, ''));
  } catch {
    return { rows: [], headers: [], issues: [{ row: 0, field: 'file', code: 'CSV_UNCLOSED_QUOTE', message: 'Tanda kutip CSV tidak ditutup.' }] };
  }
  if (document.length < 2) {
    return { rows: [], headers: document[0] ?? [], issues: [{ row: 0, field: 'file', code: 'CSV_EMPTY', message: 'File CSV kosong atau tidak memiliki data.' }] };
  }
  const headers = document[0]!.map(header => header.toLowerCase().trim());
  const duplicateHeaders = [...new Set(headers.filter((header, index) => header && headers.indexOf(header) !== index))];
  if (duplicateHeaders.length) {
    return { rows: [], headers, issues: [{ row: 1, field: 'header', code: 'DUPLICATE_HEADER', message: `Header duplikat: ${duplicateHeaders.join(', ')}` }] };
  }
  const missing = LEGACY_ROYALTY_REQUIRED_COLUMNS.filter(column => !headers.includes(column));
  if (missing.length) {
    return { rows: [], headers, issues: [{ row: 1, field: 'header', code: 'MISSING_COLUMNS', message: `Kolom wajib tidak ditemukan: ${missing.join(', ')}` }] };
  }
  const index = (name: string) => headers.indexOf(name);
  const rows: LegacyRoyaltyCsvRow[] = [];
  for (let offset = 1; offset < document.length; offset += 1) {
    const values = document[offset]!;
    const rowNumber = offset + 1;
    const fail = (field: string, code: string, message: string) => issues.push({ row: rowNumber, field, code, message });
    const period = values[index('period')]?.trim() ?? '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) { fail('period', 'INVALID_PERIOD', 'Period wajib berformat YYYY-MM.'); continue; }
    const rawIsrc = values[index('isrc')]?.trim() ?? '';
    const isrc = rawIsrc.replace(/-/g, '').toUpperCase();
    if (!/^[A-Z0-9]{12}$/.test(isrc)) { fail('isrc', 'INVALID_ISRC', 'ISRC harus 12 karakter alfanumerik setelah normalisasi.'); continue; }
    const upc = optional(values, index('upc')) ?? '';
    if (upc && !/^\d{12,13}$/.test(upc)) { fail('upc', 'INVALID_UPC', 'UPC harus 12 atau 13 digit.'); continue; }
    const platform = values[index('platform')]?.trim() ?? '';
    if (!platform) { fail('platform', 'PLATFORM_REQUIRED', 'Platform tidak boleh kosong.'); continue; }
    const country = (values[index('country')]?.trim() ?? '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) { fail('country', 'INVALID_COUNTRY', 'Country wajib berupa kode dua huruf.'); continue; }
    const rawSalesUnit = values[index('sales_unit')]?.trim() ?? '';
    if (!/^\+?\d+$/.test(rawSalesUnit)) { fail('sales_unit', 'INVALID_SALES_UNIT', 'Sales unit wajib berupa bilangan bulat nonnegatif.'); continue; }
    const salesUnit = Number(rawSalesUnit);
    if (!Number.isSafeInteger(salesUnit) || salesUnit > 2_147_483_647) { fail('sales_unit', 'INVALID_SALES_UNIT', 'Sales unit di luar rentang yang didukung.'); continue; }
    const rawNetRevenue = values[index('net_revenue')]?.trim() ?? '';
    let netMinor: bigint;
    try { netMinor = decimalMoney(rawNetRevenue); }
    catch { fail('net_revenue', 'INVALID_NET_REVENUE', 'Net revenue wajib nonnegatif dengan maksimal dua angka desimal.'); continue; }
    const title = optional(values, index('title'));
    const artist = optional(values, index('artist'));
    const labelName = optional(values, index('label_name'));
    const salesType = optional(values, index('sales_type'));
    rows.push({
      sourceRowNumber: rowNumber, period, isrc, upc, platform, country, salesUnit, netMinor,
      ...(title ? { title } : {}), ...(artist ? { artist } : {}), ...(labelName ? { labelName } : {}),
      ...(salesType ? { salesType } : {}),
    });
  }
  const periods = [...new Set(rows.map(row => row.period))];
  if (periods.length > 1) issues.push({ row: 0, field: 'period', code: 'MULTIPLE_PERIODS', message: 'Satu file hanya boleh memuat satu periode royalti.' });
  return { rows, issues, headers };
}

