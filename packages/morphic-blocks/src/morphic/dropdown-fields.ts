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
  private readonly scopes: string[];

  constructor(
    to: string | string[],
    private readonly initial = "",
    scope: string | string[] = [],
  ) {
    // Blockly asks for the options while it builds the field, before `targets` is set.
    super(function (this: Blockly.FieldDropdown) {
      return (this as MorphicReference).nameOptions(initial);
    });
    this.targets = (Array.isArray(to) ? to : [to])
      .map(parseReferenceTarget)
      .filter((target) => target !== null);
    this.scopes = (Array.isArray(scope) ? scope : [scope]).map(toBlocklyType);
  }

  /** Whether this field lists what `field` of `declaration` holds: a target of it, and in its scope. */
  refersTo(declaration: Blockly.Block, field: string): boolean {
    const type = toCleanId(declaration.type);
    return this.targets.some((target) => target.block === type && target.field === field) && this.sees(declaration);
  }

  /**
   * The block a scoped reference looks inside: the nearest block around it
   * of a `scope` type (the class around `self.name`). `undefined` without a
   * scope, `null` when no such block is around it.
   */
  private scopeBlock(): Blockly.Block | null | undefined {
    if (!this.scopes?.length) return undefined;
    let around = this.getSourceBlock()?.getSurroundParent() ?? null;
    while (around && !this.scopes.includes(around.type)) around = around.getSurroundParent();
    return around;
  }

  /** Whether the field lists only what a block around it holds. */
  isScoped(): boolean {
    return this.scopes.length > 0;
  }

  /** Whether a declaration is one this reference may name: anywhere, or inside its scope block. */
  private sees(declaration: Blockly.Block, scope = this.scopeBlock()): boolean {
    if (scope === undefined) return true;
    for (let around = declaration.getSurroundParent(); around; around = around.getSurroundParent()) {
      if (around === scope) return true;
    }
    return false;
  }

  /**
   * The names the program declares for this field, each once, in alphabetical
   * order. `known` keeps the lists of one pass over many references, which
   * mostly ask for the same one.
   */
  declaredNames(known?: Map<string, string[]>): string[] {
    const workspace = this.getSourceBlock()?.workspace;
    if (!workspace) return [];
    const scope = this.scopeBlock();
    const key = `${scope === undefined ? "" : (scope?.id ?? "-")}|${(this.targets ?? []).map((target) => `${target.block}.${target.field}`).join(",")}`;
    const listed = known?.get(key);
    if (listed) return listed;
    const names = new Set<string>();
    for (const target of this.targets ?? []) {
      for (const block of workspace.getBlocksByType(toBlocklyType(target.block), false)) {
        if (block.isInsertionMarker() || !this.sees(block, scope)) continue;
        const name = block.getFieldValue(target.field);
        if (typeof name === "string" && name !== "") names.add(name);
      }
    }
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    known?.set(key, sorted);
    return sorted;
  }

  /** Whether the name is one nothing declares (its declaration was deleted, or never made). */
  isMissing(known?: Map<string, string[]>): boolean {
    return !this.declaredNames(known).includes(this.getValue() ?? "");
  }

  /** Mark the field with `morphic-reference-missing` while its name is one nothing declares. */
  showMissing(known?: Map<string, string[]>): void {
    this.fieldGroup_?.classList.toggle("morphic-reference-missing", this.isMissing(known));
  }

  override initView(): void {
    super.initView();
    this.showMissing();
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

  protected override doValueUpdate_(newValue: string): void {
    super.doValueUpdate_(newValue);
    this.showMissing();
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
 * declaration still has the old name), a reference that is new or moved
 * takes a declared name when its own names nothing, and every reference
 * shows whether its name is declared. The changes join the edit that caused
 * them, so one undo takes both back.
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

    // Only these change which names exist or which a reference can see.
    const kinds: string[] = [
      Blockly.Events.BLOCK_CREATE,
      Blockly.Events.BLOCK_DELETE,
      Blockly.Events.BLOCK_CHANGE,
      Blockly.Events.BLOCK_MOVE,
    ];
    if (event.isUiEvent || !kinds.includes(event.type)) return;
    const references = referencesIn(workspace);
    if (references.length === 0) return;
    const showMissing = (): void => {
      const known = new Map<string, string[]>();
      for (const reference of references) reference.showMissing(known);
    };
    // An undo, a redo or a loaded program brings its own names; only a
    // person's edit is followed by changes.
    if (!event.recordUndo) {
      showMissing();
      return;
    }

    if (event.type === Blockly.Events.BLOCK_CREATE) {
      const blocks = ((event as Blockly.Events.BlockCreate).ids ?? [])
        .map((id) => workspace.getBlockById(id))
        .filter((block) => block !== null);
      inGroup(() => referencesIn(workspace, blocks).forEach((reference) => reference.pickDeclared()));
    }

    if (event.type === Blockly.Events.BLOCK_MOVE) {
      // A block put into another one (not merely moved on the canvas): a
      // scoped reference in it sees other names in its new class or function.
      const move = event as Blockly.Events.BlockMove;
      const moved = move.newParentId !== move.oldParentId ? workspace.getBlockById(move.blockId ?? "") : null;
      if (moved) {
        inGroup(() => {
          for (const reference of referencesIn(workspace, moved.getDescendants(false))) {
            if (reference.isScoped()) reference.pickDeclared();
          }
        });
      }
    }

    if (event.type === Blockly.Events.BLOCK_CHANGE) {
      const change = event as Blockly.Events.BlockChange;
      const block = change.blockId ? workspace.getBlockById(change.blockId) : null;
      const oldName = String(change.oldValue ?? "");
      const newName = String(change.newValue ?? "");
      if (change.element === "field" && change.name && block && oldName !== newName) {
        inGroup(() => {
          for (const reference of references) {
            if (!reference.refersTo(block, change.name!) || reference.getValue() !== oldName) continue;
            if (!reference.declaredNames().includes(oldName)) reference.setValue(newName);
          }
        });
      }
    }

    showMissing();
  });
}
