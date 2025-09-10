# Utilities API

Helper functions for parsing and transforming data between different coordinate systems and formats.

## Parsing Functions

### `parseVector(vec: string): BABYLON.Vector3`

Parses a space-separated string into a Babylon.js Vector3.

**Parameters:**
- `vec`: string - Space-separated coordinates (e.g., "1.5 0.0 0.3")

**Returns:** BABYLON.Vector3 - Parsed vector

**Throws:** Error if string doesn't contain exactly 3 values

**Example:**
```typescript
import { parseVector } from '@ranchhandrobotics/babylon_ros';

// Parse position from URDF
const positionStr = "1.0 0.5 0.25";
const position = parseVector(positionStr);
console.log(position); // Vector3(1.0, 0.5, 0.25)

// Use in transform
joint.origin = parseVector("0 0 0.1");
```

### `parseRPY(rpy: string): BABYLON.Vector3`

Parses a roll-pitch-yaw rotation string into a Babylon.js Vector3.

**Parameters:**
- `rpy`: string - Space-separated RPY angles in radians (e.g., "0 0 1.57")

**Returns:** BABYLON.Vector3 - RPY rotation vector

**Note:** Maintains ROS convention (Roll, Pitch, Yaw) in Vector3 components

**Example:**
```typescript
import { parseRPY } from '@ranchhandrobotics/babylon_ros';

// Parse rotation from URDF  
const rpyStr = "0 0 1.5708"; // 90 degrees yaw
const rotation = parseRPY(rpyStr);
console.log(rotation); // Vector3(0, 0, 1.5708)

// Use in joint
joint.rpy = parseRPY("0.1 0.2 0.3");
```

### `parseColor(color: string): BABYLON.Color4`

Parses an RGBA color string into a Babylon.js Color4.

**Parameters:**
- `color`: string - Space-separated RGBA values (0.0 to 1.0, e.g., "1.0 0.0 0.0 1.0")

**Returns:** BABYLON.Color4 - Parsed color

**Throws:** Error if string doesn't contain exactly 4 values

**Example:**
```typescript
import { parseColor } from '@ranchhandrobotics/babylon_ros';

// Parse material color from URDF
const colorStr = "0.8 0.2 0.1 1.0"; // Orange
const color = parseColor(colorStr);
console.log(color); // Color4(0.8, 0.2, 0.1, 1.0)

// Use in material
material.color = parseColor("1.0 0.0 0.0 0.8"); // Semi-transparent red
```

## Transformation Functions

### `applyRotationToTransform(transformNode: BABYLON.TransformNode, vec: BABYLON.Vector3): void`

Applies roll-pitch-yaw rotation to a transform node using the correct order.

**Parameters:**
- `transformNode`: BABYLON.TransformNode - The node to rotate
- `vec`: BABYLON.Vector3 - RPY rotation values in radians

**Behavior:**
- Applies rotations in the correct order: Yaw (Z), then Pitch (Y), then Roll (X)
- Handles ROS to Babylon.js coordinate system conversion
- Modifies the transform node in place

**Example:**
```typescript
import { applyRotationToTransform } from '@ranchhandrobotics/babylon_ros';

// Create transform node
const transform = new BABYLON.TransformNode("joint_transform", scene);

// Apply 90-degree yaw rotation
const rpy = new BABYLON.Vector3(0, 0, Math.PI/2);
applyRotationToTransform(transform, rpy);

// Transform is now rotated 90 degrees around Z-axis
```

## Usage Examples

### URDF Data Parsing

```typescript
// Typical URDF parsing workflow
const urdfOrigin = "1.0 0.5 0.25";        // Position
const urdfRPY = "0 0 1.5708";             // 90° yaw
const urdfColor = "0.8 0.2 0.1 1.0";      // Orange color

// Parse into Babylon.js types
const position = parseVector(urdfOrigin);
const rotation = parseRPY(urdfRPY);
const color = parseColor(urdfColor);

// Apply to robot components
joint.origin = position;
joint.rpy = rotation;
material.color = color;
```

### Complete Joint Setup

```typescript
// Joint configuration from URDF attributes
const joint = new Joint();
joint.name = "shoulder_joint";
joint.origin = parseVector("0.1 0 0.2");    // 10cm forward, 20cm up
joint.rpy = parseRPY("0 0 0");               // No rotation
joint.axis = parseVector("0 1 0");           // Y-axis rotation

// Create transform and apply rotation
joint.create(scene, materialMap);
if (joint.transform) {
    applyRotationToTransform(joint.transform, joint.rpy);
}
```

### Material Setup from URDF

```typescript
// Material definition from URDF
const material = new Material();
material.name = "blue_plastic";
material.color = parseColor("0.2 0.3 0.8 1.0"); // Blue plastic

// Alternative: parse from URDF XML attributes
const colorAttr = xmlElement.getAttribute("rgba");
if (colorAttr) {
    material.color = parseColor(colorAttr);
}
```

## Error Handling

### Vector Parsing Errors

