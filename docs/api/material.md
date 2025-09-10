# Material API

The `Material` class defines visual properties for robot surfaces, including colors and textures.

## Constructor

```typescript
const material = new Material();
```

Creates a new Material instance with default values.

## Properties

### Public Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Material identifier (default: "default") |
| `filename` | `string` | Path to texture image file |
| `color` | `BABYLON.Color4 \| undefined` | RGBA color values |
| `material` | `BABYLON.Material \| undefined` | The Babylon.js material instance |

## Methods

### Lifecycle Methods

#### `create(scene: BABYLON.Scene): void`

Creates the Babylon.js material in the scene based on the material properties.

**Parameters:**
- `scene`: BABYLON.Scene - The Babylon.js scene

**Behavior:**
- Creates a StandardMaterial with the material name
- If `filename` is specified, creates a texture-based material
- If `color` is specified, creates a color-based material
- Sets material properties like alpha and backface culling

**Example:**
```typescript
material.create(scene);
```

#### `dispose(): void`

Cleans up the Babylon.js material resources.

**Example:**
```typescript
material.dispose();
```

### Utility Methods

#### `isReference(): boolean`

Determines if this material is a reference to another material by name.

**Returns:** boolean - true if this is a reference (no filename or color defined)

**Example:**
```typescript
if (material.isReference()) {
    console.log("This material references another material by name");
}
```

## Material Types

### Color-Based Materials

```typescript
const redMaterial = new Material();
redMaterial.name = "red_plastic";
redMaterial.color = new BABYLON.Color4(1, 0, 0, 1); // Red, fully opaque
redMaterial.create(scene);
```

### Texture-Based Materials

```typescript
const textureMaterial = new Material();
textureMaterial.name = "wood_texture";
textureMaterial.filename = "textures/wood.png";
textureMaterial.create(scene);
```

### Reference Materials

```typescript
// Reference an existing material by name
const materialRef = new Material();
materialRef.name = "existing_material"; // Must exist in material map
// No color or filename - this is a reference
console.log(materialRef.isReference()); // true
```

## CollisionMaterial Class

A specialized material for collision geometry visualization.

### Constructor

```typescript
const collisionMat = new CollisionMaterial();
```

### Properties

- **Name**: Always "collision"
- **Color**: Semi-transparent red (alpha = 0.25)
- **Purpose**: Visual debugging of collision shapes

### Usage

```typescript
const collisionMaterial = new CollisionMaterial();
collisionMaterial.create(scene);

// Applied automatically to collision visuals
collision.material = materialMap.get("collision");
```

## Usage Examples

### Creating Colored Materials

```typescript
// Solid colors
const blueMaterial = new Material();
blueMaterial.name = "blue_metal";
blueMaterial.color = new BABYLON.Color4(0, 0, 1, 1); // Blue

// Semi-transparent
const glassMaterial = new Material();
glassMaterial.name = "glass";
glassMaterial.color = new BABYLON.Color4(0.8, 0.8, 1, 0.3); // Light blue, 30% opacity

// Grayscale
const grayMaterial = new Material();
grayMaterial.name = "aluminum";
grayMaterial.color = new BABYLON.Color4(0.7, 0.7, 0.7, 1); // 70% gray
```

### Creating Textured Materials

```typescript
// Image texture
const logoMaterial = new Material();
logoMaterial.name = "company_logo";
logoMaterial.filename = "textures/logo.png";

// Material with transparency support
const decalMaterial = new Material();
decalMaterial.name = "warning_decal";
decalMaterial.filename = "textures/warning.png"; // PNG with alpha channel
```

### Material References in URDF Context

```typescript
// In robot materials map
const materialMap = new Map<string, Material>();

// Define base materials
const redPlastic = new Material();
redPlastic.name = "red_plastic";
redPlastic.color = new BABYLON.Color4(1, 0, 0, 1);
materialMap.set("red_plastic", redPlastic);

// Use reference in visual
const visual = new Visual();
const materialRef = new Material();
materialRef.name = "red_plastic"; // References the material above
visual.material = materialRef;
```

## Color Format

### BABYLON.Color4 Components

```typescript
const color = new BABYLON.Color4(r, g, b, a);
```

- **r**: Red component (0.0 to 1.0)
- **g**: Green component (0.0 to 1.0)  
- **b**: Blue component (0.0 to 1.0)
- **a**: Alpha/opacity (0.0 = transparent, 1.0 = opaque)

### Common Colors

```typescript
// Primary colors
const red = new BABYLON.Color4(1, 0, 0, 1);
const green = new BABYLON.Color4(0, 1, 0, 1);
const blue = new BABYLON.Color4(0, 0, 1, 1);

// Neutral colors
const white = new BABYLON.Color4(1, 1, 1, 1);
const black = new BABYLON.Color4(0, 0, 0, 1);
const gray = new BABYLON.Color4(0.5, 0.5, 0.5, 1);

// Material-like colors
const gold = new BABYLON.Color4(1, 0.84, 0, 1);
const silver = new BABYLON.Color4(0.75, 0.75, 0.75, 1);
const copper = new BABYLON.Color4(0.72, 0.45, 0.20, 1);
```

## Texture Support

### Supported Formats
- **PNG**: Best for images with transparency
- **JPG/JPEG**: Good for photographs and solid textures
- **GIF**: Basic support
- **BMP**: Basic support

### Texture Properties
```typescript
// Babylon.js automatically handles:
// - Texture loading and caching
// - Alpha channel support
// - Texture filtering and mipmapping
// - UV coordinate mapping
```

## Material Properties

### Babylon.js StandardMaterial Properties

When created, materials have these characteristics:

```typescript
// Applied automatically:
material.backFaceCulling = false; // Render both sides
material.diffuseColor = color;    // Base color
material.alpha = color.a;         // Transparency
material.diffuseTexture = texture; // If filename specified
```

### Advanced Properties

For custom material properties, access the Babylon.js material:

```typescript
material.create(scene);
if (material.material instanceof BABYLON.StandardMaterial) {
    material.material.specularColor = new BABYLON.Color3(1, 1, 1);
    material.material.specularPower = 32;
    material.material.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
}
```

## Integration with Robot

### Default Materials

Every Robot gets these materials automatically:

```typescript
// Default gray material
const defaultMat = new Material();
defaultMat.name = "default";
defaultMat.color = new BABYLON.Color4(0.5, 0.5, 0.5, 1);

// Collision visualization material  
const collisionMat = new CollisionMaterial();
```

### URDF Material Loading

```typescript
// Materials are typically loaded from URDF files
// and stored in the robot's material map
for (const [name, material] of robot.materials) {
    material.create(scene);
    console.log(`Created material: ${name}`);
}
```

## Performance Considerations

### Material Sharing
```typescript
// Reuse materials across multiple objects
const sharedMaterial = materialMap.get("aluminum");
visual1.material = sharedMaterial;
visual2.material = sharedMaterial; // Same material instance
```

### Texture Optimization
- Use appropriate texture sizes (512x512, 1024x1024)
- Compress textures when possible
- Avoid excessive transparency for performance

### Memory Management
```typescript
// Always dispose materials when done
material.dispose();

// Reference materials are disposed by the Robot
if (!material.isReference()) {
    material.dispose();
}
```

## Error Handling

The Material class provides robust error handling:
- Handles missing texture files gracefully
- Provides fallback to color-based materials
- Safe disposal of Babylon.js resources
- Logs warnings for invalid material properties