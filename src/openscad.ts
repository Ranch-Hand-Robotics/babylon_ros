/**
 * openscad-node.ts
 * Node.js-compatible OpenSCAD utilities for use in VS Code extensions and Node.js tools.
 * Provides library scanning, validation, and documentation generation using the
 * local openscad-wasm build. Does NOT depend on browser APIs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { pathToFileURL } from 'url';
import { fork } from 'child_process';

import {
  OpenSCADCustomizerValue,
} from './openscadCustomizer';


// ── Interfaces ────────────────────────────────────────────────────────────────

export interface OpenSCADValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface OpenSCADLibraryModule {
  name: string;
  parameters: string[];
  description?: string;
  line: number;
}

export interface OpenSCADLibraryFile {
  path: string;
  relativePath: string;
  libraryRoot: string;
  headerComment?: string;
  modules: OpenSCADLibraryModule[];
  functions: OpenSCADLibraryModule[];
}

export interface OpenSCADLibrariesDocumentation {
  libraries: OpenSCADLibraryFile[];
  generatedAt: string;
  libraryPaths: string[];
}


/**
 * OpenSCAD conversion request for Web Worker
 */
export interface OpenSCADConversionRequest {
  scadContent: string;
  filename: string;
  libraryFiles?: { [virtualPath: string]: string }; // Base64 encoded
  timeout?: number;
  exportFormat?: 'stl' | 'svg' | 'glb';
  parameterOverrides?: Record<string, OpenSCADCustomizerValue>;
  /** Optional absolute URL to openscad.js runtime entrypoint */
  openscadScriptUrl?: string;
}

/**
 * OpenSCAD conversion response from Web Worker
 */
export interface OpenSCADConversionResponse {
  success: boolean;
  outputData?: Uint8Array; // Binary STL/SVG/GLB data
  outputFormat?: string; // 'stl', 'svg', or 'glb'
  filename?: string;
  error?: string;
  logs?: string[]; // Captured stderr/stdout messages from OpenSCAD
  progress?: string;
}

// ── WASM loader ───────────────────────────────────────────────────────────────

/** Directories to skip when scanning for library files */
const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'venv',
  '.venv',
  'env',
  '.env',
  '__pycache__',
  '.pytest_cache',
  '.tox',
  'dist',
  'build',
  '.cache',
  '.vscode',
  '.idea',
  'target',  // Rust/Java build directories
  'bin',
  'obj',
]);

let _wasmFactoryCache: ((options: any) => Promise<any>) | null = null;

/**
 * Locate the directory containing the openscad-wasm build files.
 * Works both in the published package (dist/openscad-wasm/) and in the local
 * development tree (openscad-wasm-build/build/).
 */
function getWasmDir(): string {
  // When running from the built dist/openscad-node.js bundle
  const distWasmDir = path.join(__dirname, 'openscad-wasm');
  if (fs.existsSync(path.join(distWasmDir, 'openscad.wasm'))) {
    return distWasmDir;
  }
  // When running from the development source tree (src/openscad-node.ts)
  const devWasmDir = path.join(__dirname, '..', 'openscad-wasm-build', 'build');
  if (fs.existsSync(path.join(devWasmDir, 'openscad.wasm'))) {
    return devWasmDir;
  }
  // Fallback: assume dist layout
  return distWasmDir;
}

/**
 * Load the openscad.wasm.js ES module dynamically without webpack bundling it.
 * The /* webpackIgnore: true * / comment tells webpack to leave this dynamic
 * import as-is in the output bundle.
 */
async function getOpenSCADFactory(): Promise<(options: any) => Promise<any>> {
  if (_wasmFactoryCache) {
    return _wasmFactoryCache;
  }
  const wasmDir = getWasmDir();
  const wasmJsPath = path.join(wasmDir, 'openscad.wasm.js');
  const wasmJsUrl = pathToFileURL(wasmJsPath).href;

  // webpackIgnore: true — do NOT bundle this import
  const mod = await import(/* webpackIgnore: true */ wasmJsUrl);
  _wasmFactoryCache = mod.default ?? mod;
  return _wasmFactoryCache!;
}

/**
 * Create a fresh OpenSCAD WASM instance ready for use.
 * Provides the wasm binary directly to bypass URL-based loading.
 */
