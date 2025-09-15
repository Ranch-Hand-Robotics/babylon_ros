# RobotScene API

The `RobotScene` class is the main controller for robot visualization and interaction. It manages the 3D scene, camera, UI, and all robot components.

## Constructor

```typescript
const robotScene = new RobotScene();
```

Creates a new RobotScene instance. No parameters required.

## Properties

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `engine` | `BABYLON.Engine \| undefined` | The Babylon.js rendering engine |
| `scene` | `BABYLON.Scene \| undefined` | The main 3D scene |
| `currentURDF` | `string \| undefined` | The current URDF XML string |
| `currentRobot` | `Robot \| undefined` | The current robot instance |
| `UILayer` | `GUI.AdvancedDynamicTexture \| undefined` | The UI overlay layer |
| `ground` | `BABYLON.GroundMesh \| undefined` | The ground plane mesh |
| `camera` | `BABYLON.ArcRotateCamera \| undefined` | The scene camera |
| `readyToRender` | `Boolean` | Whether the scene is ready for rendering |

## Methods

### Scene Management

#### `createScene(canvas: HTMLCanvasElement): Promise<void>`

Initializes the 3D scene with the Babylon.js engine.

**Parameters:**
- `canvas`: HTMLCanvasElement - The HTML canvas element to render to

**Returns:** Promise that resolves when scene creation is complete

**Example:**
```typescript
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
await robotScene.createScene(canvas);
```

#### `createUI(): void`

Creates the user interface elements including the hamburger menu and controls.

**Example:**
```typescript
robotScene.createUI();
```

### Robot Operations

#### `applyURDF(urdfText: string, vscode?: any): Promise<void>`

Loads and visualizes a robot from URDF XML content.

**Parameters:**
- `urdfText`: string - The URDF XML content as a string
- `vscode`: any (optional) - VS Code context for debugging

**Returns:** Promise that resolves when URDF loading is complete

**Example:**
```typescript
const urdfContent = await fetch('robot.urdf').then(r => r.text());
await robotScene.applyURDF(urdfContent);
```

### Camera Control

#### `resetCamera(): void`

Resets the camera to the default position and target based on the robot's bounding box.

**Example:**
```typescript
robotScene.resetCamera();
```

#### `setCameraRadius(radius: number): void`

Sets the camera distance from its target.

**Parameters:**
- `radius`: number - The camera distance from its target

**Example:**
```typescript
robotScene.setCameraRadius(5.0);
```

### Visual Configuration

#### `setBackgroundColor(hexColor: string): void`

Sets the scene background color using a hex color string.

**Parameters:**
- `hexColor`: string - Hex color string (e.g., "#FF0000" or "FF0000")

**Example:**
```typescript
robotScene.setBackgroundColor("#1a1a1a");
```

#### `setGridProperties(options: object): void`

Sets the grid material properties for customizing the ground grid appearance.

**Parameters:**
- `options`: object - Grid configuration options
  - `lineColor?: string` - Hex color for grid lines
  - `mainColor?: string` - Hex color for grid background
  - `minorOpacity?: number` - Opacity of minor grid lines (0-1)
  - `gridRatio?: number` - Ratio between major and minor grid lines
  - `majorUnitFrequency?: number` - Frequency of major grid lines

**Example:**
```typescript
robotScene.setGridProperties({
  lineColor: "#00FF00",
  mainColor: "#004400",
  minorOpacity: 0.3,
  gridRatio: 1.0,
  majorUnitFrequency: 10
});
```

#### `setMirrorProperties(options: object): void`

Sets mirror reflection properties for customizing the ground mirror appearance.

**Parameters:**
- `options`: object - Mirror configuration options
  - `reflectionLevel?: number` - Strength of reflections (0-1)
  - `alpha?: number` - Mirror transparency (0-1)
  - `tintColor?: string` - Hex color for mirror tinting
  - `blurKernel?: number` - Blur amount for softer reflections (0+)
  - `roughness?: number` - Material roughness (0-1)
  - `enabled?: boolean` - Enable/disable mirror entirely

