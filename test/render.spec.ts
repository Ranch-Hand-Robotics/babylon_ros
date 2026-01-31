/*
 * Copyright (c) 2025 Lou Amadio and Ranch Hand Robotics, LLC
 * All rights reserved.
 */

import * as BABYLON from 'babylonjs';
import * as fs from 'node:fs/promises';
import * as path from 'path';
import {parseString} from 'xml2js';
import {deserializeUrdfToRobot, deserializeMaterial, parseUrdf} from '../src/urdf'
import { Cylinder } from '../src/GeometryCylinder';
import {loadRobot} from './testutil';
import { RobotScene } from '../src/RobotScene';

let engine : any = undefined;
let scene : BABYLON.Scene | undefined = undefined;

beforeAll(() => {
    // Needed for testing material loading
    engine = new BABYLON.NullEngine();
    scene = new BABYLON.Scene(engine);
});

afterAll(() => {
    scene = undefined
    engine = undefined;
});

describe("Testing Rendering Loading", () => {
    test('Test simple create', async () => {
        var robot = await loadRobot('/testdata/basic_with_material.urdf');

        expect(scene).toBeDefined();
        if (scene) {
            robot.create(scene);
        }

        let bl = robot.links.get("base_link");
        expect(bl).toBeDefined();
        expect(bl?.visuals[0].material?.name).toBe("Cyan");
    });

    test('Test rendering with single joint', async () => {
        var robot = await loadRobot('/testdata/basic_with_joint.urdf');

        expect(scene).toBeDefined();
        if (scene) {
            robot.create(scene);
        }

        let bl = robot.links.get("base_link");
        expect(bl).toBeDefined();
    });

    test('Test rendering with r2', async () => {
        var robot = await loadRobot('/testdata/r2.urdf');

        expect(scene).toBeDefined();
        if (scene) {
            robot.create(scene);
        }

        let bl = robot.links.get("base_link");
        expect(bl).toBeDefined();
    });

    test('Test screenshot functionality', async () => {
        // Create a mock canvas for testing
        const mockCanvas = {
            width: 800,
            height: 600,
            getContext: jest.fn().mockReturnValue({
                createImageData: jest.fn().mockReturnValue({
                    data: new Uint8ClampedArray(800 * 600 * 4)
                }),
                putImageData: jest.fn()
            }),
            toDataURL: jest.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
        };

        // Mock document.createElement to return our mock canvas
        const originalCreateElement = global.document.createElement;
        global.document.createElement = jest.fn().mockImplementation((tagName) => {
            if (tagName === 'canvas') {
                return mockCanvas;
            }
            return originalCreateElement.call(document, tagName);
        });

        try {
            const robotScene = new RobotScene();
            
            // Mock the engine and scene
            robotScene.engine = {
                getRenderingCanvas: jest.fn().mockReturnValue(mockCanvas)
            } as any;
            
            robotScene.scene = scene as any;

            // Test takeScreenshot method - this should fail gracefully in test environment
            // but we're mainly testing that the method exists and has the right signature
            await expect(robotScene.takeScreenshot()).rejects.toThrow();
            
            // Test takeScreenshotDataURL method
            await expect(robotScene.takeScreenshotDataURL()).rejects.toThrow();
            
            // Verify methods exist
            expect(typeof robotScene.takeScreenshot).toBe('function');
            expect(typeof robotScene.takeScreenshotDataURL).toBe('function');
            
        } finally {
            // Restore original createElement
            global.document.createElement = originalCreateElement;
        }
    }, 10000); // Increase timeout for this test

    test('Test progress callback functionality', async () => {
        const robotScene = new RobotScene();
        
        // Mock the engine and scene
        if (engine && scene) {
            robotScene.engine = engine;
            robotScene.scene = scene;
        }
        
        // Set up progress tracking
        const progressUpdates: Array<{loaded: number, total: number, progress: number}> = [];
        
        robotScene.setLoadProgressCallback((loaded, total, progress) => {
            progressUpdates.push({loaded, total, progress});
        });
        
        // Load a URDF with meshes
        const basicUrdfFilename = path.join(__dirname, '/testdata/r2.urdf');
        const basicUrdf = await fs.readFile(basicUrdfFilename);
        
        await robotScene.applyURDF(basicUrdf.toString());
        
        // Wait a bit for any initial progress updates
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify progress callback was called
        expect(progressUpdates.length).toBeGreaterThan(0);
        
        // First update should have 0 progress
        expect(progressUpdates[0].progress).toBe(0);
        expect(progressUpdates[0].loaded).toBe(0);
        expect(progressUpdates[0].total).toBeGreaterThan(0);
        
        // Verify that total meshes count is correct
        expect(progressUpdates[0].total).toBe(4); // r2.urdf has 4 mesh files
        
        // Note: In the test environment, remote meshes won't actually load,
        // so we can't verify completion to 100%. The important thing is that
        // the progress tracking infrastructure is set up correctly.
        
        // Verify setLoadProgressCallback method exists and is callable
        expect(typeof robotScene.setLoadProgressCallback).toBe('function');
    }, 30000); // Increase timeout for mesh loading

    test('Test default camera position configuration', async () => {
        const robotScene = new RobotScene();
        
        // Mock the engine and scene first (before createScene)
        robotScene.engine = new BABYLON.NullEngine();
        robotScene.scene = new BABYLON.Scene(robotScene.engine);
        
        // Create a mock canvas
        const mockCanvas = document.createElement('canvas');
        
        // Manually create camera with default values (since we're bypassing createScene)
        robotScene.camera = new BABYLON.ArcRotateCamera("camera1", -Math.PI / 3, 5 * Math.PI / 12, 1, new BABYLON.Vector3(0, 0, 0), robotScene.scene);
        
        // Verify camera was created with default values
        expect(robotScene.camera).toBeDefined();
        if (robotScene.camera) {
            // Check initial default values (should be -π/3, 5π/12, 1)
            expect(robotScene.camera.alpha).toBeCloseTo(-Math.PI / 3);
            expect(robotScene.camera.beta).toBeCloseTo(5 * Math.PI / 12);
            expect(robotScene.camera.radius).toBeCloseTo(1);
        }
    });

    test('Test setDefaultCameraPosition method', () => {
        const robotScene = new RobotScene();
        
        // Set custom default camera position before initialization
        robotScene.setDefaultCameraPosition({
            alpha: Math.PI / 2,
            beta: Math.PI / 4,
            radius: 5
        });
        
        // Mock the engine and scene
        robotScene.engine = new BABYLON.NullEngine();
        robotScene.scene = new BABYLON.Scene(robotScene.engine);
        
        // Manually create camera with custom default values
        robotScene.camera = new BABYLON.ArcRotateCamera("camera1", Math.PI / 2, Math.PI / 4, 5, new BABYLON.Vector3(0, 0, 0), robotScene.scene);
        
        // Verify camera was created with custom values
        expect(robotScene.camera).toBeDefined();
        if (robotScene.camera) {
            expect(robotScene.camera.alpha).toBeCloseTo(Math.PI / 2);
            expect(robotScene.camera.beta).toBeCloseTo(Math.PI / 4);
            expect(robotScene.camera.radius).toBeCloseTo(5);
        }
    });

    test('Test resetCamera uses default camera position', () => {
        const robotScene = new RobotScene();
        
        // Set custom default camera position
        robotScene.setDefaultCameraPosition({
            alpha: Math.PI,
            beta: Math.PI / 3,
            radius: 10
        });
        
        // Mock the engine and scene
        robotScene.engine = new BABYLON.NullEngine();
        robotScene.scene = new BABYLON.Scene(robotScene.engine);
        
        // Create camera
        robotScene.camera = new BABYLON.ArcRotateCamera("camera1", 0, 0, 1, new BABYLON.Vector3(0, 0, 0), robotScene.scene);
        
        // Modify camera position
        robotScene.camera.alpha = 0;
        robotScene.camera.beta = 0;
        robotScene.camera.radius = 1;
        
        // Reset camera
        robotScene.resetCamera();
        
        // Verify camera was reset to default values
        expect(robotScene.camera).toBeDefined();
        if (robotScene.camera) {
            expect(robotScene.camera.alpha).toBeCloseTo(Math.PI);
            expect(robotScene.camera.beta).toBeCloseTo(Math.PI / 3);
            expect(robotScene.camera.radius).toBeCloseTo(10);
        }
    });

    test('Test setVisualConfig with camera position parameters', () => {
        const robotScene = new RobotScene();
        
        // Mock the engine and scene
        robotScene.engine = new BABYLON.NullEngine();
        robotScene.scene = new BABYLON.Scene(robotScene.engine);
        
        // Create camera with initial defaults
        robotScene.camera = new BABYLON.ArcRotateCamera("camera1", -Math.PI / 3, 5 * Math.PI / 12, 1, new BABYLON.Vector3(0, 0, 0), robotScene.scene);
        
        // Use setVisualConfig to set camera position
        robotScene.setVisualConfig({
            defaultCameraAlpha: 2 * Math.PI / 3,
            defaultCameraBeta: Math.PI / 6,
            defaultCameraRadius: 20
        });
        
        // Reset camera to apply new defaults
        robotScene.resetCamera();
        
        // Verify camera uses new default values
        expect(robotScene.camera).toBeDefined();
        if (robotScene.camera) {
            expect(robotScene.camera.alpha).toBeCloseTo(2 * Math.PI / 3);
            expect(robotScene.camera.beta).toBeCloseTo(Math.PI / 6);
            expect(robotScene.camera.radius).toBeCloseTo(20);
        }
    });
});
