/*
 * Copyright (c) 2026 Lou Amadio and Ranch Hand Robotics, LLC
 * All rights reserved.
 */

import * as BABYLON from 'babylonjs';
import { RobotScene } from './RobotScene';
import { Robot } from './Robot';
import { Link } from './Link';
import { Visual } from './Visual';
import { Material } from './Material';
import { Mesh } from './GeometryMesh';
import {
  OpenSCADCustomizerParseResult,
  OpenSCADCustomizerValue,
  createOpenSCADCustomizerUI,
  injectCustomizerTheme,
  parseOpenSCADCustomizer,
  VSCODE_CUSTOMIZER_THEME,
} from './openscadCustomizer';

import {
  convertOpenSCAD
} from './openscad';

type HostTheme = Record<string, string>;

interface ModelViewerHost {
  theme?: HostTheme;
  visualConfig?: Parameters<RobotScene['setVisualConfig']>[0];
  modelData?: string;
  modelName?: string;
  libraryFiles?: Record<string, string>;
  autoConvertOnLoad?: boolean;
  /** Host-provided element for the built-in customizer UI.
   * When set and renderControls is absent, the library renders
   * its default customizer panel into this element. */
  customizerContainer?: HTMLElement;
  /**
   * CSS variable map applied to customizerContainer before the UI
   * is built.  Use VSCODE_CUSTOMIZER_THEME to match a VS Code
   * webview's color scheme.  Defaults to VSCODE_CUSTOMIZER_THEME
   * when customizerContainer is set and no explicit value is given.
   */
  customizerTheme?: Record<string, string>;
  renderControls?: (
    container: HTMLElement,
    context: {
      getConfiguration: () => Record<string, OpenSCADCustomizerValue>;
      getModelName: () => string | null;
      onConfigurationChange: (
        callback: (detail: unknown) => void
      ) => () => void;
    }
  ) => void;
  onModelLoaded?: (detail: unknown) => void;
  onConfigurationChange?: (detail: unknown) => void;
}

declare global {
  interface Window {
    modelViewerHost?: ModelViewerHost;
  }
}

interface OpenScadViewerState {
  robotScene?: RobotScene;
  currentFileName?: string;
  currentFileContent?: string;
  currentScadContent?: string;
  libraryFiles?: Record<string, string>;
  currentModelData?: Uint8Array;
  currentModelExtension?: '.stl' | '.obj' | '.glb';
  currentModelFromOpenScad?: boolean;
  currentBlobUrl?: string;
  customizerModel?: OpenSCADCustomizerParseResult;
  customizerValues: Record<string, OpenSCADCustomizerValue>;
  hostConfig?: ModelViewerHost;
  renderSessionId: number;
}

const HOST_MESSAGE_SOURCE = 'babylon_ros.viewer';
const HOST_COMMAND_SOURCE = 'babylon_ros.host';

const state: OpenScadViewerState = {
  customizerValues: {},
  renderSessionId: 0,
};

function getElement(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const start = bytes.byteOffset;
  const end = start + bytes.byteLength;
  return bytes.buffer.slice(start, end) as ArrayBuffer;
}

function postHostMessage(type: string, detail: unknown): void {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ source: HOST_MESSAGE_SOURCE, type, detail }, '*');
  }
}

function dispatchHostEvent(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function applyTheme(theme?: HostTheme): void {
  if (!theme) {
    return;
  }

  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    const cssKey = key.startsWith('--') ? key : `--${key}`;
    root.style.setProperty(cssKey, value);
  });
}

function readModelFromQuery(): string | null {
  const url = new URL(window.location.href);
  const modelParam = url.searchParams.get('model');
  const scadParam = url.searchParams.get('scad');
  const collectionParam = url.searchParams.get('collection');
  const itemParam = url.searchParams.get('item') || url.searchParams.get('file');

  if (modelParam) {
    return modelParam;
  }

  if (scadParam) {
    return scadParam;
  }

  if (collectionParam && itemParam) {
    const collection = collectionParam.endsWith('/') ? collectionParam : `${collectionParam}/`;
    const filename = itemParam.endsWith('.scad') ? itemParam : `${itemParam}.scad`;
    return `${collection}${filename}`;
  }

  return null;
}

