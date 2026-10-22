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
  /**
   * Pixels an arrow key moves the divider; with Shift five times as far.
   * Default 10. Home and End go to `min` and `max`.
   */
  step?: number;
}

export interface MorphicResizeHandle {
  dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Make `gutter` drag-resize `opts.target`, with the pointer or the keyboard.
 * Returns a handle whose `dispose()` detaches the listeners.
 */
export function makeResizable(
  gutter: HTMLElement,
  opts: MorphicResizeOptions,
): MorphicResizeHandle {
  const { target, axis, invert = false, onResize } = opts;
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  const step = opts.step ?? 10;

  const sizeNow = (): number => {
    const rect = target.getBoundingClientRect();
    return axis === "x" ? rect.width : rect.height;
  };
  // Screen readers announce the divider and the pane's size in pixels; a
  // divider between panes side by side stands upright.
  const announce = (size: number): void => gutter.setAttribute("aria-valuenow", String(Math.round(size)));
  gutter.setAttribute("role", "separator");
  gutter.setAttribute("aria-orientation", axis === "x" ? "vertical" : "horizontal");
  gutter.setAttribute("aria-valuemin", String(min));
  if (Number.isFinite(max)) gutter.setAttribute("aria-valuemax", String(max));
  if (target.id && !gutter.hasAttribute("aria-controls")) gutter.setAttribute("aria-controls", target.id);
  announce(sizeNow());

  const resizeTo = (wanted: number): void => {
    const size = clamp(wanted, min, max);
    target.style.flexBasis = `${size}px`;
    announce(size);
    onResize?.(size);
  };

  const onPointerDown = (down: PointerEvent): void => {
    // Primary button only.
    if (down.button !== 0) return;
    down.preventDefault();

    const startSize = sizeNow();
    const startPos = axis === "x" ? down.clientX : down.clientY;

    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";

    gutter.setPointerCapture(down.pointerId);

    const onMove = (move: PointerEvent): void => {
      const pos = axis === "x" ? move.clientX : move.clientY;
      const delta = pos - startPos;
      resizeTo(startSize + (invert ? -delta : delta));
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

  // The keyboard moves the divider too: the arrow keys along its axis, a
  // larger step with Shift, Home and End to the limits.
  const [back, forward] = axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  const onKeyDown = (key: KeyboardEvent): void => {
    const distance = key.shiftKey ? step * 5 : step;
    if (key.key === back || key.key === forward) {
      const toward = key.key === forward ? distance : -distance;
      resizeTo(sizeNow() + (invert ? -toward : toward));
    } else if (key.key === "Home") {
      resizeTo(min);
    } else if (key.key === "End" && Number.isFinite(max)) {
      resizeTo(max);
    } else {
      return;
    }
    key.preventDefault();
  };
  // Reachable with Tab unless the host decided otherwise.
  if (!gutter.hasAttribute("tabindex")) gutter.tabIndex = 0;

  gutter.addEventListener("pointerdown", onPointerDown);
  gutter.addEventListener("keydown", onKeyDown);

  return {
    dispose: () => {
      gutter.removeEventListener("pointerdown", onPointerDown);
      gutter.removeEventListener("keydown", onKeyDown);
    },
  };
}
