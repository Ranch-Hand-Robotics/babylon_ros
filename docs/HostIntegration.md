# Host Integration Guide

This document explains how to build custom web applications that host babylon_ros with configurable theming and integration hooks.

## Overview

babylon_ros provides a complete web-based 3D model viewing and customization platform. 
The **host demo** (`host-demo.html`) is a prototypical web application showing how to:

1. **Apply custom theming** - CSS variables for colors, spacing, typography
2. **Load and configure models** - Via URL parameters or programmatic API
3. **Receive real-time updates** - Configuration changes from the model viewer
4. **Integrate host actions** - Respond to user interactions with current model state

## Quick Start

Open `host-demo.html` in your browser. You'll see:

- **Left panel**: 3D model viewer (embedded babylon_ros viewer)
- **Right panel**: Host controls for theming, model loading, and actions

This is a fully functional example that demonstrates all integration patterns.

## Architecture

```
┌─────────────────────────────────────────┐
│ host-demo.html (Host Platform)          │
├─────────────────────────────────────────┤
│ • Theme configuration (CSS variables)   │
│ • Model file management (upload/URL)    │
│ • Host actions (Buy, Export, etc.)      │
│ • Custom UI controls                    │
│                                         │
│ • Direct Canvas: <canvas id="renderCanvas">
│   ├── BabylonJS 3D rendering            │
│   ├── OpenSCAD model conversion         │
│   └── Real-time parameter updates       │
│                                         │
│ Direct API Communication:               │
│ • viewer.loadModelData()                │
│ • viewer.setConfiguration()             │
│ • viewer.getConfiguration()             │
│ • Direct event callbacks                │
│ • ResizeObserver for aspect ratio       │
└─────────────────────────────────────────┘
```

## Theme Configuration

### CSS Variables System

babylon_ros uses CSS custom properties (variables) for complete theming control:

```css
:root {
    /* Colors */
    --primary-color: #2563eb;
    --secondary-color: #10b981;
    --accent-color: #f59e0b;
    --bg-primary: #ffffff;
    --text-primary: #1f2937;
    
    /* Typography */
    --font-family: 'Segoe UI', sans-serif;
    --font-size-md: 1rem;
    
    /* Spacing */
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
}
```

### Applying Themes Programmatically

```javascript
// Define theme palettes
const themes = {
    light: {
        '--primary-color': '#2563eb',
        '--secondary-color': '#10b981',
        '--bg-primary': '#ffffff',
        '--text-primary': '#1f2937'
    },
    dark: {
        '--primary-color': '#60a5fa',
        '--secondary-color': '#34d399',
        '--bg-primary': '#1f2937',
        '--text-primary': '#f9fafb'
    }
};

// Apply theme
function applyTheme(themeName) {
    const root = document.documentElement;
    Object.entries(themes[themeName]).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
    
    // Viewer automatically uses CSS variables from page
    // Theme is applied immediately (no postMessage needed)
}
```

### Dynamic Color Customization

```javascript
// Allow user to customize individual colors
colorPicker.addEventListener('change', (e) => {
    document.documentElement.style.setProperty(
        '--primary-color',
        e.target.value
    );
});
```

## Model Loading & Configuration

### Programmatic Model Loading

Load models directly via the viewer API:

```javascript
// Load from URL
await viewer.loadModelFromUrl('/path/to/model.scad');

// Load from content string
const scadContent = `
cube([10, 15, 20]);
`;
await viewer.loadModelData(scadContent, 'cube.scad');
```

### File Upload

Handle file uploads directly in the host:

```javascript
const fileInput = document.getElementById('fileInput');

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const content = await file.text();
    await viewer.loadModelData(content, file.name);
});
```

### Model Configuration State

Get and set the current model configuration:

```javascript
// Get current configuration
const config = viewer.getConfiguration();
console.log('Current config:', config);
// Output: { length: 20, width: 15, height: 25, shape: 'cube', ... }

// Get customizer variables
const variables = viewer.getCustomizerVariables();
console.log('Available parameters:', variables);

// Set new configuration
await viewer.setConfiguration({
    length: 30,
    width: 20,
    height: 40
});
```

## Host Integration API

### Direct Viewer API

Initialize the viewer with callbacks:

```javascript
const canvas = document.getElementById('renderCanvas');

const viewer = await babylon_ros.RenderOpenScadDirect({
    canvas: canvas,
    theme: themeConfig.light,
    autoConvertOnLoad: false,
    
    // Called when model is loaded
    onModelLoaded: (detail) => {
        console.log('Model loaded:', detail);
        // detail = {
        //   modelName: 'cube.scad',
        //   configuration: { width: 10, height: 20, ... },
        //   variables: [ { name: 'width', defaultValue: 10, ... }, ... ]
        // }
        buildCustomizerUI(detail.variables, detail.configuration);
    },
    
    // Called when configuration changes
    onConfigurationChange: (detail) => {
        console.log('Configuration changed:', detail);
        updateModelInfo(detail);
    }
});
```

