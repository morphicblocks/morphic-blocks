import * as Blockly from "blockly";
import { getLifecycleBehavior } from "./behavior-runtime";
import { resolveElementType } from "./element-types";
import { parseTemplate } from "./template";
import type {
  MorphicBehaviorMap,
  MorphicBlockDefinition,
  MorphicElementTypeConfig,
  MorphicElementTypeEntry,
  MorphicHighlightDefinition,
  MorphicModeDefinition,
  MorphicPresetDefinition,
  MorphicToolboxCategory,
} from "./types";

/**
 * Inputs for a definitions validation pass. Everything is optional except the
 * definitions + elementTypes (available at construction); the cross-reference
 * data (modes / highlighting / categories) arrives from the mount config.
 */
export interface ValidateDefinitionsArgs {
  definitions: ReadonlyMap<string, MorphicBlockDefinition>;
  elementTypes: Record<string, MorphicElementTypeEntry>;
  behaviors: MorphicBehaviorMap;
  modes?: MorphicModeDefinition[];
  presets?: MorphicPresetDefinition[];
  highlighting?: Record<string, MorphicHighlightDefinition>;
  categories?: MorphicToolboxCategory[];
}

export interface DefinitionValidationResult {
  /** Structural problems that guarantee wrong output — the caller should throw. */
  errors: string[];
  /** Degraded / dead-config problems — the caller should warn. */
  warnings: string[];
}

/**
 * Static validation of a definitions file. Complements the constructor-time
 * checks in `createDefinitionMap` (identifier / element / duplicate) with the
 * cross-field checks that would otherwise fail silently at render time.
 *
 * Pure and side-effect free: it collects every problem into `errors` (throw)
 * and `warnings` (console.warn) so the caller reports them all at once rather
 * than failing on the first. A known-good file yields two empty arrays.
 */
