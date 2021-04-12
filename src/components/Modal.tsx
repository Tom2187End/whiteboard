import "./Modal.scss";

import React, { useState, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { KEYS } from "../keys";
import { useIsMobile } from "../components/App";

export const Modal = (props: {
  className?: string;
  children: React.ReactNode;
  maxWidth?: number;
  onCloseRequest(): void;
  labelledBy: string;
}) => {
  const modalRoot = useBodyRoot();

  if (!modalRoot) {
    return null;
  }

  const handleKeydown = (event: React.KeyboardEvent) => {
    if (event.key === KEYS.ESCAPE) {
      event.nativeEvent.stopImmediatePropagation();
      event.stopPropagation();
      props.onCloseRequest();
    }
  };

  return createPortal(
    <div
      className={clsx("Modal", props.className)}
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeydown}
      aria-labelledby={props.labelledBy}
    >
      <div className="Modal__background" onClick={props.onCloseRequest}></div>
      <div
        className="Modal__content"
        style={{ "--max-width": `${props.maxWidth}px` }}
        tabIndex={0}
      >
        {props.children}
      </div>
    </div>,
    modalRoot,
  );
};

const useBodyRoot = () => {
  const [div, setDiv] = useState<HTMLDivElement | null>(null);

  const isMobile = useIsMobile();
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  useLayoutEffect(() => {
    if (div) {
      div.classList.toggle("excalidraw--mobile", isMobile);
    }
  }, [div, isMobile]);

  useLayoutEffect(() => {
    const isDarkTheme = !!document
      .querySelector(".excalidraw")
      ?.classList.contains("theme--dark");
    const div = document.createElement("div");

    div.classList.add("excalidraw", "excalidraw-modal-container");
    div.classList.toggle("excalidraw--mobile", isMobileRef.current);

    if (isDarkTheme) {
      div.classList.add("theme--dark");
      div.classList.add("theme--dark-background-none");
    }
    document.body.appendChild(div);

    setDiv(div);

    return () => {
      document.body.removeChild(div);
    };
  }, []);

  return div;
};
