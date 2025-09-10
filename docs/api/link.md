# Link API

The `Link` class represents a physical component of a robot, containing visual and collision geometries with materials and transforms.

## Constructor

```typescript
const link = new Link();
```

Creates a new Link instance with empty visual and collision arrays.

## Properties

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | The link's unique name |
| `material` | `Material \| undefined` | Default material for the link |
| `transform` | `BABYLON.TransformNode \| undefined` | The 3D transform node |
| `visuals` | `Array<Visual>` | Array of visual geometry components |
| `collisions` | `Array<Visual>` | Array of collision geometry components |

## Methods

### Lifecycle Methods

#### `create(scene: BABYLON.Scene, materialMap: Map<string, Material>): void`

Creates the link in the 3D scene, including all visual and collision geometries.

**Parameters:**
- `scene`: BABYLON.Scene - The Babylon.js scene
- `materialMap`: Map<string, Material> - Available materials for the link

**Behavior:**
- Creates a TransformNode for the link
- Creates all visual geometries and parents them to the link transform
- Creates all collision geometries with collision material and disables them by default
- Establishes proper parent-child relationships

**Example:**
```typescript
link.create(scene, materialMap);
```

#### `dispose(): void`

Cleans up all resources used by the link, including geometries, materials, and transforms.

**Example:**
```typescript
link.dispose();
```

## Usage Examples

### Basic Link Creation

```typescript
import { Link } from '@ranchhandrobotics/babylon_ros';
import { Visual } from '@ranchhandrobotics/babylon_ros';

const baseLink = new Link();
baseLink.name = "base_link";

// Add visual geometry
const visual = new Visual();
visual.geometry = new BoxGeometry(1, 1, 0.2); // 1x1x0.2m box
baseLink.visuals.push(visual);

// Create in scene
baseLink.create(scene, materialMap);
```

### Link with Multiple Visuals

```typescript
const armLink = new Link();
armLink.name = "upper_arm";

// Main arm structure
const mainVisual = new Visual();
mainVisual.geometry = new CylinderGeometry(0.5, 0.05, 0.05); // 50cm long, 5cm radius

// Joint connector
const connectorVisual = new Visual(); 
connectorVisual.geometry = new SphereGeometry(0.08); // 8cm radius sphere
connectorVisual.origin = new BABYLON.Vector3(0, 0, 0.25); // At end of arm

armLink.visuals.push(mainVisual);
armLink.visuals.push(connectorVisual);

armLink.create(scene, materialMap);
```

### Link with Collision Geometry

```typescript
const chassisLink = new Link();
chassisLink.name = "chassis";

// Visual geometry (detailed mesh)
const visual = new Visual();
visual.geometry = new MeshGeometry("chassis_detailed.dae");
chassisLink.visuals.push(visual);

// Collision geometry (simplified box)
const collision = new Visual();
collision.geometry = new BoxGeometry(2, 1, 0.5); // Simplified bounding box
chassisLink.collisions.push(collision);

chassisLink.create(scene, materialMap);
```

## Visual vs Collision Geometry

### Visual Geometries
- **Purpose**: What users see - detailed, textured models
- **Rendering**: Always visible by default
- **Performance**: Can be complex meshes with high polygon counts
- **Materials**: Use specified materials with textures and colors

### Collision Geometries  
- **Purpose**: Physics simulation and collision detection
- **Rendering**: Hidden by default (can be toggled for debugging)
- **Performance**: Should be simple shapes for fast collision detection
- **Materials**: Automatically use "collision" material (semi-transparent)

```typescript
// Visual: Detailed robot arm mesh
const visual = new Visual();
visual.geometry = new MeshGeometry("detailed_arm.dae");

// Collision: Simple cylinder approximation  
const collision = new Visual();
collision.geometry = new CylinderGeometry(0.5, 0.08, 0.08);

link.visuals.push(visual);
link.collisions.push(collision);
```

## Transform Hierarchy

