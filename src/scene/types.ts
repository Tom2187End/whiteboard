import { ExcalidrawTextElement } from "../element/types";
import { FlooredNumber } from "../types";

export type SceneState = {
  scrollX: FlooredNumber;
  scrollY: FlooredNumber;
  // null indicates transparent bg
  viewBackgroundColor: string | null;
  zoom: number;
  remotePointerViewportCoords: { [id: string]: { x: number; y: number } };
};

export type SceneScroll = {
  scrollX: FlooredNumber;
  scrollY: FlooredNumber;
};

export interface Scene {
  elements: ExcalidrawTextElement[];
}

export type ExportType = "png" | "clipboard" | "backend" | "svg";

export type ScrollBars = {
  horizontal: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  vertical: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};
