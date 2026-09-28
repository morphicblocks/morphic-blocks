import type { MorphicValueFormat } from "./types";

/**
 * A printed value the way the shown language writes it. Programs run as
 * JavaScript, so without a format a value reads like JavaScript (`true`,
 * `null`, `1,2,3`); a code element's `values` format rewrites the primitive
 * values and lists (`True`, `None`, `[1, 2, 3]`).
 */
export function formatValue(value: unknown, format: MorphicValueFormat | undefined, nested = false): string {
  if (!format) return String(value);
  if (typeof value === "string") {
    const quote = nested ? format.list?.quote : undefined;
    return quote ? `${quote}${value}${quote}` : value;
  }
  if (typeof value === "boolean") return (value ? format.true : format.false) ?? String(value);
  if (value === null) return format.null ?? "null";
  if (value === undefined) return format.undefined ?? "undefined";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return format.NaN ?? "NaN";
    if (value === Infinity) return format.Infinity ?? "Infinity";
    if (value === -Infinity) return format["-Infinity"] ?? "-Infinity";
    return String(value);
  }
  if (Array.isArray(value) && format.list) {
    const { open = "[", close = "]", separator = ", " } = format.list;
    return `${open}${value.map((item) => formatValue(item, format, true)).join(separator)}${close}`;
  }
  return String(value);
}
