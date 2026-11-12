import * as Blockly from "blockly";
import { toBlocklyType, toCleanId } from "./block-namespace";

/**
 * A declared dropdown whose open menu carries classes for app CSS:
 * `morphic-menu` and `morphic-menu-<FIELD>` (the field's name), e.g. to lay
 * picture choices out in a grid or hide the check marks.
 */
export class MorphicDropdown extends Blockly.FieldDropdown {
  protected override showEditor_(event?: MouseEvent): void {
    super.showEditor_(event);
    const menu = this.menu_?.getElement();
    menu?.classList.add("morphic-menu");
    if (this.name) menu?.classList.add(`morphic-menu-${this.name}`);
  }
}

/** The parts of a reference's target, `"class_define.NAME"`: a block and one of its fields. */
export function parseReferenceTarget(target: unknown): { block: string; field: string } | null {
  if (typeof target !== "string") return null;
  const dot = target.lastIndexOf(".");
  if (dot <= 0 || dot === target.length - 1) return null;
  return { block: target.slice(0, dot), field: target.slice(dot + 1) };
}

/**
 * A reference field (`{ "type": "reference", "to": "class_define.NAME" }`): a
 * dropdown of the names the program declares, i.e. what the `NAME` field of
 * every `class_define` block holds. Its value is the name itself, so text
 * views, generated code and saved programs read it like any other field. A
 * name whose declaration is gone stays as it is.
 */
export class MorphicReference extends MorphicDropdown {
  private readonly targets: { block: string; field: string }[];

  constructor(
    to: string | string[],
    private readonly initial = "",
  ) {
    // Blockly asks for the options while it builds the field, before `targets` is set.
    super(function (this: Blockly.FieldDropdown) {
      return (this as MorphicReference).nameOptions(initial);
    });
    this.targets = (Array.isArray(to) ? to : [to])
      .map(parseReferenceTarget)
      .filter((target) => target !== null);
  }

  /** Whether this field lists what `field` of `block` (a clean identifier) declares. */
  refersTo(block: string, field: string): boolean {
    return this.targets.some((target) => target.block === block && target.field === field);
  }

  /** The names the program declares for this field, each once, in alphabetical order. */
  declaredNames(): string[] {
    const workspace = this.getSourceBlock()?.workspace;
    if (!workspace) return [];
    const names = new Set<string>();
    for (const target of this.targets ?? []) {
      for (const block of workspace.getBlocksByType(toBlocklyType(target.block), false)) {
        if (block.isInsertionMarker()) continue;
        const name = block.getFieldValue(target.field);
        if (typeof name === "string" && name !== "") names.add(name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  /**
   * A new reference that names nothing declared takes the first declared
   * name. One that was set to something else is left alone.
   */
  pickDeclared(): void {
    const names = this.declaredNames();
    const value = this.getValue() ?? "";
    if (names.length === 0 || names.includes(value)) return;
    if (value === "" || value === this.initial) this.setValue(names[0]);
  }

  private nameOptions(initial: string): Blockly.MenuOption[] {
    const names = this.declaredNames();
    const value = this.getValue() ?? initial;
    if (!names.includes(value)) names.push(value);
    return names.map((name) => [name, name]);
  }

  /** The names change with the program, so they are never read from a cache. */
  override getOptions(): Blockly.MenuOption[] {
    return super.getOptions(false);
  }

  /** Any name is kept: its declaration may be loaded later, or be gone. */
  protected override doClassValidation_(newValue?: string): string | null {
    return typeof newValue === "string" ? newValue : null;
  }
}

function referencesIn(workspace: Blockly.Workspace, blocks: Blockly.Block[] = workspace.getAllBlocks(false)): MorphicReference[] {
  return blocks.flatMap((block) =>
    block.inputList.flatMap((input) => input.fieldRow.filter((field) => field instanceof MorphicReference)),
  );
}

/**
 * Keep a program's references in step with its declarations: a renamed
 * declaration renames the references that named it (unless another
 * declaration still has the old name), and a new reference takes a declared
 * name. The changes join the edit that caused them, so one undo takes both back.
 */
export function keepReferencesInStep(workspace: Blockly.Workspace): void {
  workspace.addChangeListener((event) => {
    const inGroup = (change: () => void) => {
      const group = Blockly.Events.getGroup();
      Blockly.Events.setGroup(event.group || group);
      try {
        change();
      } finally {
        Blockly.Events.setGroup(group);
      }
    };

    if (event.type === Blockly.Events.BLOCK_CREATE) {
      const blocks = ((event as Blockly.Events.BlockCreate).ids ?? [])
        .map((id) => workspace.getBlockById(id))
        .filter((block) => block !== null);
      inGroup(() => referencesIn(workspace, blocks).forEach((reference) => reference.pickDeclared()));
      return;
    }

    if (event.type !== Blockly.Events.BLOCK_CHANGE) return;
    const change = event as Blockly.Events.BlockChange;
    const block = change.blockId ? workspace.getBlockById(change.blockId) : null;
    if (change.element !== "field" || !change.name || !block) return;
    const oldName = String(change.oldValue ?? "");
    const newName = String(change.newValue ?? "");
    if (oldName === newName) return;
    const declares = toCleanId(block.type);
    inGroup(() => {
      for (const reference of referencesIn(workspace)) {
        if (!reference.refersTo(declares, change.name!) || reference.getValue() !== oldName) continue;
        if (!reference.declaredNames().includes(oldName)) reference.setValue(newName);
      }
    });
  });
}
