import { resolveImageSize } from "./element-types";
import { normalizeImageValue } from "./template";
import type { MorphicBlockDefinition, MorphicElementTypeEntry } from "./types";

/** Where the app loads an image the definitions name; `undefined` keeps the path. */
export type MorphicAssetUrl = (path: string) => string | undefined;

/** An `<img>` tag's src, in quotes or without, as the template parser reads it. */
const IMG_SRC = /(<img\b[^>]*?\bsrc\s*=\s*)(?:(["'])(.*?)\2|([^\s>"']+))/gi;

/** The path a src stands for: the quotes and ampersands the framework escapes, unescaped. */
const unescapePath = (src: string) => src.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** An address that cannot end its tag early: quotes and angle brackets percent-encoded. */
const safeUrl = (url: string) => url.replace(/["'<>]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * A block with every image path it names passed through `assetUrl`: the
 * `<img>` in its templates, its image elements, and its dropdown pictures.
 * Returns the block itself when nothing changes.
 */
export function withAssetUrls(
  block: MorphicBlockDefinition,
  elementTypes: Record<string, MorphicElementTypeEntry>,
  assetUrl: MorphicAssetUrl,
): MorphicBlockDefinition {
  let changed = false;
  /** The address for a path, or `undefined` to keep the src as written. */
  const resolve = (path: string) => {
    const url = assetUrl(path);
    if (url === undefined || url === path) return undefined;
    changed = true;
    return url;
  };

  const elements = Object.fromEntries(
    Object.entries(block.elements).map(([name, template]) => {
      const entry = elementTypes[name];
      const isImage = (typeof entry === "string" ? entry : entry?.type) === "image";
      // An image element's bare path becomes its <img> first, sized as the element says.
      const html = isImage ? normalizeImageValue(template, resolveImageSize(entry)) : template;
      if (html !== template) changed = true;
      return [
        name,
        html.replace(IMG_SRC, (match, start: string, _quote: string | undefined, quoted: string | undefined, bare: string | undefined) => {
          const url = resolve(unescapePath(quoted ?? bare ?? ""));
          return url === undefined ? match : `${start}"${safeUrl(url)}"`;
        }),
      ];
    }),
  );

  const fields = block.fields
    ? Object.fromEntries(
        Object.entries(block.fields).map(([name, field]) => {
          if (field.type !== "dropdown") return [name, field];
          const options = field.options.map((option) =>
            typeof option === "object" && !Array.isArray(option) && typeof option.label === "object" && option.label.src !== undefined
              ? { ...option, label: { ...option.label, src: resolve(option.label.src) ?? option.label.src } }
              : option,
          );
          return [name, { ...field, options }];
        }),
      )
    : undefined;

  return changed ? { ...block, elements, ...(fields ? { fields } : {}) } : block;
}
