import type { Language } from "@morphicblocks/blocks";
import { javascript } from "./javascript.js";
import { python } from "./python.js";

/**
 * Languages for the standard blocks of `@morphicblocks/blocks`: each says how
 * it writes every block, with the settings of its code element (quotes, type
 * names, empty slots, highlighting). Pass the ones you use to `define()`:
 * `define({ blocks: standard, languages: { python, java } }, own)`.
 */
export { javascript, python };

/** Every language by name, e.g. for a language picker. */
export const languages: Record<string, Language> = { python, javascript };
