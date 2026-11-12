import * as Blockly from "blockly";
import { getLifecycleBehavior } from "./behavior-runtime";
import { BLOCK_SHAPES, DEFAULT_ELEMENT } from "./definitions";
import { resolveBlockSets } from "./block-sets";
import { parseReferenceTarget } from "./dropdown-fields";
import { resolveElementType } from "./element-types";
import { parseTemplate, toModeClassToken } from "./template";
import type {
  MorphicBehaviorMap,
  MorphicBlockSet,
  MorphicBlockDefinition,
  MorphicCodeElementConfig,
  MorphicElementTypeEntry,
  MorphicModeDefinition,
  MorphicPresetDefinition,
  MorphicToolboxCategory,
} from "./types";

/**
 * Inputs for a definitions validation pass. Everything is optional except the
 * definitions + elementTypes (available at construction); the cross-reference
 * data (modes / code / categories) arrives from the mount config.
 */
export interface ValidateDefinitionsArgs {
  definitions: ReadonlyMap<string, MorphicBlockDefinition>;
  elementTypes: Record<string, MorphicElementTypeEntry>;
  behaviors: MorphicBehaviorMap;
  modes?: MorphicModeDefinition[];
  presets?: MorphicPresetDefinition[];
  code?: Record<string, MorphicCodeElementConfig>;
  categories?: MorphicToolboxCategory[];
  /** Names of the views the developer declared (not the defaults). */
  views?: string[];
  blockSets?: Record<string, MorphicBlockSet>;
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
  const { definitions, elementTypes, behaviors, modes, presets, code, categories, views, blockSets } = args;
  const errors: string[] = [];
  const warnings: string[] = [];

  const declaredElementNames = new Set(Object.keys(elementTypes));
  const codeElementNames = new Set(
    Object.keys(elementTypes).filter(
      (name) => resolveElementType(elementTypes[name]) === "code",
    ),
  );
  const categoryNames = new Set((categories ?? []).map((c) => c.name));

  // `default` is reserved for a block's fallback template, so it cannot also
  // name a real element.
  if (declaredElementNames.has(DEFAULT_ELEMENT)) {
    errors.push(
      `elementTypes declares "${DEFAULT_ELEMENT}", which is reserved for a block's fallback template. Rename the element.`,
    );
  }

  // A shadow/placeholder ref is valid iff it's one of our defined blocks or a
  // registered Blockly stock type (e.g. `math_number`). Stock blocks are
  // registered via `blockly/blocks` at module load, so this is reliable here.
  const refIsResolvable = (ref: string): boolean =>
    definitions.has(ref) || Blockly.Blocks[ref] !== undefined;

