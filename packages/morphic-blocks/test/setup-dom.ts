/**
 * jsdom lays nothing out, so the few measuring calls Blockly makes while
 * drawing blocks are answered with fixed sizes. Rendering is not under test;
 * only the generated text is.
 */
HTMLCanvasElement.prototype.getContext = (() => ({
  font: "",
  measureText: (text: string) => ({ width: text.length * 8 }),
})) as unknown as HTMLCanvasElement["getContext"];

Object.assign(SVGElement.prototype, {
  getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  getComputedTextLength: () => 0,
});
