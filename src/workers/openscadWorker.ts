// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// OpenSCAD conversion worker process (shared source for browser + Node.js workers)

type OpenSCADCustomizerValue = string | number | boolean | number[];

interface OpenSCADParameterConfiguration {
  jsonContent: string;
  parameterSetName: string;
}

interface ConversionRequest {
  // Browser request shape
  scadContent?: string;
  filename?: string;
  openscadScriptUrl?: string;

  // Node request shape
  scadFilePath?: string;
  workspaceRoot?: string;

  // Shared fields
  libraryFiles?: { [virtualPath: string]: string }; // Base64 encoded content
  timeout?: number; // Custom timeout in milliseconds
  exportFormat?: 'stl' | 'glb' | 'svg'; // Export format, defaults to 'glb'
  parameterOverrides?: Record<string, OpenSCADCustomizerValue>;
  parameterConfiguration?: OpenSCADParameterConfiguration;
}

interface ConversionResponse {
  success: boolean;
  outputPath?: string; // Node output path
  outputData?: Uint8Array; // Browser binary output
  outputFormat?: 'stl' | 'glb' | 'svg';
  filename?: string;
  error?: string;
  progress?: string;
}

type OpenSCADFactory = (options: any) => Promise<any>;

type NodeModules = {
  fs: typeof import('fs');
  path: typeof import('path');
  pathToFileURL: typeof import('url').pathToFileURL;
  processObj: NodeJS.Process;
};

let _nodeWasmFactoryCache: OpenSCADFactory | null = null;
let _browserWasmFactoryCache: OpenSCADFactory | null = null;

function isNodeRuntime(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node;
}

function getNodeModules(): NodeModules {
  if (!isNodeRuntime()) {
    throw new Error('Node.js modules are unavailable in browser worker runtime.');
  }
  const nodeRequire = (0, eval)('require') as NodeRequire;
  return {
    fs: nodeRequire('fs') as typeof import('fs'),
    path: nodeRequire('path') as typeof import('path'),
    pathToFileURL: (nodeRequire('url') as typeof import('url')).pathToFileURL,
    processObj: process,
  };
}

/**
 * Resolve OpenSCAD WASM runtime directory for Node.js.
 * Priority:
 * 1) Packaged/bundled runtime copied to dist/openscad-wasm-build/dist
 * 2) Legacy packaged runtime at dist/openscad-wasm
 * 3) Local development build at openscad-wasm-build/build
 */
function getNodeWasmDir(): string {
  const { fs, path, processObj } = getNodeModules();
  const candidates = [
    path.resolve(__dirname, '..', 'openscad-wasm-build', 'dist'),
    path.resolve(__dirname, '..', 'openscad-wasm'),
    path.resolve(__dirname, '..', '..', 'openscad-wasm-build', 'build'),
    path.resolve(processObj.cwd(), 'openscad-wasm-build', 'build'),
  ];

  for (const candidate of candidates) {
    const hasWasm = fs.existsSync(path.join(candidate, 'openscad.wasm'));
    const hasRuntime = fs.existsSync(path.join(candidate, 'openscad.wasm.js'));
    if (hasWasm && hasRuntime) {
      return candidate;
    }
  }

  throw new Error(
    'Unable to locate OpenSCAD WASM runtime. Expected openscad-wasm-build artifacts under dist/openscad-wasm-build/dist or openscad-wasm-build/build.'
  );
}

async function getOpenSCADFactory(request: ConversionRequest): Promise<OpenSCADFactory> {
  if (isNodeRuntime()) {
    if (_nodeWasmFactoryCache) {
      return _nodeWasmFactoryCache;
    }

    const { path, pathToFileURL } = getNodeModules();
    const wasmDir = getNodeWasmDir();
    const wasmJsPath = path.join(wasmDir, 'openscad.wasm.js');
    const wasmJsUrl = pathToFileURL(wasmJsPath).href;
    const mod = await import(/* webpackIgnore: true */ wasmJsUrl);
    _nodeWasmFactoryCache = (mod.default ?? mod) as OpenSCADFactory;
    return _nodeWasmFactoryCache;
  }

  if (_browserWasmFactoryCache) {
    return _browserWasmFactoryCache;
  }

  const scriptUrl = request.openscadScriptUrl ?? '../openscad-wasm-build/dist/openscad.js';
  console.log('[OpenSCAD Worker] Loading factory from:', scriptUrl);
  const mod = await import(/* webpackIgnore: true */ scriptUrl);
  _browserWasmFactoryCache = (mod.default ?? mod) as OpenSCADFactory;
  return _browserWasmFactoryCache;
}

