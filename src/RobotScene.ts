/*
 * Copyright (c) 2025 Lou Amadio and Ranch Hand Robotics, LLC
 * All rights reserved.
 */

import * as BABYLON from 'babylonjs';
import * as Materials from 'babylonjs-materials';
import * as urdf from './urdf';
import {Robot} from './Robot';
import {Joint, JointType} from './Joint';
import {Link} from './Link';
import {Visual} from './Visual';
import { JointRotationGizmo } from './JointRotationGizmo';
import { JointPositionGizmo } from './JointPositionGizmo';
import { Mesh } from './GeometryMesh';

import * as GUI from 'babylonjs-gui';
import * as GUI3D from 'babylonjs-gui';
import * as ColladaFileLoader from '@polyhobbyist/babylon-collada-loader';

export class RobotScene {
  public engine : BABYLON.Engine | undefined = undefined;
  public scene : BABYLON.Scene | undefined = undefined;
  public currentURDF : string | undefined = undefined;
  public uiScene : BABYLON.Scene | undefined = undefined;
  public currentRobot : Robot | undefined = undefined;
  public UI3DManager : GUI3D.GUI3DManager | undefined = undefined;
  public acitonMenu : GUI3D.NearMenu | undefined = undefined;
  
  public ground : BABYLON.GroundMesh | undefined = undefined;
  public camera : BABYLON.ArcRotateCamera | undefined = undefined;
  private mirrorTexture : BABYLON.MirrorTexture | undefined = undefined;
  private statusLabel = new GUI.TextBlock();
  public uiCamera : BABYLON.FreeCamera | undefined = undefined;
  private status3DText : GUI3D.TextBlock | undefined = undefined;
  private statusHologram : GUI3D.HolographicButton | undefined = undefined;

  public readyToRender : Boolean = false;

  private jointAxisList : BABYLON.PositionGizmo[] = [];
  private linkAxisList : BABYLON.PositionGizmo[] = [];
  private jointRotationGizmos : BABYLON.RotationGizmo[] = [];
  private linkRotationGizmos : BABYLON.RotationGizmo[] = [];
  private worldAxis : BABYLON.TransformNode | undefined = undefined;
  private worldAxisSize = 8.0;
  private selectedVisual : Visual | undefined = undefined;
  private hoveredJoint : Joint | undefined = undefined;
  private utilLayer : BABYLON.UtilityLayerRenderer | undefined = undefined;
  private gizmoLayer : BABYLON.UtilityLayerRenderer | undefined = undefined;
  private planeRotationGizmo: JointRotationGizmo | undefined = undefined;
  private planePositionGizmo: JointPositionGizmo | undefined = undefined;
  private hasBeenFramed: boolean = false;
  private pendingMeshLoads: number = 0;
  private meshLoadPromises: Promise<void>[] = [];
  private savedFramingTarget: BABYLON.Vector3 = new BABYLON.Vector3(0, 0, 0);
  private savedFramingRadius: number = 1;
  private savedFramingAlpha: number = -Math.PI / 3;
  private savedFramingBeta: number = 5 * Math.PI / 12;
  
  // Hamburger menu properties
  private hamburgerButton: GUI.Button | undefined = undefined;
  private menuPanel: GUI.StackPanel | undefined = undefined;
  private menuScrollViewer: GUI.ScrollViewer | undefined = undefined;
  private menuContainer: GUI.Rectangle | undefined = undefined;
  private isMenuExpanded: boolean = false;
  
  // Grid units properties
  private gridUnitsVisible: boolean = false;
  private currentGridUnit: string = "1m"; // "10cm", "1m"
  private gridUnitLabels: BABYLON.AbstractMesh[] = [];
  
  // Enhanced visuals properties
  private enhancedVisualsEnabled: boolean = true;
  
  // UI properties  
  public UILayer: GUI.AdvancedDynamicTexture | undefined = undefined;
  private isWebXRActive: boolean = false;
      
  clearStatus() {
    if (this.status3DText) {
      this.status3DText.text = "";
    }
  }
  
  clearAxisGizmos() {
    this.linkAxisList.forEach((a) => {
      a.dispose();
    });
    this.linkAxisList = [];
  
    this.jointAxisList.forEach((a) => {
      a.dispose();
    });
    this.jointAxisList = [];
  }
  
  addAxisToTransform(list : BABYLON.PositionGizmo[], scene : BABYLON.Scene, layer: BABYLON.UtilityLayerRenderer, transform : BABYLON.TransformNode | undefined) {
    if (transform) {
      let axis = new BABYLON.PositionGizmo(layer);
      axis.scaleRatio = 0.5;
      axis.attachedNode = transform;
      list.push(axis);
  
      let drag = () => {
        if (transform) {
          if (this.status3DText) {
            this.status3DText.text = transform.name + 
            "\nX: " + transform.position.x.toFixed(6) + 
            "\nY: " + transform.position.y.toFixed(6) + 
            "\nZ: " + transform.position.z.toFixed(6);
            
            this.updateStatusPosition(transform);
          }
        }
      };
  
      axis.xGizmo.dragBehavior.onDragObservable.add(drag);
      axis.yGizmo.dragBehavior.onDragObservable.add(drag);
      axis.zGizmo.dragBehavior.onDragObservable.add(drag);
    }
  }
  
  toggleAxisOnRobot(jointOrLink : Boolean, scene : BABYLON.Scene | undefined, layer: BABYLON.UtilityLayerRenderer) {
    if (!this.currentRobot || !scene) {
      return;
    }
  
    let whichAxis = jointOrLink ? this.jointAxisList : this.linkAxisList;
  
    if (whichAxis.length === 0) {
      if (jointOrLink) {
        // Use Array.from to correctly iterate through the Map
        Array.from(this.currentRobot.joints.entries()).forEach(([name, j]) => {
          this.addAxisToTransform(whichAxis, scene, layer, j.transform);
        });
      } else {
        // Use Array.from to correctly iterate through the Map
        Array.from(this.currentRobot.links.entries()).forEach(([name, l]) => {
          l.visuals.forEach((v: Visual) => {
            this.addAxisToTransform(whichAxis, scene, layer, v.transform);
          });
        });
      }
    } else {
      this.clearAxisGizmos();
      this.clearStatus();
    }
  }

  clearRotationGizmos() {
    this.jointRotationGizmos.forEach((a) => {
      a.dispose();
    });
    this.jointRotationGizmos = [];
    this.linkRotationGizmos.forEach((a) => {
      a.dispose();
    });
    this.linkRotationGizmos = [];
  }
  
  addRotationToTransform(list : BABYLON.RotationGizmo[], scene : BABYLON.Scene | undefined, layer: BABYLON.UtilityLayerRenderer, transform : BABYLON.TransformNode | undefined) {
    if (!scene) {
      return;
    }

    if (transform) {
      let rotationGizmo = new BABYLON.RotationGizmo(layer);
      rotationGizmo.scaleRatio = 0.5;
      rotationGizmo.attachedNode = transform;
      list.push(rotationGizmo);
  
      let drag = () => {
        if (transform) {
          let statusText = transform.name + 
          "\nR:" + transform.rotation.x.toFixed(6) + 
          "\nP:" + transform.rotation.y.toFixed(6) + 
          "\nY:" + transform.rotation.z.toFixed(6);
          
          if (this.status3DText) {
            this.status3DText.text = statusText;
            this.updateStatusPosition(transform);
          }
        }
      };
  
      rotationGizmo.xGizmo.dragBehavior.onDragObservable.add(drag);
      rotationGizmo.yGizmo.dragBehavior.onDragObservable.add(drag);
      rotationGizmo.zGizmo.dragBehavior.onDragObservable.add(drag);
    }
  }
  
