import { toModeClassToken } from "./template";
import type {
  MorphicModeDefinition,
  MorphicModeStyle,
  MorphicModeName,
  MorphicStyleBundle,
  MorphicToolboxCategory,
} from "./types";

export class MorphicStyleManager {
  private readonly loadedStyleKeys = new Set<string>();

  /**
   * Injects visibility CSS derived from mode definitions.
   * Hides all morphic elements by default, then shows only those listed
   * in each mode's `elements` array. Developer CSS only needs to handle styling.
   */
  public ensureModeVisibilityStyles(modes: MorphicModeDefinition[]): void {
    const cssKey = `mode-visibility:${modes.map((m) => `${m.name}:${m.elements.join(",")}`).join(";")}`;
    if (this.loadedStyleKeys.has(cssKey)) return;

    const lines: string[] = ['[class^="morphic-element-"] { display: none; }'];
    for (const mode of modes) {
      const modeToken = toModeClassToken(mode.name);
      for (const element of mode.elements) {
        const elementToken = toModeClassToken(element);
        lines.push(`.morphic-mode-${modeToken} > .morphic-element-${elementToken} { display: block; }`);
      }
    }

    const styleEl = document.createElement("style");
    styleEl.dataset.morphicSource = "mode-visibility";
    styleEl.textContent = lines.join("\n");
    document.head.appendChild(styleEl);
    this.loadedStyleKeys.add(cssKey);
  }

  public ensureStyles(
    baseStyle: MorphicStyleBundle | undefined,
    modeStyles: MorphicModeStyle[],
  ): void {
    this.ensureStyleBundle(baseStyle, "base");
    for (const style of modeStyles) {
      this.ensureStyleBundle(style, `mode:${style.mode}`);
    }
  }

  public ensureCategoryStyles(categories: MorphicToolboxCategory[]): void {
    for (const category of categories) {
      if (!category.color) {
        continue;
      }
      const token = toModeClassToken(category.name);
      const cssKey = `category:${token}:${category.color}`;
      if (this.loadedStyleKeys.has(cssKey)) {
        continue;
      }
      const styleEl = document.createElement("style");
      styleEl.dataset.morphicSource = `category:${token}`;
      styleEl.textContent = `.morphic-category-${token} { --morphic-category-color: ${category.color}; }`;
      document.head.appendChild(styleEl);
      this.loadedStyleKeys.add(cssKey);
    }
  }

  public validateModeCoverage(
    modeStyles: MorphicModeStyle[],
    definitionModes: MorphicModeName[],
  ): void {
    const styleModes = new Set(modeStyles.map((style) => style.mode));
    const missingModes = definitionModes.filter(
      (mode) => !styleModes.has(mode),
    );
    if (missingModes.length > 0) {
      console.warn(
        `[MorphicBlocks] Modes without explicit CSS definition: ${missingModes.join(", ")}.`,
      );
    }
  }

  private ensureStyleBundle(
    style: MorphicStyleBundle | MorphicModeStyle | undefined,
    sourceName: string,
  ): void {
    if (!style) {
      return;
    }

    if (style.href) {
      const hrefKey = `href:${style.href}`;
      if (!this.loadedStyleKeys.has(hrefKey)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = style.href;
        link.dataset.morphicSource = sourceName;
        document.head.appendChild(link);
        this.loadedStyleKeys.add(hrefKey);
      }
    }

    if (style.cssText) {
      const cssKey = `text:${sourceName}:${style.cssText}`;
      if (!this.loadedStyleKeys.has(cssKey)) {
        const styleElement = document.createElement("style");
        styleElement.dataset.morphicSource = sourceName;
        styleElement.textContent = style.cssText;
        document.head.appendChild(styleElement);
        this.loadedStyleKeys.add(cssKey);
      }
    }
  }
}