function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const statusBar = getElement('status') as HTMLDivElement | null;
  if (!statusBar) return;
  
  statusBar.textContent = message;
  statusBar.className = `status ${type}`;
  statusBar.style.display = 'block';

  if (type !== 'error') {
    window.setTimeout(() => {
      if (statusBar.textContent === message) {
        statusBar.style.display = 'none';
      }
    }, 2500);
  }
}

function notifyConfigurationChanged(): void {
  const detail = {
    modelName: state.currentFileName ?? null,
    configuration: { ...state.customizerValues },
  };

  dispatchHostEvent('modelviewer:configurationchange', detail);
  postHostMessage('modelviewer:configurationchange', detail);
  state.hostConfig?.onConfigurationChange?.(detail);
}

function revokeCurrentBlobUrl(): void {
  if (state.currentBlobUrl) {
    URL.revokeObjectURL(state.currentBlobUrl);
    state.currentBlobUrl = undefined;
  }
}

function clearCurrentRobot(): void {
  if (!state.robotScene?.currentRobot) {
    return;
  }

  const robot = state.robotScene.currentRobot;
  state.robotScene.currentRobot = undefined;
  robot.dispose();
}

function renderMeshUri(uri: string, forcedExtension: string): void {
  if (!state.robotScene?.scene) {
    return;
  }

  const renderSessionId = ++state.renderSessionId;

  clearCurrentRobot();

  const robot = new Robot();
  const link = new Link();
  const visual = new Visual();

  const isOpenScadGlb = forcedExtension === '.glb' && state.currentModelFromOpenScad === true;
  const scale = forcedExtension === '.stl' || forcedExtension === '.obj' || isOpenScadGlb
    ? new BABYLON.Vector3(0.001, 0.001, 0.001)
    : new BABYLON.Vector3(1, 1, 1);

  visual.geometry = new Mesh(uri, scale, forcedExtension);
  if (isOpenScadGlb) {
    // Intentionally do not apply an extra visual rotation here.
    // Robot root transform already converts ROS/OpenSCAD Z-up into Babylon Y-up.
  }
  visual.material = new Material();
  visual.material.name = 'default';
  visual.material.color = new BABYLON.Color4(0.95, 0.95, 0.95, 1.0);

  let hasFramed = false;
  const frameWhenReady = () => {
    if (hasFramed || state.renderSessionId !== renderSessionId) {
      return;
    }
    hasFramed = true;
    state.robotScene?.frameModel();
  };

  visual.geometry.setLoadCompleteCallback?.(() => {
    frameWhenReady();
  });

  link.visuals.push(visual);
  robot.links.set('base_link', link);

  state.robotScene.currentRobot = robot;
  robot.create(state.robotScene.scene);

  // Safety fallback in case a loader path does not emit completion callbacks.
  window.setTimeout(() => {
    frameWhenReady();
  }, 1000);
}

function renderBinaryMeshData(
  data: Uint8Array,
  extension: '.stl' | '.obj' | '.glb',
  fromOpenScad: boolean = false
): void {
  state.currentModelData = data;
  state.currentModelExtension = extension;
  state.currentModelFromOpenScad = fromOpenScad;
  revokeCurrentBlobUrl();

  const blobType = extension === '.glb'
    ? 'model/gltf-binary'
    : extension === '.obj'
      ? 'model/obj'
      : 'model/stl';

  const blob = new Blob([toBlobPart(data)], { type: blobType });
  state.currentBlobUrl = URL.createObjectURL(blob);
  renderMeshUri(state.currentBlobUrl, extension);
}

