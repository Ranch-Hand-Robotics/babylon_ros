/*
 * Copyright (c) 2025 Lou Amadio and Ranch Hand Robotics, LLC
 * All rights reserved.
 */

import * as BABYLON from 'babylonjs';
import * as Materials from 'babylonjs-materials';
import * as urdf from './urdf';
import {Robot} from './Robot';
import {Joint} from './Joint';
import {Link} from './Link';
import {Visual} from './Visual';
import { RobotScene } from './RobotScene';

import * as GUI from 'babylonjs-gui';
import * as GUI3D from 'babylonjs-gui';
import * as ColladaFileLoader from '@polyhobbyist/babylon-collada-loader';

let currentRobotScene : RobotScene | undefined = undefined;

// Test menu state variables for 2D UI
let testMenuButton: GUI.Button | undefined = undefined;
let testMenuPanel: GUI.StackPanel | undefined = undefined;
let testMenuScrollViewer: GUI.ScrollViewer | undefined = undefined;
let isTestMenuExpanded: boolean = false;
let testMenuContainer: GUI.Rectangle | undefined = undefined;

// Test menu variables for 3D UI
let testWristMenu: GUI3D.NearMenu | undefined = undefined;

function createTestMenuButton(name: string, text: string, onClick: () => void): GUI.Button {
  const button = GUI.Button.CreateSimpleButton(name, text);
  button.widthInPixels = 200;
  button.heightInPixels = 28;
  button.color = "white";
  button.cornerRadius = 4;
  button.background = "rgba(0, 120, 215, 0.8)";
  button.fontSize = "11px";
  button.paddingTopInPixels = 3;
  button.paddingBottomInPixels = 3;
  button.onPointerUpObservable.add(onClick);
  return button;
}

function createTestGroupHeader(text: string): GUI.TextBlock {
  const header = new GUI.TextBlock();
  header.text = text;
  header.color = "white";
  header.fontSize = "14px";
  header.fontWeight = "bold";
  header.heightInPixels = 25;
  header.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  header.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  return header;
}

function createTestGroupSeparator(): GUI.Rectangle {
  const separator = new GUI.Rectangle();
  separator.widthInPixels = 160;
  separator.heightInPixels = 1;
  separator.color = "rgba(255, 255, 255, 0.3)";
  separator.background = "rgba(255, 255, 255, 0.3)";
  separator.thickness = 0;
  return separator;
}

function toggleTestMenu() {
  isTestMenuExpanded = !isTestMenuExpanded;
  
  if (testMenuContainer) {
    testMenuContainer.isVisible = isTestMenuExpanded;
  }
  
  // Update hamburger button text
  if (testMenuButton) {
    testMenuButton.textBlock!.text = isTestMenuExpanded ? "✕" : "Tests";
  }
}

function addTestToRobotScene(robotScene : RobotScene) {
  // Detect UI mode based on RobotScene state
  const isWebXR = robotScene.UI3DManager !== undefined;
  
  if (isWebXR) {
    // Create 3D WebXR test interface with wrist menu
    createWebXRTestInterface(robotScene);
  } else {
    // Create 2D desktop test interface
    createDesktopTestInterface(robotScene);
  }
}

function createDesktopTestInterface(robotScene: RobotScene) {
  if (!robotScene.UILayer) {
    return;
  }

  // Create hamburger-style test menu button
  testMenuButton = GUI.Button.CreateSimpleButton("testMenuButton", "Tests");
  testMenuButton.widthInPixels = 60;
  testMenuButton.heightInPixels = 40;
  testMenuButton.color = "white";
  testMenuButton.cornerRadius = 5;
  testMenuButton.background = "rgba(0, 0, 0, 0.8)";
  testMenuButton.fontSize = "12px";
  testMenuButton.fontWeight = "bold";
  testMenuButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  testMenuButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  testMenuButton.leftInPixels = -10;
  testMenuButton.topInPixels = 10;
  
  testMenuButton.onPointerUpObservable.add(() => {
    toggleTestMenu();
  });
  
  robotScene.UILayer.addControl(testMenuButton);

  // Create menu panel container
  testMenuContainer = new GUI.Rectangle("testMenuContainer");
  testMenuContainer.widthInPixels = 250;
  testMenuContainer.height = "80%";
  testMenuContainer.cornerRadius = 8;
  testMenuContainer.color = "white";
  testMenuContainer.thickness = 2;
  testMenuContainer.background = "rgba(0, 0, 0, 0.9)";
  testMenuContainer.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  testMenuContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  testMenuContainer.leftInPixels = -10;
  testMenuContainer.isVisible = false;
  
  robotScene.UILayer.addControl(testMenuContainer);

  // Create scroll viewer for the menu
  testMenuScrollViewer = new GUI.ScrollViewer("testMenuScrollViewer");
  testMenuScrollViewer.thickness = 0;
  testMenuScrollViewer.color = "transparent";
  testMenuScrollViewer.background = "transparent";
  testMenuScrollViewer.widthInPixels = 240;
  testMenuScrollViewer.height = "95%";
  testMenuScrollViewer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  
  testMenuContainer.addControl(testMenuScrollViewer);

  // Create the menu panel (vertical stack)
  testMenuPanel = new GUI.StackPanel("testMenuPanel");
  testMenuPanel.isVertical = true;
  testMenuPanel.spacing = 3;
  testMenuPanel.paddingTopInPixels = 10;
  testMenuPanel.paddingBottomInPixels = 10;
  testMenuPanel.paddingLeftInPixels = 10;
  testMenuPanel.paddingRightInPixels = 10;
  
  testMenuScrollViewer.addControl(testMenuPanel);

  addDesktopTestButtons(robotScene);
}

