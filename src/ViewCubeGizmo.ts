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
  private guiTexture: GUI.AdvancedDynamicTexture;
  private container: GUI.Rectangle;
  private cubeGrid: GUI.Grid;
  private homeButton: GUI.Button;
  private resetCameraCallback: () => void;
  private faceButtons: Map<string, GUI.Button> = new Map();
  
  // Face orientations for the view cube
  // Each entry is [alpha, beta] for camera positioning
  private readonly FACE_ORIENTATIONS: { [key: string]: [number, number] } = {
    'X+': [0, Math.PI / 2],              // Front - Red
    'X-': [Math.PI, Math.PI / 2],        // Back - Dark Red
    'Y+': [Math.PI / 2, Math.PI / 2],    // Right - Green
    'Y-': [-Math.PI / 2, Math.PI / 2],   // Left - Dark Green
    'Z+': [0, 0.1],                      // Top - Blue (0.1 instead of 0 to avoid gimbal lock)
    'Z-': [0, Math.PI - 0.1]             // Bottom - Dark Blue
  };

  // Colors matching the world axis display
  private readonly FACE_COLORS: { [key: string]: string } = {
    'X+': 'rgba(255, 0, 0, 0.8)',        // Red
    'X-': 'rgba(180, 0, 0, 0.8)',        // Dark Red
    'Y+': 'rgba(0, 255, 0, 0.8)',        // Green
    'Y-': 'rgba(0, 180, 0, 0.8)',        // Dark Green
    'Z+': 'rgba(0, 0, 255, 0.8)',        // Blue
    'Z-': 'rgba(0, 0, 180, 0.8)'         // Dark Blue
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

    // Create UI controls
    this.container = this.createContainer();
    this.cubeGrid = this.createCubeGrid();
    this.createFaceButtons();
    this.homeButton = this.createHomeButton();
    
    // Update visual state based on camera orientation
    this.scene.onBeforeRenderObservable.add(() => {
      this.updateVisualState();
    });
  }

  private createContainer(): GUI.Rectangle {
    const container = new GUI.Rectangle("viewCubeContainer");
    container.widthInPixels = 150;
    container.heightInPixels = 180;
    container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    container.leftInPixels = -20;
    container.topInPixels = -20;
    container.thickness = 0;
    container.background = "transparent";
    
    this.guiTexture.addControl(container);
    return container;
  }

  private createCubeGrid(): GUI.Grid {
    const grid = new GUI.Grid("viewCubeGrid");
    grid.widthInPixels = 120;
    grid.heightInPixels = 120;
    grid.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    grid.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    
    // Create a 3x3 grid for the cube faces
    for (let i = 0; i < 3; i++) {
      grid.addRowDefinition(1/3);
      grid.addColumnDefinition(1/3);
    }
    
    this.container.addControl(grid);
    return grid;
  }

  private createFaceButtons(): void {
    // Layout the faces in a cross pattern
    // Top row: [empty, Z+, empty]
    // Middle row: [Y-, X+, Y+]
    // Bottom row: [empty, Z-, X-]
    
    const layout = [
      { face: 'Z+', row: 0, col: 1 },
      { face: 'Y-', row: 1, col: 0 },
      { face: 'X+', row: 1, col: 1 },
      { face: 'Y+', row: 1, col: 2 },
      { face: 'Z-', row: 2, col: 1 },
      { face: 'X-', row: 2, col: 2 }
    ];

    for (const { face, row, col } of layout) {
      const button = this.createFaceButton(face);
      this.cubeGrid.addControl(button, row, col);
      this.faceButtons.set(face, button);
    }
  }

  private createFaceButton(face: string): GUI.Button {
    const button = GUI.Button.CreateSimpleButton(`face_${face}`, face);
    button.widthInPixels = 38;
    button.heightInPixels = 38;
    button.cornerRadius = 5;
    button.color = "white";
    button.background = this.FACE_COLORS[face];
    button.fontSize = "14px";
    button.fontWeight = "bold";
    button.thickness = 2;
    
    button.onPointerUpObservable.add(() => {
      this.rotateCameraToFace(face);
    });
    
    button.onPointerEnterObservable.add(() => {
      button.alpha = 0.7;
      button.thickness = 3;
    });
    
    button.onPointerOutObservable.add(() => {
      button.alpha = 1.0;
      button.thickness = 2;
    });
    
    return button;
  }

  private createHomeButton(): GUI.Button {
    const homeButton = GUI.Button.CreateSimpleButton("viewCubeHome", "⌂");
    homeButton.widthInPixels = 35;
    homeButton.heightInPixels = 35;
    homeButton.cornerRadius = 18;
    homeButton.color = "white";
    homeButton.background = "rgba(80, 80, 80, 0.9)";
    homeButton.fontSize = "20px";
    homeButton.fontWeight = "bold";
    homeButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    homeButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    homeButton.topInPixels = 0;
    homeButton.thickness = 2;
    
    homeButton.onPointerUpObservable.add(() => {
      this.resetCameraCallback();
    });
    
    homeButton.onPointerEnterObservable.add(() => {
      homeButton.background = "rgba(120, 120, 120, 0.9)";
      homeButton.thickness = 3;
    });
    
    homeButton.onPointerOutObservable.add(() => {
      homeButton.background = "rgba(80, 80, 80, 0.9)";
      homeButton.thickness = 2;
    });
    
    this.container.addControl(homeButton);
    return homeButton;
  }

  private updateVisualState(): void {
    // Highlight the face that is closest to the current view
    const currentAlpha = this.camera.alpha;
    const currentBeta = this.camera.beta;
    
    let closestFace = 'X+';
    let minDiff = Number.MAX_VALUE;
    
    for (const [face, [alpha, beta]] of Object.entries(this.FACE_ORIENTATIONS)) {
      const alphaDiff = Math.abs(this.normalizeAngle(alpha - currentAlpha));
      const betaDiff = Math.abs(beta - currentBeta);
      const diff = alphaDiff + betaDiff;
      
      if (diff < minDiff) {
        minDiff = diff;
        closestFace = face;
      }
    }
    
    // Update button appearance to highlight the active face
    this.faceButtons.forEach((button, face) => {
      if (face === closestFace && minDiff < 0.5) {
        button.thickness = 4;
        button.shadowBlur = 10;
        button.shadowColor = "rgba(255, 255, 255, 0.8)";
      } else {
        button.thickness = 2;
        button.shadowBlur = 0;
      }
    });
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  private rotateCameraToFace(face: string): void {
    const orientation = this.FACE_ORIENTATIONS[face];
    if (!orientation) {
      console.warn(`Unknown face: ${face}`);
      return;
    }
    
    const [targetAlpha, targetBeta] = orientation;
    
    // Smoothly animate camera to target orientation
    const frameCount = 30;
    let frame = 0;
    
    const startAlpha = this.camera.alpha;
    const startBeta = this.camera.beta;
    
    // Handle alpha angle wrapping for shortest path
    let deltaAlpha = targetAlpha - startAlpha;
    while (deltaAlpha > Math.PI) deltaAlpha -= 2 * Math.PI;
    while (deltaAlpha < -Math.PI) deltaAlpha += 2 * Math.PI;
    
    const animation = () => {
      frame++;
      const t = frame / frameCount;
      const eased = this.easeInOutCubic(t);
      
      this.camera.alpha = startAlpha + deltaAlpha * eased;
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
            this.rotateCameraToFace('X+');
            break;
          case '2':
            this.rotateCameraToFace('X-');
            break;
          case '3':
            this.rotateCameraToFace('Y+');
            break;
          case '4':
            this.rotateCameraToFace('Y-');
            break;
          case '5':
            this.rotateCameraToFace('Z+');
            break;
          case '6':
            this.rotateCameraToFace('Z-');
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
    if (this.container) {
      this.guiTexture.removeControl(this.container);
      this.container.dispose();
    }
  }
}
