export interface MorphicImageToken {
  kind: "image";
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface MorphicTextToken {
  kind: "text";
  value: string;
}

export interface MorphicPlaceholderToken {
  kind: "placeholder";
  index: number;
}

/** `%1:type`: the name of the type of the value in slot 1, from the element's `code.types`. */
export interface MorphicValueTypeToken {
  kind: "valueType";
  index: number;
}

export interface MorphicFieldToken {
  kind: "field";
  name: string;
}

/** `%parent.NAME`: the `NAME` field of the nearest block around this one that has it. */
export interface MorphicParentFieldToken {
  kind: "parentField";
  name: string;
}

export type MorphicTemplateToken =
  | MorphicImageToken
  | MorphicTextToken
  | MorphicPlaceholderToken
  | MorphicValueTypeToken
  | MorphicFieldToken
  | MorphicParentFieldToken;

const DEFAULT_IMAGE_SIZE = 18;

/** Written after a slot's number, `%1:type`, for the type of the slot's value. */
const VALUE_TYPE_SUFFIX = ":type";

/** Written before a field's name, `%parent.NAME`, for a field of a block around this one. */
const PARENT_FIELD_PREFIX = "%parent.";

function isParentFieldStart(template: string, index: number): boolean {
  return template.startsWith(PARENT_FIELD_PREFIX, index) && /[A-Z_]/.test(template[index + PARENT_FIELD_PREFIX.length] ?? "");
}

export function parseTemplate(template: string): MorphicTemplateToken[] {
  const tokens: MorphicTemplateToken[] = [];
  let index = 0;

  while (index < template.length) {
    const char = template[index];
    if (char === "<" && /^<img\b/i.test(template.slice(index))) {
      const tagCloseIndex = template.indexOf(">", index);
      if (tagCloseIndex === -1) {
        pushText(tokens, template.slice(index));
        break;
      }

      const tag = template.slice(index, tagCloseIndex + 1);
      const imageToken = parseImageTag(tag);
      if (imageToken) {
        tokens.push(imageToken);
      }
      index = tagCloseIndex + 1;
      continue;
    }

    if (char === "%" && /\d/.test(template[index + 1] ?? "")) {
      let digitIndex = index + 1;
      while (digitIndex < template.length && /\d/.test(template[digitIndex] ?? "")) {
        digitIndex += 1;
      }
      const placeholderIndex = Number.parseInt(template.slice(index + 1, digitIndex), 10);
      if (template.startsWith(VALUE_TYPE_SUFFIX, digitIndex)) {
        tokens.push({ kind: "valueType", index: placeholderIndex });
        index = digitIndex + VALUE_TYPE_SUFFIX.length;
        continue;
      }
      if (!Number.isNaN(placeholderIndex)) {
        tokens.push({ kind: "placeholder", index: placeholderIndex });
      }
      index = digitIndex;
      continue;
    }

    if (isParentFieldStart(template, index)) {
      let end = index + PARENT_FIELD_PREFIX.length;
      while (end < template.length && /[A-Z0-9_]/.test(template[end] ?? "")) {
        end += 1;
      }
      tokens.push({ kind: "parentField", name: template.slice(index + PARENT_FIELD_PREFIX.length, end) });
      index = end;
      continue;
    }

    if (char === "%" && /[A-Z_]/.test(template[index + 1] ?? "")) {
      let end = index + 1;
      while (end < template.length && /[A-Z0-9_]/.test(template[end] ?? "")) {
        end += 1;
      }
      const name = template.slice(index + 1, end);
      tokens.push({ kind: "field", name });
      index = end;
      continue;
    }

    let textEnd = index + 1;
    while (textEnd < template.length) {
      const nextChar = template[textEnd];
      const isPlaceholderStart = nextChar === "%" && /\d/.test(template[textEnd + 1] ?? "");
      const isFieldStart = nextChar === "%" && /[A-Z_]/.test(template[textEnd + 1] ?? "");
      const isImgTagStart = nextChar === "<" && /^<img\b/i.test(template.slice(textEnd));
      if (isImgTagStart || isPlaceholderStart || isFieldStart || isParentFieldStart(template, textEnd)) {
        break;
      }
      textEnd += 1;
    }
    pushText(tokens, template.slice(index, textEnd));
    index = textEnd;
  }

  return compactTextTokens(tokens);
}

/**
 * Whether the text on each side of a slot leaves the value in it alone. A
 * slot between brackets or commas stands free (`len(%1)`, `max(%1, %2)`), and
 * so does the slot of a statement after its keyword or sign (`return %1`,
 * `if %1:`, `x = %1`). An operator or a word in front of it (`not %1`, `-%1`)
 * or something that goes on from it (`%1.length`) binds to the value.
 */
export function slotSides(tokens: MorphicTemplateToken[], index: number, statement: boolean): { before: boolean; after: boolean } {
  const written: MorphicTemplateToken[] = tokens.filter((token) => token.kind !== "image");
  const at = written.indexOf(tokens[index]!);
  // The nearest character that is no space, on one side; "" at the template's edge, null at a field or slot.
  const nearest = (step: -1 | 1): string | null => {
    for (let look = at + step; look >= 0 && look < written.length; look += step) {
      const token = written[look]!;
      if (token.kind !== "text") return null;
      const text = step === -1 ? token.value.trimEnd() : token.value.trimStart();
      if (text) return step === -1 ? text.at(-1)! : text[0]!;
      if (token.value.includes("\n")) return "\n";
    }
    return "";
  };
  const word = /[\p{L}\p{N}_$]/u;
  const before = nearest(-1);
  const after = nearest(1);
  return {
    before: before === "" || (before !== null && ("([{,\n".includes(before) || (statement && ("=:;".includes(before) || word.test(before))))),
    after: after === "" || (after !== null && (")]},;:{\n".includes(after) || (statement && word.test(after)))),
  };
}

/** Whether the text around a slot binds to the value in it, so a value built from others needs brackets there. */
export function slotIsExposed(tokens: MorphicTemplateToken[], index: number, statement: boolean): boolean {
  const free = slotSides(tokens, index, statement);
  return !free.before || !free.after;
}

const QUOTE_MARKS = "\"'`";

/** The mark a field stands between where a template writes it as a text (`"%TEXT"`), else `null`. */
export function quoteAround(before: string | undefined, after: string | undefined): string | null {
  const mark = before?.at(-1);
  return mark && QUOTE_MARKS.includes(mark) && after?.[0] === mark ? mark : null;
}

/** A text as it is written between two marks: the mark and the backslash each get a backslash in front. */
export function escapeQuoted(text: string, mark: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll(mark, `\\${mark}`);
}

/**
 * Read a text written between two marks from `pos` on: where the closing
 * mark is, and the text without its backslashes. `null` when the line ends
 * before the mark comes.
 */
export function readQuoted(source: string, pos: number, mark: string): { value: string; end: number } | null {
  let value = "";
  for (let at = pos; at < source.length && source[at] !== "\n"; at++) {
    const char = source[at]!;
    if (char === mark) return { value, end: at };
    const next = source[at + 1];
    if (char === "\\" && (next === "\\" || next === mark)) {
      value += next;
      at++;
    } else value += char;
  }
  return null;
}

export function normalizeTemplateText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * A name as a CSS class part. The name is kept as written (`icon-tiles`,
 * `iconTiles`, `icon_tiles` all work), so the app's CSS uses the same name as
 * its definitions; only characters a class cannot hold become `-`.
 */
export function toModeClassToken(mode: string): string {
  return mode.trim().replace(/[^A-Za-z0-9_-]+/g, "-");
}

/**
 * Converts parsed template tokens into an HTML string for toolbox canvas rendering.
 * - Text tokens become escaped text nodes.
 * - Image tokens become <img> elements.
 * - Placeholder tokens become <span class="morphic-toolbox-slot" data-slot-index="N">.
 */
export function renderTemplateAsHtml(tokens: MorphicTemplateToken[]): string {
  return tokens.map((token) => {
    if (token.kind === "text") {
      return escapeHtml(token.value);
    }
    if (token.kind === "image") {
      return `<img src="${escapeAttr(token.src)}" alt="${escapeAttr(token.alt)}" width="${token.width}" height="${token.height}">`;
    }
    if (token.kind === "field") {
      return `<span class="morphic-field-placeholder" data-field-name="${escapeAttr(token.name)}"></span>`;
    }
    if (token.kind === "valueType") {
      return `<span class="morphic-value-type" data-slot-index="${token.index}"></span>`;
    }
    if (token.kind === "parentField") {
      // A tile stands alone: there is no block around it to read from.
      return "";
    }
    // placeholder
    return `<span class="morphic-toolbox-slot" data-slot-index="${token.index}"></span>`;
  }).join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const IMAGE_PATH_PATTERN = /\.(svg|png|jpe?g|gif|webp)(?:[#?].*)?$/i;

/**
 * Normalise the value of a `type: "image"` element so it always becomes an
 * `<img>` tag. Behaviour:
 *   - Already-formed `<img …>` HTML → returned unchanged.
 *   - Recognised image path (.svg, .png, .jpg, .jpeg, .gif, .webp) → wrapped
 *     as `<img src="value" width="W" height="H">` with the supplied size.
 *   - Anything else → returned unchanged (treated as plain text downstream).
 *
 * Use the size from `resolveImageSize(elementTypes[name])` so per-element
 * `size` overrides take effect.
 */
export function normalizeImageValue(
  value: string,
  size: { width: number; height: number },
): string {
  if (!value) return value;
  const trimmed = value.trim();
  if (/^<img\b/i.test(trimmed)) return value;
  if (IMAGE_PATH_PATTERN.test(trimmed)) {
    return `<img src="${escapeAttr(trimmed)}" width="${size.width}" height="${size.height}">`;
  }
  return value;
}

function parseImageTag(tag: string): MorphicImageToken | null {
  if (!/^<img\b/i.test(tag)) {
    return null;
  }

  const src = extractAttribute(tag, "src");
  if (!src) {
    return null;
  }

  const alt = extractAttribute(tag, "alt") ?? "";
  const width = Number.parseInt(extractAttribute(tag, "width") ?? `${DEFAULT_IMAGE_SIZE}`, 10);
  const height = Number.parseInt(extractAttribute(tag, "height") ?? `${DEFAULT_IMAGE_SIZE}`, 10);

  return {
    kind: "image",
    src,
    alt,
    width: Number.isNaN(width) ? DEFAULT_IMAGE_SIZE : width,
    height: Number.isNaN(height) ? DEFAULT_IMAGE_SIZE : height
  };
}

function extractAttribute(tag: string, attributeName: string): string | null {
  const quoted = new RegExp(`${attributeName}\\s*=\\s*(['"])(.*?)\\1`, "i").exec(tag);
  if (quoted?.[2]) {
    return quoted[2];
  }

  const unquoted = new RegExp(`${attributeName}\\s*=\\s*([^\\s>]+)`, "i").exec(tag);
  return unquoted?.[1] ?? null;
}

function pushText(tokens: MorphicTemplateToken[], value: string): void {
  if (!value) {
    return;
  }
  tokens.push({ kind: "text", value });
}

function compactTextTokens(tokens: MorphicTemplateToken[]): MorphicTemplateToken[] {
  const compacted: MorphicTemplateToken[] = [];
  for (const token of tokens) {
    const last = compacted[compacted.length - 1];
    if (token.kind === "text" && last?.kind === "text") {
      last.value += token.value;
      continue;
    }
    compacted.push(token);
  }
  return compacted;
}

