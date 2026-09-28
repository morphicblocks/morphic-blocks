import type {
  MorphicCodeElementConfig,
  MorphicElementType,
  MorphicElementTypeConfig,
  MorphicElementTypeEntry,
  MorphicEmptyDefaultConfig,
  MorphicInputSlotDefinition,
} from "./types";

/** Get the rendering type of an entry, normalising bare strings vs config. */
export function resolveElementType(
  entry: MorphicElementTypeEntry | undefined,
): MorphicElementType | undefined {
  if (entry === undefined) return undefined;
  return typeof entry === "string" ? entry : entry.type;
}

/**
 * An element type entry with its code element's settings from the `code`
 * section folded in. Internal: the renderers read the settings from the entry
 * they already hold for the element.
 */
export type MorphicElementTypeWithCode = MorphicElementTypeConfig &
  Pick<MorphicCodeElementConfig, "empty" | "stringQuote">;

/** `elementTypes` with each code element's `code` settings folded in. */
export function withCodeSettings(
  elementTypes: Record<string, MorphicElementTypeEntry>,
  code: Record<string, MorphicCodeElementConfig> | undefined,
): Record<string, MorphicElementTypeEntry> {
  const merged = { ...elementTypes };
  for (const [name, settings] of Object.entries(code ?? {})) {
    const entry = elementTypes[name];
    if (resolveElementType(entry) !== "code") continue;
    const { empty, stringQuote } = settings;
    if (empty === undefined && stringQuote === undefined) continue;
    const base = typeof entry === "string" ? { type: entry } : entry!;
    const withCode: MorphicElementTypeWithCode = { ...base, empty, stringQuote };
    merged[name] = withCode;
  }
  return merged;
}

const DEFAULT_IMAGE_SIZE = 16;

/**
 * Resolve the display size for a `type: "image"` element. Reads the optional
 * `size` field on `MorphicElementTypeConfig`; falls back to 16×16. Accepts a
 * number (square), a numeric string ("32"), or an explicit "WxH" string.
 */
export function resolveImageSize(
  entry: MorphicElementTypeEntry | undefined,
): { width: number; height: number } {
  if (!entry || typeof entry === "string") {
    return { width: DEFAULT_IMAGE_SIZE, height: DEFAULT_IMAGE_SIZE };
  }
  const raw = (entry as MorphicElementTypeConfig).size;
  if (raw === undefined) {
    return { width: DEFAULT_IMAGE_SIZE, height: DEFAULT_IMAGE_SIZE };
  }
  if (typeof raw === "number") {
    return { width: raw, height: raw };
  }
  const match = /^(\d+)(?:x(\d+))?$/i.exec(raw.trim());
  if (!match) {
    return { width: DEFAULT_IMAGE_SIZE, height: DEFAULT_IMAGE_SIZE };
  }
  const width = Number.parseInt(match[1]!, 10);
  const height = match[2] ? Number.parseInt(match[2], 10) : width;
  return { width, height };
}

/**
 * Resolve the empty-state default config for a value slot. Honours the
 * priority chain: per-slot `default` (highest) → the code element's
 * `empty[check]` → its `empty.default` (catch-all, also used when the slot has no
 * `check`). Returns undefined when nothing is configured — callers should treat
 * that as "show the codespace marker / empty workspace socket."
 */
export function resolveDefaultConfig(
  slot: MorphicInputSlotDefinition | undefined,
  elementEntry: MorphicElementTypeEntry | undefined,
): MorphicEmptyDefaultConfig | undefined {
  if (slot?.default) return slot.default;
  if (!elementEntry || typeof elementEntry === "string") return undefined;
  const empty = (elementEntry as MorphicElementTypeWithCode).empty;
  if (!empty) return undefined;
  const checkStr = slot?.check
    ? Array.isArray(slot.check)
      ? slot.check[0]
      : slot.check
    : undefined;
  return (checkStr ? empty[checkStr] : undefined) ?? empty.default;
}
