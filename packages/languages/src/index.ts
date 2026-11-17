import type { Language } from "@morphicblocks/blocks";
import { cpp } from "./cpp.js";
import { go } from "./go.js";
import { java } from "./java.js";
import { javascript } from "./javascript.js";
import { python } from "./python.js";
import { rust } from "./rust.js";

/**
 * Languages for the standard blocks of `@morphicblocks/blocks`: each says how
 * it writes every block, with the settings of its code element (quotes, type
 * names, empty slots, highlighting). Pass the ones you use to `define()`:
 * `define({ blocks: standard, languages: { python, java } }, own)`.
 */
export { cpp, go, java, javascript, python, rust };

/** Every language by name, e.g. for a language picker. */
export const languages: Record<string, Language> = { python, javascript, java, go, rust, cpp };
