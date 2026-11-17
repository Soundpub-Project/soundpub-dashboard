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

export interface LegacyRoyaltyCsvStreamChunk {
  rows: LegacyRoyaltyCsvRow[];
  issues: LegacyRoyaltyCsvIssue[];
  processedRows: number;
}

export interface LegacyRoyaltyCsvStreamResult {
  headers: string[];
  dataRows: number;
  parsedRows: number;
  invalidRows: number;
  periods: string[];
  issues: LegacyRoyaltyCsvIssue[];
  issuesTruncated: boolean;
}

export interface LegacyRoyaltyCsvStreamOptions {
  chunkSize?: number;
  maxRows?: number;
  issueLimit?: number;
  onChunk?: (chunk: LegacyRoyaltyCsvStreamChunk) => Promise<void> | void;
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

function headersResult(values: string[]) {
  const headers = values.map(header => header.toLowerCase().trim());
  const duplicateHeaders = [...new Set(headers.filter((header, index) => header && headers.indexOf(header) !== index))];
  if (duplicateHeaders.length) return { headers, issue: { row: 1, field: 'header', code: 'DUPLICATE_HEADER',
    message: `Header duplikat: ${duplicateHeaders.join(', ')}` } satisfies LegacyRoyaltyCsvIssue };
  const missing = LEGACY_ROYALTY_REQUIRED_COLUMNS.filter(column => !headers.includes(column));
  if (missing.length) return { headers, issue: { row: 1, field: 'header', code: 'MISSING_COLUMNS',
    message: `Kolom wajib tidak ditemukan: ${missing.join(', ')}` } satisfies LegacyRoyaltyCsvIssue };
  return { headers };
}

function parseValues(headers: string[], values: string[], rowNumber: number):
  { row?: LegacyRoyaltyCsvRow; issue?: LegacyRoyaltyCsvIssue } {
  const index = (name: string) => headers.indexOf(name);
  const fail = (field: string, code: string, message: string) => ({ issue: { row: rowNumber, field, code, message } });
  const period = values[index('period')]?.trim() ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return fail('period', 'INVALID_PERIOD', 'Period wajib berformat YYYY-MM.');
  const rawIsrc = values[index('isrc')]?.trim() ?? '';
  const isrc = rawIsrc.replace(/-/g, '').toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) return fail('isrc', 'INVALID_ISRC', 'ISRC harus 12 karakter alfanumerik setelah normalisasi.');
  const upc = optional(values, index('upc')) ?? '';
  if (upc && !/^\d{12,13}$/.test(upc)) return fail('upc', 'INVALID_UPC', 'UPC harus 12 atau 13 digit.');
  const platform = values[index('platform')]?.trim() ?? '';
  if (!platform) return fail('platform', 'PLATFORM_REQUIRED', 'Platform tidak boleh kosong.');
  const country = (values[index('country')]?.trim() ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return fail('country', 'INVALID_COUNTRY', 'Country wajib berupa kode dua huruf.');
  const rawSalesUnit = values[index('sales_unit')]?.trim() ?? '';
  if (!/^\+?\d+$/.test(rawSalesUnit)) return fail('sales_unit', 'INVALID_SALES_UNIT', 'Sales unit wajib berupa bilangan bulat nonnegatif.');
  const salesUnit = Number(rawSalesUnit);
  if (!Number.isSafeInteger(salesUnit) || salesUnit > 2_147_483_647) return fail('sales_unit', 'INVALID_SALES_UNIT', 'Sales unit di luar rentang yang didukung.');
  const rawNetRevenue = values[index('net_revenue')]?.trim() ?? '';
  let netMinor: bigint;
  try { netMinor = decimalMoney(rawNetRevenue); }
  catch { return fail('net_revenue', 'INVALID_NET_REVENUE', 'Net revenue wajib nonnegatif dengan maksimal dua angka desimal.'); }
  const title = optional(values, index('title'));
  const artist = optional(values, index('artist'));
  const labelName = optional(values, index('label_name'));
  for (const [field, name] of [['title', title], ['artist', artist], ['label_name', labelName]] as const) {
    if (name && name.length > 200) return fail(field, 'FIELD_TOO_LONG', `${field} maksimal 200 karakter.`);
  }
  const salesType = optional(values, index('sales_type'));
  if (salesType && salesType.length > 100) return fail('sales_type', 'INVALID_SALES_TYPE', 'Sales type maksimal 100 karakter.');
  return { row: { sourceRowNumber: rowNumber, period, isrc, upc, platform, country, salesUnit, netMinor,
    ...(title ? { title } : {}), ...(artist ? { artist } : {}), ...(labelName ? { labelName } : {}),
    ...(salesType ? { salesType } : {}) } };
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
  const header = headersResult(document[0]!);
  const headers = header.headers;
  if (header.issue) return { rows: [], headers, issues: [header.issue] };
  if (document.length - 1 > 1000) {
    return { rows: [], headers, issues: [{ row: 0, field: 'file', code: 'ROW_LIMIT_EXCEEDED', message: 'Satu impor maksimal memuat 1.000 baris data.' }] };
  }
  const rows: LegacyRoyaltyCsvRow[] = [];
  for (let offset = 1; offset < document.length; offset += 1) {
    const values = document[offset]!;
    const rowNumber = offset + 1;
    const parsed = parseValues(headers, values, rowNumber);
    if (parsed.issue) issues.push(parsed.issue);
    else if (parsed.row) rows.push(parsed.row);
  }
  const periods = [...new Set(rows.map(row => row.period))];
  if (periods.length > 1) issues.push({ row: 0, field: 'period', code: 'MULTIPLE_PERIODS', message: 'Satu file hanya boleh memuat satu periode royalti.' });
  return { rows, issues, headers };
}

export async function parseLegacyRoyaltyCsvStream(input: AsyncIterable<Uint8Array | string>,
  options: LegacyRoyaltyCsvStreamOptions = {}): Promise<LegacyRoyaltyCsvStreamResult> {
  const chunkSize = options.chunkSize ?? 1000;
  const maxRows = options.maxRows ?? 100_000;
  const issueLimit = options.issueLimit ?? 500;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || !Number.isInteger(maxRows) || maxRows < 1 ||
      !Number.isInteger(issueLimit) || issueLimit < 1) throw new RangeError('Invalid streaming CSV options');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let headers: string[] = [];
  let headerIssue: LegacyRoyaltyCsvIssue | undefined;
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let quotePending = false;
  let skipLf = false;
  let firstCharacter = true;
  let dataRows = 0;
  let parsedRows = 0;
  let invalidRows = 0;
  let issuesTruncated = false;
  const periods = new Set<string>();
  const issues: LegacyRoyaltyCsvIssue[] = [];
  let chunkRows: LegacyRoyaltyCsvRow[] = [];
  let chunkIssues: LegacyRoyaltyCsvIssue[] = [];
  let chunkProcessed = 0;
  const retainIssue = (issue: LegacyRoyaltyCsvIssue) => {
    if (issues.length < issueLimit) issues.push(issue);
    else issuesTruncated = true;
  };
  const flush = async () => {
    if (!chunkProcessed) return;
    await options.onChunk?.({ rows: chunkRows, issues: chunkIssues, processedRows: chunkProcessed });
    chunkRows = [];
    chunkIssues = [];
    chunkProcessed = 0;
  };
  const emitRecord = async () => {
    const values = [...row, field.trim()];
    row = [];
    field = '';
    if (!values.some(value => value.length > 0)) return;
    if (!headers.length && !headerIssue) {
      const header = headersResult(values);
      headers = header.headers;
      headerIssue = header.issue;
      if (headerIssue) retainIssue(headerIssue);
      return;
    }
    dataRows += 1;
    if (dataRows > maxRows) throw new Error('ROYALTY_ROW_LIMIT_EXCEEDED');
    chunkProcessed += 1;
    if (!headerIssue) {
      const parsed = parseValues(headers, values, dataRows + 1);
      if (parsed.row) {
        parsedRows += 1;
        periods.add(parsed.row.period);
        chunkRows.push(parsed.row);
      } else if (parsed.issue) {
        invalidRows += 1;
        chunkIssues.push(parsed.issue);
        retainIssue(parsed.issue);
      }
    } else invalidRows += 1;
    if (chunkProcessed >= chunkSize) await flush();
  };
  const consume = async (text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]!;
      if (firstCharacter) { firstCharacter = false; if (character === '\uFEFF') continue; }
      if (skipLf) { skipLf = false; if (character === '\n') continue; }
      if (quoted) {
        if (quotePending) {
          quotePending = false;
          if (character === '"') { field += '"'; continue; }
          quoted = false;
        } else if (character === '"') { quotePending = true; continue; }
        else { field += character; continue; }
      }
      if (character === '"' && field.length === 0) quoted = true;
      else if (character === ',') { row.push(field.trim()); field = ''; }
      else if (character === '\n' || character === '\r') {
        if (character === '\r') skipLf = true;
        await emitRecord();
      } else field += character;
    }
  };
  try {
    for await (const value of input) await consume(typeof value === 'string' ? value : decoder.decode(value, { stream: true }));
    await consume(decoder.decode());
  } catch (error) {
    if (error instanceof TypeError) throw new Error('ROYALTY_FILE_ENCODING_INVALID');
    throw error;
  }
  if (quotePending) { quotePending = false; quoted = false; }
  if (quoted) retainIssue({ row: 0, field: 'file', code: 'CSV_UNCLOSED_QUOTE', message: 'Tanda kutip CSV tidak ditutup.' });
  else if (row.length || field.length) await emitRecord();
  await flush();
  if (!headers.length && !headerIssue) retainIssue({ row: 0, field: 'file', code: 'CSV_EMPTY', message: 'File CSV kosong atau tidak memiliki data.' });
  else if (!dataRows) retainIssue({ row: 0, field: 'file', code: 'CSV_EMPTY', message: 'File CSV kosong atau tidak memiliki data.' });
  if (periods.size > 1) retainIssue({ row: 0, field: 'period', code: 'MULTIPLE_PERIODS', message: 'Satu file hanya boleh memuat satu periode royalti.' });
  return { headers, dataRows, parsedRows, invalidRows, periods: [...periods], issues, issuesTruncated };
}

