import { ExcalidrawElement } from "./types";
import { rotate } from "../math";
import { Drawable } from "roughjs/bin/core";
import { Point } from "roughjs/bin/geometry";

// If the element is created from right to left, the width is going to be negative
// This set of functions retrieves the absolute position of the 4 points.
export function getElementAbsoluteCoords(element: ExcalidrawElement) {
  if (element.type === "arrow" || element.type === "line") {
    return getLinearElementAbsoluteBounds(element);
  }
  return [
    element.x,
    element.y,
    element.x + element.width,
    element.y + element.height,
  ];
}

export function getDiamondPoints(element: ExcalidrawElement) {
  // Here we add +1 to avoid these numbers to be 0
  // otherwise rough.js will throw an error complaining about it
  const topX = Math.floor(element.width / 2) + 1;
  const topY = 0;
  const rightX = element.width;
  const rightY = Math.floor(element.height / 2) + 1;
  const bottomX = topX;
  const bottomY = element.height;
  const leftX = topY;
  const leftY = rightY;

  return [topX, topY, rightX, rightY, bottomX, bottomY, leftX, leftY];
}

export function getLinearElementAbsoluteBounds(element: ExcalidrawElement) {
  if (element.points.length < 2 || !element.shape) {
    const { minX, minY, maxX, maxY } = element.points.reduce(
      (limits, [x, y]) => {
        limits.minY = Math.min(limits.minY, y);
        limits.minX = Math.min(limits.minX, x);

        limits.maxX = Math.max(limits.maxX, x);
        limits.maxY = Math.max(limits.maxY, y);

        return limits;
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    return [
      minX + element.x,
      minY + element.y,
      maxX + element.x,
      maxY + element.y,
    ];
  }

  const shape = element.shape as Drawable[];

  // first element is always the curve
  const ops = shape[0].sets[0].ops;

  let currentP: Point = [0, 0];

  const { minX, minY, maxX, maxY } = ops.reduce(
    (limits, { op, data }) => {
      // There are only four operation types:
      // move, bcurveTo, lineTo, and curveTo
      if (op === "move") {
        // change starting point
        currentP = data as Point;
        // move operation does not draw anything; so, it always
        // returns false
      } else if (op === "bcurveTo") {
        // create points from bezier curve
        // bezier curve stores data as a flattened array of three positions
        // [x1, y1, x2, y2, x3, y3]
        const p1 = [data[0], data[1]] as Point;
        const p2 = [data[2], data[3]] as Point;
        const p3 = [data[4], data[5]] as Point;

        const p0 = currentP;
        currentP = p3;

        const equation = (t: number, idx: number) =>
          Math.pow(1 - t, 3) * p3[idx] +
          3 * t * Math.pow(1 - t, 2) * p2[idx] +
          3 * Math.pow(t, 2) * (1 - t) * p1[idx] +
          p0[idx] * Math.pow(t, 3);

        let t = 0;
        while (t <= 1.0) {
          const x = equation(t, 0);
          const y = equation(t, 1);

          limits.minY = Math.min(limits.minY, y);
          limits.minX = Math.min(limits.minX, x);

          limits.maxX = Math.max(limits.maxX, x);
          limits.maxY = Math.max(limits.maxY, y);

          t += 0.1;
        }
      } else if (op === "lineTo") {
        // TODO: Implement this
      } else if (op === "qcurveTo") {
        // TODO: Implement this
      }
      return limits;
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  return [
    minX + element.x,
    minY + element.y,
    maxX + element.x,
    maxY + element.y,
  ];
}

export function getArrowPoints(element: ExcalidrawElement) {
  const points = element.points;
  const [x1, y1] = points.length >= 2 ? points[points.length - 2] : [0, 0];
  const [x2, y2] = points[points.length - 1];

  const size = 30; // pixels
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const arrowLength = element.points.reduce((total, [cx, cy], idx, points) => {
    const [px, py] = idx > 0 ? points[idx - 1] : [0, 0];
    return total + Math.hypot(cx - px, cy - py);
  }, 0);

  // Scale down the arrow until we hit a certain size so that it doesn't look weird
  // This value is selected by minizing a minmum size with the whole length of the arrow
  // intead of last segment of the arrow
  const minSize = Math.min(size, arrowLength / 2);
  const xs = x2 - ((x2 - x1) / distance) * minSize;
  const ys = y2 - ((y2 - y1) / distance) * minSize;

  const angle = 20; // degrees
  const [x3, y3] = rotate(xs, ys, x2, y2, (-angle * Math.PI) / 180);
  const [x4, y4] = rotate(xs, ys, x2, y2, (angle * Math.PI) / 180);

  return [x2, y2, x3, y3, x4, y4];
}

export function getCommonBounds(elements: readonly ExcalidrawElement[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  elements.forEach(element => {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element);
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  });

  return [minX, minY, maxX, maxY];
}
