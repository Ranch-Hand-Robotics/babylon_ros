/**
 * OpenSCAD Customizer for babylon_ros
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

export type OpenSCADCustomizerWidgetType =
  | 'dropdown'
  | 'slider'
  | 'checkbox'
  | 'spinbox'
  | 'textbox'
  | 'vector';

export interface OpenSCADCustomizerVariable {
  name: string;
  valueType: 'string' | 'number' | 'boolean' | 'vector';
  defaultValue: OpenSCADCustomizerValue;
  tab: string;
  hidden: boolean;
  description?: string;
  widget: OpenSCADCustomizerWidgetType;
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
 * Parses OpenSCAD customizer variables from file content.
 * Uses the production-tested implementation that:
 * - Only parses the customizer region (before first uncommented '{')
 * - Handles [Hidden] tab sections
 * - Supports labeled dropdown options (0:Off, 1:On)
 * - Handles preceding // comment lines as descriptions
 * - Robust literal value parsing (scientific notation, prefix signs)
 */
export function parseOpenSCADCustomizer(
  content: string,
  _filename: string = 'model.scad'
): OpenSCADCustomizerParseResult {
  const warnings: OpenSCADCustomizerParseWarning[] = [];
  const variables: OpenSCADCustomizerVariable[] = [];

  const firstBraceIndex = findFirstUncommentedBraceIndex(content);
  const parseRegion = firstBraceIndex >= 0 ? content.slice(0, firstBraceIndex) : content;
  const firstBraceLine = firstBraceIndex >= 0 ? content.slice(0, firstBraceIndex).split(/\r?\n/).length : undefined;
  const lines = parseRegion.split(/\r?\n/);

  let currentTab = 'parameters';
  let pendingDescription: string | undefined;

  const tabRegex = /^\s*\/\*\s*\[([^\]]+)\]\s*\*\/\s*$/;
  const strictDescriptionRegex = /^\/\/(.*)$/;
  const assignmentRegex = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*;\s*(?:\/\/\s*(.*))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    const tabMatch = line.match(tabRegex);
    if (tabMatch) {
      currentTab = normalizeTabName(tabMatch[1]);
      pendingDescription = undefined;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const descMatch = line.match(strictDescriptionRegex);
    if (descMatch) {
      pendingDescription = descMatch[1].trim();
      continue;
    }

    const assignmentMatch = line.match(assignmentRegex);
    if (!assignmentMatch) {
      pendingDescription = undefined;
      continue;
    }

    const [, name, rawValue, trailingCommentRaw] = assignmentMatch;
    const literalParse = parseLiteralValue(rawValue);
    if (!literalParse.ok) {
      warnings.push({
        line: lineNumber,
        message: `Skipping '${name}': value is not a supported literal for customizer.`
      });
      pendingDescription = undefined;
      continue;
    }

    const hidden = currentTab === 'Hidden';
    if (hidden) {
      pendingDescription = undefined;
      continue;
    }

    const inferred = inferWidget(
      literalParse.valueType,
      literalParse.value,
      trailingCommentRaw,
      warnings,
      lineNumber
    );

    variables.push({
      name,
      valueType: literalParse.valueType,
      defaultValue: literalParse.value,
      tab: currentTab,
      hidden,
      description: pendingDescription,
      widget: inferred.widget,
      options: inferred.options,
      range: inferred.range,
      maxLength: inferred.maxLength,
      rawConstraint: inferred.rawConstraint,
      line: lineNumber
    });

    pendingDescription = undefined;
  }

  return {
    variables,
    warnings,
    firstBraceLine
  };
}

// ── Customizer parser helpers (ported from rde-urdf production code) ─────────

