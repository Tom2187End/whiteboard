import { fileSave } from "browser-nativefs";
import { EVENT_IO, trackEvent } from "../analytics";
import {
  copyCanvasToClipboardAsPng,
  copyTextToSystemClipboard,
} from "../clipboard";
import { NonDeletedExcalidrawElement } from "../element/types";
import { t } from "../i18n";
import { exportToCanvas, exportToSvg } from "../scene/export";
import { ExportType } from "../scene/types";
import { canvasToBlob } from "./blob";
import { AppState } from "../types";
import { serializeAsJSON } from "./json";

export { loadFromBlob } from "./blob";
export { loadFromJSON, saveAsJSON } from "./json";

export const exportCanvas = async (
  type: ExportType,
  elements: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
  canvas: HTMLCanvasElement,
  {
    exportBackground,
    exportPadding = 10,
    viewBackgroundColor,
    name,
    scale = 1,
    shouldAddWatermark,
  }: {
    exportBackground: boolean;
    exportPadding?: number;
    viewBackgroundColor: string;
    name: string;
    scale?: number;
    shouldAddWatermark: boolean;
  },
) => {
  if (elements.length === 0) {
    return window.alert(t("alerts.cannotExportEmptyCanvas"));
  }
  if (type === "svg" || type === "clipboard-svg") {
    const tempSvg = exportToSvg(elements, {
      exportBackground,
      viewBackgroundColor,
      exportPadding,
      scale,
      shouldAddWatermark,
      metadata:
        appState.exportEmbedScene && type === "svg"
          ? await (
              await import(/* webpackChunkName: "image" */ "./image")
            ).encodeSvgMetadata({
              text: serializeAsJSON(elements, appState),
            })
          : undefined,
    });
    if (type === "svg") {
      await fileSave(new Blob([tempSvg.outerHTML], { type: "image/svg+xml" }), {
        fileName: `${name}.svg`,
        extensions: [".svg"],
      });
      trackEvent(EVENT_IO, "export", "svg");
      return;
    } else if (type === "clipboard-svg") {
      trackEvent(EVENT_IO, "export", "clipboard-svg");
      copyTextToSystemClipboard(tempSvg.outerHTML);
      return;
    }
  }

  const tempCanvas = exportToCanvas(elements, appState, {
    exportBackground,
    viewBackgroundColor,
    exportPadding,
    scale,
    shouldAddWatermark,
  });
  tempCanvas.style.display = "none";
  document.body.appendChild(tempCanvas);

  if (type === "png") {
    const fileName = `${name}.png`;
    let blob = await canvasToBlob(tempCanvas);
    if (appState.exportEmbedScene) {
      blob = await (
        await import(/* webpackChunkName: "image" */ "./image")
      ).encodePngMetadata({
        blob,
        metadata: serializeAsJSON(elements, appState),
      });
    }

    await fileSave(blob, {
      fileName,
      extensions: [".png"],
    });
    trackEvent(EVENT_IO, "export", "png");
  } else if (type === "clipboard") {
    try {
      await copyCanvasToClipboardAsPng(tempCanvas);
      trackEvent(EVENT_IO, "export", "clipboard-png");
    } catch (error) {
      if (error.name === "CANVAS_POSSIBLY_TOO_BIG") {
        throw error;
      }
      throw new Error(t("alerts.couldNotCopyToClipboard"));
    }
  }

  // clean up the DOM
  if (tempCanvas !== canvas) {
    tempCanvas.remove();
  }
};
