import { distanceBetweenPointAndSegment } from "../math";

import { ExcalidrawElement } from "./types";
import {
  getArrowPoints,
  getDiamondPoints,
  getElementAbsoluteCoords
} from "./bounds";

export function hitTest(
  element: ExcalidrawElement,
  x: number,
  y: number
): boolean {
  // For shapes that are composed of lines, we only enable point-selection when the distance
  // of the click is less than x pixels of any of the lines that the shape is composed of
  const lineThreshold = 10;

  if (element.type === "ellipse") {
    // https://stackoverflow.com/a/46007540/232122
    const px = Math.abs(x - element.x - element.width / 2);
    const py = Math.abs(y - element.y - element.height / 2);

    let tx = 0.707;
    let ty = 0.707;

    const a = Math.abs(element.width) / 2;
    const b = Math.abs(element.height) / 2;

    [0, 1, 2, 3].forEach(x => {
      const xx = a * tx;
      const yy = b * ty;

      const ex = ((a * a - b * b) * tx ** 3) / a;
      const ey = ((b * b - a * a) * ty ** 3) / b;

      const rx = xx - ex;
      const ry = yy - ey;

      const qx = px - ex;
      const qy = py - ey;

      const r = Math.hypot(ry, rx);
      const q = Math.hypot(qy, qx);

      tx = Math.min(1, Math.max(0, ((qx * r) / q + ex) / a));
      ty = Math.min(1, Math.max(0, ((qy * r) / q + ey) / b));
      const t = Math.hypot(ty, tx);
      tx /= t;
      ty /= t;
    });

    if (element.backgroundColor !== "transparent") {
      return (
        a * tx - (px - lineThreshold) >= 0 && b * ty - (py - lineThreshold) >= 0
      );
    } else {
      return Math.hypot(a * tx - px, b * ty - py) < lineThreshold;
    }
  } else if (element.type === "rectangle") {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element);

    if (element.backgroundColor !== "transparent") {
      return (
        x > x1 - lineThreshold &&
        x < x2 + lineThreshold &&
        y > y1 - lineThreshold &&
        y < y2 + lineThreshold
      );
    }

    // (x1, y1) --A-- (x2, y1)
    //    |D             |B
    // (x1, y2) --C-- (x2, y2)
    return (
      distanceBetweenPointAndSegment(x, y, x1, y1, x2, y1) < lineThreshold || // A
      distanceBetweenPointAndSegment(x, y, x2, y1, x2, y2) < lineThreshold || // B
      distanceBetweenPointAndSegment(x, y, x2, y2, x1, y2) < lineThreshold || // C
      distanceBetweenPointAndSegment(x, y, x1, y2, x1, y1) < lineThreshold // D
    );
  } else if (element.type === "diamond") {
    x -= element.x;
    y -= element.y;

    let [
      topX,
      topY,
      rightX,
      rightY,
      bottomX,
      bottomY,
      leftX,
      leftY
    ] = getDiamondPoints(element);

    if (element.backgroundColor !== "transparent") {
      // TODO: remove this when we normalize coordinates globally
      if (topY > bottomY) [bottomY, topY] = [topY, bottomY];
      if (rightX < leftX) [leftX, rightX] = [rightX, leftX];

      topY -= lineThreshold;
      bottomY += lineThreshold;
      leftX -= lineThreshold;
      rightX += lineThreshold;

      // all deltas should be < 0. Delta > 0 indicates it's on the outside side
      //  of the line.
      //
      //          (topX, topY)
      //     D  /             \ A
      //      /               \
      //  (leftX, leftY)  (rightX, rightY)
      //    C \               / B
      //      \              /
      //      (bottomX, bottomY)
      //
      // https://stackoverflow.com/a/2752753/927631
      return (
        // delta from line D
        (leftX - topX) * (y - leftY) - (leftX - x) * (topY - leftY) <= 0 &&
        // delta from line A
        (topX - rightX) * (y - rightY) - (x - rightX) * (topY - rightY) <= 0 &&
        // delta from line B
        (rightX - bottomX) * (y - bottomY) -
          (x - bottomX) * (rightY - bottomY) <=
          0 &&
        // delta from line C
        (bottomX - leftX) * (y - leftY) - (x - leftX) * (bottomY - leftY) <= 0
      );
    }

    return (
      distanceBetweenPointAndSegment(x, y, topX, topY, rightX, rightY) <
        lineThreshold ||
      distanceBetweenPointAndSegment(x, y, rightX, rightY, bottomX, bottomY) <
        lineThreshold ||
      distanceBetweenPointAndSegment(x, y, bottomX, bottomY, leftX, leftY) <
        lineThreshold ||
      distanceBetweenPointAndSegment(x, y, leftX, leftY, topX, topY) <
        lineThreshold
    );
  } else if (element.type === "arrow") {
    let [x1, y1, x2, y2, x3, y3, x4, y4] = getArrowPoints(element);
    // The computation is done at the origin, we need to add a translation
    x -= element.x;
    y -= element.y;

    return (
      //    \
      distanceBetweenPointAndSegment(x, y, x3, y3, x2, y2) < lineThreshold ||
      // -----
      distanceBetweenPointAndSegment(x, y, x1, y1, x2, y2) < lineThreshold ||
      //    /
      distanceBetweenPointAndSegment(x, y, x4, y4, x2, y2) < lineThreshold
    );
  } else if (element.type === "text") {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element);

    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  } else if (element.type === "selection") {
    console.warn("This should not happen, we need to investigate why it does.");
    return false;
  } else {
    throw new Error("Unimplemented type " + element.type);
  }
}
