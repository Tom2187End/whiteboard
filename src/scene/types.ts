import { ExcalidrawTextElement } from "../element/types";

export type SceneState = {
  scrollX: number;
  scrollY: number;
  // null indicates transparent bg
  viewBackgroundColor: string | null;
  zoom: number;
};

export type SceneScroll = {
  scrollX: number;
  scrollY: number;
};

export interface Scene {
  elements: ExcalidrawTextElement[];
}

export type ExportType = "png" | "clipboard" | "backend" | "svg";
