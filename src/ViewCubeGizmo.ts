/*
 * Copyright (c) 2025 Lou Amadio and Ranch Hand Robotics, LLC
 * All rights reserved.
 */

import * as BABYLON from 'babylonjs';
import * as GUI from 'babylonjs-gui';

/**
 * ViewCubeGizmo - A 3D navigation cube for camera orientation control
 * Positioned in the lower right corner of the viewport
 */
export class ViewCubeGizmo {
  private scene: BABYLON.Scene;
  private camera: BABYLON.ArcRotateCamera;
  private utilityLayer: BABYLON.UtilityLayerRenderer;
  private cube: BABYLON.Mesh;
  private cubeCamera: BABYLON.ArcRotateCamera;
  private renderTarget: BABYLON.RenderTargetTexture;
  private guiTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle;
  private image: GUI.Image;
  private homeButton: GUI.Button;
  private resetCameraCallback: () => void;
  
  // Coordinate transformation for ROS coordinate system
  private readonly ROS_TRANSFORM = new BABYLON.Vector3(-Math.PI/2, 0, 0);
  
  // Face orientations for the view cube (in ROS coordinates)
  // Each entry is [alpha, beta] for camera positioning
  private readonly FACE_ORIENTATIONS: { [key: string]: [number, number] } = {
    'front': [0, Math.PI / 2],           // +X
    'back': [Math.PI, Math.PI / 2],      // -X
    'right': [Math.PI / 2, Math.PI / 2], // +Y
    'left': [-Math.PI / 2, Math.PI / 2], // -Y
    'top': [0, 0],                       // +Z
    'bottom': [0, Math.PI]               // -Z
  };

  constructor(
    scene: BABYLON.Scene,
    camera: BABYLON.ArcRotateCamera,
    guiTexture: GUI.AdvancedDynamicTexture,
    resetCameraCallback: () => void
  ) {
    this.scene = scene;
    this.camera = camera;
    this.guiTexture = guiTexture;
    this.resetCameraCallback = resetCameraCallback;

    // Create a utility layer for the view cube rendering
    this.utilityLayer = new BABYLON.UtilityLayerRenderer(this.scene);
    this.utilityLayer.utilityLayerScene.autoClear = false;

    // Create the render target and view cube
    this.renderTarget = this.createRenderTarget();
    this.cube = this.createViewCube();
    this.cubeCamera = this.createCubeCamera();

    // Create UI overlay
    this.container = this.createContainer();
    this.image = this.createImageElement();
    this.homeButton = this.createHomeButton();

    // Setup rendering
    this.setupRenderLoop();
    
    // Update cube orientation with camera changes
    this.scene.onBeforeRenderObservable.add(() => {
      this.updateCubeOrientation();
    });
  }

  private createRenderTarget(): BABYLON.RenderTargetTexture {
    const renderTarget = new BABYLON.RenderTargetTexture(
      "viewCubeRTT",
      256,
      this.utilityLayer.utilityLayerScene,
      false,
      true,
      BABYLON.Constants.TEXTURETYPE_UNSIGNED_INT,
      false,
      BABYLON.Constants.TEXTURE_BILINEAR_SAMPLINGMODE
    );
    renderTarget.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    return renderTarget;
  }

