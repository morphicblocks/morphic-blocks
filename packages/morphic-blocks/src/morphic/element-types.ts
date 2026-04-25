import type {
  MorphicElementType,
  MorphicElementTypeConfig,
  MorphicElementTypeEntry,
} from "./types";

/** Get the rendering type of an entry, normalising bare strings vs config. */
export function resolveElementType(
  entry: MorphicElementTypeEntry | undefined,
): MorphicElementType | undefined {
  if (entry === undefined) return undefined;
  return typeof entry === "string" ? entry : entry.type;
}

/**
 * Look up the empty-slot default for a value input. `check` is the input slot's
 * `check` field (e.g. "Number"); falls back to `empty.default` if `check` is
 * unset or has no matching entry. Returns undefined if no default applies.
 */
export function resolveEmptyDefault(
  entry: MorphicElementTypeEntry | undefined,
  check: string | string[] | undefined,
): string | undefined {
  if (!entry || typeof entry === "string") return undefined;
  const empty = (entry as MorphicElementTypeConfig).empty;
  if (!empty) return undefined;
  if (typeof check === "string" && empty[check] !== undefined) {
    return empty[check];
  }
  return empty["default"];
}
