import React from "react";
import { ProjectName } from "../components/ProjectName";
import { saveAsJSON, loadFromJSON } from "../data";
import { load, save } from "../components/icons";
import { ToolButton } from "../components/ToolButton";
import { t } from "../i18n";
import useIsMobile from "../is-mobile";
import { register } from "./register";

export const actionChangeProjectName = register({
  name: "changeProjectName",
  perform: (_elements, appState, value) => {
    return { appState: { ...appState, name: value } };
  },
  PanelComponent: ({ appState, updateData }) => (
    <ProjectName
      label={t("labels.fileTitle")}
      value={appState.name || "Unnamed"}
      onChange={(name: string) => updateData(name)}
    />
  ),
});

export const actionChangeExportBackground = register({
  name: "changeExportBackground",
  perform: (_elements, appState, value) => {
    return { appState: { ...appState, exportBackground: value } };
  },
  PanelComponent: ({ appState, updateData }) => (
    <label>
      <input
        type="checkbox"
        checked={appState.exportBackground}
        onChange={event => updateData(event.target.checked)}
      />{" "}
      {t("labels.withBackground")}
    </label>
  ),
});

export const actionSaveScene = register({
  name: "saveScene",
  perform: (elements, appState, value) => {
    saveAsJSON(elements, appState).catch(error => console.error(error));
    return {};
  },
  PanelComponent: ({ updateData }) => (
    <ToolButton
      type="button"
      icon={save}
      title={t("buttons.save")}
      aria-label={t("buttons.save")}
      showAriaLabel={useIsMobile()}
      onClick={() => updateData(null)}
    />
  ),
});

export const actionLoadScene = register({
  name: "loadScene",
  perform: (
    elements,
    appState,
    { elements: loadedElements, appState: loadedAppState },
  ) => {
    return { elements: loadedElements, appState: loadedAppState };
  },
  PanelComponent: ({ updateData }) => (
    <ToolButton
      type="button"
      icon={load}
      title={t("buttons.load")}
      aria-label={t("buttons.load")}
      showAriaLabel={useIsMobile()}
      onClick={() => {
        loadFromJSON()
          .then(({ elements, appState }) => {
            updateData({ elements: elements, appState: appState });
          })
          .catch(error => console.error(error));
      }}
    />
  ),
});