async function createOpenSCADInstance(
  stdout?: (text: string) => void,
  stderr?: (text: string) => void,
): Promise<any> {
  const factory = await getOpenSCADFactory();
  const wasmDir = getWasmDir();
  const wasmBinary = fs.readFileSync(path.join(wasmDir, 'openscad.wasm'));

  return factory({
    noInitialRun: true,
    wasmBinary,
    locateFile: (filename: string) => path.join(wasmDir, filename),
    print: stdout ?? (() => { /* noop */ }),
    printErr: stderr ?? (() => { /* noop */ }),
  });
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Returns true when filePath has a .scad extension (case-insensitive). */
export function isOpenSCADFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.scad';
}

/**
 * Returns the OS-specific default OpenSCAD library paths.
 * These are the same directories used by the desktop OpenSCAD application.
 */
export function getDefaultOpenSCADLibraryPaths(): string[] {
  const home = os.homedir();
  const platform = os.platform();

  if (platform === 'win32') {
    return [path.join(home, 'Documents', 'OpenSCAD', 'libraries')];
  }
  if (platform === 'darwin') {
    return [path.join(home, 'Documents', 'OpenSCAD', 'libraries')];
  }
  return [path.join(home, '.local', 'share', 'OpenSCAD', 'libraries')];
}

/**
 * Returns all OpenSCAD library paths: default OS paths plus any
 * configured extra paths. Non-existent directories are filtered out.
 *
 * @param workspaceRoot  Optional workspace root for ${workspaceFolder} substitution.
 * @param configuredPaths  Extra paths from extension settings.
 */
export async function getAllOpenSCADLibraryPaths(
  workspaceRoot?: string,
  configuredPaths?: string[],
): Promise<string[]> {
  const candidates: string[] = [...getDefaultOpenSCADLibraryPaths()];

  if (configuredPaths) {
    for (const rawPath of configuredPaths) {
      const resolved = workspaceRoot
        ? rawPath.replace(/\$\{workspaceFolder\}/g, workspaceRoot)
        : rawPath;
      candidates.push(resolved);
    }
  }

  const existing: string[] = [];
  for (const p of candidates) {
    try {
      const stat = await fs.promises.stat(p);
      if (stat.isDirectory()) {
        existing.push(p);
      }
    } catch {
      // Directory does not exist — skip silently
    }
  }
  return existing;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate an OpenSCAD file by compiling it with the WASM runtime.
 *
 * @param filePath  Path to the .scad file (used for reading when content is omitted).
 * @param content   Optional: SCAD source to validate instead of reading the file.
 * @param workspaceRoot  Optional: workspace root for library resolution.
 */
export async function validateOpenSCAD(
  filePath: string,
  content?: string,
  workspaceRoot?: string,
): Promise<OpenSCADValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const scadContent = content ?? fs.readFileSync(filePath, 'utf8');

    const instance = await createOpenSCADInstance(
      (_text: string) => { /* stdout — ignore render output */ },
      (text: string) => {
        if (/ERROR|error/.test(text)) {
          errors.push(text);
        } else if (/WARNING|warning/.test(text)) {
          warnings.push(text);
        }
      },
    );

    // Write the SCAD source to the virtual FS
    instance.FS.writeFile('/input.scad', scadContent);

    // A dry-run echo export is the lightest way to surface parse errors
    const exitCode: number = instance.callMain(['/input.scad', '-o', '/output.echo']);

    return {
      valid: exitCode === 0 && errors.length === 0,
      errors,
      warnings,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
      warnings: [],
    };
  }
}

// ── Library documentation ─────────────────────────────────────────────────────

/** Extract the leading block comment (/** ... *\/ or /* ... *\/) from file content. */
function extractHeaderComment(content: string): string | undefined {
  const match = content.match(/^\s*(\/\*[\s\S]*?\*\/)/);
  return match ? match[1].replace(/^\/\*+\s*/, '').replace(/\s*\*+\/$/, '').trim() : undefined;
}

