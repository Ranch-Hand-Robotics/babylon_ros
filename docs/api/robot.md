# Robot API

The `Robot` class represents a complete robot model loaded from URDF, managing all links, joints, and materials.

## Constructor

```typescript
const robot = new Robot();
```

Creates a new Robot instance with default materials.

## Properties

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | The robot's name |
| `transform` | `BABYLON.TransformNode \| undefined` | Root transform node for the entire robot |
| `links` | `Map<string, Link>` | Map of link names to Link objects |
| `joints` | `Map<string, Joint>` | Map of joint names to Joint objects |
| `materials` | `Map<string, Material>` | Map of material names to Material objects |

## Methods

### Lifecycle Methods

#### `create(scene: BABYLON.Scene): void`

Initializes the robot in the 3D scene, creating all transforms, materials, links, and joints.

**Parameters:**
- `scene`: BABYLON.Scene - The Babylon.js scene to create the robot in

**Behavior:**
- Creates a root transform node with ROS to Babylon.js coordinate conversion
- Initializes all materials in the scene
- Creates all links with their visual and collision geometries
- Creates all joints and establishes parent-child relationships
- Handles orphaned transforms by parenting them to the root

**Example:**
```typescript
const robot = new Robot();
robot.name = "my_robot";
robot.create(scene);
```

#### `dispose(): void`

Cleans up all resources used by the robot, including meshes, materials, and transforms.

**Example:**
```typescript
robot.dispose();
```

## Default Materials

Every Robot instance starts with two default materials:

### Default Material
- **Name**: "default"
- **Color**: Gray (0.5, 0.5, 0.5, 1.0)
- **Usage**: Applied to robot parts without specific material definitions

### Collision Material
- **Name**: "collision"
- **Type**: `CollisionMaterial`
- **Usage**: Applied to collision geometry (typically semi-transparent)

## Transform Hierarchy

The Robot class establishes a proper transform hierarchy:

1. **Root Transform**: The robot's main transform node with ROS coordinate conversion
2. **Joint Transforms**: Each joint is parented to its parent link
3. **Link Transforms**: Each child link is parented to its joint
4. **Orphaned Links**: Any links without parents are automatically parented to the root

### Coordinate System Conversion

The robot automatically converts from ROS coordinate system to Babylon.js:
- **ROS**: X-forward, Y-left, Z-up
- **Babylon.js**: X-right, Y-up, Z-forward  
- **Conversion**: Rotation of -90° around X-axis

## Usage Examples

### Basic Robot Creation

```typescript
import { Robot } from '@ranchhandrobotics/babylon_ros';

const robot = new Robot();
robot.name = "my_robot";

// Create in scene
robot.create(scene);

// Later cleanup
robot.dispose();
```

### Accessing Robot Components

```typescript
// Access specific link
const baseLink = robot.links.get("base_link");

// Access specific joint
const wheelJoint = robot.joints.get("wheel_joint");

// Access material
const redMaterial = robot.materials.get("red_plastic");

// Iterate through all links
for (const [name, link] of robot.links) {
    console.log(`Link: ${name}`);
}

// Iterate through all joints
for (const [name, joint] of robot.joints) {
    console.log(`Joint: ${name}, Type: ${joint.type}`);
}
```

### Working with Robot Transform

```typescript
// Move entire robot
if (robot.transform) {
    robot.transform.position = new BABYLON.Vector3(1, 0, 0);
    robot.transform.rotation = new BABYLON.Vector3(0, Math.PI/4, 0);
}

// Get robot bounding box
let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

for (const [name, link] of robot.links) {
    for (const visual of link.visuals) {
        if (visual.mesh) {
            const boundingInfo = visual.mesh.getBoundingInfo();
            BABYLON.Vector3.MinimizeInPlace(min, boundingInfo.boundingBox.minimumWorld);
            BABYLON.Vector3.MaximizeInPlace(max, boundingInfo.boundingBox.maximumWorld);
        }
    }
}
```

## Integration with URDF

The Robot class is typically populated from URDF data:

```typescript
import * as urdf from './urdf';

// Parse URDF and populate robot
const urdfDoc = new DOMParser().parseFromString(urdfText, 'text/xml');
const robot = urdf.loadRobot(urdfDoc, scene, {}); // Returns populated Robot instance
```

## Common Base Links

The Robot class handles various naming conventions for base links:
- `base_link`: Standard mobile robot base
- `base_footprint`: Common for wheeled robots like TurtleBot
- `world`: Used by some manufacturers like Unitree

## Error Handling

The Robot class provides robust error handling:
- Handles missing parent/child relationships gracefully
- Automatically parents orphaned transforms
- Provides safe disposal of all resources
- Logs warnings for malformed robot structures

## Performance Considerations

- Large robots with many links/joints are handled efficiently
- Transform hierarchy is optimized for rendering performance  
- Material sharing reduces memory usage
- Proper disposal prevents memory leaks

## Thread Safety

The Robot class is designed for single-threaded use in browser environments. All operations should be performed on the main thread.