**Example:**
```typescript
robotScene.setMirrorProperties({
  reflectionLevel: 0.3,
  alpha: 0.4,
  tintColor: "#001100",
  blurKernel: 16,
  roughness: 0.6,
  enabled: true
});
```

#### `setVisualConfig(config: object): void`

Sets all visual properties at once for convenient bulk configuration.

**Parameters:**
- `config`: object - Complete visual configuration
  - `cameraRadius?: number` - Camera distance from target
  - `backgroundColor?: string` - Scene background color (hex)
  - `gridLineColor?: string` - Grid line color (hex)
  - `gridMainColor?: string` - Grid background color (hex)
  - `gridMinorOpacity?: number` - Minor grid line opacity (0-1)
  - `gridRatio?: number` - Grid line ratio
  - `majorUnitFrequency?: number` - Major grid line frequency
  - `mirrorReflectionLevel?: number` - Mirror reflection strength (0-1)
  - `mirrorAlpha?: number` - Mirror transparency (0-1)
  - `mirrorTintColor?: string` - Mirror tint color (hex)
  - `mirrorBlurKernel?: number` - Mirror blur amount (0+)
  - `mirrorRoughness?: number` - Mirror roughness (0-1)
  - `mirrorEnabled?: boolean` - Enable/disable mirror

**Returns:** void

**Example:**
```typescript
robotScene.setVisualConfig({
  cameraRadius: 8.0,
  backgroundColor: "#2a2a2a",
  gridLineColor: "#00AA00",
  gridMainColor: "#003300",
  gridMinorOpacity: 0.25,
  gridRatio: 1.2,
  majorUnitFrequency: 8,
  mirrorReflectionLevel: 0.4,
  mirrorAlpha: 0.6,
  mirrorTintColor: "#002200",
  mirrorBlurKernel: 20,
  mirrorRoughness: 0.3,
  mirrorEnabled: true
});
```

### Screenshot and Export

#### `takeScreenshot(width?: number, height?: number): Promise<string>`

Captures a screenshot of the current scene.

**Parameters:**
- `width`: number (optional) - Screenshot width in pixels (default: canvas width)
- `height`: number (optional) - Screenshot height in pixels (default: canvas height)

**Returns:** Promise that resolves to a base64 encoded PNG image string

**Example:**
```typescript
const screenshot = await robotScene.takeScreenshot(1920, 1080);
// screenshot is a base64 string: "data:image/png;base64,iVBORw0KGgoAAAA..."
```

### Interactive Features

#### `toggleAxisOnRobot(jointOrLink: boolean, scene: BABYLON.Scene, layer: BABYLON.UtilityLayerRenderer): void`

Toggles position gizmos on joints or links for interactive manipulation.

**Parameters:**
- `jointOrLink`: boolean - true for joints, false for links
- `scene`: BABYLON.Scene - The Babylon.js scene
- `layer`: BABYLON.UtilityLayerRenderer - The utility layer for gizmos

#### `toggleAxisRotationOnRobot(jointOrLink: boolean, ui: GUI.AdvancedDynamicTexture, scene: BABYLON.Scene, layer: BABYLON.UtilityLayerRenderer): void`

Toggles rotation gizmos on joints or links for interactive manipulation.

**Parameters:**
- `jointOrLink`: boolean - true for joints, false for links
- `ui`: GUI.AdvancedDynamicTexture - The UI layer
- `scene`: BABYLON.Scene - The Babylon.js scene
- `layer`: BABYLON.UtilityLayerRenderer - The utility layer for gizmos

### Utility Methods

#### `clearStatus(): void`

Clears the status text display.

#### `clearAxisGizmos(): void`

Removes all position gizmos from the scene.

#### `clearRotationGizmos(): void`

Removes all rotation gizmos from the scene.

#### `clearJointExerciseGizmos(): void`

Removes joint exercise gizmos (advanced joint manipulation tools).