function findFirstUncommentedBraceIndex(text: string): number {
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let stringQuote = '"';

  for (let i = 0; i < text.length; i++) {
    const current = text[i];
    const next = i + 1 < text.length ? text[i + 1] : '';

    if (inLineComment) {
      if (current === '\n') { inLineComment = false; }
      continue;
    }
    if (inBlockComment) {
      if (current === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      if (current === '\\') { i++; continue; }
      if (current === stringQuote) { inString = false; }
      continue;
    }
    if (current === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (current === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (current === '"' || current === '\'') { inString = true; stringQuote = current; continue; }
    if (current === '{') { return i; }
  }
  return -1;
}

function isNumericLiteral(value: string): boolean {
  return /^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(value.trim());
}

function parseLiteralValue(rawValue: string): {
  ok: true;
  value: OpenSCADCustomizerValue;
  valueType: 'string' | 'number' | 'boolean' | 'vector';
} | { ok: false } {
  const value = rawValue.trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return { ok: true, value: value.slice(1, -1), valueType: 'string' };
  }
  if (value === 'true' || value === 'false') {
    return { ok: true, value: value === 'true', valueType: 'boolean' };
  }
  if (isNumericLiteral(value)) {
    return { ok: true, value: Number(value), valueType: 'number' };
  }

  const vectorMatch = value.match(/^\[(.*)\]$/);
  if (vectorMatch) {
    const inner = vectorMatch[1].trim();
    if (inner.length === 0) { return { ok: false }; }
    const parts = inner.split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length === 0 || parts.length > 4) { return { ok: false }; }
    const numericVector: number[] = [];
    for (const part of parts) {
      if (!isNumericLiteral(part)) { return { ok: false }; }
      numericVector.push(Number(part));
    }
    return { ok: true, value: numericVector, valueType: 'vector' };
  }

  return { ok: false };
}

function parseBracketConstraint(commentText: string): string | undefined {
  const bracketMatch = commentText.match(/\[(.*)\]/);
  return bracketMatch ? bracketMatch[1].trim() : undefined;
}

function parseNumericToken(value: string): number | undefined {
  const trimmed = value.trim();
  if (!isNumericLiteral(trimmed)) { return undefined; }
  return Number(trimmed);
}

function parseDropdownOptions(constraint: string, defaultValue: OpenSCADCustomizerValue): OpenSCADCustomizerOption[] | undefined {
  const parts = constraint.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) { return undefined; }

  const options: OpenSCADCustomizerOption[] = [];
  for (const part of parts) {
    const labeled = part.split(':').map(x => x.trim());
    if (labeled.length === 2) {
      const [left, right] = labeled;
      if (typeof defaultValue === 'number') {
        const n = parseNumericToken(left);
        if (n === undefined) { return undefined; }
        options.push({ value: n, label: right });
      } else {
        options.push({ value: left, label: right });
      }
      continue;
    }
    if (typeof defaultValue === 'number') {
      const n = parseNumericToken(part);
      if (n === undefined) { return undefined; }
      options.push({ value: n });
    } else {
      options.push({ value: part });
    }
  }

  return options.length > 1 ? options : undefined;
}

function parseRangeConstraint(constraint: string): OpenSCADCustomizerRangeConstraint | undefined {
  const tokens = constraint.split(':').map(token => token.trim());

  if (tokens.length === 1) {
    const max = parseNumericToken(tokens[0]);
    return max !== undefined ? { max } : undefined;
  }
  if (tokens.length === 2) {
    const min = parseNumericToken(tokens[0]);
    const max = parseNumericToken(tokens[1]);
    return min !== undefined && max !== undefined ? { min, max } : undefined;
  }
  if (tokens.length === 3) {
    const min = parseNumericToken(tokens[0]);
    const step = parseNumericToken(tokens[1]);
    const max = parseNumericToken(tokens[2]);
    return min !== undefined && step !== undefined && max !== undefined ? { min, step, max } : undefined;
  }
  return undefined;
}

function parseSpinboxStep(commentText: string): number | undefined {
  const stepMatch = commentText.match(/^\s*\.?\d+(?:\.\d+)?\s*$/);
  if (!stepMatch) { return undefined; }
  const normalized = commentText.trim().startsWith('.') ? `0${commentText.trim()}` : commentText.trim();
  const step = Number(normalized);
  return Number.isFinite(step) ? step : undefined;
}

