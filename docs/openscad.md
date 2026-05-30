# OpenSCAD Integration in babylon_ros

This guide explains how to use the new OpenSCAD functionality in babylon_ros for browser-based SCAD to STL conversion.

## Overview

babylon_ros includes browser-based OpenSCAD support through:
- **OpenSCAD Module** (`src/openscad.ts`) - Core conversion and customizer logic
- **Web Worker** - Background processing for STL conversion
- **Customizer UI** - Automatic UI generation from OpenSCAD customizer variables
- **Enhanced Viewer** (`web/viewer-openscad.html`) - Full-featured OpenSCAD editor/viewer

The latest OpenSCAD WASM build is automatically downloaded from the [openscad-wasm GitHub releases](https://github.com/Ranch-Hand-Robotics/openscad-wasm/releases) during project build.

## Installation

The OpenSCAD WASM artifacts are downloaded automatically when building babylon_ros:

```bash
npm install
npm run build     # Automatically downloads latest openscad-wasm
```

Or manually download the latest release:

```bash
npm run download-openscad
```

The artifacts are stored in the `openscad-wasm-build/` directory:
```
openscad-wasm-build/
├── build/
│   ├── openscad.js
│   ├── openscad.wasm
│   └── openscad.fonts.js
└── version.json
```

## Features

### 1. OpenSCAD to STL Conversion
Convert .scad files to STL format directly in the browser using openscad-wasm:

```typescript
import * as babylon_ros from '@ranchhandrobotics/babylon_ros';

const request = {
  scadContent: scadFileContents,
  filename: 'model.scad',
  libraryFiles: {}, // Optional: base64-encoded library files
  exportFormat: 'stl',
  parameterOverrides: {} // Optional: parameter overrides
};

const response = await babylon_ros.convertOpenSCAD(request);
if (response.success) {
  const stlData = response.outputData; // Uint8Array
  // Use STL data...
}
```

### 2. Customizer Variable Parsing
Automatically parse OpenSCAD customizer variables from .scad code:

```typescript
const parseResult = babylon_ros.parseOpenSCADCustomizer(scadContent, 'model.scad');

console.log(parseResult.variables); // Array of customizer variables
console.log(parseResult.warnings);  // Any parse warnings
```

Variables are detected from comments like:
```openscad
// width = 10
// height = 20
// showTop = true
// colors = [1, 0, 0]
```

### 3. Customizer UI Component
Create an interactive UI for customizer variables:

```typescript
const customizer = babylon_ros.createOpenSCADCustomizerUI();

// Render to a container
const container = document.getElementById('customizer-ui');
customizer.render(container, parseResult, (values) => {
  console.log('User updated values:', values);
  // Re-render model with new values
});

// Get/set values programmatically
const values = customizer.getValues();
customizer.setValues({ width: 15, height: 25 });
```

## Web Workers

OpenSCAD conversion runs in a Web Worker to avoid blocking the UI. The worker:
- Loads openscad-wasm from the downloaded GitHub release
- Initializes virtual filesystem with library files
- Applies parameter overrides
- Runs OpenSCAD conversion
- Returns binary STL data

Worker initialization and management is handled automatically by `convertOpenSCAD()`.

## OpenSCAD Viewer

The `web/viewer-openscad.html` file provides a complete web application with:

### UI Features
- **File Upload** - Load .scad, .urdf, .xacro, or .stl files
- **Customizer Panel** - Auto-generated UI for customizer variables
- **Parameter Controls**:
  - Sliders for numeric ranges
  - Spinboxes for numbers
  - Checkboxes for booleans
  - Dropdowns for enums
  - Vector inputs for arrays
  - Text inputs for strings
- **Real-time Preview** - Render STL in babylon.js viewer
- **Download Export** - Save converted STL files
- **Responsive Design** - Works on desktop and mobile

### Open the Viewer
```bash
# Build babylon_ros first
npm run build

# Serve the web directory
npx http-server web/
```

Then open `http://localhost:8080/viewer-openscad.html` in your browser.

## Examples

### Example 1: Basic OpenSCAD Model
```typescript
// Simple cube model
const scadCode = `
// width = 10
// height = 20
// depth = 15

cube([width, height, depth]);
`;

const result = babylon_ros.parseOpenSCADCustomizer(scadCode);
// result.variables = [
//   { name: 'width', valueType: 'number', defaultValue: 10, ... },
//   { name: 'height', valueType: 'number', defaultValue: 20, ... },
//   { name: 'depth', valueType: 'number', defaultValue: 15, ... }
// ]
```

### Example 2: Converting with Parameters
```typescript
const scadContent = `
// radius = 5
// height = 10

cylinder(r=radius, h=height);
`;

const overrides = { radius: 8, height: 15 };

const response = await babylon_ros.convertOpenSCAD({
  scadContent,
  filename: 'cylinder.scad',
  parameterOverrides: overrides
});

// STL data with customized parameters is ready
```

### Example 3: Using Libraries
```typescript
// Load OpenSCAD library files
const libraryFiles = {
  'MCAD/math.scad': base64EncodedContent,
  'MCAD/shapes.scad': base64EncodedContent
};

const response = await babylon_ros.convertOpenSCAD({
  scadContent: 'use <MCAD/shapes.scad>; ... ',
  libraryFiles,
  filename: 'model.scad'
});
```

## API Reference

### Functions

#### `parseOpenSCADCustomizer(content: string, filename?: string): OpenSCADCustomizerParseResult`
Parse customizer variables from OpenSCAD content.

**Returns:**
- `variables` - Array of `OpenSCADCustomizerVariable` objects
- `warnings` - Array of parse warnings
- `firstBraceLine` - Optional line number of first code

#### `convertOpenSCAD(request: OpenSCADConversionRequest, workerScript?: string): Promise<OpenSCADConversionResponse>`
Convert OpenSCAD to STL using Web Worker.

**Parameters:**
- `request` - Conversion request with SCAD content, libraries, etc.
- `workerScript` - Optional custom worker script (uses default if omitted)

**Returns:** Promise resolving to conversion response with binary STL data

#### `createOpenSCADCustomizerUI(): OpenSCADCustomizerUI`
Create a UI component for customizer variables.

**Returns:** Object with methods:
- `render(container, model, onChange)` - Render UI to container
- `getValues()` - Get current parameter values
- `setValues(values)` - Set parameter values
- `enable(enabled)` - Enable/disable UI

#### `buildOpenSCADOverrides(overrides: Record<string, OpenSCADCustomizerValue>): string`
Convert parameter object to OpenSCAD variable assignments.

**Returns:** String of OpenSCAD code to prepend to model

### Types

#### `OpenSCADCustomizerVariable`
```typescript
interface OpenSCADCustomizerVariable {
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
  line: number;
}
```

#### `OpenSCADConversionRequest`
```typescript
interface OpenSCADConversionRequest {
  scadContent: string;
  filename: string;
  libraryFiles?: { [virtualPath: string]: string }; // Base64 encoded
  timeout?: number;
  exportFormat?: 'stl' | 'svg';
  parameterOverrides?: Record<string, OpenSCADCustomizerValue>;
}
```

#### `OpenSCADConversionResponse`
```typescript
interface OpenSCADConversionResponse {
  success: boolean;
  outputData?: Uint8Array;  // Binary STL/SVG data
  outputFormat?: string;
  filename?: string;
  error?: string;
  progress?: string;
}
```

## Dependencies

- **openscad-wasm** - WebAssembly OpenSCAD implementation (downloaded from [GitHub Releases](https://github.com/Ranch-Hand-Robotics/openscad-wasm/releases))
  - Automatically downloaded during build via `npm run download-openscad`
  - No npm dependency required
- **babylonjs** - 3D rendering engine (~7.16.0)
- **TypeScript** - For type definitions

## Browser Support

Works in modern browsers supporting:
- Web Workers
- WebAssembly (WASM)
- File API
- Blob/URL APIs

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 15+

## Performance Notes

### Conversion Speed
- Simple models: < 1 second
- Complex models: 2-30 seconds depending on complexity
- Timeout default: 5 minutes (configurable)

### Memory Usage
- WASM module: ~8 MB
- Virtual filesystem: Depends on library files loaded
- Output STL: Proportional to geometry complexity

## Troubleshooting

### Worker Timeout
If conversion times out:
1. Increase `timeout` parameter (in milliseconds)
2. Simplify model geometry
3. Check browser console for errors

### Missing openscad-wasm Artifacts
If you get an error about loading OpenSCAD runtime:
1. Run `npm run download-openscad` to fetch the latest release
2. Ensure the build folder exists at `openscad-wasm-build/build/`
3. Check that webpack was configured correctly

### Missing Libraries
Library files must be:
1. Explicitly provided as base64-encoded in `libraryFiles`
2. Located at virtual paths matching OpenSCAD `use/include` statements

### UI Not Rendering
Check that:
1. HTML container element exists
2. Customizer variables are present in SCAD file
3. Comments follow the `// varName = defaultValue` format

## Integration Example

```html
<div id="customizer"></div>
<canvas id="viewer"></canvas>

<script src="babylon_ros.js"></script>
<script>
  const fileInput = document.querySelector('input[type=file]');
  
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const content = await file.text();
    
    // Parse customizer
    const model = babylon_ros.parseOpenSCADCustomizer(content);
    
    // Render UI
    const ui = babylon_ros.createOpenSCADCustomizerUI();
    ui.render(document.getElementById('customizer'), model, async (values) => {
      // Convert on parameter change
      const response = await babylon_ros.convertOpenSCAD({
        scadContent: content,
        filename: file.name,
        parameterOverrides: values
      });
      
      if (response.success) {
        // Display STL in babylon viewer...
      }
    });
  });
</script>
```

## License

This integration uses a mixed-license distribution model:

- `babylon_ros` source: MIT
- OpenSCAD runtime artifacts (`openscad-wasm`): GPL-2.0-or-later

If you redistribute bundles that include OpenSCAD runtime artifacts, review:

- [`../LICENSE-COMPATIBILITY.md`](../LICENSE-COMPATIBILITY.md)
- [`../THIRDPARTYNOTICES.md`](../THIRDPARTYNOTICES.md)

## See Also

- [OpenSCAD Documentation](https://openscad.org/documentation.html)
- [babylon.js Documentation](https://www.babylonjs-playground.com/)
- [openscad-wasm Repository](https://github.com/Ranch-Hand-Robotics/openscad-wasm)
- [openscad-wasm Releases](https://github.com/Ranch-Hand-Robotics/openscad-wasm/releases)