/** Extract module/function definitions and their parameter lists. */
function extractDefinitions(content: string): { modules: OpenSCADLibraryModule[]; functions: OpenSCADLibraryModule[] } {
  const modules: OpenSCADLibraryModule[] = [];
  const functions: OpenSCADLibraryModule[] = [];
  const lines = content.split('\n');

  // Regex: optional preceding // comment line is handled by tracking pendingDoc
  const defRegex = /^\s*(module|function)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/;
  const commentRegex = /^\s*\/\/(.*)$/;

  let pendingDoc: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const commentMatch = line.match(commentRegex);
    if (commentMatch) {
      pendingDoc = commentMatch[1].trim();
      continue;
    }

    const defMatch = line.match(defRegex);
    if (defMatch) {
      const kind = defMatch[1] as 'module' | 'function';
      const name = defMatch[2];
      const paramStr = defMatch[3].trim();
      const parameters = paramStr
        ? paramStr.split(',').map(p => p.trim()).filter(Boolean)
        : [];

      const def: OpenSCADLibraryModule = { name, parameters, line: i + 1 };
      if (pendingDoc) {
        def.description = pendingDoc;
      }
      if (kind === 'module') {
        modules.push(def);
      } else {
        functions.push(def);
      }
    }

    pendingDoc = undefined;
  }

  return { modules, functions };
}

/** Recursively collect all .scad files from a directory, skipping excluded dirs. */
async function collectScadFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectScadFiles(fullPath);
      results.push(...sub);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.scad')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Scan library paths and generate structured documentation.
 *
 * @param workspaceRoot  Optional workspace root for ${workspaceFolder} substitution.
 * @param configuredPaths  Extra paths from extension settings (e.g. urdf-editor.OpenSCADLibraryPaths).
 */
export async function generateOpenSCADLibrariesDocumentation(
  workspaceRoot?: string,
  configuredPaths?: string[],
): Promise<OpenSCADLibrariesDocumentation> {
  const libraryPaths = await getAllOpenSCADLibraryPaths(workspaceRoot, configuredPaths);
  const libraries: OpenSCADLibraryFile[] = [];

  for (const libRoot of libraryPaths) {
    const files = await collectScadFiles(libRoot);
    for (const filePath of files) {
      let content: string;
      try {
        content = await fs.promises.readFile(filePath, 'utf8');
      } catch {
        continue;
      }

      const headerComment = extractHeaderComment(content);
      const { modules, functions } = extractDefinitions(content);

      if (modules.length === 0 && functions.length === 0 && !headerComment) {
        continue; // Nothing useful to document
      }

      libraries.push({
        path: filePath,
        relativePath: path.relative(libRoot, filePath),
        libraryRoot: libRoot,
        headerComment,
        modules,
        functions,
      });
    }
  }

  return {
    libraries,
    generatedAt: new Date().toISOString(),
    libraryPaths,
  };
}

/**
 * Convert an OpenSCADLibrariesDocumentation object into a Markdown string
 * suitable for consumption by AI assistants or documentation sites.
 */
