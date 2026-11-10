import type { MorphicBehaviorMap } from "./types";
import { applyBlockShapes, createDefinitionMap, expandDefaultElements } from "./definitions";
import { resolveElementType, withCodeSettings } from "./element-types";
import { validateDefinitions, type DefinitionValidationResult } from "./validate-definitions";
import type {
  MorphicBlocksFormat,
  MorphicBlocksFormatJson,
  MorphicElementTypeEntry,
  MorphicModeDefinition,
  MorphicPresetDefinition,
  MorphicViewDeclaration,
  MorphicViewKind,
} from "./types";

/** The views without a `views` section: one workspace, one codespace. */
export const DEFAULT_VIEWS: Record<string, MorphicViewKind> = { workspace: "workspace", codespace: "codespace" };

/** The views in their long form; a bare kind is the short form. */
export function normalizeViews(
  views: Record<string, MorphicViewKind | MorphicViewDeclaration> | undefined,
): Record<string, MorphicViewDeclaration> {
  return Object.fromEntries(
    Object.entries(views ?? DEFAULT_VIEWS).map(([name, view]) => [name, typeof view === "string" ? { kind: view } : view]),
  );
}

/** Each declared view's kind. */
export function checkViewDeclarations(views: Record<string, MorphicViewDeclaration>): string[] {
  const errors: string[] = [];
  for (const [name, declaration] of Object.entries(views)) {
    if ((declaration.kind as string) === "preview") {
      errors.push(`View "${name}": the preview is a codespace that cannot be edited since 0.4.0: { "kind": "codespace", "editable": false }.`);
    } else if (declaration.kind !== "workspace" && declaration.kind !== "codespace") {
      errors.push(`View "${name}": unknown kind "${String(declaration.kind)}". Use "workspace" or "codespace".`);
    }
  }
  return errors;
}

/**
 * The presets against the modes, views and elements: duplicate names, an
 * unknown toolbox mode, views that show no code element. A view no one
 * declared only warns, since a view added later may carry the name.
 */
export function checkPresets(args: {
  presets: MorphicPresetDefinition[] | undefined;
  modes: MorphicModeDefinition[] | undefined;
  views: Record<string, MorphicViewDeclaration>;
  elementTypes: Record<string, MorphicElementTypeEntry>;
}): DefinitionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const modeByName = new Map((args.modes ?? []).map((mode) => [mode.name, mode]));
  const seen = new Set<string>();
  for (const preset of args.presets ?? []) {
    if (seen.has(preset.name)) {
      errors.push(`Preset "${preset.name}" is defined more than once.`);
      continue;
    }
    seen.add(preset.name);
    if (!modeByName.has(preset.toolbox)) {
      errors.push(`Preset "${preset.name}": unknown mode "${preset.toolbox}" for the toolbox.`);
    }
    const shown = Object.entries(preset.views ?? {});
    if (shown.length === 0) errors.push(`Preset "${preset.name}": "views" must name at least one view.`);
    for (const [viewName, element] of shown) {
      if (!args.views[viewName]) {
        warnings.push(`Preset "${preset.name}" names "${viewName}", which is no declared view (${Object.keys(args.views).join(", ")}).`);
      }
      if (resolveElementType(args.elementTypes[element]) !== "code") {
        errors.push(
          `Preset "${preset.name}": view "${viewName}" shows "${element}", which is no code element.` +
            (modeByName.has(element) ? ` Views show elements since 0.4.0, and "${element}" is a mode.` : ""),
        );
      }
    }
  }
  return { errors, warnings };
}

/** Settings that moved in an earlier version, named so an upgrade fails with directions. */
export function movedDefinitionErrors(presets: MorphicPresetDefinition[] | undefined, hasHighlighting: boolean): string[] {
  const errors: string[] = [];
  // Moved in 0.4.0.
  for (const preset of presets ?? []) {
    const old = (["workspace", "codespace", "preview"] as const).filter((key) => key in preset);
    if (old.length > 0) {
      errors.push(
        `Preset "${preset.name}": ${old.map((key) => `"${key}"`).join(", ")} moved into "views" in 0.4.0, by view name: ` +
          `"views": { ${old.map((key) => `"${key}": "${(preset as unknown as Record<string, string>)[key]}"`).join(", ")} }.`,
      );
    }
  }
  // Moved in 0.3.0.
  if (hasHighlighting) {
    errors.push('The top level "highlighting" map moved into the "code" section: "code": { "<element>": { "highlighting": { … } } }.');
  }
  return errors;
}

/**
 * Every check `mount()` runs on a definitions file, without mounting: the
 * blocks themselves, the definitions, the presets and the views. Errors stop
 * a mount; warnings do not. With `modeStyles` (the modes that have a
 * stylesheet), a mode without one warns too.
 */
export function checkDefinitions(
  format: MorphicBlocksFormat | MorphicBlocksFormatJson,
  behaviors: MorphicBehaviorMap = {},
  options: { modeStyles?: string[] } = {},
): DefinitionValidationResult {
  const definitions = format as MorphicBlocksFormat;
  const elementTypes = definitions.elementTypes ?? {};
  let blocks;
  try {
    blocks = createDefinitionMap(applyBlockShapes(expandDefaultElements(definitions.blocks, elementTypes)));
  } catch (error) {
    return { errors: [(error as Error).message], warnings: [] };
  }
  const views = normalizeViews(definitions.views);
  const checked = validateDefinitions({
    definitions: blocks,
    elementTypes,
    behaviors,
    modes: definitions.modes,
    presets: definitions.presets,
    code: definitions.code,
    categories: definitions.categories,
    views: Object.keys(definitions.views ?? {}),
    blockSets: definitions.blockSets,
  });
  const presets = checkPresets({
    presets: definitions.presets,
    modes: definitions.modes,
    views,
    elementTypes: withCodeSettings(elementTypes, definitions.code),
  });
  const errors = [
    ...checked.errors,
    ...movedDefinitionErrors(definitions.presets, "highlighting" in definitions),
    ...checkViewDeclarations(views),
    ...presets.errors,
  ];
  const warnings = [...checked.warnings, ...presets.warnings];
  if (options.modeStyles) {
    const styled = new Set(options.modeStyles);
    const missing = (definitions.modes ?? []).map((mode) => mode.name).filter((mode) => !styled.has(mode));
    if (missing.length > 0) warnings.push(`Modes without explicit CSS definition: ${missing.join(", ")}.`);
  }
  return { errors, warnings };
}
