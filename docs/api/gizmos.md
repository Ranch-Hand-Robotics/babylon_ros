# Gizmos API

Interactive manipulation tools for robot joints, providing visual controls for position and rotation adjustments.

## JointPositionGizmo

A specialized gizmo for manipulating joint positions along their motion axis.

### Constructor

```typescript
const positionGizmo = new JointPositionGizmo(joint, color, utilityLayer);
```

**Parameters:**
- `joint`: Joint - The joint to manipulate
- `color`: BABYLON.Color3 - Gizmo color
- `utilityLayer`: BABYLON.UtilityLayerRenderer - Rendering layer

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `dragBehavior` | `BABYLON.PointerDragBehavior` | Handles drag interactions |
| `snapDistance` | `number` | Distance snapping increment (default: 0) |
| `onSnapObservable` | `BABYLON.Observable` | Event fired when snapping occurs |
| `associatedJoint` | `Joint \| undefined` | The joint being manipulated |
| `coloredMaterial` | `BABYLON.StandardMaterial` | Default appearance material |
| `hoverMaterial` | `BABYLON.StandardMaterial` | Hover state material |
| `disableMaterial` | `BABYLON.StandardMaterial` | Disabled state material |

### Usage Example

```typescript
import { JointPositionGizmo } from '@ranchhandrobotics/babylon_ros';

// Create position gizmo for a prismatic joint
const linearJoint = robot.joints.get("linear_actuator");
if (linearJoint && linearJoint.type === JointType.Prismatic) {
    const positionGizmo = new JointPositionGizmo(
        linearJoint,
        BABYLON.Color3.Blue(), // Blue color for Z-axis
        utilityLayer
    );
    
    // Configure snapping
    positionGizmo.snapDistance = 0.01; // 1cm increments
    
    // Listen for position changes
    positionGizmo.dragBehavior.onDragObservable.add(() => {
        console.log(`Joint position: ${linearJoint.transform?.position}`);
    });
    
    // Attach to joint
    positionGizmo.attachedNode = linearJoint.transform;
}
```

## JointRotationGizmo

A specialized gizmo for manipulating joint rotations around their axis.

### Constructor

```typescript
const rotationGizmo = new JointRotationGizmo(joint, color, utilityLayer);
```

**Parameters:**
- `joint`: Joint - The joint to manipulate  
- `color`: BABYLON.Color3 - Gizmo color
- `utilityLayer`: BABYLON.UtilityLayerRenderer - Rendering layer

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `dragBehavior` | `BABYLON.PointerDragBehavior` | Handles drag interactions |
| `snapDistance` | `number` | Angular snapping increment in radians (default: 0) |
| `onSnapObservable` | `BABYLON.Observable` | Event fired when snapping occurs |
| `angle` | `number` | Accumulated rotation angle (reset on drag start) |
| `sensitivity` | `number` | Drag sensitivity multiplier (default: 1) |
| `enableLimits` | `boolean` | Whether to enforce joint limits (default: true) |
| `associatedJoint` | `Joint \| undefined` | The joint being manipulated |
| `MaxDragAngle` | `number` (static) | Maximum camera angle for interaction |

### Usage Example

```typescript
import { JointRotationGizmo } from '@ranchhandrobotics/babylon_ros';

// Create rotation gizmo for a revolute joint
const shoulderJoint = robot.joints.get("shoulder_joint");
if (shoulderJoint && shoulderJoint.type === JointType.Revolute) {
    const rotationGizmo = new JointRotationGizmo(
        shoulderJoint,
        BABYLON.Color3.Red(), // Red color for X-axis rotation
        utilityLayer
    );
    
    // Configure snapping to 15-degree increments
    rotationGizmo.snapDistance = Math.PI / 12; // 15 degrees
    
    // Enable joint limits
    rotationGizmo.enableLimits = true;
    
    // Adjust sensitivity for finer control
    rotationGizmo.sensitivity = 0.5;
    
    // Listen for rotation changes
    rotationGizmo.dragBehavior.onDragObservable.add(() => {
        console.log(`Joint angle: ${rotationGizmo.angle} radians`);
    });
    
    // Attach to joint
    rotationGizmo.attachedNode = shoulderJoint.transform;
}
```

## Gizmo Color Conventions

Standard color coding for different axes and joint types:

```typescript
// Axis-based colors (following RGB = XYZ convention)
const xAxisColor = BABYLON.Color3.Red();    // X-axis: Red
const yAxisColor = BABYLON.Color3.Green();  // Y-axis: Green  
const zAxisColor = BABYLON.Color3.Blue();   // Z-axis: Blue

// Joint type colors
const revoluteColor = BABYLON.Color3.Yellow();   // Revolute joints
const prismaticColor = BABYLON.Color3.Cyan();    // Prismatic joints
const continuousColor = BABYLON.Color3.Magenta(); // Continuous joints
```

## Automatic Gizmo Creation

The RobotScene class provides automatic gizmo creation based on joint properties:

