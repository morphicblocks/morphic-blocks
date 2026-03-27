import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MdPrint,
  MdCallSplit,
  MdLoop,
  MdCalculate,
  MdCompare,
  MdPin,
  MdTextFields,
  MdToggleOn,
  MdEditNote,
  MdDataObject,
} from "react-icons/md";

type IconProps = { size?: number; color?: string };

function imgTag(Icon: ComponentType<IconProps>): string {
  const svg = renderToStaticMarkup(
    createElement(Icon, { size: 16, color: "white" }),
  );
  return `<img src="data:image/svg+xml,${encodeURIComponent(svg)}" width="16" height="16">`;
}

export const blockIcons: Record<string, string> = {
  text_print: imgTag(MdPrint),
  logic_if: imgTag(MdCallSplit),
  loop_for: imgTag(MdLoop),
  math_arithmetic: imgTag(MdCalculate),
  logic_compare: imgTag(MdCompare),
  math_number: imgTag(MdPin),
  text_value: imgTag(MdTextFields),
  logic_boolean: imgTag(MdToggleOn),
  var_declare: imgTag(MdEditNote),
  var_get: imgTag(MdDataObject),
};