async function createOpenSCADInstance(
  request: ConversionRequest,
  stdout?: (text: string) => void,
  stderr?: (text: string) => void,
): Promise<any> {
  const factory = await getOpenSCADFactory(request);
  console.log('[OpenSCAD Worker] Factory loaded successfully');

  if (isNodeRuntime()) {
    const { fs, path } = getNodeModules();
    const wasmDir = getNodeWasmDir();
    const wasmBinary = fs.readFileSync(path.join(wasmDir, 'openscad.wasm'));

    return factory({
      noInitialRun: true,
      wasmBinary,
      locateFile: (filename: string) => path.join(wasmDir, filename),
      print: (text: string) => {
        console.log('[OpenSCAD stdout]', text);
        stdout?.(text);
      },
      printErr: (text: string) => {
        console.log('[OpenSCAD stderr]', text);
        stderr?.(text);
      },
    });
  }

  console.log('[OpenSCAD Worker] Creating browser instance...');
  return factory({
    noInitialRun: true,
    locateFile: (filename: string) => {
      // Resolve asset files relative to the openscad.js script URL
      // This allows the WASM to find openscad.fonts.js, openscad.wasm, etc.
      const baseUrl = request.openscadScriptUrl ?? '../openscad-wasm-build/dist/openscad.js';
      const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
      return baseDir + filename;
    },
    print: (text: string) => {
      console.log('[OpenSCAD stdout]', text);
      stdout?.(text);
    },
    printErr: (text: string) => {
      console.log('[OpenSCAD stderr]', text);
      stderr?.(text);
    },
  });
}

function getInputName(request: ConversionRequest): string {
  if (request.filename && request.filename.trim().length > 0) {
    return request.filename;
  }
  if (request.scadFilePath && request.scadFilePath.trim().length > 0) {
    if (isNodeRuntime()) {
      const { path } = getNodeModules();
      return path.basename(request.scadFilePath);
    }
    const normalized = request.scadFilePath.replace(/\\/g, '/');
    const slashIndex = normalized.lastIndexOf('/');
    return slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
  }
  return 'model.scad';
}

function stripScadExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith('.scad')
    ? fileName.slice(0, -5)
    : fileName;
}

async function getScadContent(request: ConversionRequest): Promise<string> {
  if (typeof request.scadContent === 'string') {
    return request.scadContent;
  }

  if (request.scadFilePath && isNodeRuntime()) {
    const { fs } = getNodeModules();
    return fs.promises.readFile(request.scadFilePath, 'utf8');
  }

  throw new Error('No SCAD content available. Provide request.scadContent or request.scadFilePath.');
}

async function handleConversionMessage(request: ConversionRequest): Promise<void> {
  try {
    await convertOpenSCAD(request);
  } catch (error) {
    const response: ConversionResponse = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    sendMessage(response, isNodeRuntime() ? 1 : undefined);
  }
}

function registerMessageHandlers(): void {
  if (isNodeRuntime()) {
    const { processObj } = getNodeModules();
    processObj.on('message', async (message: ConversionRequest) => {
      await handleConversionMessage(message);
    });

    processObj.on('SIGTERM', () => {
      sendProgress('OpenSCAD conversion process terminated');
      processObj.exit(0);
    });

    processObj.on('SIGINT', () => {
      sendProgress('OpenSCAD conversion process interrupted');
      processObj.exit(0);
    });

    processObj.on('disconnect', () => {
      processObj.exit(0);
    });
    return;
  }

  (self as any).onmessage = async (event: MessageEvent<ConversionRequest>) => {
    await handleConversionMessage(event.data);
  };
}