```typescript
// Automatic gizmo creation in RobotScene
addExerciseGizmoToJoint(joint: Joint, scene: BABYLON.Scene, layer: BABYLON.UtilityLayerRenderer) {
    if (joint.type === JointType.Fixed) {
        return; // No gizmo for fixed joints
    }
    
    switch (joint.type) {
        case JointType.Revolute:
        case JointType.Continuous:
            // Create rotation gizmo based on axis
            if (Math.abs(joint.axis.y) > 0.5) {
                // Y-axis rotation - use green gizmo
                this.planeRotationGizmo = new JointRotationGizmo(
                    joint, BABYLON.Color3.Green(), layer
                );
            } else if (Math.abs(joint.axis.z) > 0.5) {
                // Z-axis rotation - use blue gizmo
                this.planeRotationGizmo = new JointRotationGizmo(
                    joint, BABYLON.Color3.Blue(), layer
                );
            } else {
                // X-axis rotation - use red gizmo
                this.planeRotationGizmo = new JointRotationGizmo(
                    joint, BABYLON.Color3.Red(), layer
                );
            }
            break;
            
        case JointType.Prismatic:
            // Create position gizmo based on axis
            this.planePositionGizmo = new JointPositionGizmo(
                joint, BABYLON.Color3.Cyan(), layer
            );
            break;
    }
}
```

## Gizmo Interaction

### Drag Events

Both gizmo types provide drag event observables:

```typescript
// Position gizmo drag handling
positionGizmo.dragBehavior.onDragStartObservable.add(() => {
    console.log("Started dragging position");
});

positionGizmo.dragBehavior.onDragObservable.add(() => {
    // Update joint position
    if (joint.transform) {
        const position = joint.transform.position;
        console.log(`Position: ${position.x}, ${position.y}, ${position.z}`);
    }
});

positionGizmo.dragBehavior.onDragEndObservable.add(() => {
    console.log("Finished dragging position");
});

// Rotation gizmo drag handling  
rotationGizmo.dragBehavior.onDragObservable.add(() => {
    console.log(`Rotation angle: ${rotationGizmo.angle} radians`);
    console.log(`Rotation degrees: ${rotationGizmo.angle * 180 / Math.PI}°`);
});
```

### Snapping Events

Handle snapping for precise control:

```typescript
// Position snapping
positionGizmo.snapDistance = 0.005; // 5mm increments
positionGizmo.onSnapObservable.add((snapInfo) => {
    console.log(`Snapped by ${snapInfo.snapDistance} units`);
});

// Rotation snapping  
rotationGizmo.snapDistance = Math.PI / 36; // 5-degree increments
rotationGizmo.onSnapObservable.add((snapInfo) => {
    const degrees = snapInfo.snapDistance * 180 / Math.PI;
    console.log(`Snapped by ${degrees} degrees`);
});
```

## Joint Limits Enforcement

### Rotation Limits

```typescript
const rotationGizmo = new JointRotationGizmo(joint, color, layer);

// Enable limit checking
rotationGizmo.enableLimits = true;

// Limits are automatically read from joint properties
console.log(`Joint limits: ${joint.lowerLimit} to ${joint.upperLimit} radians`);

// The gizmo will prevent movement beyond these limits
rotationGizmo.dragBehavior.onDragObservable.add(() => {
    if (rotationGizmo.enableLimits) {
        // Clamp angle to joint limits
        const clampedAngle = Math.max(joint.lowerLimit, 
                           Math.min(joint.upperLimit, rotationGizmo.angle));
        
        if (clampedAngle !== rotationGizmo.angle) {
            console.log("Hit joint limit!");
        }
    }
});
```

### Position Limits

```typescript
const positionGizmo = new JointPositionGizmo(joint, color, layer);

// For prismatic joints, limits apply to translation distance
positionGizmo.dragBehavior.onDragObservable.add(() => {
    if (joint.transform) {
        const distance = joint.transform.position.length();
        
        if (distance < joint.lowerLimit || distance > joint.upperLimit) {
            console.log("Position outside joint limits!");
        }
    }
});
```

## Material States

Gizmos provide different visual states:

```typescript
// Access different material states
const gizmo = new JointRotationGizmo(joint, color, layer);

// Default state - colored material
console.log(gizmo.coloredMaterial.name);

// Hover state - brighter/highlighted material
gizmo._gizmoMesh.actionManager = new BABYLON.ActionManager(scene);
gizmo._gizmoMesh.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPointerOverTrigger, () => {
        gizmo._gizmoMesh.material = gizmo.hoverMaterial;
    })
);

// Disabled state - grayed out material
if (joint.type === JointType.Fixed) {
    gizmo._gizmoMesh.material = gizmo.disableMaterial;
}
```

## Performance Considerations

### Utility Layer Management
```typescript
// Use shared utility layer for multiple gizmos
const utilityLayer = new BABYLON.UtilityLayerRenderer(scene);

// Create multiple gizmos on same layer
const gizmo1 = new JointRotationGizmo(joint1, color, utilityLayer);
const gizmo2 = new JointPositionGizmo(joint2, color, utilityLayer);

// Proper cleanup
gizmo1.dispose();
gizmo2.dispose();
utilityLayer.dispose();
```

### Selective Gizmo Activation
```typescript
// Only show gizmos for selected joints
function showGizmosForJoint(selectedJoint: Joint) {
    // Clear existing gizmos
    clearAllGizmos();
    
    // Create gizmo only for selected joint
    if (selectedJoint.type !== JointType.Fixed) {
        createGizmoForJoint(selectedJoint);
    }
}
```

## Integration with RobotScene

Gizmos are typically managed by the RobotScene class:

```typescript
// Toggle joint exercise mode
robotScene.clearJointExerciseGizmos(); // Clear existing
robotScene.addExerciseGizmoToJoint(selectedJoint, scene, utilityLayer);

// Gizmos automatically:
// - Choose appropriate type based on joint
// - Use proper colors for axes
// - Enforce joint limits
// - Handle coordinate system conversions
```