  private createViewCube(): BABYLON.Mesh {
    const cube = BABYLON.MeshBuilder.CreateBox(
      "viewCube",
      { size: 2 },
      this.utilityLayer.utilityLayerScene
    );

    // Create materials for each face with labels
    const faceColors = [
      new BABYLON.Color3(1, 0, 0),     // +X (front) - Red
      new BABYLON.Color3(0.7, 0, 0),   // -X (back) - Dark Red
      new BABYLON.Color3(0, 1, 0),     // +Y (right) - Green
      new BABYLON.Color3(0, 0.7, 0),   // -Y (left) - Dark Green
      new BABYLON.Color3(0, 0, 1),     // +Z (top) - Blue
      new BABYLON.Color3(0, 0, 0.7)    // -Z (bottom) - Dark Blue
    ];

    const multiMat = new BABYLON.MultiMaterial("viewCubeMultiMat", this.utilityLayer.utilityLayerScene);
    
    for (let i = 0; i < 6; i++) {
      const mat = new BABYLON.StandardMaterial(`faceMat${i}`, this.utilityLayer.utilityLayerScene);
      mat.diffuseColor = faceColors[i];
      mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
      mat.emissiveColor = faceColors[i].scale(0.3);
      multiMat.subMaterials.push(mat);
    }

    cube.material = multiMat;
    cube.subMeshes = [];
    
    // Define submeshes for each face
    const verticesCount = 24; // Box has 24 vertices (4 per face)
    cube.subMeshes.push(new BABYLON.SubMesh(0, 0, verticesCount, 0, 6, cube));   // front
    cube.subMeshes.push(new BABYLON.SubMesh(1, 0, verticesCount, 6, 6, cube));   // back
    cube.subMeshes.push(new BABYLON.SubMesh(2, 0, verticesCount, 12, 6, cube));  // right
    cube.subMeshes.push(new BABYLON.SubMesh(3, 0, verticesCount, 18, 6, cube));  // left
    cube.subMeshes.push(new BABYLON.SubMesh(4, 0, verticesCount, 24, 6, cube));  // top
    cube.subMeshes.push(new BABYLON.SubMesh(5, 0, verticesCount, 30, 6, cube));  // bottom

    // Add edge rendering for modern look
    cube.enableEdgesRendering();
    cube.edgesWidth = 4.0;
    cube.edgesColor = new BABYLON.Color4(1, 1, 1, 1);

    this.renderTarget.renderList = [cube];

    return cube;
  }

  private createCubeCamera(): BABYLON.ArcRotateCamera {
    const camera = new BABYLON.ArcRotateCamera(
      "viewCubeCamera",
      0,
      0,
      5,
      BABYLON.Vector3.Zero(),
      this.utilityLayer.utilityLayerScene
    );
    camera.layerMask = 0x10000000;
    this.renderTarget.activeCamera = camera;
    return camera;
  }

  private createContainer(): GUI.Rectangle {
    const container = new GUI.Rectangle("viewCubeContainer");
    container.widthInPixels = 140;
    container.heightInPixels = 140;
    container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    container.leftInPixels = -20;
    container.topInPixels = -20;
    container.thickness = 0;
    container.background = "transparent";
    
    this.guiTexture.addControl(container);
    return container;
  }

  private createImageElement(): GUI.Image {
    const image = new GUI.Image("viewCubeImage", "");
    image.width = "120px";
    image.height = "120px";
    image.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    image.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    image.stretch = GUI.Image.STRETCH_FILL;
    
    // Make it clickable
    image.isPointerBlocker = true;
    
    // Add click handler to detect which face was clicked
    image.onPointerDownObservable.add((eventData) => {
      this.handleCubeClick(eventData);
    });
    
    // Add hover effect
    image.onPointerEnterObservable.add(() => {
      image.alpha = 0.8;
    });
    
    image.onPointerOutObservable.add(() => {
      image.alpha = 1.0;
    });
    
    this.container.addControl(image);
    return image;
  }

  private createHomeButton(): GUI.Button {
    const homeButton = GUI.Button.CreateSimpleButton("viewCubeHome", "⌂");
    homeButton.widthInPixels = 30;
    homeButton.heightInPixels = 30;
    homeButton.cornerRadius = 15;
    homeButton.color = "white";
    homeButton.background = "rgba(100, 100, 100, 0.8)";
    homeButton.fontSize = "18px";
    homeButton.fontWeight = "bold";
    homeButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    homeButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    homeButton.topInPixels = 0;
    
    homeButton.onPointerUpObservable.add(() => {
      this.resetCameraCallback();
    });
    
    homeButton.onPointerEnterObservable.add(() => {
      homeButton.background = "rgba(150, 150, 150, 0.9)";
    });
    
    homeButton.onPointerOutObservable.add(() => {
      homeButton.background = "rgba(100, 100, 100, 0.8)";
    });
    
    this.container.addControl(homeButton);
    return homeButton;
  }

