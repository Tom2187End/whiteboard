import rough from "roughjs/bin/rough";
import oc from "open-color";
import { newTextElement } from "../element";
import { NonDeletedExcalidrawElement } from "../element/types";
import { getCommonBounds } from "../element/bounds";
import { renderScene, renderSceneToSvg } from "../renderer/renderScene";
import { distance, SVG_NS } from "../utils";
import { normalizeScroll } from "./scroll";
import { AppState } from "../types";
import { t } from "../i18n";
import { DEFAULT_FONT_FAMILY, DEFAULT_VERTICAL_ALIGN } from "../constants";

export const SVG_EXPORT_TAG = `<!-- svg-source:excalidraw -->`;

export const exportToCanvas = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  {
    exportBackground,
    exportPadding = 10,
    viewBackgroundColor,
    scale = 1,
    shouldAddWatermark,
  }: {
    exportBackground: boolean;
    exportPadding?: number;
    scale?: number;
    viewBackgroundColor: string;
    shouldAddWatermark: boolean;
  },
  createCanvas: (width: number, height: number) => any = (width, height) => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width * scale;
    tempCanvas.height = height * scale;
    return tempCanvas;
  },
) => {
  let sceneElements = elements;
  if (shouldAddWatermark) {
    const [, , maxX, maxY] = getCommonBounds(elements);
    sceneElements = [...sceneElements, getWatermarkElement(maxX, maxY)];
  }

  // calculate smallest area to fit the contents in
  const [minX, minY, maxX, maxY] = getCommonBounds(sceneElements);
  const width = distance(minX, maxX) + exportPadding * 2;
  const height =
    distance(minY, maxY) +
    exportPadding +
    (shouldAddWatermark ? 0 : exportPadding);

  const tempCanvas: any = createCanvas(width, height);

  renderScene(
    sceneElements,
    appState,
    null,
    scale,
    rough.canvas(tempCanvas),
    tempCanvas,
    {
      viewBackgroundColor: exportBackground ? viewBackgroundColor : null,
      scrollX: normalizeScroll(-minX + exportPadding),
      scrollY: normalizeScroll(-minY + exportPadding),
      zoom: 1,
      remotePointerViewportCoords: {},
      remoteSelectedElementIds: {},
      shouldCacheIgnoreZoom: false,
      remotePointerUsernames: {},
    },
    {
      renderScrollbars: false,
      renderSelection: false,
      renderOptimizations: false,
      renderGrid: false,
    },
  );

  return tempCanvas;
};

export const exportToSvg = (
  elements: readonly NonDeletedExcalidrawElement[],
  {
    exportBackground,
    exportPadding = 10,
    viewBackgroundColor,
    shouldAddWatermark,
  }: {
    exportBackground: boolean;
    exportPadding?: number;
    viewBackgroundColor: string;
    shouldAddWatermark: boolean;
  },
): SVGSVGElement => {
  let sceneElements = elements;
  if (shouldAddWatermark) {
    const [, , maxX, maxY] = getCommonBounds(elements);
    sceneElements = [...sceneElements, getWatermarkElement(maxX, maxY)];
  }

  // calculate canvas dimensions
  const [minX, minY, maxX, maxY] = getCommonBounds(sceneElements);
  const width = distance(minX, maxX) + exportPadding * 2;
  const height =
    distance(minY, maxY) +
    exportPadding +
    (shouldAddWatermark ? 0 : exportPadding);

  // initialze SVG root
  const svgRoot = document.createElementNS(SVG_NS, "svg");
  svgRoot.setAttribute("version", "1.1");
  svgRoot.setAttribute("xmlns", SVG_NS);
  svgRoot.setAttribute("viewBox", `0 0 ${width} ${height}`);

  svgRoot.innerHTML = `
  ${SVG_EXPORT_TAG}
  <defs>
    <style>
      @font-face {
        font-family: "Virgil";
        src: url("https://excalidraw.com/FG_Virgil.woff2");
      }
      @font-face {
        font-family: "Cascadia";
        src: url("https://excalidraw.com/Cascadia.woff2");
      }
    </style>
  </defs>
  `;

  // render backgroiund rect
  if (exportBackground && viewBackgroundColor) {
    const rect = svgRoot.ownerDocument!.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    rect.setAttribute("width", `${width}`);
    rect.setAttribute("height", `${height}`);
    rect.setAttribute("fill", viewBackgroundColor);
    svgRoot.appendChild(rect);
  }

  const rsvg = rough.svg(svgRoot);
  renderSceneToSvg(sceneElements, rsvg, svgRoot, {
    offsetX: -minX + exportPadding,
    offsetY: -minY + exportPadding,
  });

  return svgRoot;
};

const getWatermarkElement = (maxX: number, maxY: number) => {
  return newTextElement({
    text: t("labels.madeWithExcalidraw"),
    fontSize: 16,
    fontFamily: DEFAULT_FONT_FAMILY,
    textAlign: "right",
    verticalAlign: DEFAULT_VERTICAL_ALIGN,
    x: maxX,
    y: maxY + 16,
    strokeColor: oc.gray[5],
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
  });
};
