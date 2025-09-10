# Visual API

The `Visual` class represents a visual component that can be rendered in 3D space, containing geometry, materials, and transform information.

## Constructor

```typescript
const visual = new Visual();
```

Creates a new Visual instance with default values.

## Properties

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Visual component name |
| `geometry` | `IGeometry \| undefined` | The 3D geometry to render |
| `material` | `Material \| undefined` | Material properties (color, texture) |
| `origin` | `BABYLON.Vector3` | Position offset from parent |
| `rpy` | `BABYLON.Vector3` | Roll, pitch, yaw rotation (radians) |
| `transform` | `BABYLON.TransformNode \| undefined` | The 3D transform node |

## Methods

### Lifecycle Methods

#### `create(scene: BABYLON.Scene, materialMap: Map<string, Material>): void`

Creates the visual component in the 3D scene with geometry and materials.

**Parameters:**
- `scene`: BABYLON.Scene - The Babylon.js scene
- `materialMap`: Map<string, Material> - Available materials

**Behavior:**
- Creates a TransformNode with position and rotation
- Resolves material references from the material map
- Creates the geometry with the resolved material
- Establishes parent-child transform relationship

**Example:**
```typescript
visual.create(scene, materialMap);
```

#### `dispose(): void`

Cleans up all resources including geometry, materials, and transforms.

**Behavior:**
- Disposes geometry resources
- Disposes non-reference materials (reference materials are handled by Robot)
- Disposes transform node

**Example:**
```typescript
visual.dispose();
```

### State Management

#### `setEnabled(enabled: boolean): void`

Controls the visibility and rendering of the visual component.

**Parameters:**
- `enabled`: boolean - true to show, false to hide

**Example:**
```typescript
visual.setEnabled(false); // Hide the visual
visual.setEnabled(true);  // Show the visual
```

#### `isEnabled(): boolean`

Checks if the visual component is currently enabled/visible.

**Returns:** boolean - true if enabled, false if disabled

**Example:**
```typescript
if (visual.isEnabled()) {
    console.log("Visual is currently visible");
}
```

## Usage Examples

### Basic Visual with Box Geometry

```typescript
import { Visual } from '@ranchhandrobotics/babylon_ros';
import { BoxGeometry } from '@ranchhandrobotics/babylon_ros';

const visual = new Visual();
visual.name = "chassis_visual";
visual.geometry = new BoxGeometry(2, 1, 0.5); // 2x1x0.5 meter box
visual.origin = new BABYLON.Vector3(0, 0, 0.25); // Raise 25cm
visual.rpy = new BABYLON.Vector3(0, 0, Math.PI/4); // 45° yaw rotation

visual.create(scene, materialMap);
```

### Visual with Mesh Geometry and Material

```typescript
const visual = new Visual();
visual.name = "robot_body";
visual.geometry = new MeshGeometry("robot_chassis.dae");

// Use a specific material
const redMaterial = new Material();
redMaterial.name = "red_plastic";
redMaterial.color = new BABYLON.Color4(1, 0, 0, 1); // Red
visual.material = redMaterial;

visual.create(scene, materialMap);
```

### Visual with Material Reference

```typescript
const visual = new Visual();
visual.name = "wheel_visual";
visual.geometry = new CylinderGeometry(0.1, 0.3, 0.3); // 10cm height, 30cm diameter

// Reference an existing material by name
const materialRef = new Material();
materialRef.name = "black_rubber"; // Must exist in materialMap
visual.material = materialRef;

visual.create(scene, materialMap);
```

## Geometry Types

The Visual class works with any geometry that implements the `IGeometry` interface:

### Primitive Geometries
```typescript
// Box geometry
visual.geometry = new BoxGeometry(width, height, depth);

// Sphere geometry  
visual.geometry = new SphereGeometry(radius);

// Cylinder geometry
visual.geometry = new CylinderGeometry(height, topRadius, bottomRadius);
```

### Mesh Geometries
```typescript
// Load from file (DAE, STL, etc.)
visual.geometry = new MeshGeometry("path/to/model.dae");

// The geometry will handle loading and material application
```

## Transform and Positioning

