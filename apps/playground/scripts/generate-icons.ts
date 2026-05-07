/**
 * One-time generator: renders Material Design React icons used by the
 * playground into static SVG files under public/icons/. Run via
 *   bun run apps/playground/scripts/generate-icons.ts
 * Re-run only when adding/removing icons or changing color/size.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MdCalculate,
  MdCallSplit,
  MdCompare,
  MdDataObject,
  MdEditNote,
  MdLoop,
  MdPin,
  MdPrint,
  MdTextFields,
  MdToggleOn,
} from "react-icons/md";

const icons = {
  text_print: MdPrint,
  logic_if: MdCallSplit,
  loop_for: MdLoop,
  math_arithmetic: MdCalculate,
  logic_compare: MdCompare,
  m_math_number: MdPin,
  text_value: MdTextFields,
  m_logic_boolean: MdToggleOn,
  var_declare: MdEditNote,
  var_get: MdDataObject,
};

const outDir = path.resolve(import.meta.dir, "../public/icons");
await mkdir(outDir, { recursive: true });

for (const [name, Icon] of Object.entries(icons)) {
  const svg = renderToStaticMarkup(
    createElement(Icon, { size: 16, color: "white" }),
  );
  await writeFile(path.join(outDir, `${name}.svg`), svg);
  console.log("✓", `${name}.svg`);
}
