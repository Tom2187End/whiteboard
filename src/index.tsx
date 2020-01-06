import React from "react";
import ReactDOM from "react-dom";
import rough from "roughjs/bin/wrappers/rough";
import { RoughCanvas } from "roughjs/bin/canvas";
import { TwitterPicker } from "react-color";

import { moveOneLeft, moveAllLeft, moveOneRight, moveAllRight } from "./zindex";
import { roundRect } from "./roundRect";
import EditableText from "./components/EditableText";

import "./styles.scss";

type ExcalidrawElement = ReturnType<typeof newElement>;
type ExcalidrawTextElement = ExcalidrawElement & {
  type: "text";
  font: string;
  text: string;
  actualBoundingBoxAscent: number;
};

const LOCAL_STORAGE_KEY = "excalidraw";
const LOCAL_STORAGE_KEY_STATE = "excalidraw-state";

const elements = Array.of<ExcalidrawElement>();

const DEFAULT_PROJECT_NAME = `excalidraw-${getDateTime()}`;

let skipHistory = false;
const stateHistory: string[] = [];
const redoStack: string[] = [];

function generateHistoryCurrentEntry() {
  return JSON.stringify(
    elements.map(element => ({ ...element, isSelected: false }))
  );
}
function pushHistoryEntry(newEntry: string) {
  if (
    stateHistory.length > 0 &&
    stateHistory[stateHistory.length - 1] === newEntry
  ) {
    // If the last entry is the same as this one, ignore it
    return;
  }
  stateHistory.push(newEntry);
}
function restoreHistoryEntry(entry: string) {
  const newElements = JSON.parse(entry);
  elements.splice(0, elements.length);
  newElements.forEach((newElement: ExcalidrawElement) => {
    generateDraw(newElement);
    elements.push(newElement);
  });
  // When restoring, we shouldn't add an history entry otherwise we'll be stuck with it and can't go back
  skipHistory = true;
}

// https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript/47593316#47593316
const LCG = (seed: number) => () =>
  ((2 ** 31 - 1) & (seed = Math.imul(48271, seed))) / 2 ** 31;

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

// Unfortunately, roughjs doesn't support a seed attribute (https://github.com/pshihn/rough/issues/27).
// We can achieve the same result by overriding the Math.random function with a
// pseudo random generator that supports a random seed and swapping it back after.
function withCustomMathRandom<T>(seed: number, cb: () => T): T {
  const random = Math.random;
  Math.random = LCG(seed);
  const result = cb();
  Math.random = random;
  return result;
}

// https://stackoverflow.com/a/6853926/232122
function distanceBetweenPointAndSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSquare = C * C + D * D;
  let param = -1;
  if (lenSquare !== 0) {
    // in case of 0 length line
    param = dot / lenSquare;
  }

  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return Math.hypot(dx, dy);
}

function hitTest(element: ExcalidrawElement, x: number, y: number): boolean {
  // For shapes that are composed of lines, we only enable point-selection when the distance
  // of the click is less than x pixels of any of the lines that the shape is composed of
  const lineThreshold = 10;

  if (element.type === "ellipse") {
    // https://stackoverflow.com/a/46007540/232122
    const px = Math.abs(x - element.x - element.width / 2);
    const py = Math.abs(y - element.y - element.height / 2);

    let tx = 0.707;
    let ty = 0.707;

    const a = element.width / 2;
    const b = element.height / 2;

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

    return Math.hypot(a * tx - px, b * ty - py) < lineThreshold;
  } else if (element.type === "rectangle") {
    const x1 = getElementAbsoluteX1(element);
    const x2 = getElementAbsoluteX2(element);
    const y1 = getElementAbsoluteY1(element);
    const y2 = getElementAbsoluteY2(element);

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

    const [
      topX,
      topY,
      rightX,
      rightY,
      bottomX,
      bottomY,
      leftX,
      leftY
    ] = getDiamondPoints(element);

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
    const x1 = getElementAbsoluteX1(element);
    const x2 = getElementAbsoluteX2(element);
    const y1 = getElementAbsoluteY1(element);
    const y2 = getElementAbsoluteY2(element);

    return x >= x1 && x <= x2 && y >= y1 && y <= y2;
  } else if (element.type === "selection") {
    console.warn("This should not happen, we need to investigate why it does.");
    return false;
  } else {
    throw new Error("Unimplemented type " + element.type);
  }
}

function resizeTest(
  element: ExcalidrawElement,
  x: number,
  y: number,
  sceneState: SceneState
): string | false {
  if (element.type === "text") return false;

  const handlers = handlerRectangles(element, sceneState);

  const filter = Object.keys(handlers).filter(key => {
    const handler = handlers[key];

    return (
      x + sceneState.scrollX >= handler[0] &&
      x + sceneState.scrollX <= handler[0] + handler[2] &&
      y + sceneState.scrollY >= handler[1] &&
      y + sceneState.scrollY <= handler[1] + handler[3]
    );
  });

  if (filter.length > 0) {
    return filter[0];
  }

  return false;
}

function newElement(
  type: string,
  x: number,
  y: number,
  strokeColor: string,
  backgroundColor: string,
  fillStyle: string,
  strokeWidth: number,
  roughness: number,
  opacity: number,
  width = 0,
  height = 0
) {
  const element = {
    type: type,
    x: x,
    y: y,
    width: width,
    height: height,
    isSelected: false,
    strokeColor: strokeColor,
    backgroundColor: backgroundColor,
    fillStyle: fillStyle,
    strokeWidth: strokeWidth,
    roughness: roughness,
    opacity: opacity,
    seed: randomSeed(),
    draw(
      rc: RoughCanvas,
      context: CanvasRenderingContext2D,
      sceneState: SceneState
    ) {}
  };
  return element;
}

type SceneState = {
  scrollX: number;
  scrollY: number;
  // null indicates transparent bg
  viewBackgroundColor: string | null;
};

const SCROLLBAR_WIDTH = 6;
const SCROLLBAR_MIN_SIZE = 15;
const SCROLLBAR_MARGIN = 4;
const SCROLLBAR_COLOR = "rgba(0,0,0,0.3)";
const CANVAS_WINDOW_OFFSET_LEFT = 250;
const CANVAS_WINDOW_OFFSET_TOP = 0;

