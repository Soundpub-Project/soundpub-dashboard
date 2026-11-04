import { formatMoney } from '../finance/money.js';
import { parseLegacyRoyaltyCsv } from './legacy-csv.js';
import { splitLegacyRoyalty } from './split.js';

export function previewLegacyRoyaltyCsv(text: string) {
  const parsed = parseLegacyRoyaltyCsv(text);
  let net = 0n;
  let artist = 0n;
  let label = 0n;
  let soundpub = 0n;
  for (const row of parsed.rows) {
    const split = splitLegacyRoyalty(row.netMinor);
    net += split.netMinor;
    artist += split.artistMinor;
    label += split.labelMinor;
    soundpub += split.soundpubMinor;
  }
  const invalidRows = new Set(parsed.issues.filter(issue => issue.row > 1).map(issue => issue.row)).size;
  const periods = [...new Set(parsed.rows.map(row => row.period))];
  return {
    valid_rows: parsed.rows.length,
    invalid_rows: invalidRows,
    file_errors: parsed.issues.filter(issue => issue.row <= 1).length,
    period: periods.length === 1 ? periods[0]! : null,
    currency: 'IDR' as const,
    total_net_amount: formatMoney(net),
    artist_amount: formatMoney(artist),
    label_amount: formatMoney(label),
    soundpub_amount: formatMoney(soundpub),
    issues: parsed.issues,
    sample_rows: parsed.rows.slice(0, 20).map(row => ({
      source_row_number: row.sourceRowNumber,
      period: row.period,
      isrc: row.isrc,
      upc: row.upc,
      platform: row.platform,
      country: row.country,
      sales_unit: row.salesUnit,
      net_revenue: formatMoney(row.netMinor),
    })),
  };
}