  toggleAxisRotationOnRobot(jointOrLink : Boolean, scene : BABYLON.Scene | undefined, layer: BABYLON.UtilityLayerRenderer) {
    if (!this.currentRobot || !scene) {
      return;
    }
  
    let whichList = jointOrLink ? this.jointRotationGizmos : this.linkRotationGizmos;
    if (whichList.length === 0) {
      if (jointOrLink) {
        // Use Array.from to correctly iterate through the Map
        Array.from(this.currentRobot.joints.entries()).forEach(([name, j]) => {
          this.addRotationToTransform(whichList, scene, layer, j.transform);
        });
      } else {
        // Use Array.from to correctly iterate through the Map
        Array.from(this.currentRobot.links.entries()).forEach(([name, l]) => {
          l.visuals.forEach((v: Visual) => {
            this.addRotationToTransform(whichList, scene, layer, v.transform);
          });
        });
      }
    } else {
      this.clearRotationGizmos();
      this.clearStatus();
    }
  }
  
  clearJointExerciseGizmos() {
    this.planeRotationGizmo?.dispose();
    this.planeRotationGizmo = undefined;
    this.planePositionGizmo?.dispose();
    this.planePositionGizmo = undefined;
  }

  updateStatusPosition(transform: BABYLON.TransformNode) {
    if (this.statusHologram && transform) {
      // Position the status hologram near the transform
      const worldPos = transform.getAbsolutePosition();
      this.statusHologram.position = new BABYLON.Vector3(
        worldPos.x, 
        worldPos.y + 0.3, // Position slightly above the object
        worldPos.z
      );
    }
  }

  addExerciseGizmoToJoint(joint: Joint, scene: BABYLON.Scene, layer: BABYLON.UtilityLayerRenderer) {
    if (!joint.transform) {
      console.log(`No transform for joint: ${joint.name}`);
      return;
    }

    console.log(`Creating gizmo for joint: ${joint.name}, type: ${joint.type}`);

    // Only create gizmos for non-fixed joints
    if (joint.type === JointType.Fixed) {
      return;
    }
    
    switch (joint.type) {
      case JointType.Continuous:
      case JointType.Revolute:
        if (Math.abs(joint.axis.y) > 0.5) {
          console.log(`Joint ${joint.name} is primarily rotating around y-axis`);
          // Create a rotation gizmo for the XZ plane (rotating around Y axis)
          this.planeRotationGizmo = new JointRotationGizmo(
            joint,
            BABYLON.Color3.Green(),
            layer
          );
        } else if (Math.abs(joint.axis.z) > 0.5) {
          console.log(`Joint ${joint.name} is primarily rotating around z-axis`);
          // Create a rotation gizmo for the XY plane (rotating around Z axis)
          this.planeRotationGizmo = new JointRotationGizmo(
            joint,
            BABYLON.Color3.Blue(),
            layer
          );
        } else {
          console.log(`Joint ${joint.name} rotating around x-axis`);
          this.planeRotationGizmo = new JointRotationGizmo(
            joint,
            BABYLON.Color3.Red(),
            layer
          );
        }
        
        // Configure the rotation gizmo
        this.planeRotationGizmo.scaleRatio = 0.75; // Much larger for better visibility
        this.planeRotationGizmo.attachedNode = joint.transform;
        this.planeRotationGizmo.enableLimits = joint.type !== JointType.Continuous;
        
        this.planeRotationGizmo.dragBehavior.onDragObservable.add(() => {
          if (joint.transform) {
            this.updateJointStatusLabel(joint);
          }
        });
        
        break;
        
      case JointType.Prismatic:
        // For planar joints, create a position gizmo limited to two axes
        this.planePositionGizmo = undefined;
        if (Math.abs(joint.axis.y) > 0.5) {
          this.planePositionGizmo = new JointPositionGizmo(
            joint,
            BABYLON.Color3.Blue(),
            layer);
        } else if (Math.abs(joint.axis.z) > 0.5) {
          this.planePositionGizmo = new JointPositionGizmo(
            joint,
            BABYLON.Color3.Red(),
            layer);
        } else {
          this.planePositionGizmo = new JointPositionGizmo(
            joint,
            BABYLON.Color3.Green(),
            layer);
        }

        if (this.planePositionGizmo)
        {
          this.planePositionGizmo.scaleRatio = .75;
          this.planePositionGizmo.attachedNode = joint.transform;
        }
        break;

        case JointType.Planar:
          console.log(`Joint ${joint.name} is using a planar joint, which is not yet supported for exercise gizmos. If you would like to see this, please open an issue on the GitHub repository.`);
          break;

        case JointType.Floating:
          console.log(`Joint ${joint.name} is using a floating joint, which is not yet supported for exercise gizmos. If you would like to see this, please open an issue on the GitHub repository.`);
          break;
    }
  }
  
  updateJointStatusLabel(joint: Joint) {
    if (!joint.transform) return;
    
    let limitsText = "";

    let rotationText = "";
    if (joint.type === JointType.Revolute || joint.type === JointType.Continuous) {
      rotationText = "\nRotation: " + joint.transform.rotation.x.toFixed(3) + "," +
              joint.transform.rotation.y.toFixed(3) + "," +
              joint.transform.rotation.z.toFixed(3);
      if (!isNaN(joint.lowerLimit) && !isNaN(joint.upperLimit) && joint.lowerLimit !== joint.upperLimit && joint.type !== JointType.Continuous) {
        limitsText = "\nLimits: " + joint.lowerLimit.toFixed(2) + " to " + joint.upperLimit.toFixed(2);
      }
    }

    let positionText = "";
    if (joint.type === JointType.Prismatic) {
      positionText = "\nPosition: " + joint.transform.position.x.toFixed(3) + "," +
              joint.transform.position.y.toFixed(3) + "," +
              joint.transform.position.z.toFixed(3);
    }

    let statusText = joint.name + 
      "\nType: " + joint.type +
      limitsText +
      rotationText +
      positionText;
    
    if (this.status3DText) {
      this.status3DText.text = statusText;
      this.updateStatusPosition(joint.transform);
    }
  }
  
  toggleCollision() {
    if (this.currentRobot) {
      // Use Array.from to safely iterate through Map entries
      Array.from(this.currentRobot.links.entries()).forEach(([name, link]) => {
        link.collisions.forEach((c: Visual) => {
            c.setEnabled(!c.isEnabled());
        });
      });
    }
  }

  toggleVisuals() {
    if (this.currentRobot) {
      // Use Array.from to safely iterate through Map entries  
      Array.from(this.currentRobot.links.entries()).forEach(([name, link]) => {
        link.visuals.forEach((v: Visual) => {
            v.setEnabled(!v.isEnabled());
        });
      });
    }
  }

  toggleBoundingBoxes() {
    if (this.currentRobot) {
      // Use Array.from to safely iterate through Map entries
      Array.from(this.currentRobot.links.entries()).forEach(([name, link]) => {
        link.visuals.forEach((v: Visual) => {
            v.geometry?.meshes?.forEach((m: BABYLON.AbstractMesh) => {
              m.showBoundingBox = !m.showBoundingBox;
            });
        });
      });
    }
  }

  public resetCamera() {
    if (this.camera) {
      if (this.hasBeenFramed) {
        // Use the saved auto-framing position
        this.camera.setTarget(this.savedFramingTarget);
        this.camera.radius = this.savedFramingRadius;
        this.camera.alpha = this.savedFramingAlpha;
        this.camera.beta = this.savedFramingBeta;
      } else {
        // Fall back to default position if no framing has been done
        this.camera.alpha = -Math.PI / 3;
        this.camera.beta = 5 * Math.PI / 12;
        this.camera.target = new BABYLON.Vector3(0, 0, 0);
        this.camera.radius = 1;
      }
    }
  }

  /**
   * Sets the camera radius (distance from target)
   * @param radius The camera distance from its target
   */
  public setCameraRadius(radius: number): void {
    if (this.camera) {
      this.camera.radius = radius;
    }
  }