export function validateDefinitions(
  args: ValidateDefinitionsArgs,
): DefinitionValidationResult {
  const { definitions, elementTypes, behaviors, modes, presets, highlighting, categories } = args;
  const errors: string[] = [];
  const warnings: string[] = [];

  const declaredElementNames = new Set(Object.keys(elementTypes));
  const codeElementNames = new Set(
    Object.keys(elementTypes).filter(
      (name) => resolveElementType(elementTypes[name]) === "code",
    ),
  );
  const categoryNames = new Set((categories ?? []).map((c) => c.name));

  // A shadow/placeholder ref is valid iff it's one of our defined blocks or a
  // registered Blockly stock type (e.g. `math_number`). Stock blocks are
  // registered via `blockly/blocks` at module load, so this is reliable here.
  const refIsResolvable = (ref: string): boolean =>
    definitions.has(ref) || Blockly.Blocks[ref] !== undefined;

  for (const def of definitions.values()) {
    const id = def.identifier;
    const lifecycle = getLifecycleBehavior(behaviors[id]);
    const hasOnViewApplied = Boolean(lifecycle?.onViewApplied);

    // (1) Every element name used by the block must be declared in elementTypes.
    for (const name of Object.keys(def.elements)) {
      if (!declaredElementNames.has(name)) {
        warnings.push(
          `Block "${id}": element "${name}" is not declared in elementTypes — it renders with no known type.`,
        );
      }
    }

    // Parse the block's code-element templates once, collecting placeholder and
    // field tokens. Only `code`-type elements become workspace/source templates,
    // so only they participate in placeholder-set agreement.
    const placeholderSets = new Map<string, Set<number>>();
    const allPlaceholders = new Set<number>();
    const fieldTokens = new Set<string>();
    for (const [name, content] of Object.entries(def.elements)) {
      if (!codeElementNames.has(name)) continue;
      const indices = new Set<number>();
      for (const token of parseTemplate(content)) {
        if (token.kind === "placeholder") {
          indices.add(token.index);
          allPlaceholders.add(token.index);
        } else if (token.kind === "field") {
          fieldTokens.add(token.name);
        }
      }
      placeholderSets.set(name, indices);
    }

    // (2) All code elements must share the same %N set. A mismatch means an
    // input (and any block plugged into it) silently disappears on mode switch.
    const setEntries = [...placeholderSets.entries()];
    if (setEntries.length > 1) {
      const [refName, refSet] = setEntries[0]!;
      for (const [name, set] of setEntries.slice(1)) {
        if (!sameNumberSet(refSet, set)) {
          errors.push(
            `Block "${id}": code elements "${refName}" and "${name}" use different placeholders ` +
              `(${fmtIndices(refSet)} vs ${fmtIndices(set)}). All code elements must share the same ` +
              `%N set, or an input disappears when switching to the differing mode.`,
          );
        }
      }
    }

    // (3) %N ↔ inputSlots.
    const slotKeys = new Set(
      Object.keys(def.inputSlots ?? {})
        .map((k) => Number(k))
        .filter((n) => Number.isInteger(n)),
    );
    for (const index of allPlaceholders) {
      if (!def.inputSlots?.[String(index)]) {
        warnings.push(
          `Block "${id}": placeholder %${index} has no inputSlots["${index}"] entry — the input ` +
            `is auto-named ARG${index} and can't be read by name in behaviors.`,
        );
      }
    }
    for (const key of slotKeys) {
      if (!allPlaceholders.has(key)) {
        warnings.push(
          `Block "${id}": inputSlots["${key}"] has no matching %${key} placeholder in any code element — the config is ignored.`,
        );
      }
    }

    // (4) %FIELDNAME ↔ fields. An undeclared field token is only valid when a
    // behavior's onViewApplied supplies the field (the custom-field escape
    // hatch); otherwise the field can never appear.
    const fieldKeys = new Set(Object.keys(def.fields ?? {}));
    for (const name of fieldTokens) {
      if (!def.fields?.[name] && !hasOnViewApplied) {
        errors.push(
          `Block "${id}": field token %${name} has no fields["${name}"] entry and the block has no ` +
            `onViewApplied behavior to create it — the field will never appear.`,
        );
      }
    }
    for (const name of fieldKeys) {
      if (!fieldTokens.has(name)) {
        warnings.push(
          `Block "${id}": fields["${name}"] has no matching %${name} token in any code element — the config is ignored.`,
        );
      }
    }

    // (4b) Dropdown option `display` keys must be code elements — a display for
    // an element that never renders as source text is dead config.
    for (const [name, fieldDef] of Object.entries(def.fields ?? {})) {
      if (fieldDef?.type !== "dropdown") continue;
      for (const option of fieldDef.options) {
        if (typeof option !== "object" || Array.isArray(option) || !option.display) continue;
        for (const element of Object.keys(option.display)) {
          if (!codeElementNames.has(element)) {
            warnings.push(
              `Block "${id}": fields["${name}"] option "${option.value}" has display for "${element}", ` +
                `which is not a code element — that entry never applies.`,
            );
          }
        }
      }
    }

    // (5) Category must exist (only when categories were supplied to validate against).
    if (
      def.category !== undefined &&
      categoryNames.size > 0 &&
      !categoryNames.has(def.category)
    ) {
      warnings.push(
        `Block "${id}": category "${def.category}" is not declared in categories — the block loses its colour and grouping.`,
      );
    }

    // (6) Per-slot shadow/placeholder defaults must resolve.
    for (const [key, slot] of Object.entries(def.inputSlots ?? {})) {
      checkRef(slot?.default?.shadow, `Block "${id}": inputSlots["${key}"].default.shadow`);
      checkRef(slot?.default?.placeholder, `Block "${id}": inputSlots["${key}"].default.placeholder`);
    }
  }

  // (7) elementType-level empty defaults must resolve (global, shared across blocks).
  for (const [name, entry] of Object.entries(elementTypes)) {
    if (typeof entry === "string") continue;
    const empty = (entry as MorphicElementTypeConfig).empty;
    if (!empty) continue;
    for (const [check, cfg] of Object.entries(empty)) {
      checkRef(cfg.shadow, `elementTypes.${name}.empty.${check}.shadow`);
      checkRef(cfg.placeholder, `elementTypes.${name}.empty.${check}.placeholder`);
    }
  }

  // (7b) Config fields on the wrong element type are silently ignored — warn so
  // a misplacement isn't mistaken for "the setting doesn't work". `empty` /
  // `stringQuote` apply to code elements; `size` applies to image elements.
  for (const [name, entry] of Object.entries(elementTypes)) {
    if (typeof entry === "string") continue;
    const type = entry.type;
    if (entry.size !== undefined && type !== "image") {
      warnings.push(
        `elementTypes."${name}": "size" applies only to image elements — ignored for a ${type} element.`,
      );
    }
    if (entry.stringQuote !== undefined && type !== "code") {
      warnings.push(
        `elementTypes."${name}": "stringQuote" applies only to code elements — ignored for a ${type} element.`,
      );
    }
    if (entry.empty !== undefined && type !== "code") {
      warnings.push(
        `elementTypes."${name}": "empty" applies only to code elements — ignored for a ${type} element.`,
      );
    }
  }

  // (8) Mode elements must be declared element names.
  for (const mode of modes ?? []) {
    for (const element of mode.elements) {
      if (!declaredElementNames.has(element)) {
        warnings.push(
          `Mode "${mode.name}": element "${element}" is not declared in elementTypes — it renders nothing.`,
        );
      }
    }
  }

  // (9) Highlighting keys must be code elements or the rules never apply.
  for (const key of Object.keys(highlighting ?? {})) {
    if (!codeElementNames.has(key)) {
      warnings.push(
        `highlighting["${key}"] is not a code element — its rules will never apply.`,
      );
    }
  }

  // (10) Cross-namespace name collisions. A name reused as an element, a mode,
  // and/or a preset is legal (they're separate maps) but easy to confuse — e.g.
  // a mode named after its source element makes `python` mean three things.
  const namespacesByName = new Map<string, Set<string>>();
  const noteName = (name: string, namespace: string): void => {
    const set = namespacesByName.get(name) ?? new Set<string>();
    set.add(namespace);
    namespacesByName.set(name, set);
  };
  for (const name of declaredElementNames) noteName(name, "element");
  for (const mode of modes ?? []) noteName(mode.name, "mode");
  for (const preset of presets ?? []) noteName(preset.name, "preset");
  for (const [name, namespaces] of namespacesByName) {
    if (namespaces.size > 1) {
      warnings.push(
        `Name "${name}" is used as ${[...namespaces].sort().join(" and ")} — reusing a name ` +
          `across element / mode / preset is allowed but confusing; consider distinct names.`,
      );
    }
  }

  return { errors, warnings };

  function checkRef(ref: string | undefined, where: string): void {
    if (!ref || refIsResolvable(ref)) return;
    errors.push(
      `${where}: "${ref}" is neither a defined block nor a registered Blockly block type.`,
    );
  }
}

function sameNumberSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function fmtIndices(set: Set<number>): string {
  const list = [...set].sort((x, y) => x - y);
  return list.length ? list.map((n) => `%${n}`).join(" ") : "(none)";
}