function getScrollBars(
  canvasWidth: number,
  canvasHeight: number,
  scrollX: number,
  scrollY: number
) {
  let minX = Infinity;
  let maxX = 0;
  let minY = Infinity;
  let maxY = 0;

  elements.forEach(element => {
    minX = Math.min(minX, getElementAbsoluteX1(element));
    maxX = Math.max(maxX, getElementAbsoluteX2(element));
    minY = Math.min(minY, getElementAbsoluteY1(element));
    maxY = Math.max(maxY, getElementAbsoluteY2(element));
  });

  minX += scrollX;
  maxX += scrollX;
  minY += scrollY;
  maxY += scrollY;
  const leftOverflow = Math.max(-minX, 0);
  const rightOverflow = Math.max(-(canvasWidth - maxX), 0);
  const topOverflow = Math.max(-minY, 0);
  const bottomOverflow = Math.max(-(canvasHeight - maxY), 0);

  // horizontal scrollbar
  let horizontalScrollBar = null;
  if (leftOverflow || rightOverflow) {
    horizontalScrollBar = {
      x: Math.min(
        leftOverflow + SCROLLBAR_MARGIN,
        canvasWidth - SCROLLBAR_MIN_SIZE - SCROLLBAR_MARGIN
      ),
      y: canvasHeight - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN,
      width: Math.max(
        canvasWidth - rightOverflow - leftOverflow - SCROLLBAR_MARGIN * 2,
        SCROLLBAR_MIN_SIZE
      ),
      height: SCROLLBAR_WIDTH
    };
  }

  // vertical scrollbar
  let verticalScrollBar = null;
  if (topOverflow || bottomOverflow) {
    verticalScrollBar = {
      x: canvasWidth - SCROLLBAR_WIDTH - SCROLLBAR_MARGIN,
      y: Math.min(
        topOverflow + SCROLLBAR_MARGIN,
        canvasHeight - SCROLLBAR_MIN_SIZE - SCROLLBAR_MARGIN
      ),
      width: SCROLLBAR_WIDTH,
      height: Math.max(
        canvasHeight - bottomOverflow - topOverflow - SCROLLBAR_WIDTH * 2,
        SCROLLBAR_MIN_SIZE
      )
    };
  }

  return {
    horizontal: horizontalScrollBar,
    vertical: verticalScrollBar
  };
}

function isOverScrollBars(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  scrollX: number,
  scrollY: number
) {
  const scrollBars = getScrollBars(canvasWidth, canvasHeight, scrollX, scrollY);

  const [isOverHorizontalScrollBar, isOverVerticalScrollBar] = [
    scrollBars.horizontal,
    scrollBars.vertical
  ].map(
    scrollBar =>
      scrollBar &&
      scrollBar.x <= x &&
      x <= scrollBar.x + scrollBar.width &&
      scrollBar.y <= y &&
      y <= scrollBar.y + scrollBar.height
  );

  return {
    isOverHorizontalScrollBar,
    isOverVerticalScrollBar
  };
}

function handlerRectangles(element: ExcalidrawElement, sceneState: SceneState) {
  const elementX1 = element.x;
  const elementX2 = element.x + element.width;
  const elementY1 = element.y;
  const elementY2 = element.y + element.height;

  const margin = 4;
  const minimumSize = 40;
  const handlers: { [handler: string]: number[] } = {};

  const marginX = element.width < 0 ? 8 : -8;
  const marginY = element.height < 0 ? 8 : -8;

  if (Math.abs(elementX2 - elementX1) > minimumSize) {
    handlers["n"] = [
      elementX1 + (elementX2 - elementX1) / 2 + sceneState.scrollX - 4,
      elementY1 - margin + sceneState.scrollY + marginY,
      8,
      8
    ];

    handlers["s"] = [
      elementX1 + (elementX2 - elementX1) / 2 + sceneState.scrollX - 4,
      elementY2 - margin + sceneState.scrollY - marginY,
      8,
      8
    ];
  }

  if (Math.abs(elementY2 - elementY1) > minimumSize) {
    handlers["w"] = [
      elementX1 - margin + sceneState.scrollX + marginX,
      elementY1 + (elementY2 - elementY1) / 2 + sceneState.scrollY - 4,
      8,
      8
    ];

    handlers["e"] = [
      elementX2 - margin + sceneState.scrollX - marginX,
      elementY1 + (elementY2 - elementY1) / 2 + sceneState.scrollY - 4,
      8,
      8
    ];
  }

  handlers["nw"] = [
    elementX1 - margin + sceneState.scrollX + marginX,
    elementY1 - margin + sceneState.scrollY + marginY,
    8,
    8
  ]; // nw
  handlers["ne"] = [
    elementX2 - margin + sceneState.scrollX - marginX,
    elementY1 - margin + sceneState.scrollY + marginY,
    8,
    8
  ]; // ne
  handlers["sw"] = [
    elementX1 - margin + sceneState.scrollX + marginX,
    elementY2 - margin + sceneState.scrollY - marginY,
    8,
    8
  ]; // sw
  handlers["se"] = [
    elementX2 - margin + sceneState.scrollX - marginX,
    elementY2 - margin + sceneState.scrollY - marginY,
    8,
    8
  ]; // se

  if (element.type === "arrow") {
    return {
      nw: handlers.nw,
      se: handlers.se
    };
  }

  return handlers;
}

function renderScene(
  rc: RoughCanvas,
  canvas: HTMLCanvasElement,
  sceneState: SceneState,
  // extra options, currently passed by export helper
  {
    offsetX,
    offsetY,
    renderScrollbars = true,
    renderSelection = true
  }: {
    offsetX?: number;
    offsetY?: number;
    renderScrollbars?: boolean;
    renderSelection?: boolean;
  } = {}
) {
  if (!canvas) return;
  const context = canvas.getContext("2d")!;

  const fillStyle = context.fillStyle;
  if (typeof sceneState.viewBackgroundColor === "string") {
    context.fillStyle = sceneState.viewBackgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    context.clearRect(0, 0, canvas.width, canvas.height);
  }
  context.fillStyle = fillStyle;

  const selectedIndices = getSelectedIndices();

  sceneState = {
    ...sceneState,
    scrollX: typeof offsetX === "number" ? offsetX : sceneState.scrollX,
    scrollY: typeof offsetY === "number" ? offsetY : sceneState.scrollY
  };

  elements.forEach(element => {
    element.draw(rc, context, sceneState);
    if (renderSelection && element.isSelected) {
      const margin = 4;

      const elementX1 = getElementAbsoluteX1(element);
      const elementX2 = getElementAbsoluteX2(element);
      const elementY1 = getElementAbsoluteY1(element);
      const elementY2 = getElementAbsoluteY2(element);
      const lineDash = context.getLineDash();
      context.setLineDash([8, 4]);
      context.strokeRect(
        elementX1 - margin + sceneState.scrollX,
        elementY1 - margin + sceneState.scrollY,
        elementX2 - elementX1 + margin * 2,
        elementY2 - elementY1 + margin * 2
      );
      context.setLineDash(lineDash);

      if (element.type !== "text" && selectedIndices.length === 1) {
        const handlers = handlerRectangles(element, sceneState);
        Object.values(handlers).forEach(handler => {
          context.strokeRect(handler[0], handler[1], handler[2], handler[3]);
        });
      }
    }
  });

  if (renderScrollbars) {
    const scrollBars = getScrollBars(
      context.canvas.width / window.devicePixelRatio,
      context.canvas.height / window.devicePixelRatio,
      sceneState.scrollX,
      sceneState.scrollY
    );

    const strokeStyle = context.strokeStyle;
    context.fillStyle = SCROLLBAR_COLOR;
    context.strokeStyle = "rgba(255,255,255,0.8)";
    [scrollBars.horizontal, scrollBars.vertical].forEach(scrollBar => {
      if (scrollBar)
        roundRect(
          context,
          scrollBar.x,
          scrollBar.y,
          scrollBar.width,
          scrollBar.height,
          SCROLLBAR_WIDTH / 2
        );
    });
    context.strokeStyle = strokeStyle;
    context.fillStyle = fillStyle;
  }
}