export function convertLibrariesDocumentationToMarkdown(
  doc: OpenSCADLibrariesDocumentation,
): string {
  const lines: string[] = [
    '# OpenSCAD Libraries Documentation',
    '',
    `Generated: ${doc.generatedAt}`,
    '',
    `Library paths scanned:`,
    ...doc.libraryPaths.map(p => `- \`${p}\``),
    '',
    `Found **${doc.libraries.length}** library file(s).`,
    '',
  ];

  for (const lib of doc.libraries) {
    lines.push(`## ${lib.relativePath}`, '');
    lines.push(`**Path:** \`${lib.path}\``, '');

    if (lib.headerComment) {
      lines.push(lib.headerComment, '');
    }

    if (lib.modules.length > 0) {
      lines.push('### Modules', '');
      for (const mod of lib.modules) {
        const sig = `${mod.name}(${mod.parameters.join(', ')})`;
        lines.push(`#### \`${sig}\``);
        if (mod.description) {
          lines.push('', mod.description);
        }
        lines.push('');
      }
    }

    if (lib.functions.length > 0) {
      lines.push('### Functions', '');
      for (const fn of lib.functions) {
        const sig = `${fn.name}(${fn.parameters.join(', ')})`;
        lines.push(`#### \`${sig}\``);
        if (fn.description) {
          lines.push('', fn.description);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Convenience wrapper: generate documentation and write it to a Markdown file.
 */
export async function generateAndSaveLibrariesDocumentation(
  outputPath: string,
  workspaceRoot?: string,
  configuredPaths?: string[],
): Promise<void> {
  const doc = await generateOpenSCADLibrariesDocumentation(workspaceRoot, configuredPaths);
  const markdown = convertLibrariesDocumentationToMarkdown(doc);
  await fs.promises.writeFile(outputPath, markdown, 'utf8');
}

// ── Node.js Worker Export Types ───────────────────────────────────────────────

/**
 * Configuration for OpenSCAD parameter overrides (Node.js worker)
 */
export interface OpenSCADParameterConfiguration {
  jsonContent: string;
  parameterSetName: string;
}

/**
 * Request interface for Node.js OpenSCAD worker
 */
export interface OpenSCADNodeConversionRequest {
  scadFilePath: string;
  libraryFiles: { [virtualPath: string]: string }; // Base64 encoded content
  workspaceRoot?: string;
  timeout?: number; // Custom timeout in milliseconds
  exportFormat?: 'stl' | 'svg' | 'glb'; // Export format
  parameterOverrides?: Record<string, OpenSCADCustomizerValue>;
  parameterConfiguration?: OpenSCADParameterConfiguration;
}

/**
 * Response interface for Node.js OpenSCAD worker
 */
export interface OpenSCADNodeConversionResponse {
  success: boolean;
  outputPath?: string;
  error?: string;
  progress?: string;
}

export interface OpenSCADNodeConversionOptions {
  timeout?: number;
  outputFormat?: 'stl' | 'glb';
  parameterOverrides?: Record<string, OpenSCADCustomizerValue>;
  parameterConfiguration?: OpenSCADParameterConfiguration;
}

/**
 * Get the path to the OpenSCAD Node.js worker module.
 * Can be used by Node.js applications (like RDE MCP Server) to spawn worker processes.
 * 
 * @returns Path to the compiled openscadWorker.js file
 */
export function getOpenSCADNodeWorkerPath(): string {
  // Node-target worker is emitted under dist/workers.
  return path.join(__dirname, 'workers', 'openscadWorker.node.js');
}

/**
 * Check if the OpenSCAD Node.js worker is available at the expected location.
 */
export function isOpenSCADNodeWorkerAvailable(): boolean {
  const workerPath = getOpenSCADNodeWorkerPath();
  return fs.existsSync(workerPath);
}

/**
 * Convert an OpenSCAD file using the Node.js worker process.
 * This keeps OpenSCAD execution off the extension host thread.
 */
export function convertOpenSCADWithNodeWorker(
  scadFilePath: string,
  trace?: any,
  options?: OpenSCADNodeConversionOptions,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (!fs.existsSync(scadFilePath)) {
      trace?.appendLine(`Error: SCAD file not found: ${scadFilePath}`);
      resolve(null);
      return;
    }

    const workerPath = getOpenSCADNodeWorkerPath();
    if (!fs.existsSync(workerPath)) {
      trace?.appendLine(`Error: OpenSCAD worker not found: ${workerPath}`);
      resolve(null);
      return;
    }

    const timeout = options?.timeout ?? 300000;
    const worker = fork(workerPath, [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    let settled = false;

    const finish = (result: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        worker.kill();
      } catch {
        // best effort
      }
      resolve(result);
    };

    const timeoutHandle = setTimeout(() => {
      trace?.appendLine(`OpenSCAD worker conversion timed out after ${timeout}ms`);
      finish(null);
    }, timeout);

    worker.on('message', (message: OpenSCADNodeConversionResponse) => {
      if (message.progress) {
        trace?.appendLine(`${message.progress}`);
        return;
      }

      clearTimeout(timeoutHandle);
      if (message.success && message.outputPath) {
        finish(message.outputPath);
      } else {
        trace?.appendLine(`OpenSCAD worker error: ${message.error || 'Unknown error'}`);
        finish(null);
      }
    });

    worker.on('error', (err: Error) => {
      clearTimeout(timeoutHandle);
      trace?.appendLine(`OpenSCAD worker process error: ${err.message}`);
      finish(null);
    });

    worker.on('exit', (code) => {
      if (settled) {
        return;
      }
      clearTimeout(timeoutHandle);
      // Defer by one event loop tick so any buffered IPC messages that arrived
      // before the process exited have a chance to be processed first.
      setImmediate(() => {
        if (settled) {
          return;
        }
        trace?.appendLine(`OpenSCAD worker exited unexpectedly with code ${code}`);
        finish(null);
      });
    });

    const request: OpenSCADNodeConversionRequest = {
      scadFilePath,
      libraryFiles: {},
      timeout,
      exportFormat: options?.outputFormat ?? 'stl',
      parameterOverrides: options?.parameterOverrides,
      parameterConfiguration: options?.parameterConfiguration,
    };

    worker.send(request);
  });
}



/**
 * Create a Web Worker for OpenSCAD conversion
 */
function createOpenSCADWorker(workerScript?: string): Worker {
  if (workerScript) {
    // Use provided worker script
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    return new Worker(workerUrl);
  }

  // Load the compiled browser worker
  const workerUrl = resolveOpenSCADWorkerUrl();
  return new Worker(workerUrl, { type: 'module' });
}


/**
 * Create a Web Worker for OpenSCAD conversion
 * Returns a promise that resolves with the conversion result
 */
export function convertOpenSCAD(
  request: OpenSCADConversionRequest,
  workerScript?: string
): Promise<OpenSCADConversionResponse> {
  return new Promise<OpenSCADConversionResponse>((resolve, reject) => {
    try {
      // Create an inline worker if no script provided
      const worker = createOpenSCADWorker(workerScript);

      // Set timeout for conversion
      const timeout = request.timeout || 300000; // 5 minutes default
      const timeoutHandle = setTimeout(() => {
        worker.terminate();
        reject(new Error(`OpenSCAD conversion timed out after ${timeout}ms`));
      }, timeout);

      // Handle worker messages
      worker.onmessage = (event: MessageEvent<OpenSCADConversionResponse>) => {
        if (event.data.progress) {
          return;
        }
        clearTimeout(timeoutHandle);
        if (event.data.success) {
          worker.terminate();
          resolve(event.data);
        } else {
          worker.terminate();
          reject(new Error(event.data.error || 'OpenSCAD conversion failed'));
        }
      };

      // Handle worker errors
      worker.onerror = (error: ErrorEvent) => {
        clearTimeout(timeoutHandle);
        worker.terminate();
        reject(new Error(`Worker error: ${error.message}`));
      };

      const openscadScriptUrl = resolveOpenSCADScriptUrl(request.openscadScriptUrl);

      // Send conversion request to worker with the OpenSCAD script URL
      worker.postMessage({
        ...request,
        openscadScriptUrl
      });
    } catch (error) {
      reject(error);
    }
  }).catch(async (error: unknown): Promise<OpenSCADConversionResponse> => {
    // If worker initialization/importScripts fails (CSP, offline, blocked local assets),
    // surface a clear actionable error.
    const message = error instanceof Error ? error.message : String(error);
    const workerLoadFailure = /importScripts|Worker error|NetworkError|Failed to execute 'importScripts'|Unable to load OpenSCAD runtime/i.test(message);
    if (!workerLoadFailure) {
      throw error;
    }

    throw new Error(
      'OpenSCAD runtime is unavailable. ' +
      'Run "npm run download-openscad" and then "npm run build" to refresh runtime assets, ' +
      'or provide request.openscadScriptUrl to point to openscad.js.'
    );
  });
}

function resolveOpenSCADScriptUrl(explicitUrl?: string): string {
  if (explicitUrl && explicitUrl.trim().length > 0) {
    return explicitUrl;
  }

  // Allow host applications to set a global override without changing call sites
  const globalOverride = (globalThis as unknown as { __BABYLON_ROS_OPENSCAD_URL?: string }).__BABYLON_ROS_OPENSCAD_URL;
  if (typeof globalOverride === 'string' && globalOverride.trim().length > 0) {
    return globalOverride;
  }

  if (typeof document !== 'undefined') {
    const currentScript = document.currentScript as HTMLScriptElement | null;
    const src = currentScript?.src;
    if (src) {
      try {
        const base = new URL('.', src).href;
        return new URL('openscad-wasm-build/dist/openscad.js', base).href;
      } catch {
        // fall through to other strategies
      }
    }
  }

  if (typeof window !== 'undefined' && window.location) {
    try {
      return new URL('openscad-wasm-build/dist/openscad.js', window.location.href).href;
    } catch {
      // fall through to final relative fallback
    }
  }

  return './openscad-wasm-build/dist/openscad.js';
}


/**
 * Resolve the URL to the compiled OpenSCAD browser worker.
 * Works in both development and production environments.
 */
function resolveOpenSCADWorkerUrl(): string {
  // Allow explicit override via global variable
  const globalOverride = (globalThis as unknown as { __BABYLON_ROS_WORKER_URL?: string }).__BABYLON_ROS_WORKER_URL;
  if (typeof globalOverride === 'string' && globalOverride.trim().length > 0) {
    return globalOverride;
  }

  if (typeof document !== 'undefined') {
    const currentScript = document.currentScript as HTMLScriptElement | null;
    const src = currentScript?.src;
    if (src) {
      try {
        const locationProtocol = typeof window !== 'undefined' ? window.location?.protocol : undefined;
        if (locationProtocol === 'file:') {
          return new URL('../dist/workers/openscadWorker.js', src).href;
        }
        const base = new URL('.', src).href;
        return new URL('workers/openscadWorker.js', base).href;
      } catch {
        // fall through to other strategies
      }
    }
  }

  if (typeof window !== 'undefined' && window.location) {
    try {
      if (window.location.protocol === 'file:') {
        // Local dev viewer (`web/viewer-openscad.html`) runs from /web,
        // while the compiled browser worker is emitted under /dist.
        return new URL('../dist/workers/openscadWorker.js', window.location.href).href;
      }
      return new URL('openscadWorker.js', window.location.href).href;
    } catch {
      // fall through to final relative fallback
    }
  }

  return './workers/openscadWorker.js';
}

// ── Library file loading ───────────────────────────────────────────────────────

/**
 * Recursively load library files from disk into OpenSCAD WASM virtual filesystem.
 * 
 * @param instance  OpenSCAD WASM instance with FS property
 * @param libraryPaths  Array of library directory paths to load
 * @param trace  Optional debug trace output
 */
async function loadLibraryFiles(
  instance: any,
  libraryPaths: string[],
  trace?: any,
): Promise<void> {
  // Create /libraries directory in WASM FS
  try {
    instance.FS.mkdir('/libraries');
  } catch {
    // Directory may already exist
  }

  for (const libPath of libraryPaths) {
    if (!fs.existsSync(libPath)) {
      continue;
    }

    trace?.appendLine(`Loading libraries from: ${libPath}`);

    // Recursively scan and load all .scad files
    const files = await collectScadFiles(libPath);
    let loadedCount = 0;

    for (const filePath of files) {
      try {
        const relativePath = path.relative(libPath, filePath).replace(/\\/g, '/');
        const vfsPath = `/libraries/${relativePath}`;

        // Ensure parent directory exists in WASM FS
        const vfsDir = path.dirname(vfsPath).replace(/\\/g, '/');
        const parts = vfsDir.split('/').filter(p => p);
        let currentPath = '';
        for (const part of parts) {
          currentPath += '/' + part;
          try {
            instance.FS.mkdir(currentPath);
          } catch {
            // Directory already exists
          }
        }

        // Read file and write to WASM FS
        const content = fs.readFileSync(filePath, 'utf8');
        instance.FS.writeFile(vfsPath, content);
        loadedCount++;
      } catch (err) {
        trace?.appendLine(`Warning: Failed to load library file: ${filePath}`);
      }
    }

    if (loadedCount > 0) {
      trace?.appendLine(`Loaded ${loadedCount} library files from ${libPath}`);
    }
  }
}

/**
 * Load OpenSCAD fonts helper into the WASM FS.
 * Required for proper font rendering in OpenSCAD.
 * Calls addFonts(instance) from openscad.fonts.js which writes fonts.conf
 * and Liberation font binaries into the WASM virtual filesystem.
 */
async function loadOpenSCADFonts(instance: any): Promise<void> {
  try {
    const wasmDir = getWasmDir();
    const fontsPath = path.join(wasmDir, 'openscad.fonts.js');

    if (fs.existsSync(fontsPath)) {
      try {
        // openscad.fonts.js is an ES module — use dynamic import with webpackIgnore
        // so webpack does not attempt to bundle this runtime-located file.
        // pathToFileURL converts the Windows/Unix path to a valid file:// URL.
        const { pathToFileURL } = require('url') as typeof import('url');
        const fontsModule = await import(/* webpackIgnore: true */ pathToFileURL(fontsPath).href as string);
        if (typeof fontsModule.addFonts === 'function') {
          fontsModule.addFonts(instance);
        }
      } catch {
        // Font loading is best-effort; don't fail conversion if it doesn't work
      }
    }
  } catch {
    // Font loading is best-effort; don't fail conversion if it doesn't work
  }
}

// ── Node.js-compatible conversion functions ───────────────────────────────────

/**
 * Convert an OpenSCAD file to STL or GLB format with cancellation token support.
 * Designed for use in VS Code extensions and Node.js tools.
 * 
 * @param scadFilePath  Path to the .scad file
 * @param trace  Debug output trace (function that logs strings)
 * @param token  Optional VS Code CancellationToken for cancellation support
 * @param options  Conversion options (timeout, parameter overrides, outputFormat, etc.)
 * @returns  Path to generated file, or null if conversion failed/was cancelled
 */
export async function convertOpenSCADCancellable(
  scadFilePath: string,
  trace: any,
  token?: any,
  options?: {
    timeout?: number;
    parameterOverrides?: Record<string, OpenSCADCustomizerValue>;
    parameterConfiguration?: OpenSCADParameterConfiguration;
    outputFormat?: 'stl' | 'glb';
  },
): Promise<string | null> {
  if (token?.isCancellationRequested) {
    trace?.appendLine('Conversion cancelled before start');
    return null;
  }

  return convertOpenSCADWithNodeWorker(scadFilePath, trace, {
    timeout: options?.timeout,
    outputFormat: options?.outputFormat,
    parameterOverrides: options?.parameterOverrides,
    parameterConfiguration: options?.parameterConfiguration,
  });
}

/**
 * Export an OpenSCAD file to STL or SVG format with cancellation token support.
 * Designed for use in VS Code extensions and Node.js tools.
 * 
 * @param scadFilePath  Path to the .scad file
 * @param exportFormat  Output format: 'stl' or 'svg'
 * @param trace  Debug output trace (function that logs strings)
 * @param token  Optional VS Code CancellationToken for cancellation support
 * @param options  Export options (timeout, parameter overrides, etc.)
 * @returns  Path to generated file, or null if export failed/was cancelled
 */
export async function exportOpenSCAD(
  scadFilePath: string,
  exportFormat: 'stl' | 'svg',
  trace: any,
  token?: any,
  options?: {
    timeout?: number;
    parameterOverrides?: Record<string, OpenSCADCustomizerValue>;
    suppressErrorMessage?: boolean;
  },
): Promise<string | null> {
  if (!fs.existsSync(scadFilePath)) {
    if (!options?.suppressErrorMessage) {
      trace?.appendLine(`Error: SCAD file not found: ${scadFilePath}`);
    }
    return null;
  }

  const extension = exportFormat === 'svg' ? '.svg' : '.stl';
  const outputPath = scadFilePath.replace(/\.scad$/i, extension);
  const timeout = options?.timeout ?? 300000; // 5 minutes default
  const startTime = Date.now();

  // STL export is routed through the Node worker so extension-host execution
  // stays responsive and behavior matches preview conversion plumbing.
  if (exportFormat === 'stl') {
    if (token?.isCancellationRequested) {
      if (!options?.suppressErrorMessage) {
        trace?.appendLine('Export cancelled before start');
      }
      return null;
    }

    if (!options?.suppressErrorMessage) {
      trace?.appendLine(`Exporting OpenSCAD to STL via worker: ${scadFilePath}`);
    }

    const stlPath = await convertOpenSCADWithNodeWorker(scadFilePath, trace, {
      timeout,
      outputFormat: 'stl',
      parameterOverrides: options?.parameterOverrides,
    });

    if (!stlPath && !options?.suppressErrorMessage && !token?.isCancellationRequested) {
      trace?.appendLine('STL export failed via worker');
    }
    return stlPath;
  }

  try {
    // Check for cancellation before starting
    if (token?.isCancellationRequested) {
      if (!options?.suppressErrorMessage) {
        trace?.appendLine('Export cancelled before start');
      }
      return null;
    }

    if (!options?.suppressErrorMessage) {
      trace?.appendLine(`Exporting OpenSCAD to ${exportFormat.toUpperCase()}: ${scadFilePath}`);
    }

    const scadContent = fs.readFileSync(scadFilePath, 'utf8');
    
    // Apply parameter overrides if provided
    let finalScadContent = scadContent;
    if (options?.parameterOverrides) {
      if (!options?.suppressErrorMessage) {
        trace?.appendLine('Applying parameter overrides');
      }
      finalScadContent = applyParameterOverrides(scadContent, options.parameterOverrides);
    }

    // Get library paths for this SCAD file's directory
    const scadDir = path.dirname(scadFilePath);
    const workspaceRoot = path.resolve(scadDir, '../..');
    const libraryPaths = await getAllOpenSCADLibraryPaths(workspaceRoot);

    // Create OpenSCAD WASM instance with stderr capture
    const errors: string[] = [];

    const instance = await createOpenSCADInstance(
      (_text: string) => { /* stdout — ignore render output */ },
      (text: string) => {
        if (/ERROR|error/.test(text)) {
          errors.push(text);
          if (!options?.suppressErrorMessage) {
            trace?.appendLine(`Error: ${text}`);
          }
        }
      },
    );

    // Check for cancellation before writing files
    if (token?.isCancellationRequested) {
      if (!options?.suppressErrorMessage) {
        trace?.appendLine('Export cancelled before WASM initialization');
      }
      return null;
    }

    // Load fonts to avoid fontconfig errors
    await loadOpenSCADFonts(instance);

    // Load libraries into WASM FS
    if (!options?.suppressErrorMessage) {
      trace?.appendLine(`Loading libraries from ${libraryPaths.length} paths`);
    }
    await loadLibraryFiles(instance, libraryPaths, trace);

    // Write SCAD content to WASM FS
    instance.FS.writeFile('/input.scad', finalScadContent);

    // Check for cancellation before conversion
    if (token?.isCancellationRequested) {
      if (!options?.suppressErrorMessage) {
        trace?.appendLine('Export cancelled before OpenSCAD execution');
      }
      return null;
    }

    // Run OpenSCAD export with timeout
    // Note: Use /input.scad first, then -o flag, matching openscad CLI convention
    if (!options?.suppressErrorMessage) {
      trace?.appendLine(`Running OpenSCAD export to ${exportFormat.toUpperCase()}...`);
    }
    
    const outputFileName = exportFormat === 'svg' ? '/output.svg' : '/output.stl';
    const exportPromise = new Promise<number>((_resolve, reject) => {
      try {
        const exitCode: number = instance.callMain(['/input.scad', '-o', outputFileName]);
        _resolve(exitCode);
      } catch (err) {
        reject(err);
      }
    });

    // Handle timeout and cancellation
    let exitCode = -1;
    try {
      const timeoutPromise = new Promise<number>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`OpenSCAD export timeout after ${timeout}ms`));
        }, timeout);
      });

      const cancellationPromise = token
        ? new Promise<number>((_resolve, reject) => {
            token.onCancellationRequested(() => {
              reject(new Error('OpenSCAD export cancelled by user'));
            });
          })
        : null;

      const promises = [exportPromise];
      if (cancellationPromise) {
        promises.push(cancellationPromise);
      }
      if (timeout > 0) {
        promises.push(timeoutPromise);
      }

      exitCode = await Promise.race(promises);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!options?.suppressErrorMessage) {
        trace?.appendLine(`Export error: ${message}`);
      }
      errors.push(message);
    }

    if (errors.length > 0) {
      if (!options?.suppressErrorMessage) {
        trace?.appendLine(`Export failed with ${errors.length} error(s)`);
      }
      return null;
    }

    if (exitCode !== 0) {
      if (!options?.suppressErrorMessage) {
        trace?.appendLine(`OpenSCAD exited with code ${exitCode}`);
      }
      return null;
    }

    // Check for cancellation before reading output
    if (token?.isCancellationRequested) {
      if (!options?.suppressErrorMessage) {
        trace?.appendLine('Export cancelled before reading output');
      }
      return null;
    }

    // Read output from WASM FS and write to filesystem
    try {
      const outputData = instance.FS.readFile(outputFileName);
      fs.writeFileSync(outputPath, Buffer.from(outputData));
      
      const elapsed = Date.now() - startTime;
      if (!options?.suppressErrorMessage) {
        trace?.appendLine(`Export succeeded in ${elapsed}ms: ${outputPath}`);
      }
      return outputPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!options?.suppressErrorMessage) {
        trace?.appendLine(`Failed to read/write output: ${message}`);
      }
      return null;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!options?.suppressErrorMessage) {
      trace?.appendLine(`Export exception: ${message}`);
    }
    return null;
  }
}

/**
 * Apply parameter overrides to OpenSCAD content by injecting variable assignments.
 * @param scadContent  Original SCAD source code
 * @param overrides  Key-value pairs of parameter names and values
 * @returns  SCAD content with overrides prepended
 */
function applyParameterOverrides(
  scadContent: string,
  overrides: Record<string, OpenSCADCustomizerValue>,
): string {
  const assignments = Object.entries(overrides)
    .map(([name, value]) => {
      // Quote string values, leave numbers/booleans as-is
      const formattedValue = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : value;
      return `${name} = ${formattedValue};`;
    })
    .join('\n');

  return assignments + '\n' + scadContent;
}
