import * as GA from "./ga";
import * as GALine from "./galines";
import { Point, Line, join } from "./ga";

/**
 * TODO: docs
 */

export function from([x, y]: readonly [number, number]): Point {
  return [0, 0, 0, 0, y, x, 1, 0];
}

export function toTuple(point: Point): [number, number] {
  return [point[5], point[4]];
}

export function abs(point: Point): Point {
  return [0, 0, 0, 0, Math.abs(point[4]), Math.abs(point[5]), 1, 0];
}

export function intersect(line1: Line, line2: Line): Point {
  return GA.normalized(GA.meet(line1, line2));
}

// Projects `point` onto the `line`.
// The returned point is the closest point on the `line` to the `point`.
export function project(point: Point, line: Line): Point {
  return intersect(GALine.orthogonal(line, point), line);
}

export function distance(point1: Point, point2: Point): number {
  return GA.norm(join(point1, point2));
}

export function distanceToLine(point: Point, line: Line): number {
  return GA.joinScalar(point, line);
}
