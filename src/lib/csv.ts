export function parseCsvDocument(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;

  const pushRow = () => {
    row.push(field.trim());
    if (row.some(value => value.length > 0)) rows.push(row);
    row = [];
    field = '';
    closedQuote = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += character;
      }
    } else if (closedQuote && character !== ',' && character !== '\n' && character !== '\r') {
      throw new Error('Karakter setelah tanda kutip penutup CSV tidak valid.');
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new Error('Tanda kutip CSV hanya boleh berada di awal field.');
    } else if (character === ',') {
      row.push(field.trim());
      field = '';
      closedQuote = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      pushRow();
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Tanda kutip CSV tidak ditutup.');
  pushRow();
  return rows;
}
