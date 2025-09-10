# Babylon ROS API Overview

The Babylon ROS library provides a comprehensive TypeScript/JavaScript API for loading, visualizing, and interacting with URDF (Unified Robot Description Format) files in web browsers using Babylon.js.

## Core Architecture

The library is built around several key classes that work together to provide a complete robot visualization system:

- **[RobotScene](api/robot-scene.md)** - Main scene management and interaction controller
- **[Robot](api/robot.md)** - Robot model representation and management
- **[Link](api/link.md)** - Individual robot link components
- **[Joint](api/joint.md)** - Robot joint definitions and behaviors
- **[Visual](api/visual.md)** - Visual geometry representations
- **[Material](api/material.md)** - Material definitions and textures

## Geometry System

The library supports various geometry types for robot components:

- **[IGeometry Interface](api/geometry.md#igeometry)** - Base geometry interface
- **[Mesh](api/geometry.md#mesh)** - Complex mesh geometries from files
- **[Box](api/geometry.md#box)** - Box primitive geometries
- **[Sphere](api/geometry.md#sphere)** - Sphere primitive geometries
- **[Cylinder](api/geometry.md#cylinder)** - Cylinder primitive geometries

## Interactive Controls

Advanced interaction and manipulation tools:

- **[JointPositionGizmo](api/gizmos.md#jointpositiongizmo)** - Position manipulation for joints
- **[JointRotationGizmo](api/gizmos.md#jointrotationgizmo)** - Rotation manipulation for joints

## Utilities

Helper functions and utilities:

- **[Utilities](api/utilities.md)** - Parsing and transformation utilities

## Quick Start

```typescript
import { RobotScene } from '@ranchhandrobotics/babylon_ros';

// Create a new robot scene
const robotScene = new RobotScene();

// Initialize the 3D scene
await robotScene.createScene(canvas);

// Create the UI
robotScene.createUI();

// Load a URDF file
const urdfText = await fetch('path/to/robot.urdf').then(r => r.text());
await robotScene.applyURDF(urdfText);
```

## Features

- **URDF Loading**: Complete support for URDF specification including links, joints, materials, and meshes
- **Interactive 3D Visualization**: Real-time 3D rendering with camera controls
- **Joint Manipulation**: Interactive gizmos for moving and rotating joints
- **Material Support**: Textures, colors, and material properties
- **Grid System**: Configurable measurement grids (10cm, 1m increments)
- **Screenshot Capture**: Programmatic screenshot functionality
- **Responsive UI**: Hamburger menu system with feature toggles

## Browser Compatibility

The library works in all modern browsers that support WebGL and ES6 modules:

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Dependencies

- **Babylon.js**: 3D rendering engine
- **Babylon.js Materials**: Extended material system
- **Babylon.js GUI**: User interface components
- **Babylon.js Collada Loader**: COLLADA/DAE file support