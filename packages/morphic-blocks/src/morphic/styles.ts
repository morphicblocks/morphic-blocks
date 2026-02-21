import type { MorphicModeStyle, MorphicModeName, MorphicStyleBundle } from "./types";

export class MorphicStyleManager {
  private readonly loadedStyleKeys = new Set<string>();

  public ensureStyles(baseStyle: MorphicStyleBundle | undefined, modeStyles: MorphicModeStyle[]): void {
    this.ensureStyleBundle(baseStyle, "base");
    for (const style of modeStyles) {
      this.ensureStyleBundle(style, `mode:${style.mode}`);
    }
  }

  public validateModeCoverage(modeStyles: MorphicModeStyle[], definitionModes: MorphicModeName[]): void {
    const styleModes = new Set(modeStyles.map((style) => style.mode));
    const missingModes = definitionModes.filter((mode) => !styleModes.has(mode));
    if (missingModes.length > 0) {
      console.warn(
        `[MorphicBlocks] Modes without explicit CSS definition: ${missingModes.join(", ")}.`
      );
    }
  }

  private ensureStyleBundle(
    style: MorphicStyleBundle | MorphicModeStyle | undefined,
    sourceName: string
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

