import type {
  MorphicBehaviorMap,
  MorphicBlockDefinition,
  MorphicBlocksFormat,
  MorphicBlocksFormatJson,
  MorphicCodeElementConfig,
  MorphicDropdownOption,
  MorphicFieldDefinition,
  MorphicInputSlotDefinition,
} from "morphic-blocks";
import { standard, standardCategories } from "./standard.js";
import type { Language, StandardBlocks } from "./types.js";

/** What `define()` takes from packages: a set of standard blocks and the languages that write them. */
export interface DefinePackages {
  /** The standard blocks to use: `standard`, or some of them (`pick(standard, [...])`). */
  blocks?: StandardBlocks;
  /** The languages, by the element name each gets: `{ java, go }`, or `{ "my-java": java }`. */
  languages?: Record<string, Language>;
}

/**
 * Some of the standard blocks, by identifier, in the order given:
 * `pick(standard, ["print", "if", "repeat"])`.
 */
export function pick(blocks: StandardBlocks, identifiers: string[]): StandardBlocks {
  const picked: StandardBlocks = {};
  for (const identifier of identifiers) {
    const block = Object.hasOwn(blocks, identifier) ? blocks[identifier] : undefined;
    if (!block) throw new Error(`pick: "${identifier}" is no block of the set.`);
    picked[identifier] = block;
  }
  return picked;
}

/**
 * Put standard blocks, languages and an app's own definitions together into
 * the definitions and behaviors `new MorphicBlocks(...)` takes. The packages
 * go in first and the app's own entries win:
 *
 * - each language becomes a code element under its key, with its settings;
 *   `own.code[key]` changes single settings
 * - each standard block gets the templates of the languages; an own block with
 *   the same identifier adds to it or changes it (elements, fields, slots)
 * - own blocks, modes, views, presets and block sets stay as they are
 * - `ownBehaviors` replace the standard behaviors of the same blocks
 */
export function define(
  packages: DefinePackages,
  ownDefinitions: Partial<MorphicBlocksFormat> | Partial<MorphicBlocksFormatJson> = {},
  ownBehaviors: MorphicBehaviorMap = {},
): { definitions: MorphicBlocksFormat; behaviors: MorphicBehaviorMap } {
  // A definitions file imported as JSON has the same structure with wider types.
  const own = ownDefinitions as Partial<MorphicBlocksFormat>;
  const blocks = packages.blocks ?? {};
  const languages = packages.languages ?? {};
  const ownBlocks = new Map((own.blocks ?? []).map((block) => [block.identifier, block]));

  const merged: MorphicBlockDefinition[] = [];
  const behaviors: MorphicBehaviorMap = {};
  for (const [identifier, { behavior, ...block }] of Object.entries(blocks)) {
    const elements: Record<string, string> = {};
    const fields = clone(block.fields);
    const inputSlots = clone(block.inputSlots);
    for (const [element, language] of Object.entries(languages)) {
      const template = language.blocks[identifier];
      if (template !== undefined) elements[element] = template;
      for (const [name, field] of Object.entries(fields ?? {})) {
        const display = language.display?.[`${identifier}.${name}`];
        if (display && field.type === "dropdown") field.options = field.options.map((option) => withDisplay(option, element, display));
      }
      for (const slot of Object.values(inputSlots ?? {})) {
        const separator = slot.name ? language.separators?.[`${identifier}.${slot.name}`] : undefined;
        if (separator !== undefined && slot.repeat) slot.repeat.separator = { ...separators(slot), [element]: separator };
      }
    }
    const change = ownBlocks.get(identifier);
    const definition = mergeBlock({ ...block, identifier, elements, fields, inputSlots }, change);
    // A block no language writes, and the app neither, has nothing to show.
    if (Object.keys(definition.elements).length === 0) continue;
    merged.push(definition);
    behaviors[identifier] = behavior;
  }
  for (const block of own.blocks ?? []) {
    // A copy: what is left out below is left out of the result, not of the app's own object.
    if (!Object.hasOwn(blocks, block.identifier)) merged.push(clone(block));
  }

  // What names a standard block the app did not take is left out: a default,
  // the target of a reference (the field becomes a plain text when none is
  // left), a scope.
  const present = new Set(merged.map((block) => block.identifier));
  const usable = (ref: string | undefined) => ref === undefined || present.has(ref) || !Object.hasOwn(standard, ref);
  for (const block of merged) {
    for (const slot of Object.values(block.inputSlots ?? {})) {
      if (slot.default && !(usable(slot.default.shadow) && usable(slot.default.placeholder))) delete slot.default;
    }
    for (const [name, field] of Object.entries(block.fields ?? {})) {
      if (field.type !== "reference") continue;
      const targets = [field.to].flat().filter((target) => usable(target.slice(0, target.lastIndexOf("."))));
      const scopes = field.scope === undefined ? [] : [field.scope].flat().filter(usable);
      if (targets.length === 0) {
        block.fields![name] = { type: "text", ...(field.default !== undefined ? { default: field.default } : {}) };
        continue;
      }
      field.to = targets.length === 1 ? targets[0]! : targets;
      if (scopes.length > 0) field.scope = scopes.length === 1 ? scopes[0]! : scopes;
      else delete field.scope;
    }
  }

  const elementTypes = { ...own.elementTypes };
  const code: Record<string, MorphicCodeElementConfig> = { ...own.code };
  for (const [element, language] of Object.entries(languages)) {
    elementTypes[element] ??= "code";
    const settings = mergeSettings(clone(language.code ?? {}), own.code?.[element]);
    for (const [check, config] of Object.entries(settings.empty ?? {})) {
      if (!(usable(config.shadow) && usable(config.placeholder))) delete settings.empty![check];
    }
    code[element] = settings;
  }

  const categories = [...(own.categories ?? [])];
  const used = new Set(merged.map((block) => block.category));
  for (const category of standardCategories) {
    if (used.has(category.name) && !categories.some((entry) => entry.name === category.name)) categories.push(category);
  }

  return {
    definitions: { ...own, elementTypes, code, categories, blocks: merged },
    behaviors: { ...behaviors, ...ownBehaviors },
  };
}

