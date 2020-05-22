import {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "../element/types";
import { getNonDeletedElements } from "../element";

export interface SceneStateCallback {
  (): void;
}

export interface SceneStateCallbackRemover {
  (): void;
}

class GlobalScene {
  private nonDeletedElements: readonly NonDeletedExcalidrawElement[] = [];
  private callbacks: Set<SceneStateCallback> = new Set();

  constructor(private _elements: readonly ExcalidrawElement[] = []) {}

  getElementsIncludingDeleted() {
    return this._elements;
  }

  getElements(): readonly NonDeletedExcalidrawElement[] {
    return this.nonDeletedElements;
  }

  replaceAllElements(nextElements: readonly ExcalidrawElement[]) {
    this._elements = nextElements;
    this.nonDeletedElements = getNonDeletedElements(this._elements);
    this.informMutation();
  }

  informMutation() {
    for (const callback of Array.from(this.callbacks)) {
      callback();
    }
  }

  addCallback(cb: SceneStateCallback): SceneStateCallbackRemover {
    if (this.callbacks.has(cb)) {
      throw new Error();
    }

    this.callbacks.add(cb);

    return () => {
      if (!this.callbacks.has(cb)) {
        throw new Error();
      }
      this.callbacks.delete(cb);
    };
  }
}

export const globalSceneState = new GlobalScene();