### Origin Position
```typescript
// Position relative to parent transform
visual.origin = new BABYLON.Vector3(1, 0, 0.5); // 1m right, 0.5m up
```

### Roll-Pitch-Yaw Rotation
```typescript
// Rotation in radians
visual.rpy = new BABYLON.Vector3(
    0,          // Roll around X-axis
    Math.PI/6,  // Pitch around Y-axis (30°)
    Math.PI/4   // Yaw around Z-axis (45°)
);
```

### Transform Hierarchy
```typescript
// Visual transforms are automatically parented
// Parent -> Visual Transform -> Geometry Transform

if (visual.transform && visual.geometry?.transform) {
    console.log("Transform hierarchy established");
    
    // Move the entire visual (geometry moves with it)
    visual.transform.position = new BABYLON.Vector3(0, 1, 0);
}
```

## Material Handling

### Direct Material Assignment
```typescript
const material = new Material();
material.color = new BABYLON.Color4(0, 1, 0, 1); // Green
material.name = "green_plastic";

visual.material = material;
```

### Material Reference
```typescript
// Reference a material that exists in the material map
const materialRef = new Material();
materialRef.name = "existing_material"; // Must be in materialMap

visual.material = materialRef;
```

### Material Priority
1. **Visual material**: If specified, takes priority
2. **Link material**: Falls back to parent link's material
3. **Default material**: Uses "default" from material map

## Visibility Control

### Show/Hide Visual
```typescript
// Hide for debugging or performance
visual.setEnabled(false);

// Show when needed
visual.setEnabled(true);

// Check current state
if (!visual.isEnabled()) {
    console.log("Visual is hidden");
}
```

### Collision vs Visual
```typescript
// Visual components (what you see)
const visual = new Visual();
visual.geometry = new MeshGeometry("detailed_model.dae");
link.visuals.push(visual);

// Collision components (physics shapes, usually hidden)
const collision = new Visual();
collision.geometry = new BoxGeometry(1, 1, 1); // Simple box
collision.setEnabled(false); // Hidden by default
link.collisions.push(collision);
```

## Advanced Usage

### Multiple Visuals per Link
```typescript
const link = new Link();

// Main body visual
const bodyVisual = new Visual();
bodyVisual.geometry = new BoxGeometry(1, 0.5, 0.3);
bodyVisual.material = bodyMaterial;

// Decoration visual
const logoVisual = new Visual();
logoVisual.geometry = new MeshGeometry("company_logo.dae");
logoVisual.origin = new BABYLON.Vector3(0.4, 0, 0.15); // On front face
logoVisual.material = logoMaterial;

link.visuals.push(bodyVisual);
link.visuals.push(logoVisual);
```

### Dynamic Visual Updates
```typescript
// Change position at runtime
if (visual.transform) {
    visual.transform.position = new BABYLON.Vector3(0, 0, 1);
    visual.transform.rotation = new BABYLON.Vector3(0, 0, Math.PI);
}

// Toggle visibility for debugging
visual.setEnabled(!visual.isEnabled());
```

### Accessing Mesh Data
```typescript
if (visual.geometry?.meshes) {
    for (const mesh of visual.geometry.meshes) {
        console.log(`Mesh: ${mesh.name}`);
        console.log(`Vertices: ${mesh.getTotalVertices()}`);
        console.log(`Triangles: ${mesh.getTotalIndices() / 3}`);
    }
}
```

## Error Handling

The Visual class provides robust error handling:
- Handles missing materials with graceful fallbacks
- Manages transform hierarchy safely
- Properly disposes resources to prevent memory leaks
- Logs warnings for invalid geometry or material references

## Performance Considerations

- **Geometry Complexity**: Balance visual quality with rendering performance
- **Material Sharing**: Reuse materials to reduce memory usage
- **Visibility Culling**: Use `setEnabled(false)` to hide unnecessary visuals
- **Resource Management**: Always dispose visuals when no longer needed

## Integration with Robot Structure

Visuals are typically components of Links:
```typescript
// Part of robot loading process
const link = new Link();
link.name = "base_link";

const visual = new Visual();
visual.geometry = new BoxGeometry(1, 1, 0.2);
link.visuals.push(visual);

// When link.create() is called, all visuals are created too
link.create(scene, materialMap);
```