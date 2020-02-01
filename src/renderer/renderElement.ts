import { ExcalidrawElement } from "../element/types";
import { isTextElement } from "../element/typeChecks";
import {
  getDiamondPoints,
  getArrowPoints,
  getLinePoints,
} from "../element/bounds";
import { RoughCanvas } from "roughjs/bin/canvas";
import { Drawable } from "roughjs/bin/core";
import { Point } from "roughjs/bin/geometry";
import { RoughSVG } from "roughjs/bin/svg";
import { RoughGenerator } from "roughjs/bin/generator";
import { SVG_NS } from "../utils";

function generateElement(
  element: ExcalidrawElement,
  generator: RoughGenerator,
) {
  if (!element.shape) {
    switch (element.type) {
      case "rectangle":
        element.shape = generator.rectangle(
          0,
          0,
          element.width,
          element.height,
          {
            stroke: element.strokeColor,
            fill:
              element.backgroundColor === "transparent"
                ? undefined
                : element.backgroundColor,
            fillStyle: element.fillStyle,
            strokeWidth: element.strokeWidth,
            roughness: element.roughness,
            seed: element.seed,
          },
        );
        break;
      case "diamond": {
        const [
          topX,
          topY,
          rightX,
          rightY,
          bottomX,
          bottomY,
          leftX,
          leftY,
        ] = getDiamondPoints(element);
        element.shape = generator.polygon(
          [
            [topX, topY],
            [rightX, rightY],
            [bottomX, bottomY],
            [leftX, leftY],
          ],
          {
            stroke: element.strokeColor,
            fill:
              element.backgroundColor === "transparent"
                ? undefined
                : element.backgroundColor,
            fillStyle: element.fillStyle,
            strokeWidth: element.strokeWidth,
            roughness: element.roughness,
            seed: element.seed,
          },
        );
        break;
      }
      case "ellipse":
        element.shape = generator.ellipse(
          element.width / 2,
          element.height / 2,
          element.width,
          element.height,
          {
            stroke: element.strokeColor,
            fill:
              element.backgroundColor === "transparent"
                ? undefined
                : element.backgroundColor,
            fillStyle: element.fillStyle,
            strokeWidth: element.strokeWidth,
            roughness: element.roughness,
            seed: element.seed,
            curveFitting: 1,
          },
        );
        break;
      case "arrow": {
        const [x2, y2, x3, y3, x4, y4] = getArrowPoints(element);
        const options = {
          stroke: element.strokeColor,
          strokeWidth: element.strokeWidth,
          roughness: element.roughness,
          seed: element.seed,
        };
        // points array can be empty in the beginning, so it is important to add
        // initial position to it
        const points: Point[] = element.points.length
          ? element.points
          : [[0, 0]];
        element.shape = [
          //    \
          generator.line(x3, y3, x2, y2, options),
          // -----
          generator.curve(points, options),
          //    /
          generator.line(x4, y4, x2, y2, options),
        ];
        break;
      }
      case "line": {
        const [x1, y1, x2, y2] = getLinePoints(element);
        const options = {
          stroke: element.strokeColor,
          strokeWidth: element.strokeWidth,
          roughness: element.roughness,
          seed: element.seed,
        };
        element.shape = generator.line(x1, y1, x2, y2, options);
        break;
      }
    }
  }
}

