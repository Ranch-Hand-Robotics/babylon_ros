# Geometry API

The geometry system provides 3D shapes for robot visual and collision components through the `IGeometry` interface and concrete implementations.

## IGeometry Interface

The base interface that all geometry types implement:

```typescript
interface IGeometry {
    meshes: BABYLON.AbstractMesh[] | undefined;
    transform: BABYLON.TransformNode | undefined;
    
    create(scene: BABYLON.Scene, mat: Material | undefined): void;
    dispose(): void;
    setLoadCompleteCallback?(callback: () => void): void;
}
```

### Properties
- `meshes`: Array of Babylon.js mesh objects
- `transform`: Transform node for positioning and hierarchy

### Methods
- `create()`: Creates the geometry in the scene with optional material
- `dispose()`: Cleans up geometry resources
- `setLoadCompleteCallback()`: Optional callback for async loading completion

## Primitive Geometries

### Box Geometry

Creates rectangular box shapes.

```typescript
import { Box } from '@ranchhandrobotics/babylon_ros';

const box = new Box(width, height, depth);
```

**Constructor Parameters:**
- `width`: number - X-axis dimension (meters)
- `height`: number - Y-axis dimension (meters)  
- `depth`: number - Z-axis dimension (meters)

**Example:**
```typescript
// Create a 2x1x0.5 meter box
const chassisBox = new Box(2.0, 1.0, 0.5);
chassisBox.create(scene, material);
```

### Sphere Geometry

Creates spherical shapes.

```typescript
import { Sphere } from '@ranchhandrobotics/babylon_ros';

const sphere = new Sphere(radius);
```

**Constructor Parameters:**
- `radius`: number - Sphere radius (meters)

**Example:**
```typescript
// Create a 10cm radius sphere
const ballJoint = new Sphere(0.1);
ballJoint.create(scene, material);
```

### Cylinder Geometry

Creates cylindrical shapes.

```typescript
import { Cylinder } from '@ranchhandrobotics/babylon_ros';

const cylinder = new Cylinder(length, radius);
```

**Constructor Parameters:**
- `length`: number - Cylinder height/length (meters)
- `radius`: number - Cylinder radius (meters)

**Special Behavior:**
- Automatically rotated 90° around X-axis to align with ROS conventions
- ROS cylinders are along Z-axis, Babylon.js cylinders are along Y-axis

**Example:**
```typescript
// Create a 50cm long, 5cm radius cylinder
const robotArm = new Cylinder(0.5, 0.05);
robotArm.create(scene, material);
```

## Mesh Geometry

Loads complex 3D models from files.

```typescript
import { Mesh } from '@ranchhandrobotics/babylon_ros';

const mesh = new Mesh(uri, scale);
```

**Constructor Parameters:**
- `uri`: string - Path to 3D model file
- `scale`: BABYLON.Vector3 - Scaling factors for X, Y, Z axes

**Supported Formats:**
- **COLLADA (.dae)**: Full feature support including materials, animations
- **STL (.stl)**: Basic mesh geometry (automatically handles coordinate conversion)
- **OBJ (.obj)**: Basic mesh geometry
- **glTF (.gltf, .glb)**: Modern format with full PBR material support

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `uri` | `string` | File path or URL to the mesh |
| `scale` | `BABYLON.Vector3` | Scaling applied to loaded mesh |
| `meshes` | `BABYLON.AbstractMesh[] \| undefined` | Loaded mesh objects |
| `transform` | `BABYLON.TransformNode \| undefined` | Transform node |
| `material` | `Material \| undefined` | Override material |
| `skeletons` | `BABYLON.Skeleton[] \| undefined` | Animation skeletons |

### Methods

#### `setLoadCompleteCallback(callback: () => void): void`

Sets a callback function to be called when mesh loading completes.

**Example:**
```typescript
const robotMesh = new Mesh("robot_body.dae", new BABYLON.Vector3(1, 1, 1));

robotMesh.setLoadCompleteCallback(() => {
    console.log("Robot mesh loaded successfully");
    // Perform post-load operations
});

robotMesh.create(scene, material);
```

## Usage Examples

### Creating Primitive Shapes

```typescript
// Robot chassis - large box
const chassis = new Box(2.0, 1.0, 0.3);
const chassisMaterial = new Material();
chassisMaterial.color = new BABYLON.Color4(0.5, 0.5, 0.5, 1);
chassis.create(scene, chassisMaterial);

// Wheel - cylinder
const wheel = new Cylinder(0.1, 0.3); // 10cm wide, 30cm diameter
const rubberMaterial = new Material();
rubberMaterial.color = new BABYLON.Color4(0.1, 0.1, 0.1, 1);
wheel.create(scene, rubberMaterial);

// Sensor housing - sphere
const lidarDome = new Sphere(0.08); // 8cm radius
const blackMaterial = new Material();
blackMaterial.color = new BABYLON.Color4(0, 0, 0, 1);
lidarDome.create(scene, blackMaterial);
```

