/**
 * Lector CSV de los conjuntos de Open Data BCN.
 *
 * Soporta lo que aparece en los ficheros reales del portal: separador «;» (terrazas) o «,»
 * (fuentes) detectado en la cabecera, campos entre comillas con separadores, saltos de línea y
 * comillas dobladas (""), finales de línea CRLF o LF, y marca BOM. Algunos conjuntos antiguos
 * vienen en UTF-16 con BOM: `decodeBytes` los decodifica.
 */

export type CsvRow = Record<string, string>;
export type CsvDelimiter = ";" | ",";

/** Texto de un fichero respetando su BOM (UTF-8, UTF-16 LE o BE). */
export function decodeBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/** «;» o «,»: el que más aparece fuera de comillas en la cabecera. */
export function detectDelimiter(headerLine: string): CsvDelimiter {
  let semi = 0;
  let comma = 0;
  let quoted = false;
  for (const ch of headerLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === ";") semi++;
    else if (!quoted && ch === ",") comma++;
  }
  return semi > comma ? ";" : ",";
}

/** Filas como listas de celdas. Las líneas vacías se ignoran. */
export function parseCsv(text: string, delimiter?: CsvDelimiter): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstBreak = s.indexOf("\n");
  const d = delimiter ?? detectDelimiter(firstBreak < 0 ? s : s.slice(0, firstBreak));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = "";
    if (!(row.length === 1 && row[0].trim() === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === d) {
      row.push(field);
      field = "";
    } else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Filas como objetos indexados por la cabecera (celdas recortadas; las que faltan, vacías). */
export function csvToObjects(text: string, delimiter?: CsvDelimiter): CsvRow[] {
  const rows = parseCsv(text, delimiter);
  if (rows.length === 0) return [];
  const head = rows[0].map((h) => h.trim());
  const out: CsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const o: CsvRow = {};
    for (let c = 0; c < head.length; c++) o[head[c]] = (cells[c] ?? "").trim();
    out.push(o);
  }
  return out;
}

/** Número con punto o coma decimal; NaN si la celda está vacía o no es un número. */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return value;
  const t = value.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}