function saveAsJSON(name: string) {
  const serialized = JSON.stringify({
    version: 1,
    source: window.location.origin,
    elements
  });

  saveFile(
    `${name}.json`,
    "data:text/plain;charset=utf-8," + encodeURIComponent(serialized)
  );
}

function loadFromJSON() {
  const input = document.createElement("input");
  const reader = new FileReader();
  input.type = "file";
  input.accept = ".json";

  input.onchange = () => {
    if (!input.files!.length) {
      alert("A file was not selected.");
      return;
    }

    reader.readAsText(input.files![0], "utf8");
  };

  input.click();

  return new Promise(resolve => {
    reader.onloadend = () => {
      if (reader.readyState === FileReader.DONE) {
        const data = JSON.parse(reader.result as string);
        restore(data.elements, null);
        resolve();
      }
    };
  });
}

function exportAsPNG({
  exportBackground,
  exportPadding = 10,
  viewBackgroundColor,
  name
}: {
  exportBackground: boolean;
  exportPadding?: number;
  viewBackgroundColor: string;
  scrollX: number;
  scrollY: number;
  name: string;
}) {
  if (!elements.length) return window.alert("Cannot export empty canvas.");
  // calculate smallest area to fit the contents in

  let subCanvasX1 = Infinity;
  let subCanvasX2 = 0;
  let subCanvasY1 = Infinity;
  let subCanvasY2 = 0;

  elements.forEach(element => {
    subCanvasX1 = Math.min(subCanvasX1, getElementAbsoluteX1(element));
    subCanvasX2 = Math.max(subCanvasX2, getElementAbsoluteX2(element));
    subCanvasY1 = Math.min(subCanvasY1, getElementAbsoluteY1(element));
    subCanvasY2 = Math.max(subCanvasY2, getElementAbsoluteY2(element));
  });

  function distance(x: number, y: number) {
    return Math.abs(x > y ? x - y : y - x);
  }

  const tempCanvas = document.createElement("canvas");
  tempCanvas.style.display = "none";
  document.body.appendChild(tempCanvas);
  tempCanvas.width = distance(subCanvasX1, subCanvasX2) + exportPadding * 2;
  tempCanvas.height = distance(subCanvasY1, subCanvasY2) + exportPadding * 2;

  renderScene(
    rough.canvas(tempCanvas),
    tempCanvas,
    {
      viewBackgroundColor: exportBackground ? viewBackgroundColor : null,
      scrollX: 0,
      scrollY: 0
    },
    {
      offsetX: -subCanvasX1 + exportPadding,
      offsetY: -subCanvasY1 + exportPadding,
      renderScrollbars: false,
      renderSelection: false
    }
  );

  saveFile(`${name}.png`, tempCanvas.toDataURL("image/png"));

  // clean up the DOM
  if (tempCanvas !== canvas) tempCanvas.remove();
}

function saveFile(name: string, data: string) {
  // create a temporary <a> elem which we'll use to download the image
  const link = document.createElement("a");
  link.setAttribute("download", name);
  link.setAttribute("href", data);
  link.click();

  // clean up
  link.remove();
}

function rotate(x1: number, y1: number, x2: number, y2: number, angle: number) {
  // 𝑎′𝑥=(𝑎𝑥−𝑐𝑥)cos𝜃−(𝑎𝑦−𝑐𝑦)sin𝜃+𝑐𝑥
  // 𝑎′𝑦=(𝑎𝑥−𝑐𝑥)sin𝜃+(𝑎𝑦−𝑐𝑦)cos𝜃+𝑐𝑦.
  // https://math.stackexchange.com/questions/2204520/how-do-i-rotate-a-line-segment-in-a-specific-point-on-the-line
  return [
    (x1 - x2) * Math.cos(angle) - (y1 - y2) * Math.sin(angle) + x2,
    (x1 - x2) * Math.sin(angle) + (y1 - y2) * Math.cos(angle) + y2
  ];
}

function getDateTime() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hr = date.getHours();
  const min = date.getMinutes();
  const secs = date.getSeconds();

  return `${year}${month}${day}${hr}${min}${secs}`;
}

// Casting second argument (DrawingSurface) to any,
// because it is requred by TS definitions and not required at runtime
const generator = rough.generator(null, null as any);

function isTextElement(
  element: ExcalidrawElement
): element is ExcalidrawTextElement {
  return element.type === "text";
}

function isInputLike(
  target: Element | EventTarget | null
): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function getArrowPoints(element: ExcalidrawElement) {
  const x1 = 0;
  const y1 = 0;
  const x2 = element.width;
  const y2 = element.height;

  const size = 30; // pixels
  const distance = Math.hypot(x2 - x1, y2 - y1);
  // Scale down the arrow until we hit a certain size so that it doesn't look weird
  const minSize = Math.min(size, distance / 2);
  const xs = x2 - ((x2 - x1) / distance) * minSize;
  const ys = y2 - ((y2 - y1) / distance) * minSize;

  const angle = 20; // degrees
  const [x3, y3] = rotate(xs, ys, x2, y2, (-angle * Math.PI) / 180);
  const [x4, y4] = rotate(xs, ys, x2, y2, (angle * Math.PI) / 180);

  return [x1, y1, x2, y2, x3, y3, x4, y4];
}