  /**
   * Sets the scene background color
   * @param hexColor Hex color string (e.g., "#FF0000" or "FF0000")
   */
  public setBackgroundColor(hexColor: string): void {
    if (this.scene) {
      this.scene.clearColor = BABYLON.Color4.FromHexString(hexColor);
    }
  }

  /**
   * Sets the grid material properties
   * @param options Grid configuration options
   */
  public setGridProperties(options: {
    lineColor?: string;
    mainColor?: string;
    minorOpacity?: number;
    gridRatio?: number;
    majorUnitFrequency?: number;
  }): void {
    if (!this.ground?.material || !(this.ground.material instanceof Materials.GridMaterial)) {
      return;
    }

    const gridMaterial = this.ground.material as Materials.GridMaterial;

    if (options.lineColor !== undefined) {
      gridMaterial.lineColor = BABYLON.Color3.FromHexString(options.lineColor);
    }
    if (options.mainColor !== undefined) {
      gridMaterial.mainColor = BABYLON.Color3.FromHexString(options.mainColor);
    }
    if (options.minorOpacity !== undefined) {
      gridMaterial.minorUnitVisibility = options.minorOpacity;
    }
    if (options.gridRatio !== undefined) {
      gridMaterial.gridRatio = options.gridRatio;
    }
    if (options.majorUnitFrequency !== undefined) {
      gridMaterial.majorUnitFrequency = options.majorUnitFrequency;
    }
  }

  /**
   * Sets mirror reflection properties
   * @param options Mirror configuration options
   */
  public setMirrorProperties(options: {
    reflectionLevel?: number;
    alpha?: number;
    tintColor?: string;
    blurKernel?: number;
    roughness?: number;
    enabled?: boolean;
  }): void {
    if (!this.scene) return;

    const mirrorGround = this.scene.getMeshByName("mirrorGround");
    if (!mirrorGround || !mirrorGround.material || !(mirrorGround.material instanceof BABYLON.StandardMaterial)) {
      return;
    }

    const mirrorMaterial = mirrorGround.material as BABYLON.StandardMaterial;

    if (options.enabled !== undefined) {
      mirrorGround.setEnabled(options.enabled);
      if (!options.enabled) return; // Skip other settings if disabled
    }

    if (options.reflectionLevel !== undefined && this.mirrorTexture) {
      this.mirrorTexture.level = Math.max(0, Math.min(1, options.reflectionLevel));
    }

    if (options.alpha !== undefined) {
      mirrorMaterial.alpha = Math.max(0, Math.min(1, options.alpha));
    }

    if (options.tintColor !== undefined) {
      mirrorMaterial.diffuseColor = BABYLON.Color3.FromHexString(options.tintColor);
    }

    if (options.blurKernel !== undefined && this.mirrorTexture) {
      this.mirrorTexture.blurKernel = Math.max(0, options.blurKernel);
    }

    if (options.roughness !== undefined) {
      mirrorMaterial.roughness = Math.max(0, Math.min(1, options.roughness));
    }
  }

  /**
   * Sets all visual properties at once
   * @param config Complete visual configuration
   */
  public setVisualConfig(config: {
    cameraRadius?: number;
    backgroundColor?: string;
    gridLineColor?: string;
    gridMainColor?: string;
    gridMinorOpacity?: number;
    gridRatio?: number;
    majorUnitFrequency?: number;
    mirrorReflectionLevel?: number;
    mirrorAlpha?: number;
    mirrorTintColor?: string;
    mirrorBlurKernel?: number;
    mirrorRoughness?: number;
    mirrorEnabled?: boolean;
  }): void {
    if (config.cameraRadius !== undefined) {
      this.setCameraRadius(config.cameraRadius);
    }

    if (config.backgroundColor !== undefined) {
      this.setBackgroundColor(config.backgroundColor);
    }

    // Set grid properties if any are provided
    const gridOptions: Parameters<typeof this.setGridProperties>[0] = {};
    if (config.gridLineColor !== undefined) gridOptions.lineColor = config.gridLineColor;
    if (config.gridMainColor !== undefined) gridOptions.mainColor = config.gridMainColor;
    if (config.gridMinorOpacity !== undefined) gridOptions.minorOpacity = config.gridMinorOpacity;
    if (config.gridRatio !== undefined) gridOptions.gridRatio = config.gridRatio;
    if (config.majorUnitFrequency !== undefined) gridOptions.majorUnitFrequency = config.majorUnitFrequency;

    if (Object.keys(gridOptions).length > 0) {
      this.setGridProperties(gridOptions);
    }

    // Set mirror properties if any are provided
    const mirrorOptions: Parameters<typeof this.setMirrorProperties>[0] = {};
    if (config.mirrorReflectionLevel !== undefined) mirrorOptions.reflectionLevel = config.mirrorReflectionLevel;
    if (config.mirrorAlpha !== undefined) mirrorOptions.alpha = config.mirrorAlpha;
    if (config.mirrorTintColor !== undefined) mirrorOptions.tintColor = config.mirrorTintColor;
    if (config.mirrorBlurKernel !== undefined) mirrorOptions.blurKernel = config.mirrorBlurKernel;
    if (config.mirrorRoughness !== undefined) mirrorOptions.roughness = config.mirrorRoughness;
    if (config.mirrorEnabled !== undefined) mirrorOptions.enabled = config.mirrorEnabled;

    if (Object.keys(mirrorOptions).length > 0) {
      this.setMirrorProperties(mirrorOptions);
    }
  }
  
  create3DButton(name: string, text: string, onClick: () => void): GUI3D.TouchHolographicButton {
    const button = new GUI3D.TouchHolographicButton(name);
    button.onPointerUpObservable.add(onClick);
    
    const textBlock = new GUI3D.TextBlock();
    textBlock.text = text;
    textBlock.color = "white";
    textBlock.fontSize = 14;
    
    button.content = textBlock;
    
    return button;
  }

  // 2D UI methods for desktop
  createMenuButton(name : string, text : string, onClick : () => void) {
    const button = GUI.Button.CreateSimpleButton(name, text);
    button.widthInPixels = 120;
    button.heightInPixels = 30;
    button.color = "white";
    button.cornerRadius = 5;
    button.background = "green";
    button.fontSize = "12px";
    button.paddingTopInPixels = 4;
    button.paddingBottomInPixels = 4;
    button.onPointerUpObservable.add(onClick);
    return button;
  }

  createHamburgerMenu() {
    if (!this.UILayer) {
      return;
    }

    // Create hamburger button
    this.hamburgerButton = GUI.Button.CreateSimpleButton("hamburgerButton", "☰");
    this.hamburgerButton.widthInPixels = 40;
    this.hamburgerButton.heightInPixels = 40;
    this.hamburgerButton.color = "white";
    this.hamburgerButton.cornerRadius = 5;
    this.hamburgerButton.background = "rgba(0, 0, 0, 0.8)";
    this.hamburgerButton.fontSize = "20px";
    this.hamburgerButton.fontWeight = "bold";
    this.hamburgerButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.hamburgerButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.hamburgerButton.leftInPixels = 10;
    this.hamburgerButton.topInPixels = 10;
    
    this.hamburgerButton.onPointerUpObservable.add(() => {
      this.toggleMenu();
    });
    
    this.UILayer.addControl(this.hamburgerButton);

    // Create menu panel container
    this.menuContainer = new GUI.Rectangle("menuContainer");
    this.menuContainer.widthInPixels = 175;
    this.menuContainer.heightInPixels = 400;
    this.menuContainer.cornerRadius = 8;
    this.menuContainer.color = "white";
    this.menuContainer.thickness = 2;
    this.menuContainer.background = "rgba(0, 0, 0, 0.6)";
    this.menuContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.menuContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.menuContainer.leftInPixels = 10;
    this.menuContainer.topInPixels = 60;
    this.menuContainer.isVisible = false;
    
    this.UILayer.addControl(this.menuContainer);

    // Create scroll viewer for the menu
    this.menuScrollViewer = new GUI.ScrollViewer("menuScrollViewer");
    this.menuScrollViewer.thickness = 0;
    this.menuScrollViewer.color = "transparent";
    this.menuScrollViewer.background = "transparent";
    this.menuScrollViewer.widthInPixels = 175;
    this.menuScrollViewer.heightInPixels = 400;
    this.menuScrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    
    this.menuContainer.addControl(this.menuScrollViewer);

    // Create the menu panel (vertical stack)
    this.menuPanel = new GUI.StackPanel("menuPanel");
    this.menuPanel.isVertical = true;
    this.menuPanel.spacing = 5;
    this.menuPanel.paddingTopInPixels = 10;
    this.menuPanel.paddingBottomInPixels = 10;
    this.menuPanel.paddingLeftInPixels = 5;
    this.menuPanel.paddingRightInPixels = 5;
    
    this.menuScrollViewer.addControl(this.menuPanel);

    // Add all the menu buttons
    this.createMenuButtons();
  }

