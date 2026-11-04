import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLegacyRoyaltyCsvStream } from '../src/royalties/legacy-csv.js';

const header = 'period,isrc,upc,title,artist,label_name,platform,country,sales_type,sales_unit,net_revenue';

async function *bytes(value: string, sizes: number[]) {
  const encoded = new TextEncoder().encode(value);
  let offset = 0;
  let index = 0;
  while (offset < encoded.length) {
    const size = sizes[index++ % sizes.length]!;
    yield encoded.slice(offset, offset + size);
    offset += size;
  }
}

test('streaming CSV preserves quoted newlines, escaped quotes, CRLF and UTF-8 chunk boundaries', async () => {
  const csv = '\uFEFF' + header + '\r\n2026-10,FRX762598330,1234567890123,"Lagu, ""Satu""\nLive",Artis É,L,Spotify,id,stream,1,100.05\r\n';
  const chunks: unknown[] = [];
  const result = await parseLegacyRoyaltyCsvStream(bytes(csv, [1, 2, 3, 5]), { chunkSize: 1,
    onChunk: chunk => { chunks.push(chunk); } });
  assert.equal(result.dataRows, 1);
  assert.equal(result.parsedRows, 1);
  assert.equal(result.invalidRows, 0);
  const row = (chunks[0] as { rows: { title?: string; artist?: string }[] }).rows[0];
  assert.equal(row?.title, 'Lagu, "Satu"\nLive');
  assert.equal(row?.artist, 'Artis É');
});

test('streaming CSV caps retained issues while preserving exact invalid count', async () => {
  const rows = Array.from({ length: 7 }, (_, index) => `bad-${index},SHORT,,,A,L,Spotify,ID,stream,1,1`).join('\n');
  const result = await parseLegacyRoyaltyCsvStream(bytes(`${header}\n${rows}`, [7]), { chunkSize: 2, issueLimit: 3 });
  assert.equal(result.dataRows, 7);
  assert.equal(result.invalidRows, 7);
  assert.equal(result.issues.length, 3);
  assert.equal(result.issuesTruncated, true);
});

test('streaming CSV accepts 100k rows without retaining them', { timeout: 30_000 }, async () => {
  const line = '2026-10,FRX762598330,,,A,L,Spotify,ID,stream,1,1.00\n';
  async function *input(count: number) {
    yield `${header}\n`;
    for (let index = 0; index < count; index += 1) yield line;
  }
  let received = 0;
  const result = await parseLegacyRoyaltyCsvStream(input(100_000), { chunkSize: 2000,
    onChunk: chunk => { received += chunk.rows.length; } });
  assert.equal(result.dataRows, 100_000);
  assert.equal(result.parsedRows, 100_000);
  assert.equal(received, 100_000);
  await assert.rejects(parseLegacyRoyaltyCsvStream(input(100_001)), /ROYALTY_ROW_LIMIT_EXCEEDED/);
});