function getDiamondPoints(element: ExcalidrawElement) {
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

function generateDraw(element: ExcalidrawElement) {
  if (element.type === "selection") {
    element.draw = (rc, context, { scrollX, scrollY }) => {
      const fillStyle = context.fillStyle;
      context.fillStyle = "rgba(0, 0, 255, 0.10)";
      context.fillRect(
        element.x + scrollX,
        element.y + scrollY,
        element.width,
        element.height
      );
      context.fillStyle = fillStyle;
    };
  } else if (element.type === "rectangle") {
    const shape = withCustomMathRandom(element.seed, () => {
      return generator.rectangle(0, 0, element.width, element.height, {
        stroke: element.strokeColor,
        fill: element.backgroundColor,
        fillStyle: element.fillStyle,
        strokeWidth: element.strokeWidth,
        roughness: element.roughness
      });
    });
    element.draw = (rc, context, { scrollX, scrollY }) => {
      context.globalAlpha = element.opacity / 100;
      context.translate(element.x + scrollX, element.y + scrollY);
      rc.draw(shape);
      context.translate(-element.x - scrollX, -element.y - scrollY);
      context.globalAlpha = 1;
    };
  } else if (element.type === "diamond") {
    const shape = withCustomMathRandom(element.seed, () => {
      const [
        topX,
        topY,
        rightX,
        rightY,
        bottomX,
        bottomY,
        leftX,
        leftY
      ] = getDiamondPoints(element);
      return generator.polygon(
        [
          [topX, topY],
          [rightX, rightY],
          [bottomX, bottomY],
          [leftX, leftY]
        ],
        {
          stroke: element.strokeColor,
          fill: element.backgroundColor,
          fillStyle: element.fillStyle,
          strokeWidth: element.strokeWidth,
          roughness: element.roughness
        }
      );
    });
    element.draw = (rc, context, { scrollX, scrollY }) => {
      context.globalAlpha = element.opacity / 100;
      context.translate(element.x + scrollX, element.y + scrollY);
      rc.draw(shape);
      context.translate(-element.x - scrollX, -element.y - scrollY);
      context.globalAlpha = 1;
    };
  } else if (element.type === "ellipse") {
    const shape = withCustomMathRandom(element.seed, () =>
      generator.ellipse(
        element.width / 2,
        element.height / 2,
        element.width,
        element.height,
        {
          stroke: element.strokeColor,
          fill: element.backgroundColor,
          fillStyle: element.fillStyle,
          strokeWidth: element.strokeWidth,
          roughness: element.roughness
        }
      )
    );
    element.draw = (rc, context, { scrollX, scrollY }) => {
      context.globalAlpha = element.opacity / 100;
      context.translate(element.x + scrollX, element.y + scrollY);
      rc.draw(shape);
      context.translate(-element.x - scrollX, -element.y - scrollY);
      context.globalAlpha = 1;
    };
  } else if (element.type === "arrow") {
    const [x1, y1, x2, y2, x3, y3, x4, y4] = getArrowPoints(element);
    const options = {
      stroke: element.strokeColor,
      strokeWidth: element.strokeWidth,
      roughness: element.roughness
    };

    const shapes = withCustomMathRandom(element.seed, () => [
      //    \
      generator.line(x3, y3, x2, y2, options),
      // -----
      generator.line(x1, y1, x2, y2, options),
      //    /
      generator.line(x4, y4, x2, y2, options)
    ]);

    element.draw = (rc, context, { scrollX, scrollY }) => {
      context.globalAlpha = element.opacity / 100;
      context.translate(element.x + scrollX, element.y + scrollY);
      shapes.forEach(shape => rc.draw(shape));
      context.translate(-element.x - scrollX, -element.y - scrollY);
      context.globalAlpha = 1;
    };
    return;
  } else if (isTextElement(element)) {
    element.draw = (rc, context, { scrollX, scrollY }) => {
      context.globalAlpha = element.opacity / 100;
      const font = context.font;
      context.font = element.font;
      const fillStyle = context.fillStyle;
      context.fillStyle = element.strokeColor;
      context.fillText(
        element.text,
        element.x + scrollX,
        element.y + element.actualBoundingBoxAscent + scrollY
      );
      context.fillStyle = fillStyle;
      context.font = font;
      context.globalAlpha = 1;
    };
  } else {
    throw new Error("Unimplemented type " + element.type);
  }
}

// If the element is created from right to left, the width is going to be negative
// This set of functions retrieves the absolute position of the 4 points.
// We can't just always normalize it since we need to remember the fact that an arrow
// is pointing left or right.
function getElementAbsoluteX1(element: ExcalidrawElement) {
  return element.width >= 0 ? element.x : element.x + element.width;
}
function getElementAbsoluteX2(element: ExcalidrawElement) {
  return element.width >= 0 ? element.x + element.width : element.x;
}
function getElementAbsoluteY1(element: ExcalidrawElement) {
  return element.height >= 0 ? element.y : element.y + element.height;
}
function getElementAbsoluteY2(element: ExcalidrawElement) {
  return element.height >= 0 ? element.y + element.height : element.y;
}

function setSelection(selection: ExcalidrawElement) {
  const selectionX1 = getElementAbsoluteX1(selection);
  const selectionX2 = getElementAbsoluteX2(selection);
  const selectionY1 = getElementAbsoluteY1(selection);
  const selectionY2 = getElementAbsoluteY2(selection);
  elements.forEach(element => {
    const elementX1 = getElementAbsoluteX1(element);
    const elementX2 = getElementAbsoluteX2(element);
    const elementY1 = getElementAbsoluteY1(element);
    const elementY2 = getElementAbsoluteY2(element);
    element.isSelected =
      element.type !== "selection" &&
      selectionX1 <= elementX1 &&
      selectionY1 <= elementY1 &&
      selectionX2 >= elementX2 &&
      selectionY2 >= elementY2;
  });
}

function clearSelection() {
  elements.forEach(element => {
    element.isSelected = false;
  });
}

function resetCursor() {
  document.documentElement.style.cursor = "";
}

function deleteSelectedElements() {
  for (let i = elements.length - 1; i >= 0; --i) {
    if (elements[i].isSelected) {
      elements.splice(i, 1);
    }
  }
}

function save(state: AppState) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(elements));
  localStorage.setItem(LOCAL_STORAGE_KEY_STATE, JSON.stringify(state));
}

function restoreFromLocalStorage() {
  const savedElements = localStorage.getItem(LOCAL_STORAGE_KEY);
  const savedState = localStorage.getItem(LOCAL_STORAGE_KEY_STATE);

  return restore(savedElements, savedState);
}

function restore(
  savedElements: string | ExcalidrawElement[] | null,
  savedState: string | null
) {
  try {
    if (savedElements) {
      elements.splice(
        0,
        elements.length,
        ...(typeof savedElements === "string"
          ? JSON.parse(savedElements)
          : savedElements)
      );
      elements.forEach((element: ExcalidrawElement) => {
        element.fillStyle = element.fillStyle || "hachure";
        element.strokeWidth = element.strokeWidth || 1;
        element.roughness = element.roughness || 1;
        element.opacity =
          element.opacity === null || element.opacity === undefined
            ? 100
            : element.opacity;

        generateDraw(element);
      });
    }

    return savedState ? JSON.parse(savedState) : null;
  } catch (e) {
    elements.splice(0, elements.length);
    return null;
  }
}

type AppState = {
  draggingElement: ExcalidrawElement | null;
  resizingElement: ExcalidrawElement | null;
  elementType: string;
  exportBackground: boolean;
  currentItemStrokeColor: string;
  currentItemBackgroundColor: string;
  viewBackgroundColor: string;
  scrollX: number;
  scrollY: number;
  name: string;
};

const KEYS = {
  ARROW_LEFT: "ArrowLeft",
  ARROW_RIGHT: "ArrowRight",
  ARROW_DOWN: "ArrowDown",
  ARROW_UP: "ArrowUp",
  ESCAPE: "Escape",
  DELETE: "Delete",
  BACKSPACE: "Backspace"
};