function createWebXRTestInterface(robotScene: RobotScene) {
  if (!robotScene.UI3DManager) {
    return;
  }

  // Create wrist menu for WebXR - use the existing actionMenu structure
  if (robotScene.actionMenu) {
    addWebXRTestButtons(robotScene, robotScene.actionMenu);
  }
}

function addDesktopTestButtons(robotScene: RobotScene) {
  if (!testMenuPanel) return;

  // Test data - combine both lists for comprehensive coverage
  const testList = [ 
    {name: "Basic", text: "Basic", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic.urdf"},
    {name: "Basic Joint", text: "Basic Joint", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_joint.urdf"},
    {name: "Basic Revolute Joint", text: "Basic Revolute Joint", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_joint_with_effort.urdf"},
    {name: "Planar Joint", text: "Planar Joint", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_joint_planar.urdf"},
    {name: "Prismatic Joint", text: "Prismatic Joint", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_joint_prismatic.urdf"},
    {name: "Basic Material", text: "Basic Material", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_material.urdf"},
    {name: "Basic Remote Mesh", text: "Basic Remote Mesh", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_remote_mesh.urdf"},
    {name: "Basic with STL", text: "Basic with STL", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_stl_mesh.urdf"},
    {name: "Orientation", text: "Orientation", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/orientation.urdf"},
    {name: "Bad URDF", text: "Bad URDF", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/bad.urdf"},
    {name: "DAE Test", text: "DAE Test", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/leo_chassis.urdf"},
    {name: "Leo Rover", text: "Leo Rover", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/leo.urdf"},
    {name: "BB", text: "BB", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/bb.urdf"},
    {name: "Motoman", text: "Motoman", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/motoman.urdf"},
    {name: "Arti Robot", text: "Arti Robot", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/arti.urdf"},
    {name: "Mule", text: "Mule", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/mule.urdf"},
    {name: "Inline Example", text: "Inline Example", url: ""},
  ];

  const robotTestList = [ 
    {name: "leo", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/leo.urdf"},
    {name: "BB", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/bb.urdf"},
    {name: "Motoman", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/motoman.urdf"},
    {name: "Arti Robot", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/arti.urdf"},
    {name: "Mule", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/mule.urdf"},
    {name: "Inline Example", url: ""},
  ];

  // Add Basic Tests group
  const basicTestsHeader = createTestGroupHeader("Basic Tests");
  testMenuPanel.addControl(basicTestsHeader);
  
  const basicTestsSeparator = createTestGroupSeparator();
  testMenuPanel.addControl(basicTestsSeparator);

  testList.forEach((t) => {
    const button = createTestMenuButton(t.name, t.name, async () => {
      toggleTestMenu(); // Close menu after selection
      await loadURDF(robotScene, t.url);
    });
    if (testMenuPanel) {
      testMenuPanel.addControl(button);
    }
  });


}

function addWebXRTestButtons(robotScene: RobotScene, wristMenu: GUI3D.HandMenu) {
  const testList = [ 
    {name: "Basic", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic.urdf"},
    {name: "Basic Joint", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_joint.urdf"},
    {name: "Basic Revolute", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_joint_with_effort.urdf"},
    {name: "Planar Joint", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_joint_planar.urdf"},
    {name: "Prismatic Joint", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_joint_prismatic.urdf"},
    {name: "With Material", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_material.urdf"},
    {name: "Remote Mesh", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_remote_mesh.urdf"},
    {name: "STL Mesh", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/basic_with_stl_mesh.urdf"},
    {name: "Leo Robot", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/leo.urdf"},
    {name: "Motoman", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/motoman.urdf"},
    {name: "Mule Robot", url: "https://raw.githubusercontent.com/Ranch-Hand-Robotics/babylon_ros/main/test/testdata/mule.urdf"},
    {name: "Inline Example", url: ""},
  ];

  // Create wrist menu buttons
  testList.forEach((t) => {
    const button = new GUI3D.TouchHolographicButton(t.name);
    const buttonText = new GUI3D.TextBlock();
    buttonText.text = t.name;
    buttonText.color = "white";
    buttonText.fontSize = 10;
    button.content = buttonText;
    
    // Make buttons smaller for wrist menu
    button.scaling = new BABYLON.Vector3(0.7, 0.7, 0.7);
    
    button.onPointerUpObservable.add(async () => {
      await loadURDF(robotScene, t.url, t.name === "Inline Example");
    });
    
    wristMenu.addButton(button);
  });

  // Configure wrist menu layout for better organization
  wristMenu.rows = Math.ceil(testList.length / 3);
}

async function loadURDF(robotScene: RobotScene, url: string, useInline: boolean = false) {
  try {
    let urdfText: string;
    
    if (useInline) {
      // Inline URDF example
      urdfText = `<?xml version="1.0"?>
<robot name="planar_joint_example">
  <!-- Base Link -->
  <link name="base_link">
    <visual>
      <geometry>
        <box size="0.25 0.25 0.1"/>
      </geometry>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <material name="blue">
        <color rgba="0 0 1 1"/>
      </material>
    </visual>
    <collision>
      <geometry>
        <box size="0.5 0.5 0.1"/>
      </geometry>
      <origin xyz="0 0 0" rpy="0 0 0"/>
    </collision>
    <inertial>
      <mass value="1.0"/>
      <inertia ixx="0.01" ixy="0.0" ixz="0.0" iyy="0.01" iyz="0.0" izz="0.01"/>
    </inertial>
  </link>

  <!-- Moving Link -->
  <link name="moving_link">
    <visual>
      <geometry>
        <cylinder radius="0.05" length="0.2"/>
      </geometry>
      <origin xyz="0 0 0.1" rpy="0 0 0"/>
      <material name="red">
        <color rgba="1 0 0 1"/>
      </material>
    </visual>
    <collision>
      <geometry>
        <cylinder radius="0.05" length="0.2"/>
      </geometry>
      <origin xyz="0 0 0.1" rpy="0 0 0"/>
    </collision>
    <inertial>
      <mass value="0.5"/>
      <inertia ixx="0.005" ixy="0.0" ixz="0.0" iyy="0.005" iyz="0.0" izz="0.005"/>
    </inertial>
  </link>

  <!-- Prismatic Joint -->
  <joint name="prismatic_joint" type="prismatic">
    <parent link="base_link"/>
    <child link="moving_link"/>
    <origin xyz="0 0 0.05" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit effort="1000" velocity="1.0" lower="-0.25" upper="0.25"/>
  </joint>
</robot>`;
    } else {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      urdfText = await response.text();
    }
    
    await robotScene.applyURDF(urdfText);
  } catch (error) {
    console.error(`Failed to load URDF: ${error}`);
  }
}

// Main function that gets executed once the webview DOM loads
export async function RenderTestMain() {
  const canvas = document.getElementById("renderCanvas");
  const canvasElement = canvas as unknown as HTMLCanvasElement;

  currentRobotScene = new RobotScene();
  currentRobotScene.createScene(canvasElement);
  if (currentRobotScene.scene === undefined || currentRobotScene.engine === undefined) {
    return;
  }

  //currentRobotScene.scene.debugLayer.show();
  addTestToRobotScene(currentRobotScene);

  currentRobotScene.engine.runRenderLoop(function () {
    if (currentRobotScene !== undefined && currentRobotScene.scene !== undefined && currentRobotScene.uiScene !== undefined) {
      // Update the scene
      currentRobotScene.scene.render();
      currentRobotScene.uiScene.render();
    }
  });
  
  currentRobotScene.engine.resize();
  
  window.addEventListener("resize", function () {
    if (currentRobotScene !== undefined && currentRobotScene.engine !== undefined) {
      currentRobotScene.engine.resize();
    }
  });  
}