function renderCustomizer(model: OpenSCADCustomizerParseResult): void {
  const customizerContainer = getElement('customizerContainer') as HTMLDivElement | null;
  const noCustomizerMessage = getElement('noCustomizerMessage') as HTMLDivElement | null;

  // Extract default values from model variables
  const defaultValues: Record<string, OpenSCADCustomizerValue> = {};
  model.variables.forEach((variable) => {
    defaultValues[variable.name] = variable.defaultValue;
  });

  // In hosted mode, DOM sidebar elements may not exist.
  // If the host supplied a customizerContainer element, use that
  // to render the built-in customizer UI.
  if (!customizerContainer) {
    const hostEl = state.hostConfig?.customizerContainer;
    if (hostEl && !state.hostConfig?.renderControls) {
      if (!model.variables.length) {
        hostEl.style.display = 'none';
        state.customizerValues = {};
        notifyConfigurationChanged();
        return;
      }

      hostEl.style.display = 'block';
      injectCustomizerTheme(
        hostEl,
        state.hostConfig?.customizerTheme ?? VSCODE_CUSTOMIZER_THEME
      );
      const ui = createOpenSCADCustomizerUI();
      ui.render(hostEl, model, (values) => {
        state.customizerValues = { ...values };
        notifyConfigurationChanged();
      });
      state.customizerValues = ui.getValues();
      notifyConfigurationChanged();
      return;
    }

    // No DOM sidebar and no host container — just propagate defaults.
    state.customizerValues = defaultValues;
    notifyConfigurationChanged();
    return;
  }

  if (!noCustomizerMessage) {
    state.customizerValues = defaultValues;
    notifyConfigurationChanged();
    return;
  }

  if (!model.variables.length) {
    customizerContainer.style.display = 'none';
    noCustomizerMessage.style.display = 'block';
    state.customizerValues = {};
    notifyConfigurationChanged();
    return;
  }

  customizerContainer.style.display = 'block';
  noCustomizerMessage.style.display = 'none';

  const ui = createOpenSCADCustomizerUI();
  ui.render(customizerContainer, model, (values) => {
    state.customizerValues = { ...values };
    notifyConfigurationChanged();
  });

  state.customizerValues = ui.getValues();
  notifyConfigurationChanged();
}

function updateFileInfo(filename: string, source: string, size: number): void {
  const fileInfo = getElement('fileInfo') as HTMLDivElement | null;
  if (!fileInfo) return;
  
  fileInfo.style.display = 'block';
  fileInfo.innerHTML = `<strong>${filename}</strong><br>Source: ${source}<br>Size: ${(size / 1024).toFixed(1)} KB`;
}

function setCurrentFile(name: string, content: string): void {
  state.currentFileName = name;
  state.currentFileContent = content;
}

function handleScadFile(filename: string, content: string): void {
  setCurrentFile(filename, content);
  state.currentScadContent = content;
  state.customizerModel = parseOpenSCADCustomizer(content, filename);
  renderCustomizer(state.customizerModel);

  const convertButton = getElement('convertButton') as HTMLButtonElement | null;
  if (convertButton) convertButton.disabled = false;
  showStatus('OpenSCAD loaded. Convert to preview.', 'success');

  const detail = {
    modelName: filename,
    source: 'scad',
    configuration: { ...state.customizerValues },
    variables: state.customizerModel?.variables ?? [],
  };

  dispatchHostEvent('modelviewer:modelloaded', detail);
  postHostMessage('modelviewer:modelloaded', detail);
  state.hostConfig?.onModelLoaded?.(detail);
}

async function loadModelFromRemoteUrl(modelUrl: string): Promise<void> {
  try {
    showStatus(`Loading ${modelUrl}...`, 'info');
    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();
    const filename = modelUrl.split('/').pop() || 'model.scad';
    updateFileInfo(filename, modelUrl, content.length);
    handleScadFile(filename, content);
  } catch (error: unknown) {
    const message = `Failed to load ${modelUrl}: ${error instanceof Error ? error.message : String(error)}`;
    showStatus(message, 'error');
    postHostMessage('modelviewer:error', { message, modelUrl });
  }
}