// We inline font-awesome icons in order to save on js size rather than including the font awesome react library
const SHAPES = [
  {
    icon: (
      // fa-mouse-pointer
      <svg viewBox="0 0 320 512">
        <path d="M302.189 329.126H196.105l55.831 135.993c3.889 9.428-.555 19.999-9.444 23.999l-49.165 21.427c-9.165 4-19.443-.571-23.332-9.714l-53.053-129.136-86.664 89.138C18.729 472.71 0 463.554 0 447.977V18.299C0 1.899 19.921-6.096 30.277 5.443l284.412 292.542c11.472 11.179 3.007 31.141-12.5 31.141z" />
      </svg>
    ),
    value: "selection"
  },
  {
    icon: (
      // fa-square
      <svg viewBox="0 0 448 512">
        <path d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48z" />
      </svg>
    ),
    value: "rectangle"
  },
  {
    icon: (
      // custom
      <svg viewBox="0 0 223.646 223.646">
        <path d="M111.823 0L16.622 111.823 111.823 223.646 207.025 111.823z" />
      </svg>
    ),
    value: "diamond"
  },
  {
    icon: (
      // fa-circle
      <svg viewBox="0 0 512 512">
        <path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8z" />
      </svg>
    ),
    value: "ellipse"
  },
  {
    icon: (
      // fa-long-arrow-alt-right
      <svg viewBox="0 0 448 512">
        <path d="M313.941 216H12c-6.627 0-12 5.373-12 12v56c0 6.627 5.373 12 12 12h301.941v46.059c0 21.382 25.851 32.09 40.971 16.971l86.059-86.059c9.373-9.373 9.373-24.569 0-33.941l-86.059-86.059c-15.119-15.119-40.971-4.411-40.971 16.971V216z" />
      </svg>
    ),
    value: "arrow"
  },
  {
    icon: (
      // fa-font
      <svg viewBox="0 0 448 512">
        <path d="M432 416h-23.41L277.88 53.69A32 32 0 0 0 247.58 32h-47.16a32 32 0 0 0-30.3 21.69L39.41 416H16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16h-19.58l23.3-64h152.56l23.3 64H304a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16zM176.85 272L224 142.51 271.15 272z" />
      </svg>
    ),
    value: "text"
  }
];

const shapesShortcutKeys = SHAPES.map(shape => shape.value[0]);

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function findElementByKey(key: string) {
  const defaultElement = "selection";
  return SHAPES.reduce((element, shape) => {
    if (shape.value[0] !== key) return element;

    return shape.value;
  }, defaultElement);
}

function isArrowKey(keyCode: string) {
  return (
    keyCode === KEYS.ARROW_LEFT ||
    keyCode === KEYS.ARROW_RIGHT ||
    keyCode === KEYS.ARROW_DOWN ||
    keyCode === KEYS.ARROW_UP
  );
}

function getSelectedIndices() {
  const selectedIndices: number[] = [];
  elements.forEach((element, index) => {
    if (element.isSelected) {
      selectedIndices.push(index);
    }
  });
  return selectedIndices;
}

const someElementIsSelected = () =>
  elements.some(element => element.isSelected);

const hasBackground = () =>
  elements.some(
    element =>
      element.isSelected &&
      (element.type === "rectangle" ||
        element.type === "ellipse" ||
        element.type === "diamond")
  );

const hasStroke = () =>
  elements.some(
    element =>
      element.isSelected &&
      (element.type === "rectangle" ||
        element.type === "ellipse" ||
        element.type === "diamond" ||
        element.type === "arrow")
  );

function getSelectedAttribute<T>(
  getAttribute: (element: ExcalidrawElement) => T
): T | null {
  const attributes = Array.from(
    new Set(
      elements
        .filter(element => element.isSelected)
        .map(element => getAttribute(element))
    )
  );
  return attributes.length === 1 ? attributes[0] : null;
}

function addTextElement(element: ExcalidrawTextElement) {
  resetCursor();
  const text = prompt("What text do you want?");
  if (text === null || text === "") {
    return false;
  }
  const fontSize = 20;
  element.text = text;
  element.font = `${fontSize}px Virgil`;
  const font = context.font;
  context.font = element.font;
  const textMeasure = context.measureText(element.text);
  const width = textMeasure.width;
  const actualBoundingBoxAscent =
    textMeasure.actualBoundingBoxAscent || fontSize;
  const actualBoundingBoxDescent = textMeasure.actualBoundingBoxDescent || 0;
  element.actualBoundingBoxAscent = actualBoundingBoxAscent;
  context.font = font;
  const height = actualBoundingBoxAscent + actualBoundingBoxDescent;
  // Center the text
  element.x -= width / 2;
  element.y -= actualBoundingBoxAscent;
  element.width = width;
  element.height = height;

  return true;
}

function getElementAtPosition(x: number, y: number) {
  let hitElement = null;
  // We need to to hit testing from front (end of the array) to back (beginning of the array)
  for (let i = elements.length - 1; i >= 0; --i) {
    if (hitTest(elements[i], x, y)) {
      hitElement = elements[i];
      break;
    }
  }

  return hitElement;
}