  createMenuButtons() {
    if (!this.menuPanel || !this.scene || !this.utilLayer) {
      return;
    }

    // Add all the buttons to the menu
    const jointAxisButton = this.createMenuButton("jointAxisButton", "Joint Axis", () => {
      this.toggleAxisOnRobot(true, this.scene, this.utilLayer!);
    });
    this.menuPanel.addControl(jointAxisButton);

    const linkAxisButton = this.createMenuButton("linkAxisButton", "Link Axis", () => {
      this.toggleAxisOnRobot(false, this.scene, this.utilLayer!);
    });
    this.menuPanel.addControl(linkAxisButton);

    const jointRotationButton = this.createMenuButton("jointRotationButton", "Joint Rotation", () => {
      this.toggleAxisRotationOnRobot(true, this.scene, this.utilLayer!);
    });
    this.menuPanel.addControl(jointRotationButton);

    const linkRotationButton = this.createMenuButton("linkRotationButton", "Link Rotation", () => {
      this.toggleAxisRotationOnRobot(false, this.scene, this.utilLayer!);
    });
    this.menuPanel.addControl(linkRotationButton);

    const worldAxisButton = this.createMenuButton("worldAxis", "World Axis", () => {
      this.toggleWorldAxis();
    });
    this.menuPanel.addControl(worldAxisButton);

    const collisionButton = this.createMenuButton("collision", "Collision", () => {
      this.toggleCollision();
    });
    this.menuPanel.addControl(collisionButton);

    const visualsButton = this.createMenuButton("visuals", "Visuals", () => {
      this.toggleVisuals();
    });
    this.menuPanel.addControl(visualsButton);

    const boundingBoxButton = this.createMenuButton("boundingBoxes", "Bounding Boxes", () => {
      this.toggleBoundingBoxes();
    });
    this.menuPanel.addControl(boundingBoxButton);

    const resetCameraButton = this.createMenuButton("resetCamera", "Reset Camera", () => {
      this.resetCamera();
    });
    this.menuPanel.addControl(resetCameraButton);

    const resetButton = this.createMenuButton("reset", "Reset Robot", () => {
      if (this.currentURDF !== undefined) {
        this.applyURDF(this.currentURDF);
      }
    });
    this.menuPanel.addControl(resetButton);

    // Grid unit buttons
    const gridUnits10cmButton = this.createMenuButton("gridUnits10cm", "Grid: 10cm", () => {
      this.toggleGridUnits("10cm");
    });
    this.menuPanel.addControl(gridUnits10cmButton);

    const gridUnits1mButton = this.createMenuButton("gridUnits1m", "Grid: 1m", () => {
      this.toggleGridUnits("1m");
    });
    this.menuPanel.addControl(gridUnits1mButton);

    // Add enhanced visuals toggle
    const enhancedVisualsButton = this.createMenuButton("enhancedVisuals", "Enhanced Mode", () => {
      this.toggleEnhancedVisuals();
    });
    this.menuPanel.addControl(enhancedVisualsButton);

    // Add mirror refresh button for debugging
    const refreshMirrorButton = this.createMenuButton("refreshMirror", "Refresh Mirror", () => {
      this.refreshMirror();
    });
    this.menuPanel.addControl(refreshMirrorButton);
  }

  toggleMenu() {
    this.isMenuExpanded = !this.isMenuExpanded;
    if (this.menuContainer) {
      this.menuContainer.isVisible = this.isMenuExpanded;
    }
    
    // Update hamburger button icon
    if (this.hamburgerButton) {
      this.hamburgerButton.textBlock!.text = this.isMenuExpanded ? "✕" : "☰";
    }
  }

  // 3D UI methods for WebXR
  makeTextPlane(text : string, color : string, size : number) {
    if (!this.scene) {
      return;
    }

    // Use larger texture size for better text quality and to prevent clipping
    var dynamicTexture = new BABYLON.DynamicTexture("DynamicTexture", 512, this.scene, true);
    dynamicTexture.hasAlpha = true;
    
    // Enhanced text rendering with improved visibility
    const canvas = dynamicTexture.getContext() as CanvasRenderingContext2D;
    canvas.font = "bold 60px Arial";
    canvas.textAlign = "center";
    canvas.textBaseline = "middle";
    
    // Draw very bright, clean text without outlines
    canvas.fillStyle = color;
    canvas.fillText(text, 256, 256);
    
    dynamicTexture.update();
    
    var plane = BABYLON.MeshBuilder.CreatePlane("TextPlane", {size: size}, this.scene);
    let material = new BABYLON.StandardMaterial("TextPlaneMaterial", this.scene);
    material.backFaceCulling = false;
    material.specularColor = new BABYLON.Color3(0, 0, 0);
    material.diffuseTexture = dynamicTexture;
    material.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
    
    // Add maximum emissive color to make text glow very brightly
    material.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0.8);
    
    // Disable lighting so text always appears at maximum brightness
    material.disableLighting = true;

