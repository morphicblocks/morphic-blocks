import type { MorphicHighlightDefinition } from "./types";

type Extension = import("@codemirror/state").Extension;

/**
 * Build a set of CodeMirror extensions that token-highlight the visible
 * viewport according to the given rules. Implementation deliberately uses a
 * `ViewPlugin` + `Decoration.mark` instead of a `StreamLanguage` so we don't
 * accidentally pull in language services (bracket matching, indent, etc.) —
 * the codespace is a rendered view of the block model, not a freeform editor.
 *
 * Returns an empty array when `rules` is falsy, so callers can pass the
 * result through a `Compartment` unconditionally.
 */
export function buildHighlightExtensions(
  cmView: typeof import("@codemirror/view"),
  cmState: typeof import("@codemirror/state"),
  rules: MorphicHighlightDefinition | undefined,
): Extension[] {
  if (!rules) return [];

  const keywordSet = new Set(rules.keywords ?? []);
  const stringDelims = rules.strings ?? [];
  const lineComment = rules.comment;
  const numbers = rules.numbers !== false;

  const markKw = cmView.Decoration.mark({ class: "morphic-tok-keyword" });
  const markStr = cmView.Decoration.mark({ class: "morphic-tok-string" });
  const markNum = cmView.Decoration.mark({ class: "morphic-tok-number" });
  const markCom = cmView.Decoration.mark({ class: "morphic-tok-comment" });

  const tokenize = (
    line: string,
    lineFrom: number,
    builder: import("@codemirror/state").RangeSetBuilder<import("@codemirror/view").Decoration>,
  ): void => {
    const len = line.length;
    let i = 0;
    while (i < len) {
      if (lineComment && line.startsWith(lineComment, i)) {
        builder.add(lineFrom + i, lineFrom + len, markCom);
        return;
      }
      let consumedString = false;
      for (const d of stringDelims) {
        if (line.startsWith(d, i)) {
          const start = i;
          i += d.length;
          while (i < len) {
            if (line[i] === "\\" && i + 1 < len) {
              i += 2;
              continue;
            }
            if (line.startsWith(d, i)) {
              i += d.length;
              break;
            }
            i += 1;
          }
          builder.add(lineFrom + start, lineFrom + i, markStr);
          consumedString = true;
          break;
        }
      }
      if (consumedString) continue;
      if (numbers) {
        const m = /^\d+(?:\.\d+)?/.exec(line.slice(i));
        if (m) {
          builder.add(lineFrom + i, lineFrom + i + m[0].length, markNum);
          i += m[0].length;
          continue;
        }
      }
      const ident = /^[A-Za-z_]\w*/.exec(line.slice(i));
      if (ident) {
        if (keywordSet.has(ident[0])) {
          builder.add(lineFrom + i, lineFrom + i + ident[0].length, markKw);
        }
        i += ident[0].length;
        continue;
      }
      i += 1;
    }
  };

  const build = (
    view: import("@codemirror/view").EditorView,
  ): import("@codemirror/view").DecorationSet => {
    const builder = new cmState.RangeSetBuilder<import("@codemirror/view").Decoration>();
    const doc = view.state.doc;
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const lineRef = doc.lineAt(pos);
        tokenize(lineRef.text, lineRef.from, builder);
        if (lineRef.to >= to) break;
        pos = lineRef.to + 1;
      }
    }
    return builder.finish();
  };

  const plugin = cmView.ViewPlugin.fromClass(
    class {
      decorations: import("@codemirror/view").DecorationSet;
      constructor(view: import("@codemirror/view").EditorView) {
        this.decorations = build(view);
      }
      update(u: import("@codemirror/view").ViewUpdate): void {
        if (u.docChanged || u.viewportChanged) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );

  const baseTheme = cmView.EditorView.baseTheme({
    ".morphic-tok-keyword": { color: "#cc7832" },
    ".morphic-tok-string": { color: "#6a8759" },
    ".morphic-tok-number": { color: "#6897bb" },
    ".morphic-tok-comment": { color: "#808080", fontStyle: "italic" },
  });

  const colors = rules.colors ?? {};
  const overrideSpec: Record<string, Record<string, string>> = {};
  if (colors.keyword) overrideSpec[".morphic-tok-keyword"] = { color: colors.keyword };
  if (colors.string) overrideSpec[".morphic-tok-string"] = { color: colors.string };
  if (colors.number) overrideSpec[".morphic-tok-number"] = { color: colors.number };
  if (colors.comment) overrideSpec[".morphic-tok-comment"] = { color: colors.comment, fontStyle: "italic" };

  const exts: Extension[] = [plugin, baseTheme];
  if (Object.keys(overrideSpec).length > 0) {
    exts.push(cmView.EditorView.theme(overrideSpec));
  }
  return exts;
}
