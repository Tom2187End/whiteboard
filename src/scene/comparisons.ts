import {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "../element/types";

import { getElementAbsoluteCoords } from "../element";

export const hasBackground = (type: string) =>
  type === "rectangle" ||
  type === "ellipse" ||
  type === "diamond" ||
  type === "draw" ||
  type === "line";

export const hasStroke = (type: string) =>
  type === "rectangle" ||
  type === "ellipse" ||
  type === "diamond" ||
  type === "arrow" ||
  type === "draw" ||
  type === "line";

export const canChangeSharpness = (type: string) =>
  type === "rectangle" ||
  type === "arrow" ||
  type === "draw" ||
  type === "line";

export const hasText = (type: string) => type === "text";

export const getElementAtPosition = (
  elements: readonly NonDeletedExcalidrawElement[],
  isAtPositionFn: (element: NonDeletedExcalidrawElement) => boolean,
) => {
  let hitElement = null;
  // We need to to hit testing from front (end of the array) to back (beginning of the array)
  for (let i = elements.length - 1; i >= 0; --i) {
    const element = elements[i];
    if (element.isDeleted) {
      continue;
    }
    if (isAtPositionFn(element)) {
      hitElement = element;
      break;
    }
  }

  return hitElement;
};

export const getElementContainingPosition = (
  elements: readonly ExcalidrawElement[],
  x: number,
  y: number,
) => {
  let hitElement = null;
  // We need to to hit testing from front (end of the array) to back (beginning of the array)
  for (let i = elements.length - 1; i >= 0; --i) {
    if (elements[i].isDeleted) {
      continue;
    }
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(elements[i]);
    if (x1 < x && x < x2 && y1 < y && y < y2) {
      hitElement = elements[i];
      break;
    }
  }
  return hitElement;
};