    plane.material = material;
    return plane;
  };

  createWorldAxis() {
    if (!this.scene) {
      return;
    }

    this.worldAxis = new BABYLON.TransformNode("worldAxis", this.scene);

    // Babylon.JS coordinate system to ROS transform
    this.worldAxis.rotation =  new BABYLON.Vector3(-Math.PI/2, 0, 0);
  
    var axisX = BABYLON.MeshBuilder.CreateLines("axisX", {points: [
        new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(this.worldAxisSize, 0, 0), new BABYLON.Vector3(this.worldAxisSize * 0.95, 0.05 * this.worldAxisSize, 0),
        new BABYLON.Vector3(this.worldAxisSize, 0, 0), new BABYLON.Vector3(this.worldAxisSize * 0.95, -0.05 * this.worldAxisSize, 0)
    ]}, this.scene);
    axisX.color = new BABYLON.Color3(1, 0, 0);
    axisX.parent = this.worldAxis;
  
    var xChar = this.makeTextPlane("X", "red", this.worldAxisSize / 10);
    if (xChar !== undefined) {
      xChar.position = new BABYLON.Vector3(0.9 * this.worldAxisSize, -0.05 * this.worldAxisSize, 0);
      xChar.parent = this.worldAxis;
    } 
  
    var axisY = BABYLON.MeshBuilder.CreateLines("axisY", {points: [
        new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, this.worldAxisSize, 0), new BABYLON.Vector3(-0.05 * this.worldAxisSize, this.worldAxisSize * 0.95, 0),
        new BABYLON.Vector3(0, this.worldAxisSize, 0), new BABYLON.Vector3(0.05 * this.worldAxisSize, this.worldAxisSize * 0.95, 0)
    ]}, this.scene);
    axisY.color = new BABYLON.Color3(0, 1, 0);
    axisY.parent = this.worldAxis;
  
    var yChar = this.makeTextPlane("Y", "green", this.worldAxisSize / 10);
    if (yChar !== undefined) {
      yChar.position = new BABYLON.Vector3(-0.05 * this.worldAxisSize, 0.9 * this.worldAxisSize, 0);
      yChar.parent = this.worldAxis;
    }
      
    var axisZ = BABYLON.MeshBuilder.CreateLines("axisZ", { points: [
        new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, 0, this.worldAxisSize), new BABYLON.Vector3(0, -0.05 * this.worldAxisSize, this.worldAxisSize * 0.95),
        new BABYLON.Vector3(0, 0, this.worldAxisSize), new BABYLON.Vector3(0, 0.05 * this.worldAxisSize, this.worldAxisSize * 0.95)
    ]}, this.scene);
    axisZ.color = new BABYLON.Color3(0, 0, 1);
    axisZ.parent = this.worldAxis;
  
    var zChar = this.makeTextPlane("Z", "blue", this.worldAxisSize / 10);
    if (zChar !== undefined) {
      zChar.position = new BABYLON.Vector3(0, 0.05 * this.worldAxisSize, 0.9 * this.worldAxisSize);
      zChar.rotation =  new BABYLON.Vector3(-Math.PI/2, 0, 0);
      zChar.parent = this.worldAxis;
    }
  
    this.worldAxis.position = new BABYLON.Vector3(0, 0, 0);    
  }

  toggleWorldAxis() {
    if (this.worldAxis != undefined) {
      if (this.worldAxis.isEnabled()) {
        this.worldAxis.setEnabled(false);
      } else {
        this.worldAxis.setEnabled(true);
      }
    }
  }


  createUI() {
    if (!this.engine || !this.scene) {
      return;
    }

    // Detect WebXR capability and current state
    this.detectWebXRState();

    // Create UI Scene for overlay elements
    this.uiScene = new BABYLON.Scene(this.engine);
    this.uiScene.autoClearDepthAndStencil = false; 
    this.uiScene.autoClear = false; 
    this.uiScene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    this.uiScene.useRightHandedSystem = false;

    this.uiCamera = new BABYLON.FreeCamera("overlayCamera", new BABYLON.Vector3(0, 0, 0), this.uiScene);
    this.uiCamera.fov = this.camera?.fov || 0.8;

    if (this.isWebXRActive) {
      // Create 3D WebXR UI
      this.create3DUI();
    } else {
      // Create 2D Desktop UI
      this.create2DUI();
    }

    // Create utility layer for gizmos (used by both UI modes)
    this.utilLayer = new BABYLON.UtilityLayerRenderer(this.isWebXRActive ? this.uiScene : this.scene);
    this.utilLayer.utilityLayerScene.autoClearDepthAndStencil = false;
    this.utilLayer.shouldRender = true;
    this.utilLayer.onlyCheckPointerDownEvents = false;

    const gizmoManager = new BABYLON.GizmoManager(this.uiScene, 5, this.utilLayer);
    gizmoManager.usePointerToAttachGizmos = false;
    gizmoManager.positionGizmoEnabled = true;
    gizmoManager.rotationGizmoEnabled = true;
    
    this.createWorldAxis();

    // Sync camera for UI overlay
    if (!this.isWebXRActive) {
      this.scene.onBeforeRenderObservable.add(() => {
        if (this.camera) {
          this.uiCamera?.position.copyFrom(this.camera.position);
          this.uiCamera?.rotation.copyFrom(this.camera.rotation);
        }
      });
    }

    // Set up pointer interaction for selecting joints (works for both UI modes)
    this.setupJointSelection();
  }

  private detectWebXRState(): void {
    // Check if WebXR is available and active
    // This is a simplified check - in a real implementation you'd want more sophisticated detection
    this.isWebXRActive = !!(navigator as any).xr && (this.scene?.getEngine() as any).webXRDefaultExperience?.baseExperience?.sessionManager?.session;
  }

  private create2DUI(): void {
    // Create 2D UI Layer for desktop
    this.UILayer = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
    
    // Create status label for desktop
    this.statusLabel.color = "white";
    this.statusLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.statusLabel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.statusLabel.resizeToFit = true;
    this.statusLabel.outlineColor = "green";
    this.statusLabel.outlineWidth = 2.0;
    this.UILayer.addControl(this.statusLabel);

    // Create hamburger menu system for desktop
    this.createHamburgerMenu();
  }

  private create3DUI(): void {
    // Create 3D UI manager for WebXR
    this.UI3DManager = new GUI3D.GUI3DManager(this.uiScene);
    
    // Create status display for 3D UI
    this.statusHologram = new GUI3D.HolographicButton("statusHologram");
    this.statusHologram.isVisible = false;
    
    // Create status text for 3D UI
    this.status3DText = new GUI3D.TextBlock();
    this.status3DText.text = "";
    this.status3DText.color = "white";
    this.status3DText.fontSize = 14;
    
    this.statusHologram.content = this.status3DText;
    this.statusHologram.position = new BABYLON.Vector3(0, 4, 0);
    
    // Create 3D action menu for WebXR
    this.acitonMenu = new GUI3D.NearMenu("near");
    let follower = this.acitonMenu.defaultBehavior.followBehavior;
    if (follower) {
      //follower.defaultDistance = 5;
      //follower.minimumDistance = 5;
      //follower.maximumDistance = 5;
    }
    
    this.UI3DManager.addControl(this.acitonMenu);

    // Create buttons for circular menu
    const buttonData = [
      { name: "jointAxisButton", text: "Joint Axis", action: () => this.toggleAxisOnRobot(true, this.uiScene, this.utilLayer!) },
      { name: "linkAxisButton", text: "Link Axis", action: () => this.toggleAxisOnRobot(false, this.uiScene, this.utilLayer!) },
      { name: "jointRotationButton", text: "Joint Rotation", action: () => this.toggleAxisRotationOnRobot(true, this.uiScene, this.utilLayer!) },
      { name: "linkRotationButton", text: "Link Rotation", action: () => this.toggleAxisRotationOnRobot(false, this.uiScene, this.utilLayer!) },
      { name: "worldAxisButton", text: "World Axis", action: () => this.toggleWorldAxis() },
      { name: "collisionButton", text: "Collision", action: () => this.toggleCollision() },
      { name: "visualsButton", text: "Visuals", action: () => this.toggleVisuals() },
      { name: "boundingBoxButton", text: "Bounding Box", action: () => this.toggleBoundingBoxes() }
    ];

    buttonData.forEach((bd) => {
      const button = this.create3DButton(bd.name, bd.text, bd.action);
      this.acitonMenu?.addButton(button);
    });

    // Configure menu layout
    this.acitonMenu.rows = buttonData.length / 2;
  }

  private setupJointSelection(): void {
    // Set up pointer interaction for selecting joints
    let that = this;
    
    const pointerDownHandler = function castRay() {
      if (that.scene && that.camera) {
        if (that.selectedVisual) {
          that.selectedVisual.geometry?.meshes?.forEach((m: BABYLON.AbstractMesh) => {
            m.showBoundingBox = false;
          });
          that.selectedVisual = undefined;
        }

        that.clearStatus();

        var ray = that.scene.createPickingRay(that.scene.pointerX, that.scene.pointerY, BABYLON.Matrix.Identity(), that.camera, false);	

        var hit = that.scene.pickWithRay(ray);
        if (hit?.pickedMesh && that.currentRobot) {
          let foundJoint: Joint | undefined;
          
          // Convert Map entries to array and iterate through them safely
          Array.from(that.currentRobot.joints.entries()).forEach(([name, j]) => {
            // Skip fixed joints since they can't be exercised
            if (j.type === JointType.Fixed) return;
            
            if (j.transform) {
              // Check if the picked mesh is a child of this joint's transform
              if (hit?.pickedMesh?.parent === j.transform) {
                foundJoint = j;
                console.log(`Found joint (direct parent): ${j.name}`);
                return; // Exit the forEach early
              }
              
              // If we have a child link, check if the mesh belongs to any visual in that link
              if (j.child && !foundJoint) {
                j.child.visuals.forEach(visual => {
                  if (visual.geometry?.meshes) {
                    visual.geometry.meshes.forEach(mesh => {
                      if (mesh === hit?.pickedMesh) {
                        foundJoint = j;
                        console.log(`Found joint (child link visual): ${j.name}`);
                        return; // Exit inner forEach
                      }
                    });
                  }
                });
              }
            }
          });
          
          // Process the found joint if any
          if (foundJoint) {
            console.log(`Creating gizmo for joint: ${foundJoint.name}`);
            
            // If it's different from the currently selected joint, update the gizmo
            if (foundJoint !== that.hoveredJoint) {
              that.clearJointExerciseGizmos();
              that.hoveredJoint = foundJoint;
              
              // Add the gizmo to the joint using our custom layer
              that.addExerciseGizmoToJoint(foundJoint, that.scene!, that.utilLayer!);
              
              // Update status label with joint info
              if (foundJoint.transform) {
                that.updateJointStatusLabel(foundJoint);
              }
            }
          } else {
            that.hoveredJoint = undefined;
            that.clearJointExerciseGizmos();
            that.clearStatus();
          }
        }
      }
    };
    
    // Apply the handler to the appropriate scene
    if (this.isWebXRActive && this.uiScene) {
      this.uiScene.onPointerDown = pointerDownHandler;
    } else if (this.scene) {
      this.scene.onPointerDown = pointerDownHandler;
    }
  }

  clearGridUnits() {
    this.gridUnitLabels.forEach((label) => {
      label.dispose();
    });
    this.gridUnitLabels = [];
  }

  private createAxisLabels(
    axis: 'x' | 'y' | 'z',
    range: number,
    increment: number,
    unit: string,
    labelSize: number,
    color: string
  ) {
    // Define axis-specific configuration
    const axisConfig = {
      x: {
        start: -range,
        end: range,
        skipOrigin: true,
        getPosition: (value: number) => new BABYLON.Vector3(0, 0, value),
        getRotation: () => new BABYLON.Vector3(-Math.PI/2, 0, 0)
      },
      y: {
        start: -range,
        end: range,
        skipOrigin: true,
        getPosition: (value: number) => new BABYLON.Vector3(-value, 0, 0),
        getRotation: () => new BABYLON.Vector3(-Math.PI/2, Math.PI/2, 0)
      },
      z: {
        start: increment,
        end: range,
        skipOrigin: false,
        getPosition: (value: number) => new BABYLON.Vector3(0, value, 0),
        getRotation: () => new BABYLON.Vector3(0, 0, 0)
      }
    };

    const config = axisConfig[axis];
    
    for (let value = config.start; value <= config.end; value += increment) {
      if (config.skipOrigin && Math.abs(value) < 0.001) continue;
      
      const labelText = unit === "10cm" ? `${Math.round(value * 100)} cm` : 
                       `${Math.round(value)} m`;
      
      const label = this.makeTextPlane(labelText, color, labelSize);
      if (label) {
        label.position = config.getPosition(value);
        label.rotation = config.getRotation();
        this.gridUnitLabels.push(label);
      }
    }
  }

  createGridUnits(unit: string) {
    if (!this.scene) {
      return;
    }

    this.clearGridUnits();
    this.currentGridUnit = unit;

    let increment: number;
    let range: number;
    let labelSize: number;
    
    switch (unit) {
      case "10cm":
        increment = 0.1; // 10cm in meters
        range = 5; // Show up to 5 meters in each direction
        labelSize = 0.1; // Increased size for better visibility
        break;
      case "1m":
      default:
        increment = 1; // 1 meter
        range = 25; // Show up to 25 meters in each direction
        labelSize = 0.3; // Increased size for better visibility
        break;
    }

    // Create labels for all axes using the helper function with maximum brightness colors
    this.createAxisLabels('x', range, increment, unit, labelSize, '#FFAAAA'); // Maximum bright red
    this.createAxisLabels('y', range, increment, unit, labelSize, '#AAFFAA'); // Maximum bright green
    this.createAxisLabels('z', range, increment, unit, labelSize, '#AACCFF'); // Maximum bright blue

    this.gridUnitsVisible = true;
  }

  toggleGridUnits(unit: string) {
    if (this.gridUnitsVisible && this.currentGridUnit === unit) {
      // If current unit is visible, hide it
      this.clearGridUnits();
      this.gridUnitsVisible = false;
    } else {
      // Show the requested unit
      this.createGridUnits(unit);
    }
  }

  toggleEnhancedVisuals() {
    if (!this.scene) return;
    
    this.enhancedVisualsEnabled = !this.enhancedVisualsEnabled;
    
    // Toggle mirror ground visibility
    const mirrorGround = this.scene.getMeshByName("mirrorGround");
    if (mirrorGround) {
      mirrorGround.setEnabled(this.enhancedVisualsEnabled);
    }
    
    // Toggle edge fade effects
    const edgeFade = this.scene.getMeshByName("edgeFade");
    if (edgeFade) {
      edgeFade.setEnabled(this.enhancedVisualsEnabled);
    }
    
    // Toggle background sphere
    const backgroundSphere = this.scene.getMeshByName("backgroundSphere");
    if (backgroundSphere) {
      backgroundSphere.setEnabled(this.enhancedVisualsEnabled);
    }
    
    // Adjust ground material opacity based on enhanced mode
    if (this.ground && this.ground.material instanceof Materials.GridMaterial) {
      this.ground.material.opacity = this.enhancedVisualsEnabled ? 0.6 : 0.8;
    }
    
    // Update mirror reflections when enabling enhanced visuals
    if (this.enhancedVisualsEnabled && this.currentRobot) {
      // Use a small delay to ensure the mirror ground is properly enabled first
      setTimeout(() => {
        this.updateMirrorReflections();
      }, 100);
    }
  }
  
  public async applyURDF(urdfText: string, vscode: any | undefined = undefined) {
    this.clearAxisGizmos();
    this.clearRotationGizmos();
    this.clearJointExerciseGizmos();
    this.clearGridUnits();
    this.clearStatus();

    if (this.currentRobot) {
      var tempR = this.currentRobot;
      this.currentRobot = undefined;
      tempR.dispose();
    }

    if (vscode !== undefined) {
      vscode.postMessage({
        command: "trace",
        text: `loading urdf`,
      });
    }
  

    try {
      if (this.scene) {
        this.currentURDF = urdfText;
        
        // Reset mesh loading tracking and framing flag
        this.meshLoadPromises = [];
        this.pendingMeshLoads = 0;
        this.hasBeenFramed = false;
        
        this.currentRobot = await urdf.deserializeUrdfToRobot(urdfText);
        
        // Count and setup callbacks for mesh loading
        this.currentRobot.links.forEach((link) => {
          link.visuals.forEach((visual) => {
            if (visual.geometry && visual.geometry instanceof Mesh) {
              this.pendingMeshLoads++;
              const meshLoadPromise = new Promise<void>((resolve) => {
                visual.geometry?.setLoadCompleteCallback?.(() => {
                  this.pendingMeshLoads--;
                  resolve();
                  
                  // If all meshes are loaded and this is the first time, frame the model
                  if (this.pendingMeshLoads === 0 && !this.hasBeenFramed) {
                    // Use a small delay to ensure all transforms are updated
                    setTimeout(() => {
                      this.frameModel();
                      // Update mirror reflections after all meshes are loaded and framed
                      this.updateMirrorReflections();
                    }, 100);
                  }
                });
              });
              this.meshLoadPromises.push(meshLoadPromise);
            }
          });
        });
        
        this.currentRobot.create(this.scene);
        
        // Update mirror reflections with robot meshes (with delay to ensure meshes are ready)
        setTimeout(() => {
          this.updateMirrorReflections();
        }, 50);
        
        // If there are no meshes to load, frame immediately (for primitive geometries only)
        if (this.pendingMeshLoads === 0 && !this.hasBeenFramed) {
          setTimeout(() => {
            this.frameModel();
            this.updateMirrorReflections(); // Update again after framing
          }, 100);
        }
      }
    } catch (err: any) {

      if (vscode === undefined) {
        console.error(`Error loading urdf: ${err.message}`);
      } else {
          vscode.postMessage({
          command: "error",
          text: err.message,
        });
      }

      return;
    } 

    if (vscode !== undefined) {
        vscode.postMessage({
        command: "trace",
        text: `loaded urdf`,
      });
    }
  }

  /**
   * Takes a screenshot of the scene without UI elements and returns it as a base64 encoded PNG string
   * @param width Optional width for the screenshot. If not provided, uses current canvas width
   * @param height Optional height for the screenshot. If not provided, uses current canvas height
   * @returns Promise<string> Base64 encoded PNG data string
   */
  public async takeScreenshot(width?: number, height?: number): Promise<string> {
    if (!this.scene || !this.engine || !this.camera) {
      throw new Error("Scene, engine, or camera not initialized");
    }

    // Store current layer visibility states
    const utilLayerWasVisible = this.utilLayer?.shouldRender ?? false;
    const gizmoLayerWasVisible = this.gizmoLayer?.shouldRender ?? false;

    try {
      // Hide utility and gizmo layers only
      if (this.utilLayer) {
        this.utilLayer.shouldRender = false;
      }
      if (this.gizmoLayer) {
        this.gizmoLayer.shouldRender = false;
      }

      // Get canvas dimensions for defaults
      const canvas = this.engine.getRenderingCanvas();
      const targetWidth = width || canvas?.width || 1024;
      const targetHeight = height || canvas?.height || 1024;

      // Use Babylon.JS's render target screenshot API
      return new Promise<string>((resolve, reject) => {
        this.scene!.executeWhenReady(() => {
          try {
            BABYLON.Tools.CreateScreenshotUsingRenderTarget(
              this.engine!,
              this.camera!,
              { width: targetWidth, height: targetHeight },
              (data: string) => {
                // Return just the base64 data part (without the data:image/png;base64, prefix)
                resolve(data.split(',')[1]);
              },
              'image/png',
              1, // samples
              false // antialiasing
            );
          } catch (error) {
            reject(error);
          }
        });
      });

    } finally {
      // Restore layer visibility states
      if (this.utilLayer) {
        this.utilLayer.shouldRender = utilLayerWasVisible;
      }
      if (this.gizmoLayer) {
        this.gizmoLayer.shouldRender = gizmoLayerWasVisible;
      }
    }
  }

  /**
   * Automatically frame the camera to show the entire robot model
   */
  private frameModel(): void {
    if (!this.scene || !this.camera || !this.currentRobot) {
      return;
    }

    // Get all meshes in the scene (excluding ground, world axis, etc.)
    const robotMeshes: BABYLON.AbstractMesh[] = [];
    
    // Collect all meshes from robot links
    this.currentRobot.links.forEach((link) => {
      link.visuals.forEach((visual) => {
        if (visual.geometry && visual.geometry.meshes) {
          robotMeshes.push(...visual.geometry.meshes);
        }
      });
    });

    if (robotMeshes.length === 0) {
      return;
    }

    // Calculate the bounding box of all robot meshes
    let min = new BABYLON.Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
    let max = new BABYLON.Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

    robotMeshes.forEach((mesh) => {
      const boundingInfo = mesh.getBoundingInfo();
      const meshMin = boundingInfo.boundingBox.minimumWorld;
      const meshMax = boundingInfo.boundingBox.maximumWorld;
      
      min = BABYLON.Vector3.Minimize(min, meshMin);
      max = BABYLON.Vector3.Maximize(max, meshMax);
    });

    // Calculate the center and size of the bounding box
    const center = BABYLON.Vector3.Center(min, max);
    const size = max.subtract(min);
    const maxDimension = Math.max(size.x, size.y, size.z);

    // Set camera target to the center of the model
    this.camera.setTarget(center);

    // Calculate appropriate camera distance
    // Use a factor to ensure the entire model is visible with some padding
    const distance = maxDimension * 1.5;
    this.camera.radius = Math.max(distance, 1); // Minimum radius of 1

    // Keep the same viewing angles but ensure good framing
    // You can adjust these angles if needed
    this.camera.alpha = -Math.PI / 3;
    this.camera.beta = 5 * Math.PI / 12;
    
    // Save the framing information for resetCamera()
    this.savedFramingTarget = center.clone();
    this.savedFramingRadius = this.camera.radius;
    this.savedFramingAlpha = this.camera.alpha;
    this.savedFramingBeta = this.camera.beta;
    
    this.hasBeenFramed = true;
  }

  /**
   * Takes a screenshot of the scene without UI elements and returns it as a data URL
   * @param width Optional width for the screenshot. If not provided, uses current canvas width
   * @param height Optional height for the screenshot. If not provided, uses current canvas height
   * @returns Promise<string> Data URL string (data:image/png;base64,...)
   */
  public async takeScreenshotDataURL(width?: number, height?: number): Promise<string> {
    const base64Data = await this.takeScreenshot(width, height);
    return `data:image/png;base64,${base64Data}`;
  }

  /**
   * Creates enhanced lighting system for better visual quality
   */
  private createEnhancedLighting(): void {
    if (!this.scene) return;

    // Main directional light (sun-like)
    const directionalLight = new BABYLON.DirectionalLight("directionalLight", new BABYLON.Vector3(-1, -1, -1), this.scene);
    directionalLight.position = new BABYLON.Vector3(20, 20, 20);
    directionalLight.intensity = 1.0;

    // Ambient hemispheric light for soft fill
    const hemisphericLight = new BABYLON.HemisphericLight("hemisphericLight", new BABYLON.Vector3(0, 1, 0), this.scene);
    hemisphericLight.intensity = 0.4;

    // Subtle accent lights for depth
    const accentLight1 = new BABYLON.HemisphericLight("accentLight1", new BABYLON.Vector3(1, 0.5, 0), this.scene);
    accentLight1.intensity = 0.2;
    accentLight1.diffuse = new BABYLON.Color3(1, 0.9, 0.8);

    const accentLight2 = new BABYLON.HemisphericLight("accentLight2", new BABYLON.Vector3(-0.5, 0, 1), this.scene);
    accentLight2.intensity = 0.15;
    accentLight2.diffuse = new BABYLON.Color3(0.8, 0.9, 1);
  }

  /**
   * Creates enhanced ground with improved mirroring and visual effects
   */
  private createEnhancedGround(): void {
    if (!this.scene) return;

    // Create main ground plane
    this.ground = BABYLON.MeshBuilder.CreateGround("ground", {width: 100, height: 100}, this.scene);
    this.ground.isPickable = false;

    // Enhanced grid material with better visual properties
    const groundMaterial = new Materials.GridMaterial("groundMaterial", this.scene);
    groundMaterial.majorUnitFrequency = 10;
    groundMaterial.minorUnitVisibility = 0.3;
    groundMaterial.gridRatio = 1;
    groundMaterial.opacity = 0.6;
    groundMaterial.useMaxLine = true;
    
    // Dynamic grid colors based on distance
    const primaryColor = new BABYLON.Color3(0.2, 0.8, 0.3); // Brighter green
    const secondaryColor = new BABYLON.Color3(0.1, 0.4, 0.15); // Darker green
    
    groundMaterial.lineColor = primaryColor;
    groundMaterial.mainColor = secondaryColor;
    
    this.ground.material = groundMaterial;

    // Create enhanced mirror ground for reflections
    const mirrorGround = BABYLON.MeshBuilder.CreateGround("mirrorGround", {width: 100, height: 100}, this.scene);
    mirrorGround.position.y = -0.01; // Slightly below main ground
    mirrorGround.isPickable = false;

    // Mirror material with subtle, blurred reflection
    const mirrorMaterial = new BABYLON.StandardMaterial("mirrorMaterial", this.scene);
    this.mirrorTexture = new BABYLON.MirrorTexture("mirrorTexture", 256, this.scene, true); // Lower resolution for softer look
    
    // Standard ground reflection plane
    this.mirrorTexture.mirrorPlane = new BABYLON.Plane(0, -1, 0, 0);
    this.mirrorTexture.renderList = []; // Will be populated with robot meshes later
    
    // Add blur effect to the mirror texture
    this.mirrorTexture.blurKernel = 32; // Blur the reflection for softer appearance
    
    mirrorMaterial.reflectionTexture = this.mirrorTexture;
    mirrorMaterial.reflectionTexture.level = 0.5; // Much lower reflection strength for subtlety
    mirrorMaterial.alpha = 0.5; // More transparent
    mirrorMaterial.diffuseColor = new BABYLON.Color3(0.05, 0.1, 0.05); // Slightly tinted dark green
    
    // Add some roughness to further soften the reflection
    mirrorMaterial.roughness = 0.5;
    mirrorMaterial.backFaceCulling = false;
    
    mirrorGround.material = mirrorMaterial;

    // Create edge fade effect
    this.createGroundEdgeEffects();
  }

  /**
   * Creates fade-out effects at the edges of the ground
   */
  private createGroundEdgeEffects(): void {
    if (!this.scene) return;

    // Create edge fade planes
    const edgeSize = 100;
    const fadeHeight = 0.1;
    
    // Create fade material
    const fadeMaterial = new BABYLON.StandardMaterial("fadeMaterial", this.scene);
    fadeMaterial.diffuseColor = new BABYLON.Color3(0.05, 0.2, 0.08);
    fadeMaterial.alpha = 0.3;
    fadeMaterial.alphaMode = BABYLON.Engine.ALPHA_PREMULTIPLIED;
    
    // Create dynamic texture for gradient effect
    const fadeTexture = new BABYLON.DynamicTexture("fadeTexture", {width: 512, height: 512}, this.scene);
    const fadeContext = fadeTexture.getContext();
    
    // Create radial gradient
    const gradient = fadeContext.createRadialGradient(256, 256, 0, 256, 256, 256);
    gradient.addColorStop(0, "rgba(5, 50, 20, 0)");
    gradient.addColorStop(0.7, "rgba(5, 50, 20, 0)");
    gradient.addColorStop(0.9, "rgba(5, 50, 20, 0.3)");
    gradient.addColorStop(1, "rgba(5, 50, 20, 0.8)");
    
    fadeContext.fillStyle = gradient;
    fadeContext.fillRect(0, 0, 512, 512);
    fadeTexture.update();
    
    fadeMaterial.diffuseTexture = fadeTexture;
    
    // Create edge fade plane
    const edgeFade = BABYLON.MeshBuilder.CreateGround("edgeFade", {width: edgeSize * 1.2, height: edgeSize * 1.2}, this.scene);
    edgeFade.position.y = 0.005;
    edgeFade.material = fadeMaterial;
    edgeFade.isPickable = false;
  }

  /**
   * Creates enhanced background with gradient and atmosphere
   */
  private createEnhancedBackground(): void {
    if (!this.scene) return;

    // Create gradient background
    const backgroundSphere = BABYLON.MeshBuilder.CreateSphere("backgroundSphere", {diameter: 500}, this.scene);
    const backgroundMaterial = new BABYLON.StandardMaterial("backgroundMaterial", this.scene);
    
    // Create dynamic gradient texture
    const gradientTexture = new BABYLON.DynamicTexture("gradientTexture", {width: 512, height: 512}, this.scene);
    const gradientContext = gradientTexture.getContext();
    
    // Create vertical gradient from dark at bottom to lighter at top
    const backgroundGradient = gradientContext.createLinearGradient(0, 0, 0, 512);
    backgroundGradient.addColorStop(0, "#0a0a0a"); // Very dark at top
    backgroundGradient.addColorStop(0.3, "#1a1a1a"); // Dark
    backgroundGradient.addColorStop(0.7, "#2a2a2a"); // Medium dark
    backgroundGradient.addColorStop(1, "#3a3a3a"); // Lighter at bottom
    
    gradientContext.fillStyle = backgroundGradient;
    gradientContext.fillRect(0, 0, 512, 512);
    gradientTexture.update();
    
    backgroundMaterial.diffuseTexture = gradientTexture;
    backgroundMaterial.disableLighting = true;
    backgroundMaterial.backFaceCulling = false;
    
    backgroundSphere.material = backgroundMaterial;
    backgroundSphere.isPickable = false;
    backgroundSphere.infiniteDistance = true;
  }

  /**
   * Updates the mirror reflections to include current robot meshes
   */
  private updateMirrorReflections(): void {
    if (!this.scene || !this.currentRobot || !this.mirrorTexture) {
      return;
    }
    
    // Clear existing render list
    this.mirrorTexture.renderList = [];
    let meshCount = 0;
    
    // Method 1: Add robot meshes via the robot's link structure
    let linkIndex = 0;
    this.currentRobot.links.forEach((link, linkName) => {
      link.visuals.forEach((visual, visualIndex) => {
        if (visual.geometry && visual.geometry.meshes) {
          visual.geometry.meshes.forEach((mesh, meshIndex) => {
            this.mirrorTexture!.renderList!.push(mesh);
            meshCount++;
          });
        }
      });
      linkIndex++;
    });
    
    // Method 2: Also try to find all meshes by searching the scene
    // This is a fallback in case the robot structure doesn't capture everything
    const allMeshes = this.scene.meshes.filter(mesh => 
      mesh.name !== "ground" && 
      mesh.name !== "mirrorGround" &&
      mesh.name !== "edgeFade" &&
      mesh.name !== "backgroundSphere" &&
      // Exclude world axis meshes - they should not be mirrored as they are reference coordinates
      mesh.name !== "axisX" &&
      mesh.name !== "axisY" &&
      mesh.name !== "axisZ" &&
      !mesh.name.startsWith("TextPlane") && // Exclude axis labels
      mesh.isVisible &&
      // Additional check: exclude any mesh that's a child of the world axis
      (!this.worldAxis || !this.isChildOfWorldAxis(mesh))
    );
    
    allMeshes.forEach(mesh => {
      if (!this.mirrorTexture!.renderList!.includes(mesh)) {
        this.mirrorTexture!.renderList!.push(mesh);
        meshCount++;
      }
    });
    
  }

  /**
   * Helper method to check if a mesh is a child of the world axis
   */
  private isChildOfWorldAxis(mesh: BABYLON.AbstractMesh): boolean {
    if (!this.worldAxis) return false;
    
    let parent = mesh.parent;
    while (parent) {
      if (parent === this.worldAxis) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }

  /**
   * Public method to manually refresh mirror reflections (for debugging)
   */
  public refreshMirror(): void {
    console.log("Manually refreshing mirror...");
    this.updateMirrorReflections();
  }

  public async createScene(canvas: HTMLCanvasElement) {
    let e: any = new BABYLON.Engine(canvas, true); // Generate the BABYLON 3D engine
    this.engine = e;

    this.scene = new BABYLON.Scene(e);
    if (BABYLON.SceneLoader) {
      //Add this loader into the register plugin
      BABYLON.SceneLoader.RegisterPlugin(new ColladaFileLoader.DAEFileLoader());
    }

    // Enhanced scene setup with improved visual effects
    this.scene.useRightHandedSystem = true;
    
    // Create sophisticated lighting setup
    this.createEnhancedLighting();
    
    // Create custom ground with enhanced mirroring and effects
    this.createEnhancedGround();
    
    // Set up camera with improved settings
    this.camera = new BABYLON.ArcRotateCamera("camera1", - Math.PI / 3, 5 * Math.PI / 12, 1, new BABYLON.Vector3(0, 0, 0), this.scene);
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.minZ = 0.05;
    this.camera.maxZ = 1000;
    this.camera.attachControl(canvas, true);
    
    // Enhanced scene background with gradient
    this.createEnhancedBackground();
  }
}