async function convertAndRenderCurrentScad(): Promise<void> {
  if (!state.currentScadContent || !state.currentFileName) {
    showStatus('No OpenSCAD file loaded.', 'error');
    return;
  }

  const convertButton = getElement('convertButton') as HTMLButtonElement | null;
  const downloadButton = getElement('downloadButton') as HTMLButtonElement | null;

  if (convertButton) convertButton.disabled = true;
  showStatus('Converting OpenSCAD to GLB...', 'info');

  try {
    const response = await convertOpenSCAD({
      scadContent: state.currentScadContent,
      filename: state.currentFileName,
      exportFormat: 'glb',
      parameterOverrides: state.customizerValues,
      libraryFiles: state.libraryFiles || {},
    });

    if (!response.success || !response.outputData) {
      throw new Error(response.error || 'OpenSCAD conversion failed');
    }

    renderBinaryMeshData(response.outputData, '.glb', true);
    if (downloadButton) downloadButton.disabled = false;
    showStatus('Rendered OpenSCAD model with GLB export.', 'success');
  } catch (error: unknown) {
    showStatus(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    if (convertButton) convertButton.disabled = false;
  }
}

function applyConfigurationOverrides(configuration: Record<string, OpenSCADCustomizerValue>): void {
  state.customizerValues = { ...state.customizerValues, ...configuration };
  notifyConfigurationChanged();
  void convertAndRenderCurrentScad();
}

async function downloadCurrentModel(): Promise<void> {
  if (!state.currentModelData || !state.currentModelExtension) {
    showStatus('No converted model to download.', 'error');
    return;
  }

  const downloadName = (state.currentFileName || 'model.scad').replace(/\.[^/.]+$/, state.currentModelExtension);
  const blob = new Blob([toBlobPart(state.currentModelData)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  link.click();
  URL.revokeObjectURL(url);
}

async function handleFileUpload(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  const extension = file.name.toLowerCase().split('.').pop();
  updateFileInfo(file.name, 'upload', file.size);

  if (extension === 'scad') {
    const text = await file.text();
    handleScadFile(file.name, text);
    return;
  }

  if (extension === 'stl' || extension === 'obj' || extension === 'glb') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (extension === 'stl') {
      setCurrentFile(file.name, '');
      renderBinaryMeshData(bytes, '.stl');
      const downloadButton = getElement('downloadButton') as HTMLButtonElement | null;
      if (downloadButton) downloadButton.disabled = false;
      showStatus('STL preview updated.', 'success');
      return;
    }

    if (extension === 'obj') {
      setCurrentFile(file.name, '');
      renderBinaryMeshData(bytes, '.obj');
      showStatus('OBJ preview updated.', 'success');
      return;
    }

    if (extension === 'glb') {
      setCurrentFile(file.name, '');
      renderBinaryMeshData(bytes, '.glb');
      showStatus('GLB preview updated.', 'success');
      return;
    }
  }

  showStatus('Supported file types: .scad, .stl, .obj, .glb', 'error');
}

function initializeHostControls(): void {
  const section = document.getElementById('hostControlsSection') as HTMLDivElement | null;
  const container = document.getElementById('hostControlsContainer') as HTMLDivElement | null;
  if (!section || !container || !state.hostConfig?.renderControls) {
    return;
  }

  section.style.display = 'block';
  container.innerHTML = '';

  try {
    state.hostConfig.renderControls(container, {
      getConfiguration: () => ({ ...state.customizerValues }),
      getModelName: () => state.currentFileName ?? null,
      onConfigurationChange: (callback) => {
        const handler = (event: Event) => callback((event as CustomEvent).detail);
        window.addEventListener('modelviewer:configurationchange', handler);
        return () => window.removeEventListener('modelviewer:configurationchange', handler);
      },
    });
  } catch (error: unknown) {
    showStatus(
      `Host controls failed: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

async function handleHostMessage(event: MessageEvent): Promise<void> {
  const data = event.data;
  if (!data || typeof data !== 'object' || data.source !== HOST_COMMAND_SOURCE) {
    return;
  }

  if (data.command === 'loadModel' && typeof data.url === 'string') {
    await loadModelFromRemoteUrl(data.url);
    return;
  }

  if (data.command === 'reloadFromQuery') {
    const model = readModelFromQuery();
    if (model) {
      await loadModelFromRemoteUrl(model);
    }
    return;
  }

  if (data.command === 'applyConfiguration' && typeof data.configuration === 'object' && data.configuration) {
    applyConfigurationOverrides(data.configuration as Record<string, OpenSCADCustomizerValue>);
    return;
  }

  if (data.command === 'applyTheme') {
    if (typeof data.theme === 'object') {
      applyTheme(data.theme as HostTheme);
    }
  }
}

function wireUiEvents(): void {
  const fileInput = getElement('fileInput') as HTMLInputElement | null;
  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      void handleFileUpload(event);
    });
  }

  const convertButton = getElement('convertButton') as HTMLButtonElement | null;
  if (convertButton) {
    convertButton.addEventListener('click', () => {
      void convertAndRenderCurrentScad();
    });
  }

  const downloadButton = getElement('downloadButton') as HTMLButtonElement | null;
  if (downloadButton) {
    downloadButton.addEventListener('click', () => {
      void downloadCurrentModel();
    });
  }

  const resetView = getElement('resetView') as HTMLButtonElement | null;
  if (resetView) {
    resetView.addEventListener('click', () => {
      state.robotScene?.resetCamera();
      showStatus('Camera reset.', 'success');
    });
  }

  const toggleGrid = getElement('toggleGrid') as HTMLButtonElement | null;
  if (toggleGrid) {
    toggleGrid.addEventListener('click', () => {
      state.robotScene?.toggleGridUnits('1m');
    });
  }

  window.addEventListener('message', (event) => {
    void handleHostMessage(event);
  });
}

function startRenderLoop(robotScene: RobotScene): void {
  if (!robotScene.engine || !robotScene.scene) {
    return;
  }

  robotScene.engine.runRenderLoop(() => {
    robotScene.scene?.render();
  });

  window.addEventListener('resize', () => {
    robotScene.engine?.resize();
  });
}

export interface ViewerOptions {
  canvas: HTMLCanvasElement;
  theme?: HostTheme;
  visualConfig?: Parameters<RobotScene['setVisualConfig']>[0];
  modelData?: string;
  modelName?: string;
  libraryFiles?: Record<string, string>;
  autoConvertOnLoad?: boolean;
  /** Optional element to receive the built-in customizer UI when the
   * host does not supply a renderControls callback. */
  customizerContainer?: HTMLElement;
  /**
   * CSS variable map applied to customizerContainer.
   * Defaults to VSCODE_CUSTOMIZER_THEME, which maps customizer
   * variables to VS Code webview CSS variables.
   * Pass an empty object `{}` to skip all theme injection.
   */
  customizerTheme?: Record<string, string>;
  onModelLoaded?: (detail: unknown) => void;
  onConfigurationChange?: (detail: unknown) => void;
}

export interface ViewerAPI {
  loadModelFromUrl(url: string): Promise<void>;
  loadModelData(content: string, name: string): Promise<void>;
  applyTheme(theme: HostTheme): void;
  getConfiguration(): Record<string, OpenSCADCustomizerValue>;
  getCustomizerVariables(): import('./openscadCustomizer').OpenSCADCustomizerVariable[];
  setConfiguration(config: Record<string, OpenSCADCustomizerValue>): Promise<void>;
  getModelName(): string | null;
  resetCamera(): void;
  toggleGrid(): void;
  convertAndPreview(): Promise<void>;
  downloadModel(): Promise<void>;
  resizeRenderer(): void;
}

export async function RenderOpenScadDirect(options: ViewerOptions): Promise<ViewerAPI> {
  const canvas = options.canvas;
  
  state.hostConfig = {
    theme: options.theme,
    visualConfig: options.visualConfig,
    modelData: options.modelData,
    modelName: options.modelName,
    libraryFiles: options.libraryFiles,
    autoConvertOnLoad: options.autoConvertOnLoad,
    customizerContainer: options.customizerContainer,
    customizerTheme: options.customizerTheme,
    onModelLoaded: options.onModelLoaded,
    onConfigurationChange: options.onConfigurationChange,
  };
  
  state.libraryFiles = options.libraryFiles;
  applyTheme(options.theme);

  const robotScene = new RobotScene();
  await robotScene.createScene(canvas);
  robotScene.createUI();

  if (options.visualConfig) {
    robotScene.setVisualConfig(options.visualConfig);
  }

  state.robotScene = robotScene;
  startRenderLoop(robotScene);

  if (options.modelData && options.modelName) {
    updateFileInfo(options.modelName, 'direct-config', options.modelData.length);
    handleScadFile(options.modelName, options.modelData);
    if (options.autoConvertOnLoad ?? true) {
      await convertAndRenderCurrentScad();
    }
  }

  // Return public API
  return {
    loadModelFromUrl: loadModelFromRemoteUrl,
    loadModelData: async (content: string, name: string) => {
      updateFileInfo(name, 'upload', content.length);
      handleScadFile(name, content);
      await convertAndRenderCurrentScad();
    },
    applyTheme: applyTheme,
    getConfiguration: () => ({ ...state.customizerValues }),
    getCustomizerVariables: () => state.customizerModel?.variables ?? [],
    setConfiguration: async (config: Record<string, OpenSCADCustomizerValue>) => {
      applyConfigurationOverrides(config);
    },
    getModelName: () => state.currentFileName ?? null,
    resetCamera: () => state.robotScene?.resetCamera(),
    toggleGrid: () => state.robotScene?.toggleGridUnits('1m'),
    convertAndPreview: convertAndRenderCurrentScad,
    downloadModel: downloadCurrentModel,
    resizeRenderer: () => state.robotScene?.engine?.resize(),
  };
}

export async function RenderOpenScadMain(): Promise<void> {
  const canvas = getElement('renderCanvas') as unknown as HTMLCanvasElement;

  state.hostConfig = window.modelViewerHost;
  state.libraryFiles = state.hostConfig?.libraryFiles;
  applyTheme(state.hostConfig?.theme);

  const robotScene = new RobotScene();
  await robotScene.createScene(canvas);
  robotScene.createUI();

  if (state.hostConfig?.visualConfig) {
    robotScene.setVisualConfig(state.hostConfig.visualConfig);
  }

  state.robotScene = robotScene;

  wireUiEvents();
  initializeHostControls();
  startRenderLoop(robotScene);

  if (state.hostConfig?.modelData) {
    const hostName = state.hostConfig.modelName || 'host-model.scad';
    updateFileInfo(hostName, 'host-config', state.hostConfig.modelData.length);
    handleScadFile(hostName, state.hostConfig.modelData);
    if (state.hostConfig.autoConvertOnLoad ?? true) {
      await convertAndRenderCurrentScad();
    }
  } else {
    const queryModel = readModelFromQuery();
    if (queryModel) {
      await loadModelFromRemoteUrl(queryModel);
    }
  }

  dispatchHostEvent('modelviewer:ready', {
    hostConfigEnabled: Boolean(state.hostConfig),
  });
  postHostMessage('modelviewer:ready', {
    hostConfigEnabled: Boolean(state.hostConfig),
    viewerVersion: '2.0',
    supportsHostCommands: true,
  });
}