  private setupRenderLoop(): void {
    this.scene.onAfterRenderObservable.add(() => {
      // Render the view cube to the texture
      this.renderTarget.render();
      
      // Update the GUI image with the rendered texture
      if (this.renderTarget.getInternalTexture()) {
        this.image.domImage = this.renderTarget.getInternalTexture() as any;
      }
    });
  }

  private updateCubeOrientation(): void {
    if (!this.camera || !this.cubeCamera) {
      return;
    }

    // Match the cube's rotation to the main camera's rotation
    // Apply inverse rotation so cube faces match world orientation
    const alpha = this.camera.alpha;
    const beta = this.camera.beta;
    
    this.cubeCamera.alpha = -alpha;
    this.cubeCamera.beta = beta;
  }

  private handleCubeClick(eventData: GUI.Vector2WithInfo): void {
    // Get click position relative to image
    const imgWidth = 120;
    const imgHeight = 120;
    
    // For now, we'll implement a simplified face detection
    // based on which third of the cube is clicked
    // This is a basic implementation - could be enhanced with raycasting
    
    const x = eventData.x;
    const y = eventData.y;
    
    // Determine which face was likely clicked based on current view
    // For simplicity, we'll cycle through common orientations
    
    // Get current camera orientation
    const currentAlpha = this.camera.alpha;
    const currentBeta = this.camera.beta;
    
    // Find the closest standard orientation
    let closestFace = 'front';
    let minDiff = Number.MAX_VALUE;
    
    for (const [face, [alpha, beta]] of Object.entries(this.FACE_ORIENTATIONS)) {
      const diff = Math.abs(alpha - currentAlpha) + Math.abs(beta - currentBeta);
      if (diff < minDiff) {
        minDiff = diff;
        closestFace = face;
      }
    }
    
    // Rotate to the next logical orientation
    const faceKeys = Object.keys(this.FACE_ORIENTATIONS);
    const currentIndex = faceKeys.indexOf(closestFace);
    const nextIndex = (currentIndex + 1) % faceKeys.length;
    const nextFace = faceKeys[nextIndex];
    
    this.rotateCameraToFace(nextFace);
  }

  private rotateCameraToFace(face: string): void {
    const [targetAlpha, targetBeta] = this.FACE_ORIENTATIONS[face];
    
    // Smoothly animate camera to target orientation
    const frameCount = 30;
    let frame = 0;
    
    const startAlpha = this.camera.alpha;
    const startBeta = this.camera.beta;
    
    const animation = () => {
      frame++;
      const t = frame / frameCount;
      const eased = this.easeInOutCubic(t);
      
      this.camera.alpha = startAlpha + (targetAlpha - startAlpha) * eased;
      this.camera.beta = startBeta + (targetBeta - startBeta) * eased;
      
      if (frame < frameCount) {
        requestAnimationFrame(animation);
      }
    };
    
    animation();
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Set up keyboard controls for view cube navigation
   */
  public setupKeyboardControls(): void {
    this.scene.onKeyboardObservable.add((kbInfo) => {
      if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
        switch (kbInfo.event.key.toLowerCase()) {
          case '1':
            this.rotateCameraToFace('front');
            break;
          case '2':
            this.rotateCameraToFace('back');
            break;
          case '3':
            this.rotateCameraToFace('right');
            break;
          case '4':
            this.rotateCameraToFace('left');
            break;
          case '5':
            this.rotateCameraToFace('top');
            break;
          case '6':
            this.rotateCameraToFace('bottom');
            break;
          case 'h':
          case 'home':
            this.resetCameraCallback();
            break;
        }
      }
    });
  }

  /**
   * Dispose of all resources
   */
  public dispose(): void {
    if (this.cube) {
      this.cube.dispose();
    }
    if (this.renderTarget) {
      this.renderTarget.dispose();
    }
    if (this.utilityLayer) {
      this.utilityLayer.dispose();
    }
    if (this.container) {
      this.guiTexture.removeControl(this.container);
      this.container.dispose();
    }
  }
}