async function convertOpenSCAD(request: ConversionRequest): Promise<void> {
  const {
    libraryFiles = {},
    timeout = 300000,
    exportFormat = 'glb',
    parameterOverrides,
    parameterConfiguration,
  } = request;

  try {
    const inputName = getInputName(request);
    sendProgress(`Starting OpenSCAD conversion for: ${inputName}`);

    const openscad = await createOpenSCADInstance(
      request,
      (text: string) => sendProgress(`${text}`),
      (text: any) => {
        let errorText = text;
        if (typeof text === 'string' && text.includes('[object Object]')) {
          try {
            const errorObj = text as any;
            if (errorObj && typeof errorObj === 'object') {
              errorText = errorObj.message || errorObj.toString() || text;
            }
          } catch {
            errorText = text;
          }
        } else if (typeof text === 'object' && text !== null) {
          errorText = (text as any).message || JSON.stringify(text);
        }

        const normalizedErrorText = String(errorText ?? '').trim();
        if (!normalizedErrorText.includes('Could not initialize localization')) {
          sendProgress(`${errorText}`);
        }
      },
    );

    const instance = typeof openscad?.getInstance === 'function'
      ? openscad.getInstance()
      : openscad;
    sendProgress('Loading OpenSCAD libraries...');

    // Load fonts for text rendering
    try {
      console.log('[OpenSCAD Worker] Loading fonts module...');
      const fontsModule = await import(/* webpackIgnore: true */ 
        request.openscadScriptUrl 
          ? request.openscadScriptUrl.replace('openscad.js', 'openscad.fonts.js')
          : '../openscad-wasm-build/dist/openscad.fonts.js'
      );
      const addFonts = fontsModule.addFonts || fontsModule.default?.addFonts;
      if (typeof addFonts === 'function') {
        addFonts(instance);
        console.log('[OpenSCAD Worker] Fonts loaded successfully');
        sendProgress('Fonts loaded for text rendering');
      }
    } catch (error: unknown) {
      console.log('[OpenSCAD Worker] Warning: Could not load fonts:', error);
      sendProgress('Warning: Fonts module not available - text rendering may not work');
    }

    for (const [virtualPath, base64Content] of Object.entries(libraryFiles)) {
      try {
        const dirPath = virtualPath.substring(0, virtualPath.lastIndexOf('/'));
        if (dirPath) {
          const segments = dirPath.split('/').filter(s => s.length > 0);
          let current = '';
          for (const segment of segments) {
            current += '/' + segment;
            try { instance.FS.mkdir(current); } catch { /* already exists */ }
          }
        }

        const decodedBytes = decodeBase64(base64Content);
        instance.FS.writeFile(virtualPath, decodedBytes);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        sendProgress(`Failed to load library file ${virtualPath}: ${errorMsg}`);
      }
    }

    const baseName = stripScadExtension(inputName);
    const fileExtension = `.${exportFormat}`;
    const virtualOutputPath = `/${baseName}${fileExtension}`;
    const inputVirtualPath = `/${baseName}.scad`;
    const exportFormatCli = exportFormat === 'stl' ? 'binstl' : 'glb';

    const scadContent = await getScadContent(request);
    sendProgress(`Converting OpenSCAD to ${exportFormat.toUpperCase()}...`);

    instance.FS.writeFile(inputVirtualPath, scadContent);

    if (parameterConfiguration?.jsonContent && parameterConfiguration?.parameterSetName) {
      instance.FS.writeFile('/input.parameters.json', parameterConfiguration.jsonContent);
    }

    const args: string[] = ['-o', virtualOutputPath];

    const overrideArgs = buildOverrideArgs(parameterOverrides);
    if (overrideArgs.length > 0) {
      args.push(...overrideArgs);
    }

    if (parameterConfiguration?.jsonContent && parameterConfiguration?.parameterSetName) {
      args.push('-p', '/input.parameters.json', '-P', parameterConfiguration.parameterSetName);
    }

    if (exportFormat === 'svg') {
      sendProgress('Exporting to SVG format...');
    } else {
      args.push(
        '--preview',
        '--backend=Manifold',
        `--export-format=${exportFormatCli}`
      );
      sendProgress('Using preview mode for faster rendering...');
    }

    args.push(inputVirtualPath);
    sendProgress(`Running OpenSCAD with args: ${args.join(' ')}`);

    const conversionTimeout = setTimeout(() => {
      sendMessage({
        success: false,
        error: `OpenSCAD conversion timeout after ${timeout}ms - operation taking too long`
      }, isNodeRuntime() ? 1 : undefined);
    }, timeout);

    try {
      console.log('[OpenSCAD Worker] Calling OpenSCAD with args:', args);
      instance.callMain(args);
      console.log('[OpenSCAD Worker] callMain completed successfully');
      clearTimeout(conversionTimeout);
    } catch (error) {
      clearTimeout(conversionTimeout);
      console.log('[OpenSCAD Worker] callMain error:', error);
      throw error;
    }

    console.log('[OpenSCAD Worker] Checking for output file at:', virtualOutputPath);
    const stat: any = instance.FS.stat(virtualOutputPath);
    console.log('[OpenSCAD Worker] File stat result:', stat);
    if (!stat) {
      throw new Error('Output file was not created or is empty');
    }

    sendProgress(`Output ${exportFormat.toUpperCase()} file created: ${stat.size || 'unknown'} bytes`);
    const outputContent = instance.FS.readFile(virtualOutputPath, { encoding: 'binary' }) as Uint8Array;
    if (!outputContent || outputContent.length === 0) {
      throw new Error('Output file was not created or is empty');
    }

    if (isNodeRuntime() && request.scadFilePath) {
      const { fs, path } = getNodeModules();
      const inputDir = path.dirname(request.scadFilePath);
      const outputPath = path.join(inputDir, `${baseName}${fileExtension}`);
      await fs.promises.writeFile(outputPath, Buffer.from(outputContent));
      sendMessage({ success: true, outputPath, outputFormat: exportFormat, filename: `${baseName}${fileExtension}` }, 0);
      return;
    }

    sendMessage({
      success: true,
      outputData: outputContent,
      outputFormat: exportFormat,
      filename: `${baseName}${fileExtension}`,
    });
  } catch (error: unknown) {
    sendMessage({
      success: false,
      error: normalizeErrorMessage(error),
    }, isNodeRuntime() ? 1 : undefined);
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>;
    if (value.name === 'ErrnoError') {
      const errno = String(value.errno ?? 'unknown');
      if (value.errno === 44) {
        return 'OpenSCAD did not generate valid output - check for syntax errors or rendering issues in the SCAD file';
      }
      return `File system error (errno ${errno})`;
    }
    if (typeof value.message === 'string') {
      return value.message;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(error ?? 'Unknown error occurred');
}

function serializeValue(value: OpenSCADCustomizerValue): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Invalid numeric parameter override value (must be finite).');
    }
    return `${value}`;
  }
  if (Array.isArray(value)) {
    if (value.length > 4) {
      throw new Error('Vector parameter override length must be <= 4.');
    }
    for (const item of value) {
      if (typeof item !== 'number' || !Number.isFinite(item)) {
        throw new Error('Vector parameter overrides must contain finite numeric values only.');
      }
    }
    return `[${value.join(', ')}]`;
  }

  throw new Error('Unsupported parameter override value type.');
}

function buildOverrideArgs(parameterOverrides?: Record<string, OpenSCADCustomizerValue>): string[] {
  if (!parameterOverrides) {
    return [];
  }

  const identifierRegex = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const args: string[] = [];

  for (const [name, value] of Object.entries(parameterOverrides)) {
    if (!identifierRegex.test(name)) {
      continue;
    }
    args.push('-D', `${name}=${serializeValue(value)}`);
  }

  return args;
}

function decodeBase64(base64: string): Uint8Array {
  if (isNodeRuntime()) {
    return Buffer.from(base64, 'base64');
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function sendProgress(message: string): void {
  sendMessage({ success: true, progress: message });
}

function sendMessage(response: ConversionResponse, exitCode?: number): void {
  if (isNodeRuntime()) {
    const { processObj } = getNodeModules();
    processObj.send?.(response, undefined, undefined, () => {
      if (typeof exitCode === 'number') {
        processObj.exit(exitCode);
      }
    });
    return;
  }

  (self as any).postMessage(response);
}

registerMessageHandlers();