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

export type MorphicTemplateToken = MorphicImageToken | MorphicTextToken | MorphicPlaceholderToken;

const DEFAULT_IMAGE_SIZE = 18;

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
      if (!Number.isNaN(placeholderIndex)) {
        tokens.push({ kind: "placeholder", index: placeholderIndex });
      }
      index = digitIndex;
      continue;
    }

    let textEnd = index + 1;
    while (textEnd < template.length) {
      const nextChar = template[textEnd];
      const isPlaceholderStart = nextChar === "%" && /\d/.test(template[textEnd + 1] ?? "");
      const isImgTagStart = nextChar === "<" && /^<img\b/i.test(template.slice(textEnd));
      if (isImgTagStart || isPlaceholderStart) {
        break;
      }
      textEnd += 1;
    }
    pushText(tokens, template.slice(index, textEnd));
    index = textEnd;
  }

  return compactTextTokens(tokens);
}

export function normalizeTemplateText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function toModeClassToken(mode: string): string {
  return mode.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
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