/** An own block over a standard one: its entries win, the maps (elements, fields, slots) merge by key. */
function mergeBlock(block: MorphicBlockDefinition, change: MorphicBlockDefinition | undefined): MorphicBlockDefinition {
  if (!change) return block;
  const inputSlots: Record<string, MorphicInputSlotDefinition> = { ...block.inputSlots };
  for (const [key, slot] of Object.entries(change.inputSlots ?? {})) inputSlots[key] = { ...inputSlots[key], ...slot };
  const fields: Record<string, MorphicFieldDefinition> = { ...block.fields, ...change.fields };
  return {
    ...block,
    ...change,
    elements: { ...block.elements, ...change.elements },
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...(Object.keys(inputSlots).length > 0 ? { inputSlots } : {}),
  };
}

/** A language's settings with the app's own on top: single settings win, the maps in them merge by key. */
function mergeSettings(
  settings: MorphicCodeElementConfig,
  change: MorphicCodeElementConfig | undefined,
): MorphicCodeElementConfig {
  const result: Record<string, unknown> = { ...settings };
  for (const [key, value] of Object.entries(change ?? {})) {
    const before = result[key];
    const bothMaps = [before, value].every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry));
    result[key] = bothMaps ? { ...(before as object), ...(value as object) } : value;
  }
  return result as MorphicCodeElementConfig;
}

/** A dropdown choice with the text it shows in one more element. */
function withDisplay(
  option: MorphicDropdownOption,
  element: string,
  display: Record<string, string>,
): MorphicDropdownOption {
  const choice =
    typeof option === "string" ? { value: option } : Array.isArray(option) ? { value: option[0], label: option[1] } : option;
  const shown = display[choice.value];
  return shown === undefined ? option : { ...choice, display: { ...choice.display, [element]: shown } };
}

/** A copy of plain data (fields, slots, settings), so a merge never changes a package's own objects. */
function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function separators(slot: MorphicInputSlotDefinition): Record<string, string> {
  const separator = slot.repeat?.separator;
  return typeof separator === "object" ? separator : {};
}