export function renderElement(
  element: ExcalidrawElement,
  rc: RoughCanvas,
  context: CanvasRenderingContext2D,
) {
  const generator = rc.generator;
  switch (element.type) {
    case "selection": {
      const fillStyle = context.fillStyle;
      context.fillStyle = "rgba(0, 0, 255, 0.10)";
      context.fillRect(0, 0, element.width, element.height);
      context.fillStyle = fillStyle;
      break;
    }
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "line": {
      generateElement(element, generator);
      context.globalAlpha = element.opacity / 100;
      rc.draw(element.shape as Drawable);
      context.globalAlpha = 1;
      break;
    }
    case "arrow": {
      generateElement(element, generator);
      context.globalAlpha = element.opacity / 100;
      (element.shape as Drawable[]).forEach(shape => rc.draw(shape));
      context.globalAlpha = 1;
      break;
    }
    default: {
      if (isTextElement(element)) {
        context.globalAlpha = element.opacity / 100;
        const font = context.font;
        context.font = element.font;
        const fillStyle = context.fillStyle;
        context.fillStyle = element.strokeColor;
        // Canvas does not support multiline text by default
        const lines = element.text.replace(/\r\n?/g, "\n").split("\n");
        const lineHeight = element.height / lines.length;
        const offset = element.height - element.baseline;
        for (let i = 0; i < lines.length; i++) {
          context.fillText(lines[i], 0, (i + 1) * lineHeight - offset);
        }
        context.fillStyle = fillStyle;
        context.font = font;
        context.globalAlpha = 1;
      } else {
        throw new Error("Unimplemented type " + element.type);
      }
    }
  }
}

export function renderElementToSvg(
  element: ExcalidrawElement,
  rsvg: RoughSVG,
  svgRoot: SVGElement,
  offsetX?: number,
  offsetY?: number,
) {
  const generator = rsvg.generator;
  switch (element.type) {
    case "selection": {
      // Since this is used only during editing experience, which is canvas based,
      // this should not happen
      throw new Error("Selection rendering is not supported for SVG");
    }
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "line": {
      generateElement(element, generator);
      const node = rsvg.draw(element.shape as Drawable);
      const opacity = element.opacity / 100;
      if (opacity !== 1) {
        node.setAttribute("stroke-opacity", `${opacity}`);
        node.setAttribute("fill-opacity", `${opacity}`);
      }
      node.setAttribute(
        "transform",
        `translate(${offsetX || 0} ${offsetY || 0})`,
      );
      svgRoot.appendChild(node);
      break;
    }
    case "arrow": {
      generateElement(element, generator);
      const group = svgRoot.ownerDocument!.createElementNS(SVG_NS, "g");
      const opacity = element.opacity / 100;
      (element.shape as Drawable[]).forEach(shape => {
        const node = rsvg.draw(shape);
        if (opacity !== 1) {
          node.setAttribute("stroke-opacity", `${opacity}`);
          node.setAttribute("fill-opacity", `${opacity}`);
        }
        node.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${offsetY || 0})`,
        );
        group.appendChild(node);
      });
      svgRoot.appendChild(group);
      break;
    }
    default: {
      if (isTextElement(element)) {
        const opacity = element.opacity / 100;
        const node = svgRoot.ownerDocument!.createElementNS(SVG_NS, "g");
        if (opacity !== 1) {
          node.setAttribute("stroke-opacity", `${opacity}`);
          node.setAttribute("fill-opacity", `${opacity}`);
        }
        node.setAttribute(
          "transform",
          `translate(${offsetX || 0} ${offsetY || 0})`,
        );
        const lines = element.text.replace(/\r\n?/g, "\n").split("\n");
        const lineHeight = element.height / lines.length;
        const offset = element.height - element.baseline;
        const fontSplit = element.font.split(" ").filter(d => !!d.trim());
        let fontFamily = fontSplit[0];
        let fontSize = "20px";
        if (fontSplit.length > 1) {
          fontFamily = fontSplit[1];
          fontSize = fontSplit[0];
        }
        for (let i = 0; i < lines.length; i++) {
          const text = svgRoot.ownerDocument!.createElementNS(SVG_NS, "text");
          text.textContent = lines[i];
          text.setAttribute("x", "0");
          text.setAttribute("y", `${(i + 1) * lineHeight - offset}`);
          text.setAttribute("font-family", fontFamily);
          text.setAttribute("font-size", fontSize);
          text.setAttribute("fill", element.strokeColor);
          node.appendChild(text);
        }
        svgRoot.appendChild(node);
      } else {
        throw new Error("Unimplemented type " + element.type);
      }
    }
  }
}