```typescript
try {
    const position = parseVector("1.0 0.5"); // Missing Z component
} catch (error) {
    console.error("Invalid vector format:", error.message);
    // Use default value
    const position = new BABYLON.Vector3(0, 0, 0);
}
```

### Color Parsing Errors

```typescript
try {
    const color = parseColor("1.0 0.0 0.0"); // Missing alpha
} catch (error) {
    console.error("Invalid color format:", error.message);
    // Use default color
    const color = new BABYLON.Color4(0.5, 0.5, 0.5, 1.0);
}
```

### Safe Parsing with Defaults

```typescript
function safeParseVector(vec: string, defaultValue: BABYLON.Vector3): BABYLON.Vector3 {
    try {
        return parseVector(vec);
    } catch (error) {
        console.warn(`Failed to parse vector "${vec}", using default`);
        return defaultValue;
    }
}

// Usage
const position = safeParseVector(
    urdfOrigin, 
    new BABYLON.Vector3(0, 0, 0)
);
```

## Coordinate System Handling

### ROS to Babylon.js Conversion

The utilities handle coordinate system differences between ROS and Babylon.js:

**ROS Coordinate System:**
- X: Forward
- Y: Left  
- Z: Up
- Rotations: Roll (X), Pitch (Y), Yaw (Z)

**Babylon.js Coordinate System:**
- X: Right
- Y: Up
- Z: Forward
- Rotations: Applied in specific order for proper transformation

### Rotation Order

```typescript
// applyRotationToTransform applies rotations in this order:
// 1. Yaw rotation around Z-axis
// 2. Pitch rotation around Y-axis  
// 3. Roll rotation around X-axis

// This is equivalent to:
transformNode.addRotation(0, 0, vec.z)    // Yaw (Z)
              .addRotation(0, vec.y, 0)    // Pitch (Y)
              .addRotation(vec.x, 0, 0);   // Roll (X)
```

## Common Patterns

### URDF XML Parsing

```typescript
// Typical XML attribute parsing
function parseJointFromXML(jointElement: Element): Joint {
    const joint = new Joint();
    joint.name = jointElement.getAttribute("name") || "";
    
    // Parse origin
    const originElement = jointElement.querySelector("origin");
    if (originElement) {
        const xyzAttr = originElement.getAttribute("xyz");
        const rpyAttr = originElement.getAttribute("rpy");
        
        if (xyzAttr) joint.origin = parseVector(xyzAttr);
        if (rpyAttr) joint.rpy = parseRPY(rpyAttr);
    }
    
    // Parse axis
    const axisElement = jointElement.querySelector("axis");
    if (axisElement) {
        const xyzAttr = axisElement.getAttribute("xyz");
        if (xyzAttr) joint.axis = parseVector(xyzAttr);
    }
    
    return joint;
}
```

### Material XML Parsing

```typescript
function parseMaterialFromXML(materialElement: Element): Material {
    const material = new Material();
    material.name = materialElement.getAttribute("name") || "";
    
    // Parse color
    const colorElement = materialElement.querySelector("color");
    if (colorElement) {
        const rgbaAttr = colorElement.getAttribute("rgba");
        if (rgbaAttr) {
            material.color = parseColor(rgbaAttr);
        }
    }
    
    // Parse texture
    const textureElement = materialElement.querySelector("texture");
    if (textureElement) {
        const filenameAttr = textureElement.getAttribute("filename");
        if (filenameAttr) {
            material.filename = filenameAttr;
        }
    }
    
    return material;
}
```

## Performance Considerations

### String Parsing Optimization

```typescript
// Cache parsed values when possible
const positionCache = new Map<string, BABYLON.Vector3>();

function getCachedVector(vec: string): BABYLON.Vector3 {
    if (!positionCache.has(vec)) {
        positionCache.set(vec, parseVector(vec));
    }
    return positionCache.get(vec)!;
}
```

### Batch Transformations

```typescript
// Apply multiple transformations efficiently
function setupTransforms(transforms: Array<{node: BABYLON.TransformNode, rpy: BABYLON.Vector3}>) {
    scene.beginAnimation(); // Batch updates
    
    for (const {node, rpy} of transforms) {
        applyRotationToTransform(node, rpy);
    }
    
    scene.endAnimation();
}
```

## Integration with Robot Loading

The utilities are primarily used during robot loading from URDF:

```typescript
// In urdf.ts module
export function loadRobot(urdfDoc: Document, scene: BABYLON.Scene): Robot {
    const robot = new Robot();
    
    // Parse joints
    const jointElements = urdfDoc.querySelectorAll("joint");
    for (const jointEl of jointElements) {
        const joint = new Joint();
        
        // Use utilities for parsing
        const originEl = jointEl.querySelector("origin");
        if (originEl) {
            joint.origin = parseVector(originEl.getAttribute("xyz") || "0 0 0");
            joint.rpy = parseRPY(originEl.getAttribute("rpy") || "0 0 0");
        }
        
        robot.joints.set(joint.name, joint);
    }
    
    return robot;
}
```