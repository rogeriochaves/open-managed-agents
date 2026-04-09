export type OutputFormat = "table" | "json";

let outputFormat: OutputFormat = "table";

export function setOutputFormat(format: OutputFormat): void {
  outputFormat = format;
}

export function getOutputFormat(): OutputFormat {
  return outputFormat;
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(
  headers: string[],
  rows: string[][]
): void {
  if (rows.length === 0) {
    console.log("No results.");
    return;
  }

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );

  const sep = widths.map((w) => "─".repeat(w + 2)).join("┼");
  const fmtRow = (cells: string[]) =>
    cells.map((c, i) => ` ${(c ?? "").padEnd(widths[i])} `).join("│");

  console.log(fmtRow(headers));
  console.log(sep);
  rows.forEach((r) => console.log(fmtRow(r)));
}

export function output(
  data: unknown,
  tableFn: (data: any) => { headers: string[]; rows: string[][] }
): void {
  if (outputFormat === "json") {
    printJson(data);
  } else {
    const { headers, rows } = tableFn(data);
    printTable(headers, rows);
  }
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