## Events and Interactions

The RobotScene class handles various user interactions:

- **Mouse hover**: Highlights joints and shows information
- **Click selection**: Selects visual elements for manipulation
- **Gizmo interaction**: Real-time position and rotation updates
- **Menu interactions**: Hamburger menu with feature toggles

## UI Features

The RobotScene provides a comprehensive UI system including:

- **Hamburger Menu**: Collapsible menu with organized controls
- **Grid Controls**: Toggle grid display with 10cm and 1m increments
- **Axis Visualization**: Show/hide coordinate axes on joints and links
- **Joint Exercise**: Interactive joint manipulation tools
- **Camera Controls**: Reset and frame robot functionality
- **Screenshot Capture**: Export current view as PNG

## Grid System

The scene includes a comprehensive grid system:

- **Base Grid**: Large grid plane for reference
- **Measurement Labels**: X, Y, Z axis labels with distance markers
- **Units**: Configurable 10cm and 1m increments
- **Color Coding**: Red (X), Green (Y), Blue (Z) axis labels

## Example Usage

```typescript
import { RobotScene } from '@ranchhandrobotics/babylon_ros';

// Create and initialize scene
const robotScene = new RobotScene();
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

await robotScene.createScene(canvas);
robotScene.createUI();

// Load a robot
const urdfContent = await fetch('path/to/robot.urdf').then(r => r.text());
await robotScene.applyURDF(urdfContent);

// Configure visual appearance using the new API
robotScene.setVisualConfig({
  cameraRadius: 6.0,
  backgroundColor: "#1e1e1e",
  gridLineColor: "#00AA00",
  gridMainColor: "#002200",
  gridMinorOpacity: 0.3,
  gridRatio: 1.0,
  majorUnitFrequency: 10,
  mirrorReflectionLevel: 0.3,
  mirrorAlpha: 0.5,
  mirrorTintColor: "#001100",
  mirrorBlurKernel: 16,
  mirrorEnabled: true
});

// Or set properties individually
robotScene.setBackgroundColor("#2a2a2a");
robotScene.setCameraRadius(8.0);
robotScene.setGridProperties({
  lineColor: "#FF6600",
  mainColor: "#330000",
  minorOpacity: 0.4
});
robotScene.setMirrorProperties({
  reflectionLevel: 0.2,
  alpha: 0.3,
  tintColor: "#001122",
  blurKernel: 24,
  roughness: 0.4
});

// Reset camera to frame the robot
robotScene.resetCamera();

// Take a screenshot
const screenshot = await robotScene.takeScreenshot(1920, 1080);
```

### Migration from Direct Property Access

If you were previously accessing properties directly, you can now use the new API methods:

```typescript
// OLD WAY (not recommended)
currentRobotScene.camera.radius = message.cameraRadius;
currentRobotScene.scene.clearColor = BABYLON.Color4.FromHexString(message.backgroundColor);
let gm = currentRobotScene.ground.material as Materials.GridMaterial;
gm.lineColor = BABYLON.Color3.FromHexString(message.gridMainColor);
gm.mainColor = BABYLON.Color3.FromHexString(message.gridLineColor);

// NEW WAY (recommended)
currentRobotScene.setVisualConfig({
  cameraRadius: message.cameraRadius,
  backgroundColor: message.backgroundColor,
  gridLineColor: message.gridMainColor,
  gridMainColor: message.gridLineColor,
  gridMinorOpacity: parseFloat(message.gridMinorOpacity),
  gridRatio: parseFloat(message.gridRatio),
  majorUnitFrequency: parseFloat(message.majorUnitFrequency)
});
```

## Performance Considerations

- The scene automatically manages mesh loading and rendering optimization
- Large robots with many meshes are handled asynchronously
- The UI system uses efficient event handling to minimize performance impact
- Screenshot capture is GPU-accelerated when available

## Browser Compatibility

RobotScene requires:
- WebGL 2.0 support
- ES6+ JavaScript features
- Modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)