function inferWidget(
  valueType: 'string' | 'number' | 'boolean' | 'vector',
  defaultValue: OpenSCADCustomizerValue,
  trailingComment: string | undefined,
  warnings: OpenSCADCustomizerParseWarning[],
  line: number
): {
  widget: OpenSCADCustomizerWidgetType;
  options?: OpenSCADCustomizerOption[];
  range?: OpenSCADCustomizerRangeConstraint;
  maxLength?: number;
  rawConstraint?: string;
} {
  if (valueType === 'boolean') { return { widget: 'checkbox' }; }

  if (valueType === 'vector') {
    const constraint = trailingComment ? parseBracketConstraint(trailingComment) : undefined;
    if (constraint) {
      const range = parseRangeConstraint(constraint);
      if (range) { return { widget: 'vector', range, rawConstraint: constraint }; }
      warnings.push({ line, message: `Unsupported vector constraint '${constraint}'. Falling back to vector spinboxes.` });
      return { widget: 'vector', rawConstraint: constraint };
    }
    return { widget: 'vector' };
  }

  if (!trailingComment || trailingComment.trim().length === 0) {
    return valueType === 'string' ? { widget: 'textbox' } : { widget: 'spinbox' };
  }

  const constraint = parseBracketConstraint(trailingComment);
  if (constraint) {
    if (valueType === 'string') {
      const options = parseDropdownOptions(constraint, defaultValue);
      if (options) { return { widget: 'dropdown', options, rawConstraint: constraint }; }

      const maxLength = parseNumericToken(constraint);
      if (maxLength !== undefined && Number.isInteger(maxLength) && maxLength > 0) {
        return { widget: 'textbox', maxLength, rawConstraint: constraint };
      }

      warnings.push({ line, message: `Unsupported string constraint '${constraint}'. Falling back to textbox.` });
      return { widget: 'textbox', rawConstraint: constraint };
    }

    const options = parseDropdownOptions(constraint, defaultValue);
    if (options) { return { widget: 'dropdown', options, rawConstraint: constraint }; }

    const range = parseRangeConstraint(constraint);
    if (range) { return { widget: 'slider', range, rawConstraint: constraint }; }

    warnings.push({ line, message: `Unsupported numeric constraint '${constraint}'. Falling back to spinbox.` });
    return { widget: 'spinbox', rawConstraint: constraint };
  }

  if (valueType === 'number') {
    const step = parseSpinboxStep(trailingComment.trim());
    if (step !== undefined) { return { widget: 'spinbox', range: { step } }; }
  }

  return valueType === 'string' ? { widget: 'textbox' } : { widget: 'spinbox' };
}

function normalizeTabName(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) { return 'parameters'; }
  const collapsed = trimmed.replace(/\s+/g, '').toLowerCase();
  if (collapsed === 'hidden') { return 'Hidden'; }
  if (collapsed === 'global') { return 'Global'; }
  return trimmed;
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
        border-bottom: 1px solid var(--customizer-tab-border, #4b5563);
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
          color: var(--customizer-text, #e5e7eb);
          cursor: pointer;
          border-bottom: 2px solid ${firstTab ? 'var(--customizer-tab-active, #3b82f6)' : 'transparent'};
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
          tabButton.style.borderBottomColor = 'var(--customizer-tab-active, #3b82f6)';
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
        background: var(--customizer-field-bg, transparent);
      `;

      const label = document.createElement('label');
      label.textContent = variable.description
        ? `${variable.name} — ${variable.description}`
        : variable.name;
      label.style.cssText = `
        font-weight: 500;
        font-size: 13px;
        color: var(--customizer-label, #e5e7eb);
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
      color: var(--customizer-text, #e5e7eb);
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
      border: 1px solid var(--customizer-border, #4b5563);
      border-radius: 3px;
      background: var(--customizer-input-bg, #0f172a);
      color: var(--customizer-text, #e5e7eb);
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
      border: 1px solid var(--customizer-border, #4b5563);
      border-radius: 3px;
      background: var(--customizer-input-bg, #0f172a);
      color: var(--customizer-text, #e5e7eb);
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
      border: 1px solid var(--customizer-border, #4b5563);
      border-radius: 3px;
      background: var(--customizer-input-bg, #0f172a);
      color: var(--customizer-text, #e5e7eb);
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
        border: 1px solid var(--customizer-border, #4b5563);
        border-radius: 3px;
        font-family: monospace;
        font-size: 12px;
        background: var(--customizer-input-bg, #0f172a);
        color: var(--customizer-text, #e5e7eb);
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
