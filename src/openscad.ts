/**
 * OpenSCAD utilities for babylon_ros
 * Browser-based OpenSCAD to STL conversion using Web Workers
 */

export interface OpenSCADCustomizerOption {
  label?: string;
  value: string | number | boolean;
}

export interface OpenSCADCustomizerRangeConstraint {
  min?: number;
  max?: number;
  step?: number;
}

export type OpenSCADCustomizerValue = string | number | boolean | number[];

export interface OpenSCADCustomizerVariable {
  name: string;
  valueType: 'string' | 'number' | 'boolean' | 'vector';
  defaultValue: OpenSCADCustomizerValue;
  tab: string;
  hidden: boolean;
  description?: string;
  widget: 'dropdown' | 'slider' | 'checkbox' | 'spinbox' | 'textbox' | 'vector';
  options?: OpenSCADCustomizerOption[];
  range?: OpenSCADCustomizerRangeConstraint;
  maxLength?: number;
  rawConstraint?: string;
  line: number;
}

export interface OpenSCADCustomizerParseWarning {
  line: number;
  message: string;
}

export interface OpenSCADCustomizerParseResult {
  variables: OpenSCADCustomizerVariable[];
  warnings: OpenSCADCustomizerParseWarning[];
  firstBraceLine?: number;
}

/**
 * OpenSCAD conversion request for Web Worker
 */
export interface OpenSCADConversionRequest {
  scadContent: string;
  filename: string;
  libraryFiles?: { [virtualPath: string]: string }; // Base64 encoded
  timeout?: number;
  exportFormat?: 'stl' | 'svg';
  parameterOverrides?: Record<string, OpenSCADCustomizerValue>;
}

/**
 * OpenSCAD conversion response from Web Worker
 */
export interface OpenSCADConversionResponse {
  success: boolean;
  outputData?: Uint8Array; // Binary STL/SVG data
  outputFormat?: string; // 'stl' or 'svg'
  filename?: string;
  error?: string;
  progress?: string;
}

/**
 * Parses OpenSCAD customizer variables from file content
 * Supports standard OpenSCAD customizer format:
 * - variable = default; // [constraint] // description
 * Constraints:
 * - [min:step:max] → slider
 * - [val1, val2, val3] → dropdown
 * - [false, true] → checkbox
 */
export function parseOpenSCADCustomizer(
  content: string,
  filename: string = 'model.scad'
): OpenSCADCustomizerParseResult {
  const variables: OpenSCADCustomizerVariable[] = [];
  const warnings: OpenSCADCustomizerParseWarning[] = [];
  const lines = content.split('\n');
  let currentTab = 'parameters';
  let firstBraceLine: number | undefined;

  // First pass: find all variable assignments
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const lineNumber = i + 1;

    // Check for tab section marker: /* [Tab Name] */
    const tabMatch = trimmedLine.match(/\/\*\s*\[\s*(.+?)\s*\]\s*\*\//);
    if (tabMatch) {
      currentTab = tabMatch[1].trim();
      continue;
    }

    // Skip empty lines and full-line comments
    if (!trimmedLine || (trimmedLine.startsWith('//') && !trimmedLine.includes('='))) {
      continue;
    }

    // Look for standard OpenSCAD variable assignment: name = value;
    // Supports: variable = 10; or variable = "text"; or variable = true; or variable = [1,2,3];
    const assignmentMatch = trimmedLine.match(/^(\w+)\s*=\s*(.+?);/);
    if (!assignmentMatch) {
      continue;
    }

    const varName = assignmentMatch[1];
    let valueStr = assignmentMatch[2].trim();

    // Extract customizer hint and description from rest of line
    // Format: variable = value; // [constraint] // description
    let customConstraint = '';
    let description = '';

    const commentPart = line.substring(line.indexOf('//'));
    if (commentPart) {
      // Look for constraint in brackets
      const constraintMatch = commentPart.match(/\/\/\s*\[([^\]]+)\]/);
      if (constraintMatch) {
        customConstraint = constraintMatch[1].trim();
        if (!firstBraceLine) {
          firstBraceLine = lineNumber;
        }
      }

      // Extract description (everything after the constraint or first //)
      const descPart = commentPart.replace(/\/\/\s*\[[^\]]+\]\s*/, '').replace(/^\/\/\s*/, '').trim();
      if (descPart) {
        description = descPart;
      }
    }

    // Parse the default value
    let value: OpenSCADCustomizerValue = '';
    let valueType: 'string' | 'number' | 'boolean' | 'vector' = 'string';

    // Try to parse as boolean
    if (valueStr.toLowerCase() === 'true') {
      value = true;
      valueType = 'boolean';
    } else if (valueStr.toLowerCase() === 'false') {
      value = false;
      valueType = 'boolean';
    }
    // Try to parse as number
    else if (!isNaN(Number(valueStr))) {
      value = Number(valueStr);
      valueType = 'number';
    }
    // Try to parse as vector
    else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
      try {
        const arrayStr = valueStr.slice(1, -1); // Remove brackets
        const numbers = arrayStr.split(',').map(n => parseFloat(n.trim()));
        if (numbers.every(n => !isNaN(n))) {
          value = numbers;
          valueType = 'vector';
        } else {
          value = valueStr.slice(1, -1); // Keep as string without brackets
        }
      } catch {
        value = valueStr.slice(1, -1);
      }
    }
    // Parse as string (remove quotes if present)
    else if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
             (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
      value = valueStr.slice(1, -1);
      valueType = 'string';
    } else {
      value = valueStr;
      valueType = 'string';
    }

    // Determine widget and parse constraints
    let widget = inferWidgetType(valueType);
    let options: OpenSCADCustomizerOption[] | undefined;
    let range: OpenSCADCustomizerRangeConstraint | undefined;

    if (customConstraint) {
      // Parse constraint to determine widget type
      const constraintResult = parseCustomizerConstraint(customConstraint, valueType);
      widget = constraintResult.widget;
      options = constraintResult.options;
      range = constraintResult.range;
    }

    // Create variable entry
    const variable: OpenSCADCustomizerVariable = {
      name: varName,
      valueType,
      defaultValue: value,
      tab: currentTab,
      hidden: false,
      description: description || undefined,
      widget,
      options,
      range,
      rawConstraint: customConstraint || undefined,
      line: lineNumber
    };

    variables.push(variable);
  }

  return {
    variables,
    warnings,
    firstBraceLine
  };
}