### Loading Complex Meshes

```typescript
// High-detail robot arm from COLLADA file
const armMesh = new Mesh(
    "models/robot_arm_detailed.dae",
    new BABYLON.Vector3(1, 1, 1) // No scaling
);

// Handle async loading
let meshLoadComplete = false;
armMesh.setLoadCompleteCallback(() => {
    meshLoadComplete = true;
    console.log("Arm mesh loaded");
});

armMesh.create(scene, material);

// Scaled STL mesh (STL files often need scaling)
const gearMesh = new Mesh(
    "parts/gear.stl",
    new BABYLON.Vector3(0.001, 0.001, 0.001) // Scale from mm to m
);
gearMesh.create(scene, metalMaterial);
```

### Geometry in Visual Components

```typescript
const visual = new Visual();
visual.name = "robot_body";

// Use different geometry based on requirements
if (detailedMode) {
    // High-detail mesh for close viewing
    visual.geometry = new Mesh("detailed_body.dae", new BABYLON.Vector3(1, 1, 1));
} else {
    // Simple box for performance
    visual.geometry = new Box(1.5, 0.8, 0.4);
}

visual.create(scene, materialMap);
```

## Coordinate System Conversions

### ROS to Babylon.js Coordinate Systems

The geometry classes handle coordinate system differences:

**ROS Conventions:**
- X-forward, Y-left, Z-up
- Cylinders along Z-axis
- STL files in millimeters

**Babylon.js Conventions:**  
- X-right, Y-up, Z-forward
- Cylinders along Y-axis
- Meters for all units

### Automatic Conversions

```typescript
// Cylinder: Automatically rotated 90° around X-axis
const cylinder = new Cylinder(0.5, 0.05);
// Result: 50cm cylinder pointing along Z-axis (ROS convention)

// STL Mesh: Automatically handles coordinate conversion
const stlMesh = new Mesh("part.stl", new BABYLON.Vector3(0.001, 0.001, 0.001));
// Result: Proper orientation and scaling from mm to meters
```

## Performance Considerations

### Primitive Geometries
- **Fast Creation**: Generated procedurally, very fast
- **Low Memory**: Minimal memory footprint
- **Good for Collision**: Perfect for simple collision shapes

### Mesh Geometries
- **Loading Time**: Files must be loaded from disk/network
- **Memory Usage**: Can be large for detailed models
- **Rendering Cost**: Complex meshes impact rendering performance

### Optimization Strategies

```typescript
// Use appropriate level of detail
const simpleCollision = new Box(2, 1, 0.5);        // Simple collision
const detailedVisual = new Mesh("detailed.dae", scale); // Detailed visual

// Scale optimization
const lowPolyMesh = new Mesh("low_poly.dae", scale);    // For distant objects
const highPolyMesh = new Mesh("high_poly.dae", scale);  // For close viewing

// Async loading management
const loader = new Mesh("large_model.dae", scale);
loader.setLoadCompleteCallback(() => {
    // Enable rendering after loading
    robotScene.readyToRender = true;
});
```

## Material Integration

### Geometry with Materials

```typescript
// Primitive with solid color
const box = new Box(1, 1, 1);
const redMaterial = new Material();
redMaterial.color = new BABYLON.Color4(1, 0, 0, 1);
box.create(scene, redMaterial);

// Mesh with texture (material can be embedded in file)
const texturedMesh = new Mesh("textured_model.dae", scale);
texturedMesh.create(scene, undefined); // Uses embedded materials

// Mesh with override material
const meshWithOverride = new Mesh("model.dae", scale);
meshWithOverride.create(scene, customMaterial); // Overrides embedded materials
```

## Error Handling

### File Loading Errors
```typescript
const mesh = new Mesh("missing_file.dae", scale);
mesh.setLoadCompleteCallback(() => {
    if (mesh.meshes && mesh.meshes.length > 0) {
        console.log("Mesh loaded successfully");
    } else {
        console.error("Failed to load mesh");
    }
});
```

### Disposal and Cleanup
```typescript
// Always dispose geometries to prevent memory leaks
geometry.dispose();

// For meshes, this cleans up:
// - Loaded mesh data
// - Transform nodes  
// - Associated materials (if not shared)
// - Animation data
```

## Integration with Robot Components

Geometries are typically used within Visual components:

```typescript
// Part of robot loading process
const link = new Link();
const visual = new Visual();

// Choose appropriate geometry
visual.geometry = new Box(1, 0.5, 0.3); // Simple box
// OR
visual.geometry = new Mesh("complex_part.dae", scale); // Complex mesh

link.visuals.push(visual);
```

This creates a complete chain: Robot → Link → Visual → Geometry → Babylon.js Mesh