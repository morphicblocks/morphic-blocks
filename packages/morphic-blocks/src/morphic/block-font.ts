import * as Blockly from "blockly";

/**
 * Blockly sizes a block by measuring its text with the font its renderer
 * constants name, not with the font the page's CSS draws. When a mode's CSS
 * sets another font for block text (a monospace font for a syntax mode, say),
 * the drawn text is wider than the measured one and neighbouring parts
 * overlap. These helpers read the font the CSS really applies and hand it to
 * Blockly through a theme, so measuring and drawing agree.
 */

export interface MorphicBlockFont {
  family: string;
  /** In points, as Blockly's theme expects. */
  size: number;
  weight: string;
}

const PX_PER_PT = 4 / 3;
const NAMED_WEIGHTS: Record<string, string> = { normal: "400", bold: "700" };

const normalizeWeight = (weight: string): string => NAMED_WEIGHTS[weight] ?? weight;

/** A CSS font size in points. Browsers report pixels; points pass through. */
function toPoints(size: string): number | undefined {
  const value = parseFloat(size);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const points = size.trim().endsWith("pt") ? value : value / PX_PER_PT;
  return Math.round(points * 100) / 100;
}

/** The font a workspace's renderer measures with right now. */
export function measuredFont(workspace: Blockly.WorkspaceSvg): MorphicBlockFont {
  const constants = workspace.getRenderer().getConstants();
  return {
    family: constants.FIELD_TEXT_FONTFAMILY,
    size: constants.FIELD_TEXT_FONTSIZE,
    weight: normalizeWeight(constants.FIELD_TEXT_FONTWEIGHT),
  };
}

/**
 * Read the font the page's CSS gives block text placed inside `parent`,
 * wrapped in elements carrying `wrapperClasses` (outermost first). A hidden
 * probe is added and removed again. Values the CSS leaves open come from
 * `fallback`.
 */
export function readCssFont(
  parent: HTMLElement,
  wrapperClasses: string[][],
  fallback: MorphicBlockFont,
): MorphicBlockFont {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;";
  let inner: HTMLElement = probe;
  for (const classes of wrapperClasses) {
    const wrapper = document.createElement("div");
    wrapper.className = classes.join(" ");
    inner.appendChild(wrapper);
    inner = wrapper;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("class", "blocklyText");
  svg.appendChild(text);
  inner.appendChild(svg);
  parent.appendChild(probe);

  const style = getComputedStyle(text);
  const font: MorphicBlockFont = {
    family: style.fontFamily || fallback.family,
    size: toPoints(style.fontSize) ?? fallback.size,
    weight: style.fontWeight ? normalizeWeight(style.fontWeight) : fallback.weight,
  };
  probe.remove();
  return font;
}

export const sameFont = (a: MorphicBlockFont, b: MorphicBlockFont): boolean =>
  a.family === b.family && a.size === b.size && a.weight === b.weight;

// One theme per base theme and font, shared by every engine, so switching back
// and forth between modes reuses themes instead of defining new ones.
const fontThemes = new Map<string, Blockly.Theme>();

/** `base` with its block text font replaced by `font`. */
export function themeWithFont(base: Blockly.Theme, font: MorphicBlockFont): Blockly.Theme {
  const key = `${base.name}\n${font.family}\n${font.size}\n${font.weight}`;
  let theme = fontThemes.get(key);
  if (!theme) {
    const name = `${base.name}-morphic-font-${fontThemes.size + 1}`;
    theme = Blockly.Theme.defineTheme(name, {
      name,
      base,
      fontStyle: { family: font.family, size: font.size, weight: font.weight },
      ...(base.startHats !== undefined && { startHats: base.startHats }),
    });
    fontThemes.set(key, theme);
  }
  return theme;
}

/**
 * Give `workspace` the theme for `font`, or `base` itself when the font is the
 * one `base` measures with anyway. Returns whether the theme changed.
 */
export function applyFont(
  workspace: Blockly.WorkspaceSvg,
  base: Blockly.Theme,
  baseFont: MorphicBlockFont,
  font: MorphicBlockFont,
): boolean {
  const theme = sameFont(font, baseFont) ? base : themeWithFont(base, font);
  if (workspace.getTheme() === theme) return false;
  workspace.setTheme(theme);
  return true;
}

/** Measure every block's text again, e.g. after a font changed or loaded. */
export function remeasureBlocks(workspace: Blockly.WorkspaceSvg): void {
  for (const block of workspace.getAllBlocks(false)) {
    block.markDirty();
    // markDirty() also drops each field's cached renderer constants. A field
    // fetches them again lazily, but not once its block is being disposed,
    // and a mode switch disposes blocks right after this. Fetch them now.
    for (const input of block.inputList) {
      for (const field of input.fieldRow) field.getConstants();
    }
  }
  workspace.render();
}