function ButtonSelect<T>({
  options,
  value,
  onChange
}: {
  options: { value: T; text: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="buttonList">
      {options.map(option => (
        <button
          key={option.text}
          onClick={() => onChange(option.value)}
          className={value === option.value ? "active" : ""}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

function ColorPicker({
  color,
  onChange
}: {
  color: string | null;
  onChange: (color: string) => void;
}) {
  const [isActive, setActive] = React.useState(false);
  return (
    <div>
      <button
        className="swatch"
        style={color ? { backgroundColor: color } : undefined}
        onClick={() => setActive(!isActive)}
      />
      {isActive ? (
        <div className="popover">
          <div className="cover" onClick={() => setActive(false)} />
          <TwitterPicker
            colors={[
              "#000000",
              "#ABB8C3",
              "#FFFFFF",
              "#FF6900",
              "#FCB900",
              "#00D084",
              "#8ED1FC",
              "#0693E3",
              "#EB144C",
              "#F78DA7",
              "#9900EF"
            ]}
            width="205px"
            color={color || undefined}
            onChange={changedColor => {
              onChange(changedColor.hex);
            }}
          />
        </div>
      ) : null}
      <input
        type="text"
        className="swatch-input"
        value={color || ""}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

const ELEMENT_SHIFT_TRANSLATE_AMOUNT = 5;
const ELEMENT_TRANSLATE_AMOUNT = 1;

let lastCanvasWidth = -1;
let lastCanvasHeight = -1;

let lastMouseUp: ((e: any) => void) | null = null;

class App extends React.Component<{}, AppState> {
  public componentDidMount() {
    document.addEventListener("keydown", this.onKeyDown, false);
    window.addEventListener("resize", this.onResize, false);

    const savedState = restoreFromLocalStorage();
    if (savedState) {
      this.setState(savedState);
    }
  }

  public componentWillUnmount() {
    document.removeEventListener("keydown", this.onKeyDown, false);
    window.removeEventListener("resize", this.onResize, false);
  }

  public state: AppState = {
    draggingElement: null,
    resizingElement: null,
    elementType: "selection",
    exportBackground: true,
    currentItemStrokeColor: "#000000",
    currentItemBackgroundColor: "#ffffff",
    viewBackgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    name: DEFAULT_PROJECT_NAME
  };

  private onResize = () => {
    this.forceUpdate();
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (isInputLike(event.target)) return;

    if (event.key === KEYS.ESCAPE) {
      clearSelection();
      this.forceUpdate();
      event.preventDefault();
    } else if (event.key === KEYS.BACKSPACE || event.key === KEYS.DELETE) {
      deleteSelectedElements();
      this.forceUpdate();
      event.preventDefault();
    } else if (isArrowKey(event.key)) {
      const step = event.shiftKey
        ? ELEMENT_SHIFT_TRANSLATE_AMOUNT
        : ELEMENT_TRANSLATE_AMOUNT;
      elements.forEach(element => {
        if (element.isSelected) {
          if (event.key === KEYS.ARROW_LEFT) element.x -= step;
          else if (event.key === KEYS.ARROW_RIGHT) element.x += step;
          else if (event.key === KEYS.ARROW_UP) element.y -= step;
          else if (event.key === KEYS.ARROW_DOWN) element.y += step;
        }
      });
      this.forceUpdate();
      event.preventDefault();

      // Send backward: Cmd-Shift-Alt-B
    } else if (
      event.metaKey &&
      event.shiftKey &&
      event.altKey &&
      event.code === "KeyB"
    ) {
      this.moveOneLeft();
      event.preventDefault();

      // Send to back: Cmd-Shift-B
    } else if (event.metaKey && event.shiftKey && event.code === "KeyB") {
      this.moveAllLeft();
      event.preventDefault();

      // Bring forward: Cmd-Shift-Alt-F
    } else if (
      event.metaKey &&
      event.shiftKey &&
      event.altKey &&
      event.code === "KeyF"
    ) {
      this.moveOneRight();
      event.preventDefault();

      // Bring to front: Cmd-Shift-F
    } else if (event.metaKey && event.shiftKey && event.code === "KeyF") {
      this.moveAllRight();
      event.preventDefault();

      // Select all: Cmd-A
    } else if (event.metaKey && event.code === "KeyA") {
      elements.forEach(element => {
        element.isSelected = true;
      });
      this.forceUpdate();
      event.preventDefault();
    } else if (shapesShortcutKeys.includes(event.key.toLowerCase())) {
      this.setState({ elementType: findElementByKey(event.key) });
    } else if (event.metaKey && event.code === "KeyZ") {
      const currentEntry = generateHistoryCurrentEntry();
      if (event.shiftKey) {
        // Redo action
        const entryToRestore = redoStack.pop();
        if (entryToRestore !== undefined) {
          restoreHistoryEntry(entryToRestore);
          stateHistory.push(currentEntry);
        }
      } else {
        // undo action
        let lastEntry = stateHistory.pop();
        // If nothing was changed since last, take the previous one
        if (currentEntry === lastEntry) {
          lastEntry = stateHistory.pop();
        }
        if (lastEntry !== undefined) {
          restoreHistoryEntry(lastEntry);
          redoStack.push(currentEntry);
        }
      }
      this.forceUpdate();
      event.preventDefault();
    }
  };

  private deleteSelectedElements = () => {
    deleteSelectedElements();
    this.forceUpdate();
  };

  private clearCanvas = () => {
    if (window.confirm("This will clear the whole canvas. Are you sure?")) {
      elements.splice(0, elements.length);
      this.setState({
        viewBackgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0
      });
      this.forceUpdate();
    }
  };

  private moveAllLeft = () => {
    moveAllLeft(elements, getSelectedIndices());
    this.forceUpdate();
  };

  private moveOneLeft = () => {
    moveOneLeft(elements, getSelectedIndices());
    this.forceUpdate();
  };

  private moveAllRight = () => {
    moveAllRight(elements, getSelectedIndices());
    this.forceUpdate();
  };

  private moveOneRight = () => {
    moveOneRight(elements, getSelectedIndices());
    this.forceUpdate();
  };

  private removeWheelEventListener: (() => void) | undefined;

  private updateProjectName(name: string): void {
    this.setState({ name });
  }

  private changeProperty = (callback: (element: ExcalidrawElement) => void) => {
    elements.forEach(element => {
      if (element.isSelected) {
        callback(element);
        generateDraw(element);
      }
    });

    this.forceUpdate();
  };

  private changeOpacity = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.changeProperty(element => (element.opacity = +event.target.value));
  };

  private changeStrokeColor = (color: string) => {
    this.changeProperty(element => (element.strokeColor = color));
    this.setState({ currentItemStrokeColor: color });
  };

  private changeBackgroundColor = (color: string) => {
    this.changeProperty(element => (element.backgroundColor = color));
    this.setState({ currentItemBackgroundColor: color });
  };

  public render() {
    const canvasWidth = window.innerWidth - CANVAS_WINDOW_OFFSET_LEFT;
    const canvasHeight = window.innerHeight - CANVAS_WINDOW_OFFSET_TOP;

    return (
      <div
        className="container"
        onCut={e => {
          e.clipboardData.setData(
            "text/plain",
            JSON.stringify(elements.filter(element => element.isSelected))
          );
          deleteSelectedElements();
          this.forceUpdate();
          e.preventDefault();
        }}
        onCopy={e => {
          e.clipboardData.setData(
            "text/plain",
            JSON.stringify(elements.filter(element => element.isSelected))
          );
          e.preventDefault();
        }}
        onPaste={e => {
          const paste = e.clipboardData.getData("text");
          let parsedElements;
          try {
            parsedElements = JSON.parse(paste);
          } catch (e) {}
          if (
            Array.isArray(parsedElements) &&
            parsedElements.length > 0 &&
            parsedElements[0].type // need to implement a better check here...
          ) {
            clearSelection();
            parsedElements.forEach(parsedElement => {
              parsedElement.x += 10;
              parsedElement.y += 10;
              parsedElement.seed = randomSeed();
              generateDraw(parsedElement);
              elements.push(parsedElement);
            });
            this.forceUpdate();
          }
          e.preventDefault();
        }}
      >
        <div className="sidePanel">
          <h4>Shapes</h4>
          <div className="panelTools">
            {SHAPES.map(({ value, icon }) => (
              <label
                key={value}
                className="tool"
                title={`${capitalize(value)} - ${capitalize(value)[0]}`}
              >
                <input
                  type="radio"
                  checked={this.state.elementType === value}
                  onChange={() => {
                    this.setState({ elementType: value });
                    clearSelection();
                    document.documentElement.style.cursor =
                      value === "text" ? "text" : "crosshair";
                    this.forceUpdate();
                  }}
                />
                <div className="toolIcon">{icon}</div>
              </label>
            ))}
          </div>
          {someElementIsSelected() && (
            <div className="panelColumn">
              <h4>Selection</h4>
              <div className="buttonList">
                <button onClick={this.moveOneRight}>Bring forward</button>
                <button onClick={this.moveAllRight}>Bring to front</button>
                <button onClick={this.moveOneLeft}>Send backward</button>
                <button onClick={this.moveAllLeft}>Send to back</button>
              </div>
              <h5>Stroke Color</h5>
              <ColorPicker
                color={getSelectedAttribute(element => element.strokeColor)}
                onChange={color => this.changeStrokeColor(color)}
              />

              {hasBackground() && (
                <>
                  <h5>Background Color</h5>
                  <ColorPicker
                    color={getSelectedAttribute(
                      element => element.backgroundColor
                    )}
                    onChange={color => this.changeBackgroundColor(color)}
                  />
                  <h5>Fill</h5>
                  <ButtonSelect
                    options={[
                      { value: "solid", text: "Solid" },
                      { value: "hachure", text: "Hachure" },
                      { value: "cross-hatch", text: "Cross-hatch" }
                    ]}
                    value={getSelectedAttribute(element => element.fillStyle)}
                    onChange={value => {
                      this.changeProperty(element => {
                        element.fillStyle = value;
                      });
                    }}
                  />
                </>
              )}

              {hasStroke() && (
                <>
                  <h5>Stroke Width</h5>
                  <ButtonSelect
                    options={[
                      { value: 1, text: "Thin" },
                      { value: 2, text: "Bold" },
                      { value: 4, text: "Extra Bold" }
                    ]}
                    value={getSelectedAttribute(element => element.strokeWidth)}
                    onChange={value => {
                      this.changeProperty(element => {
                        element.strokeWidth = value;
                      });
                    }}
                  />

                  <h5>Sloppiness</h5>
                  <ButtonSelect
                    options={[
                      { value: 0, text: "Draftsman" },
                      { value: 1, text: "Artist" },
                      { value: 3, text: "Cartoonist" }
                    ]}
                    value={getSelectedAttribute(element => element.roughness)}
                    onChange={value =>
                      this.changeProperty(element => {
                        element.roughness = value;
                      })
                    }
                  />
                </>
              )}

              <h5>Opacity</h5>
              <input
                type="range"
                min="0"
                max="100"
                onChange={this.changeOpacity}
                value={
                  getSelectedAttribute(element => element.opacity) ||
                  0 /* Put the opacity at 0 if there are two conflicting ones */
                }
              />

              <button onClick={this.deleteSelectedElements}>
                Delete selected
              </button>
            </div>
          )}
          <h4>Canvas</h4>
          <div className="panelColumn">
            <h5>Canvas Background Color</h5>
            <ColorPicker
              color={this.state.viewBackgroundColor}
              onChange={color => this.setState({ viewBackgroundColor: color })}
            />
            <button
              onClick={this.clearCanvas}
              title="Clear the canvas & reset background color"
            >
              Clear canvas
            </button>
          </div>
          <h4>Export</h4>
          <div className="panelColumn">
            <h5>Name</h5>
            {this.state.name && (
              <EditableText
                value={this.state.name}
                onChange={(name: string) => this.updateProjectName(name)}
              />
            )}
            <h5>Image</h5>
            <button
              onClick={() => {
                exportAsPNG(this.state);
              }}
            >
              Export to png
            </button>
            <label>
              <input
                type="checkbox"
                checked={this.state.exportBackground}
                onChange={e => {
                  this.setState({ exportBackground: e.target.checked });
                }}
              />
              background
            </label>
            <h5>Scene</h5>
            <button
              onClick={() => {
                saveAsJSON(this.state.name);
              }}
            >
              Save as...
            </button>
            <button
              onClick={() => {
                loadFromJSON().then(() => this.forceUpdate());
              }}
            >
              Load file...
            </button>
          </div>
        </div>
        <canvas
          id="canvas"
          style={{
            width: canvasWidth,
            height: canvasHeight
          }}
          width={canvasWidth * window.devicePixelRatio}
          height={canvasHeight * window.devicePixelRatio}
          ref={canvas => {
            if (this.removeWheelEventListener) {
              this.removeWheelEventListener();
              this.removeWheelEventListener = undefined;
            }
            if (canvas) {
              canvas.addEventListener("wheel", this.handleWheel, {
                passive: false
              });
              this.removeWheelEventListener = () =>
                canvas.removeEventListener("wheel", this.handleWheel);

              // Whenever React sets the width/height of the canvas element,
              // the context loses the scale transform. We need to re-apply it
              if (
                canvasWidth !== lastCanvasWidth ||
                canvasHeight !== lastCanvasHeight
              ) {
                lastCanvasWidth = canvasWidth;
                lastCanvasHeight = canvasHeight;
                canvas
                  .getContext("2d")!
                  .scale(window.devicePixelRatio, window.devicePixelRatio);
              }
            }
          }}
          onMouseDown={e => {
            if (lastMouseUp !== null) {
              // Unfortunately, sometimes we don't get a mouseup after a mousedown,
              // this can happen when a contextual menu or alert is triggered. In order to avoid
              // being in a weird state, we clean up on the next mousedown
              lastMouseUp(e);
            }
            // only handle left mouse button
            if (e.button !== 0) return;
            // fixes mousemove causing selection of UI texts #32
            e.preventDefault();
            // Preventing the event above disables default behavior
            //  of defocusing potentially focused input, which is what we want
            //  when clicking inside the canvas.
            if (isInputLike(document.activeElement)) {
              document.activeElement.blur();
            }

            // Handle scrollbars dragging
            const {
              isOverHorizontalScrollBar,
              isOverVerticalScrollBar
            } = isOverScrollBars(
              e.clientX - CANVAS_WINDOW_OFFSET_LEFT,
              e.clientY - CANVAS_WINDOW_OFFSET_TOP,
              canvasWidth,
              canvasHeight,
              this.state.scrollX,
              this.state.scrollY
            );

            const x =
              e.clientX - CANVAS_WINDOW_OFFSET_LEFT - this.state.scrollX;
            const y = e.clientY - CANVAS_WINDOW_OFFSET_TOP - this.state.scrollY;
            const element = newElement(
              this.state.elementType,
              x,
              y,
              this.state.currentItemStrokeColor,
              this.state.currentItemBackgroundColor,
              "hachure",
              1,
              1,
              100
            );
            let resizeHandle: string | false = false;
            let isDraggingElements = false;
            let isResizingElements = false;
            if (this.state.elementType === "selection") {
              const resizeElement = elements.find(element => {
                return resizeTest(element, x, y, {
                  scrollX: this.state.scrollX,
                  scrollY: this.state.scrollY,
                  viewBackgroundColor: this.state.viewBackgroundColor
                });
              });

              this.setState({
                resizingElement: resizeElement ? resizeElement : null
              });

              if (resizeElement) {
                resizeHandle = resizeTest(resizeElement, x, y, {
                  scrollX: this.state.scrollX,
                  scrollY: this.state.scrollY,
                  viewBackgroundColor: this.state.viewBackgroundColor
                });
                document.documentElement.style.cursor = `${resizeHandle}-resize`;
                isResizingElements = true;
              } else {
                const hitElement = getElementAtPosition(x, y);

                // If we click on something
                if (hitElement) {
                  if (hitElement.isSelected) {
                    // If that element is not already selected, do nothing,
                    // we're likely going to drag it
                  } else {
                    // We unselect every other elements unless shift is pressed
                    if (!e.shiftKey) {
                      clearSelection();
                    }
                    // No matter what, we select it
                    hitElement.isSelected = true;
                  }
                } else {
                  // If we don't click on anything, let's remove all the selected elements
                  clearSelection();
                }

                isDraggingElements = someElementIsSelected();

                if (isDraggingElements) {
                  document.documentElement.style.cursor = "move";
                }
              }
            }

            if (isTextElement(element)) {
              if (!addTextElement(element)) {
                return;
              }
            }

            generateDraw(element);
            elements.push(element);
            if (this.state.elementType === "text") {
              this.setState({
                draggingElement: null,
                elementType: "selection"
              });
              element.isSelected = true;
            } else {
              this.setState({ draggingElement: element });
            }

            let lastX = x;
            let lastY = y;

            if (isOverHorizontalScrollBar || isOverVerticalScrollBar) {
              lastX = e.clientX - CANVAS_WINDOW_OFFSET_LEFT;
              lastY = e.clientY - CANVAS_WINDOW_OFFSET_TOP;
            }

            const onMouseMove = (e: MouseEvent) => {
              const target = e.target;
              if (!(target instanceof HTMLElement)) {
                return;
              }

              if (isOverHorizontalScrollBar) {
                const x = e.clientX - CANVAS_WINDOW_OFFSET_LEFT;
                const dx = x - lastX;
                this.setState(state => ({ scrollX: state.scrollX - dx }));
                lastX = x;
                return;
              }

              if (isOverVerticalScrollBar) {
                const y = e.clientY - CANVAS_WINDOW_OFFSET_TOP;
                const dy = y - lastY;
                this.setState(state => ({ scrollY: state.scrollY - dy }));
                lastY = y;
                return;
              }

              if (isResizingElements && this.state.resizingElement) {
                const el = this.state.resizingElement;
                const selectedElements = elements.filter(el => el.isSelected);
                if (selectedElements.length === 1) {
                  const x =
                    e.clientX - CANVAS_WINDOW_OFFSET_LEFT - this.state.scrollX;
                  const y =
                    e.clientY - CANVAS_WINDOW_OFFSET_TOP - this.state.scrollY;
                  selectedElements.forEach(element => {
                    switch (resizeHandle) {
                      case "nw":
                        element.width += element.x - lastX;
                        element.height += element.y - lastY;
                        element.x = lastX;
                        element.y = lastY;
                        break;
                      case "ne":
                        element.width = lastX - element.x;
                        element.height += element.y - lastY;
                        element.y = lastY;
                        break;
                      case "sw":
                        element.width += element.x - lastX;
                        element.x = lastX;
                        element.height = lastY - element.y;
                        break;
                      case "se":
                        element.width += x - lastX;
                        if (e.shiftKey) {
                          element.height = element.width;
                        } else {
                          element.height += y - lastY;
                        }
                        break;
                      case "n":
                        element.height += element.y - lastY;
                        element.y = lastY;
                        break;
                      case "w":
                        element.width += element.x - lastX;
                        element.x = lastX;
                        break;
                      case "s":
                        element.height = lastY - element.y;
                        break;
                      case "e":
                        element.width = lastX - element.x;
                        break;
                    }

                    el.x = element.x;
                    el.y = element.y;
                    generateDraw(el);
                  });
                  lastX = x;
                  lastY = y;
                  // We don't want to save history when resizing an element
                  skipHistory = true;
                  this.forceUpdate();
                  return;
                }
              }

              if (isDraggingElements) {
                const selectedElements = elements.filter(el => el.isSelected);
                if (selectedElements.length) {
                  const x =
                    e.clientX - CANVAS_WINDOW_OFFSET_LEFT - this.state.scrollX;
                  const y =
                    e.clientY - CANVAS_WINDOW_OFFSET_TOP - this.state.scrollY;
                  selectedElements.forEach(element => {
                    element.x += x - lastX;
                    element.y += y - lastY;
                  });
                  lastX = x;
                  lastY = y;
                  // We don't want to save history when dragging an element to initially size it
                  skipHistory = true;
                  this.forceUpdate();
                  return;
                }
              }

              // It is very important to read this.state within each move event,
              // otherwise we would read a stale one!
              const draggingElement = this.state.draggingElement;
              if (!draggingElement) return;
              let width =
                e.clientX -
                CANVAS_WINDOW_OFFSET_LEFT -
                draggingElement.x -
                this.state.scrollX;
              let height =
                e.clientY -
                CANVAS_WINDOW_OFFSET_TOP -
                draggingElement.y -
                this.state.scrollY;
              draggingElement.width = width;
              // Make a perfect square or circle when shift is enabled
              draggingElement.height = e.shiftKey
                ? Math.abs(width) * Math.sign(height)
                : height;

              generateDraw(draggingElement);

              if (this.state.elementType === "selection") {
                setSelection(draggingElement);
              }
              // We don't want to save history when moving an element
              skipHistory = true;
              this.forceUpdate();
            };

            const onMouseUp = (e: MouseEvent) => {
              const { draggingElement, elementType } = this.state;

              lastMouseUp = null;
              window.removeEventListener("mousemove", onMouseMove);
              window.removeEventListener("mouseup", onMouseUp);

              resetCursor();

              // if no element is clicked, clear the selection and redraw
              if (draggingElement === null) {
                clearSelection();
                this.forceUpdate();
                return;
              }

              if (elementType === "selection") {
                if (isDraggingElements) {
                  isDraggingElements = false;
                }
                elements.pop();
              } else {
                draggingElement.isSelected = true;
              }

              this.setState({
                draggingElement: null,
                elementType: "selection"
              });
              this.forceUpdate();
            };

            lastMouseUp = onMouseUp;

            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);

            // We don't want to save history on mouseDown, only on mouseUp when it's fully configured
            skipHistory = true;
            this.forceUpdate();
          }}
          onDoubleClick={e => {
            const x =
              e.clientX - CANVAS_WINDOW_OFFSET_LEFT - this.state.scrollX;
            const y = e.clientY - CANVAS_WINDOW_OFFSET_TOP - this.state.scrollY;

            if (getElementAtPosition(x, y)) {
              return;
            }

            const element = newElement(
              "text",
              x,
              y,
              this.state.currentItemStrokeColor,
              this.state.currentItemBackgroundColor,
              "hachure",
              1,
              1,
              100
            );

            if (!addTextElement(element as ExcalidrawTextElement)) {
              return;
            }

            generateDraw(element);
            elements.push(element);

            this.setState({
              draggingElement: null,
              elementType: "selection"
            });
            element.isSelected = true;

            this.forceUpdate();
          }}
        />
      </div>
    );
  }

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { deltaX, deltaY } = e;
    this.setState(state => ({
      scrollX: state.scrollX - deltaX,
      scrollY: state.scrollY - deltaY
    }));
  };

  componentDidUpdate() {
    renderScene(rc, canvas, {
      scrollX: this.state.scrollX,
      scrollY: this.state.scrollY,
      viewBackgroundColor: this.state.viewBackgroundColor
    });
    save(this.state);
    if (!skipHistory) {
      pushHistoryEntry(generateHistoryCurrentEntry());
      redoStack.splice(0, redoStack.length);
    }
    skipHistory = false;
  }
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const rc = rough.canvas(canvas);
const context = canvas.getContext("2d")!;

ReactDOM.render(<App />, rootElement);