Links establish the structural hierarchy of the robot:

```typescript
// Link transforms are managed automatically
// Parent joint -> Link transform -> Child visuals/collisions

if (link.transform) {
    // Move entire link (affects all visuals and collisions)
    link.transform.position = new BABYLON.Vector3(1, 0, 0);
    
    // All child visuals inherit this transformation
    console.log(`Link has ${link.visuals.length} visuals`);
    console.log(`Link has ${link.collisions.length} collision shapes`);
}
```

## Material Handling

### Default Material
```typescript
// Link can have a default material
link.material = materialMap.get("aluminum");

// Individual visuals can override the link material
visual.material = materialMap.get("red_plastic");
```

### Material Priority
1. **Visual material**: If specified, takes highest priority
2. **Link material**: Used if visual has no specific material  
3. **Default material**: Used as fallback if neither is specified

### Collision Materials
```typescript
// Collision geometries automatically use collision material
// This provides semi-transparent rendering for debugging
const collision = new Visual();
collision.geometry = new BoxGeometry(1, 1, 1);
// collision.material is automatically set to "collision" material
```

## Accessing Link Components

### Iterating Through Visuals
```typescript
for (const visual of link.visuals) {
    console.log(`Visual at: ${visual.origin}`);
    if (visual.geometry) {
        console.log(`Geometry type: ${visual.geometry.constructor.name}`);
    }
}
```

### Checking Link Properties
```typescript
// Get link bounding box
let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

for (const visual of link.visuals) {
    if (visual.mesh) {
        const bounds = visual.mesh.getBoundingInfo();
        BABYLON.Vector3.MinimizeInPlace(min, bounds.boundingBox.minimumWorld);
        BABYLON.Vector3.MaximizeInPlace(max, bounds.boundingBox.maximumWorld);
    }
}

const size = max.subtract(min);
console.log(`Link bounding box: ${size.x} x ${size.y} x ${size.z}`);
```

### Enabling/Disabling Collision Visualization
```typescript
// Show collision geometry for debugging
for (const collision of link.collisions) {
    collision.setEnabled(true);
}

// Hide collision geometry
for (const collision of link.collisions) {
    collision.setEnabled(false);
}
```

## Integration with Robot

Links are typically created as part of robot loading:

```typescript
// Links are populated from URDF
const robot = urdf.loadRobot(urdfDoc, scene, {});

// Access specific link
const baseLink = robot.links.get("base_link");
if (baseLink) {
    console.log(`Base link has ${baseLink.visuals.length} visual components`);
    console.log(`Base link has ${baseLink.collisions.length} collision components`);
}

// Iterate through all links
for (const [name, link] of robot.links) {
    console.log(`Link: ${name}`);
    console.log(`  Visuals: ${link.visuals.length}`);
    console.log(`  Collisions: ${link.collisions.length}`);
}
```

## Common Link Types

### Base Links
```typescript
// Main chassis or body of the robot
const baseLink = new Link();
baseLink.name = "base_link";
// Usually contains the main structural geometry
```

### Arm Links
```typescript
// Robot arm segments
const upperArm = new Link();
upperArm.name = "upper_arm";
const forearm = new Link();
forearm.name = "forearm";
```

### Sensor Links
```typescript
// Camera, LiDAR, or other sensor mounts
const cameraLink = new Link();
cameraLink.name = "camera_link";
// Often contain simple geometry for sensor housings
```

## Performance Considerations

- **Visual Complexity**: Detailed visuals are rendered, so balance quality vs performance
- **Collision Simplicity**: Keep collision geometry simple for fast physics simulation
- **Material Sharing**: Reuse materials across links to reduce memory usage
- **Proper Disposal**: Always dispose links to prevent memory leaks

## Error Handling

The Link class provides robust error handling:
- Handles missing materials gracefully with fallbacks
- Safely manages transform hierarchy
- Properly disposes of all child resources
- Logs warnings for malformed geometry