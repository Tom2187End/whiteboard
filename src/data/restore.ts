import { Point } from "../types";

import {
  ExcalidrawElement,
  ExcalidrawTextElement,
  FontFamily,
} from "../element/types";
import { AppState } from "../types";
import { DataState } from "./types";
import {
  isInvisiblySmallElement,
  normalizeDimensions,
  isTextElement,
} from "../element";
import { calculateScrollCenter } from "../scene";
import { randomId } from "../random";
import { DEFAULT_TEXT_ALIGN, DEFAULT_FONT_FAMILY } from "../appState";
import { FONT_FAMILY } from "../constants";

const getFontFamilyByName = (fontFamilyName: string): FontFamily => {
  for (const [id, fontFamilyString] of Object.entries(FONT_FAMILY)) {
    if (fontFamilyString.includes(fontFamilyName)) {
      return parseInt(id) as FontFamily;
    }
  }
  return DEFAULT_FONT_FAMILY;
};

export const restore = (
  // we're making the elements mutable for this API because we want to
  //  efficiently remove/tweak properties on them (to migrate old scenes)
  savedElements: readonly Mutable<ExcalidrawElement>[],
  savedState: AppState | null,
  opts?: { scrollToContent: boolean },
): DataState => {
  const elements = savedElements
    .filter((el) => {
      // filtering out selection, which is legacy, no longer kept in elements,
      //  and causing issues if retained
      return el.type !== "selection" && !isInvisiblySmallElement(el);
    })
    .map((element) => {
      let points: Point[] = [];
      if (element.type === "arrow") {
        if (Array.isArray(element.points)) {
          // if point array is empty, add one point to the arrow
          // this is used as fail safe to convert incoming data to a valid
          // arrow. In the new arrow, width and height are not being usde
          points = element.points.length > 0 ? element.points : [[0, 0]];
        } else {
          // convert old arrow type to a new one
          // old arrow spec used width and height
          // to determine the endpoints
          points = [
            [0, 0],
            [element.width, element.height],
          ];
        }
        element.points = points;
      } else if (element.type === "line" || element.type === "draw") {
        // old spec, pre-arrows
        // old spec, post-arrows
        if (!Array.isArray(element.points) || element.points.length === 0) {
          points = [
            [0, 0],
            [element.width, element.height],
          ];
        } else {
          points = element.points;
        }
        element.points = points;
      } else {
        if (isTextElement(element)) {
          if ("font" in element) {
            const [fontPx, fontFamily]: [
              string,
              string,
            ] = (element as any).font.split(" ");
            (element as Mutable<ExcalidrawTextElement>).fontSize = parseInt(
              fontPx,
              10,
            );
            (element as Mutable<
              ExcalidrawTextElement
            >).fontFamily = getFontFamilyByName(fontFamily);
            delete (element as any).font;
          }
          if (!element.textAlign) {
            element.textAlign = DEFAULT_TEXT_ALIGN;
          }
        }

        normalizeDimensions(element);
        // old spec, where non-linear elements used to have empty points arrays
        if ("points" in element) {
          delete element.points;
        }
      }

      return {
        ...element,
        // all elements must have version > 0 so getDrawingVersion() will pick
        //  up newly added elements
        version: element.version || 1,
        id: element.id || randomId(),
        isDeleted: false,
        fillStyle: element.fillStyle || "hachure",
        strokeWidth: element.strokeWidth || 1,
        strokeStyle: element.strokeStyle ?? "solid",
        roughness: element.roughness ?? 1,
        opacity:
          element.opacity === null || element.opacity === undefined
            ? 100
            : element.opacity,
        angle: element.angle ?? 0,
        groupIds: element.groupIds || [],
      };
    });

  if (opts?.scrollToContent && savedState) {
    savedState = { ...savedState, ...calculateScrollCenter(elements) };
  }

  return {
    elements: elements,
    appState: savedState,
  };
};
