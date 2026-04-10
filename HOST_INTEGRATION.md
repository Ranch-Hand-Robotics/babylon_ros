# Host Integration Guide

This document explains how to build custom web applications that host babylon_ros with configurable theming and integration hooks.

## Overview

babylon_ros provides a complete web-based 3D model viewing and customization platform. The **host demo** (`host-demo.html`) is a prototypical web application showing how to:

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
│ • Theme configuration                   │
│ • Model file management                 │
│ • Host actions (Buy, Export, etc.)      │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ <iframe> viewer-openscad.html       │ │
│ ├─────────────────────────────────────┤ │
│ │ • 3D rendering                      │ │
│ │ • OpenSCAD customizer UI            │ │
│ │ • Model loading & conversion        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Bidirectional Communication:            │
│ • postMessage() for commands            │
│ • iframe events for notifications       │
│ • window.modelViewerHost callbacks      │
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
    
    // Also update iframe theming via postMessage
    mainFrame.contentWindow.postMessage({
        command: 'applyTheme',
        theme: themeName
    }, '*');
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

### URL Parameter Loading

The viewer supports URL parameters for direct model loading:

```
# Direct SCAD file URL
?model=https://example.com/models/cube.scad

# From collection (legacy)
?collection=models/&item=cube

# Backward compatible (legacy params)
?scad=...
?file=...
```

### Programmatic Model Loading

```javascript
// Load model by sending message to iframe
const iframe = document.getElementById('viewerFrame');

iframe.contentWindow.postMessage({
    command: 'loadModel',
    url: '/path/to/model.scad'
}, '*');
```

### Model Configuration State

Get the current model configuration:

```javascript
// Setup host integration
const hostConfig = window.modelViewerHost = {
    onConfigurationChange: function(detail) {
        // detail = {
        //   modelName: 'cube.scad',
        //   configuration: {
        //     width: 10,
        //     height: 20,
        //     depth: 15
        //   }
        // }
        console.log('Model config:', detail);
    }
};
```

## Host Integration API

### Window Messaging

Insert this into your host page **before** loading the viewer:

```javascript
// Define host integration
window.modelViewerHost = {
    // Render custom controls in viewer sidebar
    renderControls: function(container, context) {
        // container = DOM element where to render
        // context.getConfiguration() = current model params
        // context.getModelName() = current model filename
        // context.onConfigurationChange(callback) = listen for updates
    },
    
    // Respond to model load events
    onModelLoaded: function(detail) {
        console.log('Model loaded:', detail.modelName, detail.configuration);
    },
    
    // Respond to parameter changes
    onConfigurationChange: function(detail) {
        console.log('Config changed:', detail.configuration);
    }
};
```

### Event System

The viewer emits DOM events that you can listen to:

```javascript
// Listen for viewer ready
window.addEventListener('modelviewer:ready', (event) => {
    console.log('Viewer initialized');
});

// Listen for model load
window.addEventListener('modelviewer:modelloaded', (event) => {
    console.log('Model loaded:', event.detail.modelName);
});

// Listen for configuration changes
window.addEventListener('modelviewer:configurationchange', (event) => {
    const { modelName, configuration } = event.detail;
    console.log(`Updated ${modelName}:`, configuration);
});
```

## Real-World Example: E-Commerce Integration

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        .configurator { display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; }
        .viewer { border: 1px solid #ccc; border-radius: 8px; }
        .purchase-panel { padding: 2rem; background: #f5f5f5; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="configurator">
        <iframe id="viewer" src="viewer-openscad.html" class="viewer"></iframe>
        <div class="purchase-panel">
            <h2>Configure Your Part</h2>
            <div id="summary"></div>
            <button onclick="addToCart()">Add to Cart</button>
        </div>
    </div>

    <script>
        let currentConfig = null;
        
        // Setup host integration before viewer loads
        window.modelViewerHost = {
            onConfigurationChange: function(detail) {
                currentConfig = detail;
                updateSummary();
            }
        };
        
        function updateSummary() {
            const summary = document.getElementById('summary');
            if (currentConfig) {
                summary.innerHTML = `
                    <h4>${currentConfig.modelName}</h4>
                    <pre>${JSON.stringify(currentConfig.configuration, null, 2)}</pre>
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

function switchModel(index) {
    selectedModel = index;
    const model = models[index];
    
    document.getElementById('viewer').contentWindow.postMessage({
        command: 'loadModel',
        url: model.url
    }, '*');
}
```

### Configuration Export

```javascript
// Export current configuration
function exportConfiguration() {
    if (!currentConfig) return;
    
    const json = JSON.stringify(currentConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentConfig.modelName}.json`;
    a.click();
}

// Import configuration
function importConfiguration(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const config = JSON.parse(e.target.result);
        // Send to viewer
        document.getElementById('viewer').contentWindow.postMessage({
            command: 'loadConfiguration',
            configuration: config.configuration
        }, '*');
    };
    reader.readAsText(file);
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
- Web Workers (for OpenSCAD conversion)
- CSS Custom Properties
- postMessage API

## Troubleshooting

### Viewer Not Loading

1. Check browser console for errors
2. Ensure viewer-openscad.html is in the same directory or accessible via URL
3. Verify CORS headers if loading from different domain

### Theme Not Applying

1. Ensure CSS variables are set on document root
2. Check for CSS specificity conflicts
3. Use browser DevTools to inspect computed styles

### Configuration Changes Not Triggering

1. Verify `window.modelViewerHost` is set before viewer loads
2. Check `onConfigurationChange` callback is defined
3. Listen for `modelviewer:configurationchange` events as fallback

### Model Not Rendering

1. Check OpenSCAD file syntax in browser console
2. Verify file path is accessible
3. Check Web Worker support in browser
4. Monitor network tab for resource loading

## Performance Tips

1. **Lazy load themes** - Only import color schemes actually used
2. **Debounce updates** - Don't update UI for every parameter change
3. **Cache configurations** - Store user preferences locally
4. **Use web workers** - OpenSCAD conversion already runs async by default
5. **Optimize mesh files** - Use STL compression when possible

## Deployment to GitHub Pages

```bash
# Build babylon_ros
npm run build

# Copy web files to docs/
cp web/* docs/

# Commit and push
git add docs/
git commit -m "Update hosted viewers"
git push
```

Set repository settings to serve GitHub Pages from `/docs` folder.

Access at: `https://yourusername.github.io/project/host-demo.html`

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
