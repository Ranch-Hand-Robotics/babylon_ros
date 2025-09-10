# Joint API

The `Joint` class represents a robotic joint that connects two links and defines their relative motion constraints.

## JointType Enum

```typescript
enum JointType {
    Fixed = "fixed",
    Revolute = "revolute", 
    Continuous = "continuous",
    Prismatic = "prismatic",
    Floating = "floating",
    Planar = "planar"
}
```

Defines the types of joints supported:
- **Fixed**: No relative motion allowed
- **Revolute**: Rotation around a single axis with limits
- **Continuous**: Unlimited rotation around a single axis  
- **Prismatic**: Linear motion along a single axis
- **Floating**: 6 degrees of freedom (not commonly used)
- **Planar**: Motion in a 2D plane (not commonly used)

## Constructor

```typescript
const joint = new Joint();
```

Creates a new Joint instance with default values.

## Properties

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | The joint's unique name |
| `type` | `JointType` | The type of joint motion |
| `origin` | `BABYLON.Vector3` | Position offset from parent link |
| `rpy` | `BABYLON.Vector3` | Roll, pitch, yaw rotation (in radians) |
| `axis` | `BABYLON.Vector3` | Axis of rotation/translation |
| `transform` | `BABYLON.TransformNode \| undefined` | The 3D transform node |
| `parentName` | `string` | Name of the parent link |
| `childName` | `string` | Name of the child link |
| `parent` | `Link \| undefined` | Reference to parent link object |
| `child` | `Link \| undefined` | Reference to child link object |
| `lowerLimit` | `number` | Lower motion limit (radians or meters) |
| `upperLimit` | `number` | Upper motion limit (radians or meters) |

## Methods

### Lifecycle Methods

#### `create(scene: BABYLON.Scene, materialMap: Map<string, Material>): void`

Creates the joint's transform node in the 3D scene and applies positioning.

**Parameters:**
- `scene`: BABYLON.Scene - The Babylon.js scene
- `materialMap`: Map<string, Material> - Available materials (not used by joints)

**Behavior:**
- Creates a TransformNode with the joint's name
- Applies the origin position
- Applies roll-pitch-yaw rotation using utility functions

**Example:**
```typescript
joint.create(scene, materialMap);
```

#### `dispose(): void`

Cleans up the joint's transform node and releases resources.

**Example:**
```typescript
joint.dispose();
```

## Usage Examples

### Creating a Revolute Joint

```typescript
import { Joint, JointType } from '@ranchhandrobotics/babylon_ros';

const wheelJoint = new Joint();
wheelJoint.name = "wheel_joint";
wheelJoint.type = JointType.Revolute;
wheelJoint.origin = new BABYLON.Vector3(0, 0, 0.1); // 10cm offset
wheelJoint.axis = new BABYLON.Vector3(0, 1, 0); // Y-axis rotation
wheelJoint.lowerLimit = -Math.PI; // -180 degrees
wheelJoint.upperLimit = Math.PI;  // +180 degrees

wheelJoint.create(scene, materialMap);
```

### Creating a Prismatic Joint

```typescript
const linearJoint = new Joint();
linearJoint.name = "linear_actuator";
linearJoint.type = JointType.Prismatic;
linearJoint.axis = new BABYLON.Vector3(0, 0, 1); // Z-axis translation
linearJoint.lowerLimit = 0;    // 0 meters
linearJoint.upperLimit = 0.5;  // 50cm extension

linearJoint.create(scene, materialMap);
```

### Accessing Joint Properties

```typescript
// Check joint type
if (joint.type === JointType.Revolute) {
    console.log(`Revolute joint with limits: ${joint.lowerLimit} to ${joint.upperLimit}`);
}

// Get joint position in world coordinates
if (joint.transform) {
    const worldPosition = joint.transform.getAbsolutePosition();
    console.log(`Joint world position: ${worldPosition}`);
}

// Check parent-child relationships
console.log(`${joint.name} connects ${joint.parentName} to ${joint.childName}`);
```

## Joint Types in Detail

### Fixed Joints
```typescript
joint.type = JointType.Fixed;
// No motion allowed - acts like a rigid connection
// Commonly used for sensors, decorative elements
```

### Revolute Joints  
```typescript
joint.type = JointType.Revolute;
joint.axis = new BABYLON.Vector3(0, 1, 0); // Rotation around Y-axis
joint.lowerLimit = -Math.PI/2; // -90 degrees
joint.upperLimit = Math.PI/2;  // +90 degrees
// Common for robot arms, wheels with steering
```

### Continuous Joints
```typescript
joint.type = JointType.Continuous;
joint.axis = new BABYLON.Vector3(0, 0, 1); // Rotation around Z-axis
// No limits - can rotate infinitely
// Common for drive wheels, rotating sensors
```

### Prismatic Joints
```typescript
joint.type = JointType.Prismatic;
joint.axis = new BABYLON.Vector3(1, 0, 0); // Translation along X-axis
joint.lowerLimit = 0;   // Minimum extension
joint.upperLimit = 1.0; // Maximum extension (1 meter)
// Common for linear actuators, telescoping parts
```

## Coordinate Systems

### Origin and Position
- `origin`: Position relative to parent link's coordinate frame
- Applied before rotation
- Units are in meters

### Roll-Pitch-Yaw (RPY)
- `rpy.x`: Roll around X-axis (radians)
- `rpy.y`: Pitch around Y-axis (radians)  
- `rpy.z`: Yaw around Z-axis (radians)
- Applied in order: Roll, then Pitch, then Yaw

### Axis Vector
- `axis`: Unit vector defining motion direction
- For revolute/continuous: axis of rotation
- For prismatic: direction of translation
- Common axes:
  - `(1,0,0)`: X-axis
  - `(0,1,0)`: Y-axis  
  - `(0,0,1)`: Z-axis

## Limits and Constraints

### Motion Limits
- `lowerLimit`: Minimum allowed position/angle
- `upperLimit`: Maximum allowed position/angle
- Units: radians for revolute/continuous, meters for prismatic
- Fixed joints ignore limits

### Limit Examples
```typescript
// Robot arm elbow joint (120° range)
joint.lowerLimit = -Math.PI/3;  // -60°
joint.upperLimit = Math.PI/3;   // +60°

// Linear slide (0-30cm extension)
joint.lowerLimit = 0;     // Fully retracted
joint.upperLimit = 0.3;   // 30cm extended
```

## Integration with Robot

Joints are typically created as part of robot loading:

```typescript
// Joints are populated from URDF
const robot = urdf.loadRobot(urdfDoc, scene, {});

// Access joint after loading
const joint = robot.joints.get("wheel_joint");
if (joint) {
    console.log(`Joint type: ${joint.type}`);
    console.log(`Connects: ${joint.parentName} -> ${joint.childName}`);
}
```

## Transform Hierarchy

The joint transform establishes the kinematic chain:
1. **Parent Link** → **Joint Transform** → **Child Link**
2. Joint motion affects all child transforms
3. Multiple joints can create complex kinematic chains

```typescript
// Example kinematic chain
// base_link -> shoulder_joint -> upper_arm -> elbow_joint -> forearm
if (joint.parent && joint.child) {
    console.log(`Chain: ${joint.parent.name} -> ${joint.name} -> ${joint.child.name}`);
}
```