  for (const def of definitions.values()) {
    const id = def.identifier;

    // `shape` describes statement connections. Flags written next to it win,
    // so a flag that contradicts the shape is almost certainly a mistake.
    if (def.shape !== undefined) {
      if (!BLOCK_SHAPES.includes(def.shape)) {
        errors.push(
          `Block "${id}": unknown shape "${def.shape}". Use one of: ${BLOCK_SHAPES.join(", ")}.`,
        );
      } else {
        const isSet = (spec: unknown): boolean => spec !== undefined && spec !== false;
        const contradictions: string[] = [];
        if (isSet(def.output)) {
          contradictions.push("it also has an output, which makes it a value block");
        }
        if ((def.shape === "start" || def.shape === "standalone") && isSet(def.previousStatement)) {
          contradictions.push("it also connects above (previousStatement)");
        }
        if ((def.shape === "end" || def.shape === "standalone") && isSet(def.nextStatement)) {
          contradictions.push("it also connects below (nextStatement)");
        }
        if (def.shape === "statement" && (def.previousStatement === false || def.nextStatement === false)) {
          contradictions.push("a connection flag is set to false");
        }
        for (const reason of contradictions) {
          warnings.push(`Block "${id}": shape "${def.shape}" contradicts its flags: ${reason}. The flags win.`);
        }
      }
    }
    // A strict block goes only where a check matches its own; without a check
    // of its own it would fit nowhere.
    const namesCheck = (spec: unknown) => typeof spec === "string" || (Array.isArray(spec) && spec.length > 0);
    if (def.strict && !namesCheck(def.previousStatement) && !namesCheck(def.output)) {
      errors.push(
        `Block "${id}" is strict but has no check. Name its kind in "previousStatement" (or "output"), e.g. "previousStatement": "ClassField".`,
      );
    }

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
    const valueTypeTokens = new Map<string, Set<number>>();
    for (const [name, content] of Object.entries(def.elements)) {
      if (!codeElementNames.has(name)) continue;
      const indices = new Set<number>();
      const valueTypes = new Set<number>();
      for (const token of parseTemplate(content)) {
        if (token.kind === "placeholder") {
          indices.add(token.index);
          allPlaceholders.add(token.index);
        } else if (token.kind === "field") {
          fieldTokens.add(token.name);
        } else if (token.kind === "valueType") {
          // `%1:type` uses slot 1 too, also where the template leaves `%1` itself out.
          valueTypes.add(token.index);
          allPlaceholders.add(token.index);
        }
      }
      placeholderSets.set(name, indices);
      valueTypeTokens.set(name, valueTypes);
    }

    // (1b) `%N:type` names the type of slot N's value, so slot N must be a
    // value slot of the same template.
    for (const [name, valueTypes] of valueTypeTokens) {
      for (const index of valueTypes) {
        // The slot may be one this template leaves out: a declared slot stays on the block.
        const slot = def.inputSlots?.[String(index)];
        if (slot?.repeat) {
          errors.push(
            `Block "${id}": element "${name}" uses %${index}:type, but %${index} repeats. ` +
              `A slot with several values has no one type.`,
          );
        } else if ((!placeholderSets.get(name)?.has(index) && !slot) || slot?.kind === "statement") {
          errors.push(
            `Block "${id}": element "${name}" uses %${index}:type, but %${index} is not a value slot in it — ` +
              `the type comes from the value in that slot.`,
          );
        }
      }
    }

    // (2) A code element may leave a slot out that another one writes: a
    // slot declared in `inputSlots` stays on the block, undrawn. Without that
    // entry the input (and any block in it) would disappear with the element
    // shown, so the placeholders must then be the same everywhere.
    const setEntries = [...placeholderSets.entries()];
    if (setEntries.length > 1) {
      const [refName, refSet] = setEntries[0]!;
      for (const [name, set] of setEntries.slice(1)) {
        const undeclared = [...refSet, ...set].filter(
          (index) => refSet.has(index) !== set.has(index) && !def.inputSlots?.[String(index)],
        );
        if (undeclared.length > 0) {
          errors.push(
            `Block "${id}": code elements "${refName}" and "${name}" use different placeholders ` +
              `(${fmtIndices(refSet)} vs ${fmtIndices(set)}). Declare inputSlots["${undeclared[0]}"], so the block ` +
              `keeps the slot where a template leaves it out, or write %${undeclared[0]} in every code element.`,
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
          `Block "${id}": fields["${name}"] has no matching %${name} token in any code element — it is never shown.`,
        );
      }
    }

    // (4b) Dropdown option `display` keys must be code elements — a display for
    // an element that never renders as source text is dead config.
    for (const [name, fieldDef] of Object.entries(def.fields ?? {})) {
      if (fieldDef?.type !== "dropdown") continue;
      for (const option of fieldDef.options) {
        if (typeof option !== "object" || Array.isArray(option)) continue;
        const image = option.label;
        if (image && typeof image === "object" && typeof image.src !== "string" && typeof image.color !== "string") {
          errors.push(`Block "${id}": fields["${name}"] option "${option.value}" has an image label without "src" or "color".`);
        }
        if (!option.display) continue;
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

    // (5b) Values TypeScript cannot check when definitions come from a JSON
    // file: an unknown slot kind or field type silently breaks the block.
    for (const [key, slot] of Object.entries(def.inputSlots ?? {})) {
      if (slot?.kind !== undefined && !SLOT_KINDS.includes(slot.kind)) {
        errors.push(
          `Block "${id}": inputSlots["${key}"] has unknown kind "${slot.kind}". Use one of: ${SLOT_KINDS.join(", ")}.`,
        );
      }
      if (slot?.repeat && (slot.kind ?? "value") !== "value") {
        errors.push(
          `Block "${id}": inputSlots["${key}"] repeats, but it is a statement slot. Only value slots repeat; a statement slot already holds any number of blocks.`,
        );
      }
      if (slot?.repeat && !slot.name) {
        errors.push(`Block "${id}": inputSlots["${key}"] repeats but has no name. Give it a "name"; its entries are named after it.`);
      }
      // The entries of a repeating slot are named `<name>_0`, `<name>_1`, …
      const entryOf = Object.values(def.inputSlots ?? {}).find(
        (other) => other?.repeat && other.name && slot?.name?.startsWith(`${other.name}_`) && /^\d+$/.test(slot.name.slice(other.name.length + 1)),
      );
      if (entryOf) {
        errors.push(
          `Block "${id}": inputSlots["${key}"] is named "${slot!.name}", which is the name of an entry of the repeating slot "${entryOf.name}". Give it another name.`,
        );
      }
      if (slot?.strict && (slot.check === undefined || slot.check.length === 0)) {
        errors.push(
          `Block "${id}": inputSlots["${key}"] is strict but has no check. A strict slot takes only blocks whose check matches its own, so nothing would fit.`,
        );
      }
    }
    for (const [name, fieldDef] of Object.entries(def.fields ?? {})) {
      if (!FIELD_TYPES.includes(fieldDef?.type)) {
        errors.push(
          `Block "${id}": fields["${name}"] has unknown type "${fieldDef?.type}". Use one of: ${FIELD_TYPES.join(", ")}.`,
        );
      }
    }

    // (5c) A reference lists what a field of another block holds; a target
    // that does not exist would leave the list empty for good.
    for (const [name, fieldDef] of Object.entries(def.fields ?? {})) {
      if (fieldDef?.type !== "reference") continue;
      for (const scope of fieldDef.scope === undefined ? [] : [fieldDef.scope].flat()) {
        if (!definitions.has(scope)) {
          errors.push(`Block "${id}": fields["${name}"] has the scope "${scope}", but there is no block "${scope}".`);
        }
      }
      const targets = Array.isArray(fieldDef.to) ? fieldDef.to : [fieldDef.to];
      if (targets.length === 0) {
        errors.push(`Block "${id}": fields["${name}"] is a reference without "to". Name the field it lists, e.g. "class_define.NAME".`);
      }
      for (const to of targets) {
        const target = parseReferenceTarget(to);
        const where = `Block "${id}": fields["${name}"] refers to "${to}"`;
        if (!target) {
          errors.push(`${where}, which is not a block and a field. Write it as "block.FIELD", e.g. "class_define.NAME".`);
          continue;
        }
        const targetDef = definitions.get(target.block);
        if (!targetDef) {
          errors.push(`${where}, but there is no block "${target.block}".`);
        } else if (!targetDef.fields?.[target.field] && !getLifecycleBehavior(behaviors[target.block])?.onViewApplied) {
          errors.push(`${where}, but block "${target.block}" has no field "${target.field}".`);
        }
      }
    }

    // (6) Per-slot shadow/placeholder defaults must resolve.
    for (const [key, slot] of Object.entries(def.inputSlots ?? {})) {
      checkRef(slot?.default?.shadow, `Block "${id}": inputSlots["${key}"].default.shadow`);
      checkRef(slot?.default?.placeholder, `Block "${id}": inputSlots["${key}"].default.placeholder`);
    }
  }

  // (6b) Every element type must be one the renderer knows. From a JSON file a
  // typo such as "cdoe" would otherwise make the element silently disappear.
  for (const [name, entry] of Object.entries(elementTypes)) {
    const type = resolveElementType(entry);
    if (!ELEMENT_TYPES.includes(type as string)) {
      errors.push(
        `elementTypes."${name}": unknown type "${type}". Use one of: ${ELEMENT_TYPES.join(", ")}.`,
      );
    }
  }

  // (7) The code section's empty defaults must resolve (global, shared across blocks).
  for (const [name, settings] of Object.entries(code ?? {})) {
    for (const [check, cfg] of Object.entries(settings.empty ?? {})) {
      checkRef(cfg.shadow, `code.${name}.empty.${check}.shadow`);
      checkRef(cfg.placeholder, `code.${name}.empty.${check}.placeholder`);
    }
  }

  // (7b) Config fields in the wrong place are silently ignored. `size` applies
  // to image elements. `empty` and `stringQuote` moved from elementTypes into
  // the code section in 0.3.0, so an old file fails with directions.
  for (const [name, entry] of Object.entries(elementTypes)) {
    if (typeof entry === "string") continue;
    const type = entry.type;
    if (entry.size !== undefined && type !== "image") {
      warnings.push(
        `elementTypes."${name}": "size" applies only to image elements — ignored for a ${type} element.`,
      );
    }
    for (const field of ["empty", "stringQuote"]) {
      if (field in entry) {
        errors.push(
          `elementTypes."${name}": "${field}" moved into the "code" section: "code": { "${name}": { "${field}": … } }.`,
        );
      }
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

  // (8b) A mode's `render` says how its code elements are drawn on tiles. It
  // moved there from the preset's toolbox entry in 0.4.0, so an old file
  // fails with directions.
  for (const mode of modes ?? []) {
    // Typed loosely: a JSON file can hold any string here.
    for (const [element, value] of Object.entries(mode.render ?? {}) as [string, string][]) {
      if (value === "block" || value === "text") {
        errors.push(`Mode "${mode.name}": render "${value}" is now "${value}-based" (render.${element}).`);
      } else if (value !== "block-based" && value !== "text-based") {
        errors.push(`Mode "${mode.name}": render.${element} must be "block-based" or "text-based".`);
      } else if (!codeElementNames.has(element)) {
        // A code element the mode does not list yet still counts: setModeElements() can add it.
        warnings.push(
          `Mode "${mode.name}": render.${element} names no code element — it changes nothing.`,
        );
      }
    }
  }
  for (const preset of presets ?? []) {
    const toolbox: unknown = preset.toolbox;
    if (typeof toolbox === "object" && toolbox !== null) {
      const { mode, render } = toolbox as { mode?: string; render?: Record<string, string> };
      const example = Object.keys(render ?? {})[0] ?? "python";
      errors.push(
        `Preset "${preset.name}": the toolbox entry is a mode name since 0.4.0, and its "render" moved into the mode: ` +
          `"toolbox": "${mode ?? "<mode>"}", and on that mode "render": { "${example}": "text-based" }.`,
      );
    }
  }

  // (8c) Block sets name blocks and other sets; presets name block sets.
  const resolvedSets = resolveBlockSets(blockSets, (identifier) => definitions.has(identifier));
  errors.push(...resolvedSets.errors);
  warnings.push(...resolvedSets.warnings);
  for (const preset of presets ?? []) {
    if (preset.blockSet !== undefined && !blockSets?.[preset.blockSet]) {
      errors.push(`Preset "${preset.name}": blockSet "${preset.blockSet}" is no block set.`);
    }
  }

  // (9) Code section keys must be code elements or their settings never apply.
  for (const key of Object.keys(code ?? {})) {
    if (!codeElementNames.has(key)) {
      warnings.push(
        `code["${key}"] is not a code element — its settings will never apply.`,
      );
    }
  }

  // (10) Cross-namespace name collisions. A name reused as an element, a mode,
  // a preset, a view and/or a category is legal (they're separate maps) but
  // easy to confuse — e.g. a mode named after its source element makes
  // `python` mean three things.
  const namespacesByName = new Map<string, Set<string>>();
  const noteName = (name: string, namespace: string): void => {
    const set = namespacesByName.get(name) ?? new Set<string>();
    set.add(namespace);
    namespacesByName.set(name, set);
  };
  for (const name of declaredElementNames) noteName(name, "element");
  for (const mode of modes ?? []) noteName(mode.name, "mode");
  for (const preset of presets ?? []) noteName(preset.name, "preset");
  for (const view of views ?? []) noteName(view, "view");
  for (const category of categories ?? []) noteName(category.name, "category");
  for (const name of Object.keys(blockSets ?? {})) noteName(name, "block set");
  for (const [name, namespaces] of namespacesByName) {
    if (namespaces.size > 1) {
      warnings.push(
        `Name "${name}" is used as ${[...namespaces].sort().join(" and ")} — reusing a name ` +
          `across element / mode / preset / view / category / block set is allowed but confusing; consider distinct names.`,
      );
    }
    // (11) A class keeps the name as written, except what a class cannot hold;
    // the app's CSS then needs the changed name. Category labels may have
    // spaces, and block sets get no class.
    const kinds = [...namespaces].filter((kind) => kind !== "category" && kind !== "block set");
    if (kinds.length > 0 && /[^A-Za-z0-9_-]/.test(name)) {
      warnings.push(
        `Name "${name}" (${kinds.sort().join(", ")}) has characters a CSS class cannot hold; ` +
          `its classes use "${toModeClassToken(name)}".`,
      );
    }
    // (12) A framework word as a name reads like the framework's own thing.
    const word = name.toLowerCase();
    if (FRAMEWORK_WORDS.includes(word)) {
      warnings.push(
        `Name "${name}" (${[...namespaces].sort().join(", ")}) is a Morphic Blocks word — name it after what it is ` +
          `in your app (e.g. "python", "icon-tiles", "editor-pane").`,
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

const ELEMENT_TYPES: readonly string[] = ["text", "code", "image", "custom"];

/** Words the framework uses for its own things; as a developer's name they confuse readers. */
const FRAMEWORK_WORDS: readonly string[] = [
  "workspace", "codespace", "preview", "toolbox", "mode", "preset", "view", "element",
  "block", "blocks", "blockset", "block-set", "tile", "tiles", "category", ...ELEMENT_TYPES,
];
const SLOT_KINDS: readonly string[] = ["value", "statement"];
const FIELD_TYPES: readonly string[] = ["dropdown", "reference", "text", "number", "checkbox"];

function fmtIndices(set: Set<number>): string {
  const list = [...set].sort((x, y) => x - y);
  return list.length ? list.map((n) => `%${n}`).join(" ") : "(none)";
}