/**
 * Parse OpenSCAD customizer constraint and determine widget type
 * Formats:
 * - min:step:max → slider
 * - val1, val2, val3 → dropdown
 * - false, true → checkbox (boolean choice)
 */
function parseCustomizerConstraint(
  constraint: string,
  valueType: 'string' | 'number' | 'boolean' | 'vector'
): { widget: OpenSCADCustomizerVariable['widget']; options?: OpenSCADCustomizerOption[]; range?: OpenSCADCustomizerRangeConstraint } {
  
  constraint = constraint.trim();

  // Handle range constraint: min:step:max
  if (constraint.includes(':')) {
    const parts = constraint.split(':').map(p => p.trim());
    if (parts.length >= 2) {
      const min = parseFloat(parts[0]);
      let step = 1;
      let max = 100;

      if (parts.length === 2) {
        // Format: min:max
        max = parseFloat(parts[1]);
      } else if (parts.length >= 3) {
        // Format: min:step:max
        step = parseFloat(parts[1]);
        max = parseFloat(parts[2]);
      }

      if (!isNaN(min) && !isNaN(max)) {
        return {
          widget: 'slider',
          range: { min, max, step: isNaN(step) ? 1 : step }
        };
      }
    }
  }

  // Handle dropdown/choice constraint: val1, val2, val3
  if (constraint.includes(',')) {
    const parts = constraint.split(',').map(p => p.trim());
    const options: OpenSCADCustomizerOption[] = [];
    let allNumeric = true;
    let allBool = true;

    for (const part of parts) {
      if (part.toLowerCase() === 'true' || part.toLowerCase() === 'false') {
        options.push({
          value: part.toLowerCase() === 'true',
          label: part
        });
      } else if (!isNaN(Number(part))) {
        options.push({
          value: Number(part),
          label: part
        });
        allBool = false;
      } else {
        options.push({
          value: part.replace(/^["']|["']$/g, ''),
          label: part.replace(/^["']|["']$/g, '')
        });
        allNumeric = false;
        allBool = false;
      }
    }

    // If all options are booleans, use checkbox
    if (allBool && options.length === 2) {
      return { widget: 'checkbox' };
    }

    return {
      widget: 'dropdown',
      options
    };
  }

  // No constraint - use default for value type
  return { widget: inferWidgetType(valueType) };
}

/**
 * Infer the widget type based on the value type
 */
function inferWidgetType(
  valueType: 'string' | 'number' | 'boolean' | 'vector'
): OpenSCADCustomizerVariable['widget'] {
  switch (valueType) {
    case 'boolean':
      return 'checkbox';
    case 'number':
      return 'spinbox';
    case 'vector':
      return 'vector';
    case 'string':
    default:
      return 'textbox';
  }
}

/**
 * Convert customizer values to OpenSCAD script overrides
 * Generates OpenSCAD variable assignments from customizer values
 */
export function buildOpenSCADOverrides(
  overrides: Record<string, OpenSCADCustomizerValue>
): string {
  const lines: string[] = [];

  for (const [name, value] of Object.entries(overrides)) {
    if (value === null || value === undefined) {
      continue;
    }

    let scadValue: string;

    if (typeof value === 'boolean') {
      scadValue = value ? 'true' : 'false';
    } else if (typeof value === 'number') {
      scadValue = String(value);
    } else if (Array.isArray(value)) {
      scadValue = `[${value.join(', ')}]`;
    } else {
      // String - escape quotes
      scadValue = `"${String(value).replace(/"/g, '\\"')}"`;
    }

    lines.push(`${name} = ${scadValue};`);
  }

  return lines.join('\n');
}

/**
 * Create a Web Worker for OpenSCAD conversion
 * Returns a promise that resolves with the conversion result
 */
export function convertOpenSCADToSTL(
  request: OpenSCADConversionRequest,
  workerScript?: string
): Promise<OpenSCADConversionResponse> {
  return new Promise((resolve, reject) => {
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

      // Send conversion request to worker
      worker.postMessage(request);
    } catch (error) {
      reject(error);
    }
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

  // Create inline worker with default OpenSCAD conversion logic
  const inlineWorkerScript = getDefaultOpenSCADWorkerScript();
  const blob = new Blob([inlineWorkerScript], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  return new Worker(workerUrl);
}

/**
 * Get the default OpenSCAD worker script for browser-based conversion
 */
function getDefaultOpenSCADWorkerScript(): string {
  return `
    // Default OpenSCAD conversion worker
    // This worker handles OpenSCAD to STL conversion using openscad-wasm-prebuilt

    importScripts('https://cdn.jsdelivr.net/npm/openscad-wasm-prebuilt@1.2.0/dist/index.js');

    self.onmessage = async (event) => {
      try {
        const {
          scadContent,
          filename,
          libraryFiles = {},
          exportFormat = 'stl',
          parameterOverrides = {}
        } = event.data;

        // Initialize OpenSCAD
        const openscad = await createOpenSCAD({
          print: (text) => console.log(text),
          printErr: (text) => console.warn(text)
        });

        const instance = openscad.getInstance();

        // Load library files into virtual filesystem
        for (const [virtualPath, base64Content] of Object.entries(libraryFiles)) {
          try {
            // Create directory structure
            const dirPath = virtualPath.substring(0, virtualPath.lastIndexOf('/'));
            if (dirPath) {
              const segments = dirPath.split('/').filter(s => s.length > 0);
              let current = '';
              for (const segment of segments) {
                current += '/' + segment;
                try { instance.FS.mkdir(current); } catch { /* already exists */ }
              }
            }

            // Decode base64 and write file
            const binaryString = atob(base64Content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            instance.FS.writeFile(virtualPath, bytes);
          } catch (error) {
            console.warn(\`Failed to load library: \${virtualPath}\`, error);
          }
        }

        // Apply parameter overrides
        let scadWithParams = scadContent;
        for (const [name, value] of Object.entries(parameterOverrides)) {
          if (value === null || value === undefined) continue;

          let scadValue;
          if (typeof value === 'boolean') {
            scadValue = value ? 'true' : 'false';
          } else if (typeof value === 'number') {
            scadValue = String(value);
          } else if (Array.isArray(value)) {
            scadValue = \`[\${value.join(', ')}]\`;
          } else {
            scadValue = \`"\${String(value).replace(/"/g, '\\\\\\\\"')}"\`;
          }
          scadWithParams = \`\${name} = \${scadValue};\\n\${scadWithParams}\`;
        }

        // Write SCAD file to virtual filesystem
        instance.FS.writeFile('/input.scad', scadWithParams);

        // Determine output format and run conversion
        const outputPath = exportFormat === 'svg' ? '/output.svg' : '/output.stl';
        const args = ['-o', outputPath, '/input.scad'];

        instance.callMain(args);

        // Read output file
        const outputData = instance.FS.readFile(outputPath);

        // Send result back
        self.postMessage({
          success: true,
          outputData: outputData,
          outputFormat: exportFormat,
          filename: filename
        });
      } catch (error) {
        self.postMessage({
          success: false,
          error: error.message || String(error)
        });
      }
    };
  `;
}

/**
 * Interface for an OpenSCAD customizer UI component
 */
export interface OpenSCADCustomizerUI {
  render(container: HTMLElement, model: OpenSCADCustomizerParseResult, onValuesChange: (values: Record<string, OpenSCADCustomizerValue>) => void): void;
  getValues(): Record<string, OpenSCADCustomizerValue>;
  setValues(values: Record<string, OpenSCADCustomizerValue>): void;
  enable(enabled: boolean): void;
}

/**
 * Create an HTML-based OpenSCAD customizer UI component
 */
export function createOpenSCADCustomizerUI(): OpenSCADCustomizerUI {
  let currentModel: OpenSCADCustomizerParseResult | null = null;
  let currentValues: Record<string, OpenSCADCustomizerValue> = {};
  let container: HTMLElement | null = null;
  let onValuesChange: ((values: Record<string, OpenSCADCustomizerValue>) => void) | null = null;
  let enabled = true;

  function render(
    el: HTMLElement,
    model: OpenSCADCustomizerParseResult,
    onChange: (values: Record<string, OpenSCADCustomizerValue>) => void
  ) {
    container = el;
    currentModel = model;
    onValuesChange = onChange;

    // Initialize values from model defaults
    currentValues = {};
    for (const variable of model.variables) {
      currentValues[variable.name] = variable.defaultValue;
    }

    buildUI();
  }

  function buildUI() {
    if (!container || !currentModel) return;

    container.innerHTML = '';

    if (currentModel.variables.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    // Group variables by tab
    const grouped = new Map<string, OpenSCADCustomizerVariable[]>();
    for (const variable of currentModel.variables) {
      const tab = variable.tab || 'parameters';
      if (!grouped.has(tab)) {
        grouped.set(tab, []);
      }
      grouped.get(tab)?.push(variable);
    }

    // Create tabs if needed
    if (grouped.size > 1) {
      const tabsContainer = document.createElement('div');
      tabsContainer.className = 'openscad-customizer-tabs';
      tabsContainer.style.cssText = `
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        border-bottom: 1px solid #ccc;
      `;

      const contentsContainer = document.createElement('div');
      contentsContainer.className = 'openscad-customizer-contents';

      let firstTab = true;
      for (const [tabName, variables] of grouped) {
        const tabButton = document.createElement('button');
        tabButton.textContent = tabName;
        tabButton.className = firstTab ? 'active' : '';
        tabButton.style.cssText = `
          padding: 8px 16px;
          border: none;
          background: none;
          cursor: pointer;
          border-bottom: 2px solid ${firstTab ? '#007bff' : 'transparent'};
          transition: border-color 0.2s;
        `;

        const tabContent = document.createElement('div');
        tabContent.className = `openscad-customizer-tab-${tabName}`;
        tabContent.style.display = firstTab ? 'block' : 'none';

        buildVariablesUI(tabContent, variables);
        contentsContainer.appendChild(tabContent);

        tabButton.addEventListener('click', () => {
          // Hide other tabs
          for (const tab of contentsContainer.querySelectorAll('[class^="openscad-customizer-tab-"]')) {
            (tab as HTMLElement).style.display = 'none';
          }
          // Show this tab
          tabContent.style.display = 'block';

          // Update button styles
          for (const btn of tabsContainer.querySelectorAll('button')) {
            btn.style.borderBottomColor = 'transparent';
            btn.classList.remove('active');
          }
          tabButton.style.borderBottomColor = '#007bff';
          tabButton.classList.add('active');
        });

        tabsContainer.appendChild(tabButton);
        firstTab = false;
      }

      container.appendChild(tabsContainer);
      container.appendChild(contentsContainer);
    } else {
      // Single tab or no tabs
      for (const [, variables] of grouped) {
        buildVariablesUI(container, variables);
      }
    }
  }

  function buildVariablesUI(container: HTMLElement, variables: OpenSCADCustomizerVariable[]) {
    for (const variable of variables) {
      if (variable.hidden) continue;

      const field = document.createElement('div');
      field.className = 'openscad-customizer-field';
      field.style.cssText = `
        margin-bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      `;

      const label = document.createElement('label');
      label.textContent = variable.description
        ? `${variable.name} — ${variable.description}`
        : variable.name;
      label.style.cssText = `
        font-weight: 500;
        font-size: 13px;
      `;
      field.appendChild(label);

      const control = createVariableControl(variable);
      field.appendChild(control);

      container.appendChild(field);
    }
  }

  function createVariableControl(variable: OpenSCADCustomizerVariable): HTMLElement {
    const value = currentValues[variable.name] ?? variable.defaultValue;

    switch (variable.widget) {
      case 'slider':
        return createSlider(variable, value as number);
      case 'spinbox':
        return createSpinbox(variable, value as number);
      case 'checkbox':
        return createCheckbox(variable, value as boolean);
      case 'dropdown':
        return createDropdown(variable, value);
      case 'vector':
        return createVector(variable, value as number[]);
      case 'textbox':
      default:
        return createTextbox(variable, value as string);
    }
  }

  function createSlider(variable: OpenSCADCustomizerVariable, value: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
    `;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(variable.range?.min ?? 0);
    slider.max = String(variable.range?.max ?? 100);
    slider.step = String(variable.range?.step ?? 1);
    slider.value = String(value);
    slider.style.cssText = `
      width: 100%;
    `;

    const display = document.createElement('span');
    display.textContent = String(value);
    display.style.cssText = `
      min-width: 3ch;
      text-align: right;
      font-size: 12px;
      font-family: monospace;
    `;

    slider.addEventListener('input', (e) => {
      const newValue = parseFloat((e.target as HTMLInputElement).value);
      currentValues[variable.name] = newValue;
      display.textContent = String(newValue);
      notifyChange();
    });

    wrapper.appendChild(slider);
    wrapper.appendChild(display);
    return wrapper;
  }

  function createSpinbox(variable: OpenSCADCustomizerVariable, value: number): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(variable.range?.min ?? 0);
    input.max = String(variable.range?.max ?? 1000);
    input.step = String(variable.range?.step ?? 1);
    input.value = String(value);
    input.style.cssText = `
      padding: 4px;
      border: 1px solid #ccc;
      border-radius: 3px;
    `;

    input.addEventListener('change', (e) => {
      currentValues[variable.name] = parseFloat((e.target as HTMLInputElement).value);
      notifyChange();
    });

    return input;
  }

  function createCheckbox(variable: OpenSCADCustomizerVariable, value: boolean): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.style.cssText = `
      width: auto;
      cursor: pointer;
    `;

    input.addEventListener('change', (e) => {
      currentValues[variable.name] = (e.target as HTMLInputElement).checked;
      notifyChange();
    });

    return input;
  }

  function createDropdown(variable: OpenSCADCustomizerVariable, value: OpenSCADCustomizerValue): HTMLElement {
    const select = document.createElement('select');
    select.style.cssText = `
      padding: 4px;
      border: 1px solid #ccc;
      border-radius: 3px;
    `;

    if (variable.options) {
      for (const option of variable.options) {
        const opt = document.createElement('option');
        opt.value = String(option.value);
        opt.textContent = option.label || String(option.value);
        select.appendChild(opt);
      }
    }

    select.value = String(value);
    select.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      currentValues[variable.name] = variable.valueType === 'number' ? parseFloat(val) : val;
      notifyChange();
    });

    return select;
  }

  function createTextbox(variable: OpenSCADCustomizerVariable, value: string): HTMLElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    if (variable.maxLength) {
      input.maxLength = variable.maxLength;
    }
    input.style.cssText = `
      padding: 4px;
      border: 1px solid #ccc;
      border-radius: 3px;
    `;

    input.addEventListener('change', (e) => {
      currentValues[variable.name] = (e.target as HTMLInputElement).value;
      notifyChange();
    });

    return input;
  }

  function createVector(variable: OpenSCADCustomizerVariable, value: number[]): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, minmax(40px, 1fr));
      gap: 4px;
    `;

    const vector = Array.isArray(value) ? value.slice(0, 4) : (Array.isArray(variable.defaultValue) ? (variable.defaultValue as number[]).slice(0, 4) : [0]);

    for (let i = 0; i < vector.length; i++) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(variable.range?.min ?? -1000);
      input.max = String(variable.range?.max ?? 1000);
      input.step = String(variable.range?.step ?? 0.1);
      input.value = String(vector[i]);
      input.style.cssText = `
        padding: 4px;
        border: 1px solid #ccc;
        border-radius: 3px;
        font-family: monospace;
        font-size: 12px;
      `;

      input.addEventListener('change', (e) => {
        const current = Array.isArray(currentValues[variable.name])
          ? [...(currentValues[variable.name] as number[])]
          : [...vector];
        current[i] = parseFloat((e.target as HTMLInputElement).value);
        currentValues[variable.name] = current;
        notifyChange();
      });

      wrapper.appendChild(input);
    }

    return wrapper;
  }

  function notifyChange() {
    if (enabled && onValuesChange) {
      onValuesChange(currentValues);
    }
  }

  return {
    render,
    getValues: () => ({ ...currentValues }),
    setValues: (values) => {
      currentValues = { ...values };
      buildUI();
    },
    enable: (e) => {
      enabled = e;
    }
  };
}
