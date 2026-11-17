import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface InvoicePdfInput {
  invoiceNumber: string;
  amountMinor: string;
  paidAt: Date | string;
  reference: string;
  releaseTitle: string;
  artistName: string;
  trackCount: number;
  pricePerTrackMinor: string;
  payerName: string;
  payerEmail: string;
}

function safeText(value: string | null | undefined): string {
  return (value || '-').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, '?').slice(0, 100);
}

function formatIdr(minor: string): string {
  const value = BigInt(minor);
  const whole = value / 100n;
  const fraction = value % 100n;
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number(whole))}${fraction ? `,${fraction.toString().padStart(2, '0')}` : ''}`;
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' })
    .format(new Date(value));
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.05, 0.08, 0.14);
  const orange = rgb(0.96, 0.39, 0.05);
  const white = rgb(1, 1, 1);
  const row = (label: string, value: string, y: number) => {
    page.drawText(label, { x: 54, y, size: 10, font: bold, color: navy });
    page.drawText(safeText(value), { x: 210, y, size: 10, font: regular, color: navy, maxWidth: 320 });
  };

  page.drawRectangle({ x: 0, y: 758, width: 595, height: 84, color: navy });
  page.drawText('soundpub', { x: 54, y: 793, size: 25, font: bold, color: white });
  page.drawText('BUKTI PEMBAYARAN RELEASE', { x: 54, y: 775, size: 9, font: regular, color: rgb(0.82, 0.86, 0.91) });
  page.drawRectangle({ x: 385, y: 779, width: 156, height: 26, color: orange });
  page.drawText('LUNAS / PAID', { x: 409, y: 788, size: 10, font: bold, color: white });
  page.drawText('Invoice Pembayaran', { x: 54, y: 710, size: 20, font: bold, color: navy });
  page.drawText(input.invoiceNumber, { x: 54, y: 688, size: 11, font: bold, color: orange });
  page.drawText(`Dibayar pada ${formatDate(input.paidAt)}`, { x: 54, y: 671, size: 9, font: regular, color: rgb(0.35, 0.39, 0.46) });
  page.drawRectangle({ x: 54, y: 565, width: 487, height: 82, borderColor: rgb(0.85, 0.87, 0.91), borderWidth: 1 });
  row('Pembayar', input.payerName, 625);
  row('Email', input.payerEmail, 604);
  row('Referensi', input.reference, 583);
  page.drawText('Detail Release', { x: 54, y: 526, size: 13, font: bold, color: navy });
  page.drawRectangle({ x: 54, y: 402, width: 487, height: 100, borderColor: rgb(0.85, 0.87, 0.91), borderWidth: 1 });
  row('Judul Release', input.releaseTitle, 478);
  row('Artist Utama', input.artistName, 457);
  row('Jumlah Track', `${input.trackCount} track`, 436);
  row('Harga per Track', formatIdr(input.pricePerTrackMinor), 415);
  page.drawRectangle({ x: 54, y: 322, width: 487, height: 55, color: rgb(0.96, 0.97, 0.99) });
  page.drawText('TOTAL DIBAYAR', { x: 72, y: 350, size: 10, font: bold, color: navy });
  page.drawText(formatIdr(input.amountMinor), { x: 370, y: 343, size: 16, font: bold, color: orange });
  page.drawText('Dokumen ini dibuat otomatis oleh Soundpub sebagai bukti pembayaran.',
    { x: 54, y: 90, size: 8, font: regular, color: rgb(0.4, 0.43, 0.5) });
  return pdf.save();
}
