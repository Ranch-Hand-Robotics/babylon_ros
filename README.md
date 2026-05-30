# babylon_ros

## Overview

Babylon_ros is a Node.JS API for rendering [ROS 2](https://ros.org) based URDFs and Xacro in a web browser or Visual Studio Code compatible extension using [the Babylon.js graphics engine](https://www.babylonjs.com/). It now includes **browser-based OpenSCAD support** for real-time SCAD to STL conversion with customizable parameters.

<div align="center">
  
[![Mule Robot Demo](https://img.shields.io/badge/🤖_Interactive_Demo-View_3D_Robot-blue?style=for-the-badge&logo=github)](https://ranch-hand-robotics.github.io/babylon_ros/urdf-viewer.html?urdf=https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/mule.urdf)
[![OpenSCAD Viewer](https://img.shields.io/badge/🔧_OpenSCAD_Viewer-Launch-green?style=for-the-badge&logo=github)](https://ranch-hand-robotics.github.io/babylon_ros/web/viewer-openscad.html)

</div>

### Universal URDF Viewer

The generic URDF viewer accepts any URDF or Xacro file via URL parameters:

```
https://ranch-hand-robotics.github.io/babylon_ros/docs/urdf-viewer.html?urdf=YOUR_URDF_URL
```

**Example URLs:**
- **Mule Robot**: `https://ranch-hand-robotics.github.io/babylon_ros/urdf-viewer.html?urdf=https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/mule.urdf`
- **R2 Robot**: `https://ranch-hand-robotics.github.io/babylon_ros/urdf-viewer.html?urdf=https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/r2.urdf`

This makes it easy to embed live robot visualizations in any README by simply linking to the viewer with your URDF file URL.

### OpenSCAD Viewer (NEW!)

Convert OpenSCAD files to STL directly in your browser with real-time customization:

- **Upload & Convert**: Load .scad files and convert to STL instantly
- **Customizer UI**: Automatic parameter controls from OpenSCAD comments
- **Real-time Preview**: Adjust parameters and see results immediately
- **Download Export**: Save converted STL files locally
- **Library Support**: Include OpenSCAD libraries for complex models

**Try it out**: [Online OpenSCAD Viewer](https://ranch-hand-robotics.github.io/babylon_ros/web/viewer-openscad.html)

## Features

- 🤖 **URDF and Xacro Object Model**: Loads and validates URDF and Xacro files into an object model you can access
- 🔧 **OpenSCAD Conversion**: Convert .scad files to STL in the browser using WebAssembly
- 🎛 **OpenSCAD Customizer**: Automatic UI generation from customizer variables in .scad files
- 🌐 **Web Rendering Interface**: Access your visualizations from any device with a web browser
- 📸 **Screenshot API**: Capture clean screenshots of your scenes without UI elements as base64 PNG images
- 📊 **Progress Tracking**: Monitor mesh/asset loading progress with callback API for custom progress bars

## Non-Features
- **No Real-time Visualization**: This package does not provide real-time visualization capabilities. It is focused on static visualization and interaction.
- **No Simulation**: Babylon ROS does not include a physics engine for simulating dynamics or collisions.
- **No Sensor visualization**: The package does not simulate or visualize sensors.

## Installation
Babylon_ros is available via the [Node Package Manager](https://npmjs.com) package that can be installed in your web application. To install, run:

```bash
npm install --save @ranchhandrobotics/babylon_ros
```

## Usage
To use Babylon ROS in your web application, you need to set up a basic HTML page and include the Babylon.js library along with the Babylon ROS package. 

Here’s a simple example which renders a the Test Page included in this package:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style nonce="${nonce}">
        html,
        body {
            overflow: hidden;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
        }

        #renderCanvas {
            width: 100%;
            height: 100%;
            touch-action: none;
        }
    </style>
    <title>URDF Preview</title>
</head>
<body>
    <canvas id="renderCanvas" touch-action="none"></canvas>    
    <script src="./ros.js"></script>
    <script>
        
        window.addEventListener("load", babylon_ros.RenderTestMain);

    </script>

</body>
</html>
```

## OpenSCAD Support

Babylon_ros now includes comprehensive OpenSCAD support for browser-based conversion and customization. The implementation uses WebAssembly to provide fast, client-side SCAD to STL conversion.

### Quick Start with OpenSCAD

```typescript
import * as babylon_ros from '@ranchhandrobotics/babylon_ros';

// Parse customizer variables from SCAD code
const scadCode = `
// width = 10
// height = 20  
// radius = 5

cube([width, height, 1]);
cylinder(r=radius, h=height);
`;

const customizer = babylon_ros.parseOpenSCADCustomizer(scadCode);
console.log(customizer.variables); // Parameter list

// Convert to STL with custom parameters
const result = await babylon_ros.convertOpenSCAD({
  scadContent: scadCode,
  filename: 'model.scad',
  parameterOverrides: { width: 20, height: 30, radius: 8 }
});

if (result.success) {
  // Use result.outputData (Uint8Array of STL binary)
  saveSTLFile(result.outputData, 'model.stl');
}
```

### Creating a Customizer UI

```typescript
// Create UI component
const ui = babylon_ros.createOpenSCADCustomizerUI();

// Render to container with change handler
ui.render(document.getElementById('customizer-ui'), customizer, (values) => {
  console.log('Parameters changed:', values);
  // Re-render model with new values
});

// Programmatic access
const currentValues = ui.getValues();
ui.setValues({ width: 25 });
```

### Full OpenSCAD API Reference

For complete documentation on OpenSCAD integration, including:
- Web Worker implementation details
- Parameter parsing and validation
- Library file loading
- Customizer widget types
- Browser compatibility

See [OPENSCAD_README.md](./OPENSCAD_README.md) for comprehensive documentation.

### Online OpenSCAD Viewer

A full-featured web application is available at:
- **[OpenSCAD Viewer](./web/viewer-openscad.html)** - Upload .scad files and customize in real-time

Features:
- File upload and preview
- Automatic customizer UI generation
- Real-time parameter adjustment  
- STL download export
- Responsive design for mobile/desktop

## License Notes for OpenSCAD Distribution

`babylon_ros` is MIT-licensed, but OpenSCAD functionality uses runtime artifacts from `openscad-wasm` (GPL-2.0-or-later).

If you redistribute builds that include OpenSCAD runtime artifacts, review:

- [LICENSE-COMPATIBILITY.md](LICENSE-COMPATIBILITY.md)
- [THIRDPARTYNOTICES.md](THIRDPARTYNOTICES.md)

## Support
If you encounter any issues with this package, the following resources are provided:

### Github Issues
Bugs and feature requests are handled through [Github Issues in the Repository](https://github.com/Ranch-Hand-Robotics/babylon_ros/issues). 

If you find that you are hitting the same issue as someone else, please give a :+1: or comment on an existing issue.

Please provide as much details as possible, including an isolated reproduction of the issue or a pointer to an online repository.

### Discussions
[Github Discussions](https://github.com/orgs/Ranch-Hand-Robotics/discussions) are provided for community driven general guidance, walkthroughs, or support.

## Sponsor
If you find this package useful, please consider [sponsoring Ranch Hand Robotics](https://github.com/sponsors/Ranch-Hand-Robotics) to help support the development of this package and other open source projects.