### ViewerAPI Methods

The viewer instance provides these methods:

```javascript
// Loading
await viewer.loadModelFromUrl(url);           // Load from URL
await viewer.loadModelData(content, name);     // Load from string/file

// Configuration
const config = viewer.getConfiguration();      // Get current config
const vars = viewer.getCustomizerVariables();  // Get parameter definitions
await viewer.setConfiguration(config);        // Apply new config

// Camera & Display
viewer.resetCamera();                           // Frame model in view
viewer.toggleGrid();                            // Toggle grid display
viewer.resizeRenderer();                        // Update for container size

// Model Info
const name = viewer.getModelName();            // Current model filename

// Theme
viewer.applyTheme(themeObject);                // Apply custom theme

// Export
await viewer.downloadModel();                  // Download current STL
await viewer.convertAndPreview();              // Re-convert model
```

## Real-World Example: E-Commerce Integration

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: system-ui; margin: 0; }
        .configurator { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; min-height: 100vh; padding: 2rem; }
        canvas { border: 1px solid #ccc; border-radius: 8px; width: 100%; height: 100%; }
        .purchase-panel { padding: 2rem; background: #f5f5f5; border-radius: 8px; display: flex; flex-direction: column; }
        .config-summary { flex: 1; overflow-y: auto; }
        button { padding: 1rem; margin-top: 1rem; font-size: 1rem; cursor: pointer; }
    </style>
</head>
<body>
    <div class="configurator">
        <canvas id="renderCanvas"></canvas>
        <div class="purchase-panel">
            <h2>Configure Your Part</h2>
            <div class="config-summary" id="summary"></div>
            <button onclick="addToCart()">💳 Add to Cart</button>
        </div>
    </div>

    <script src="./ros.js"></script>
    <script>
        let viewer = null;
        let currentConfig = null;
        
        window.addEventListener('load', async () => {
            const canvas = document.getElementById('renderCanvas');
            
            viewer = await babylon_ros.RenderOpenScadDirect({
                canvas: canvas,
                autoConvertOnLoad: false,
                
                onModelLoaded: (detail) => {
                    currentConfig = detail;
                    updateSummary();
                },
                
                onConfigurationChange: (detail) => {
                    currentConfig = detail;
                    updateSummary();
                }
            });
            
            // Load initial model
            await viewer.loadModelFromUrl('/models/part.scad');
            
            // Monitor canvas container for size changes
            const container = canvas.parentElement;
            const resizeObserver = new ResizeObserver(() => {
                viewer.resizeRenderer();
            });
            resizeObserver.observe(container);
        });
        
        function updateSummary() {
            const summary = document.getElementById('summary');
            if (currentConfig) {
                const configHtml = Object.entries(currentConfig.configuration)
                    .map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`)
                    .join('');
                    
                summary.innerHTML = `
                    <h4>${currentConfig.modelName}</h4>
                    <div style="background: white; padding: 1rem; border-radius: 4px; font-family: monospace; font-size: 0.9rem;">
                        ${configHtml}
                    </div>
                `;
            }
        }
        
        function addToCart() {
            if (!currentConfig) {
                alert('Please load a model first');
                return;
            }
            
            const payload = {
                model: currentConfig.modelName,
                configuration: currentConfig.configuration,
                timestamp: new Date().toISOString()
            };
            
            // Send to backend
            fetch('/api/cart/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(() => {
                alert('Added to cart!');
            }).catch(e => {
                console.error('Error:', e);
                alert('Failed to add to cart');
            });
        }
    </script>
</body>
</html>
```

## CSS Theming Deep Dive

### Color Schemes

The host-demo includes three pre-built themes:

#### Light Theme
```javascript
{
    '--primary-color': '#2563eb',
    '--secondary-color': '#10b981',
    '--accent-color': '#f59e0b',
    '--bg-primary': '#ffffff',
    '--text-primary': '#1f2937'
}
```

#### Dark Theme
```javascript
{
    '--primary-color': '#60a5fa',
    '--secondary-color': '#34d399',
    '--accent-color': '#fbbf24',
    '--bg-primary': '#1f2937',
    '--text-primary': '#f9fafb'
}
```

#### High Contrast Theme
```javascript
{
    '--primary-color': '#0000ff',
    '--secondary-color': '#00aa00',
    '--accent-color': '#ff0000',
    '--bg-primary': '#000000',
    '--text-primary': '#ffffff'
}
```

### Adding New Themes

```javascript
const themes = {
    // ... existing themes
    myCustomTheme: {
        '--primary-color': '#your-color',
        '--secondary-color': '#your-color',
        '--accent-color': '#your-color',
        '--bg-primary': '#your-color',
        '--bg-secondary': '#your-color',
        '--text-primary': '#your-color',
        '--text-secondary': '#your-color',
        '--border-color': '#your-color'
    }
};
```

## Advanced Patterns

### Multi-Model Configurator

```javascript
const models = [
    { name: 'cube', url: '/models/cube.scad' },
    { name: 'sphere', url: '/models/sphere.scad' },
    { name: 'cylinder', url: '/models/cylinder.scad' }
];

let selectedModel = 0;

async function switchModel(index) {
    selectedModel = index;
    const model = models[index];
    
    try {
        await viewer.loadModelFromUrl(model.url);
        viewer.resetCamera();
    } catch (e) {
        console.error('Failed to load model:', e);
    }
}
```

### Configuration Export & Import

```javascript
// Export current configuration
function exportConfiguration() {
    if (!currentConfig) return;
    
    const json = JSON.stringify(currentConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentConfig.modelName}.config.json`;
    a.click();
}

// Import configuration
async function importConfiguration(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const config = JSON.parse(e.target.result);
        // Apply configuration to viewer
        await viewer.setConfiguration(config.configuration);
        viewer.resetCamera();
    };
    reader.readAsText(file);
}

// Download rendered model
async function downloadModel() {
    await viewer.downloadModel();
}
```

### Responsive Layout

```css
/* Adapt layout for mobile */
@media (max-width: 768px) {
    .container {
        grid-template-columns: 1fr;
    }
    
    .viewer {
        min-height: 300px;
    }
}
```

## Browser Compatibility

babylon_ros host integration works on:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Requirements:
- ES6+ support
- Web Workers (for OpenSCAD WASM conversion)
- CSS Custom Properties (CSS variables)
- WebGL support (BabylonJS rendering)
- ResizeObserver API (optional, for responsive canvas)

## Troubleshooting

### Viewer Not Rendering

1. Verify canvas element exists and has dimensions
2. Check browser console for errors from `babylon_ros.RenderOpenScadDirect()`
3. Ensure `ros.js` is loaded before calling `RenderOpenScadDirect()`
4. Check that worker URL is set: `window.__BABYLON_ROS_WORKER_URL`

### Model Not Loading

1. Verify model URL is accessible (check network tab)
2. Check OpenSCAD file syntax (browser console shows errors)
3. Ensure file permissions allow HTTP access
4. For file uploads, verify file is read as text

### Theme Not Applying

1. Set CSS variables on document root before viewer init
2. Pass theme to `RenderOpenScadDirect({ theme: ... })`
3. Check CSS variable names match expected values
4. Use browser DevTools to inspect `<html>` element styles

### Configuration Changes Not Triggering

1. Verify `onConfigurationChange` callback is defined in options
2. Check that `viewer.setConfiguration()` is awaited
3. Monitor console for errors in callback function
4. Verify callback receives proper detail object

### Stretched or Distorted Display

1. Add ResizeObserver to call `viewer.resizeRenderer()` when container resizes
2. Ensure canvas has defined width/height (not just CSS)
3. Check that parent container dimensions are set
4. For flex/grid layouts, use `min-height: 0` on flex items

## Performance Tips

1. **Lazy load themes** - Only import color schemes actually used
2. **Debounce updates** - Don't update UI for every parameter change
3. **Cache configurations** - Store user preferences locally
4. **Use web workers** - OpenSCAD conversion already runs async by default
5. **Optimize mesh files** - Use STL compression when possible

## Deployment to GitHub Pages or Static Hosting

### Build Steps

```bash
# Build babylon_ros
npm run build

# Copy built files to your hosting directory
cp dist/ros.js hosting/
cp dist/workers/openscadWorker.js hosting/workers/
cp web/host-demo.html hosting/
cp web/host-cyberdeck-demo.html hosting/  # Alternative demo

# Include in your index or use directly
```

### Set Worker URL

Each HTML file that uses babylon_ros must set the worker path:

```html
<script>
    // Point to worker location (relative or absolute path)
    window.__BABYLON_ROS_WORKER_URL = './workers/openscadWorker.js';
</script>

<script src="./ros.js"></script>
```

### GitHub Pages Example

Set repository settings to serve from `/docs` folder.

Access at: `https://yourusername.github.io/project/host-demo.html`

### Self-Hosted Server

```bash
# Simple HTTP server
cd web/
python -m http.server 8080

# Access at http://localhost:8080/host-demo.html
```

## License & Attribution

babylon_ros is provided under MIT license. When hosting, please credit:

```html
<!-- Powered by babylon_ros -->
<!-- https://github.com/Ranch-Hand-Robotics/babylon_ros -->
```

## Support

For issues, feature requests, or contributions:
- GitHub Issues: [Ranch-Hand-Robotics/babylon_ros](https://github.com/Ranch-Hand-Robotics/babylon_ros)
- Discussions: GitHub Discussions
- Documentation: See docs/ folder
