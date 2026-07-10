/**
 * Headless resizable-divider helper. The host supplies a `gutter` element (the
 * draggable divider) and a `target` flex item; dragging the gutter updates the
 * target's `flex-basis` along one axis. Unstyled — the host owns the gutter's
 * appearance and cursor.
 *
 * Every pane in a flex layout is a flex item along its axis, so `flex-basis`
 * is the single property that works for both width (`x`) and height (`y`).
 */
export interface MorphicResizeOptions {
  /** Element whose size changes. Must be a flex item along `axis`. */
  target: HTMLElement;
  /** Resize axis: `"x"` adjusts width, `"y"` adjusts height. */
  axis: "x" | "y";
  /** Lower clamp in pixels. */
  min?: number;
  /** Upper clamp in pixels. */
  max?: number;
  /**
   * Set `true` when the gutter sits *after* the target along the axis (e.g. a
   * gutter to the left of the pane it resizes), so dragging toward the positive
   * axis shrinks the target.
   */
  invert?: boolean;
  /** Called with the new pixel size on every move (e.g. to trigger a reflow). */
  onResize?: (size: number) => void;
}

export interface MorphicResizeHandle {
  dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Make `gutter` drag-resize `opts.target`. Returns a handle whose `dispose()`
 * detaches the listener.
 */
export function makeResizable(
  gutter: HTMLElement,
  opts: MorphicResizeOptions,
): MorphicResizeHandle {
  const { target, axis, invert = false, onResize } = opts;
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.POSITIVE_INFINITY;

  const onPointerDown = (down: PointerEvent): void => {
    // Primary button only.
    if (down.button !== 0) return;
    down.preventDefault();

    const rect = target.getBoundingClientRect();
    const startSize = axis === "x" ? rect.width : rect.height;
    const startPos = axis === "x" ? down.clientX : down.clientY;

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";

    gutter.setPointerCapture(down.pointerId);

    const onMove = (move: PointerEvent): void => {
      const pos = axis === "x" ? move.clientX : move.clientY;
      const delta = pos - startPos;
      const size = clamp(startSize + (invert ? -delta : delta), min, max);
      target.style.flexBasis = `${size}px`;
      onResize?.(size);
    };

    const onUp = (): void => {
      gutter.removeEventListener("pointermove", onMove);
      gutter.removeEventListener("pointerup", onUp);
      gutter.removeEventListener("lostpointercapture", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };

    gutter.addEventListener("pointermove", onMove);
    gutter.addEventListener("pointerup", onUp);
    gutter.addEventListener("lostpointercapture", onUp);
  };

  gutter.addEventListener("pointerdown", onPointerDown);

  return {
    dispose: () => gutter.removeEventListener("pointerdown", onPointerDown),
  };
}
