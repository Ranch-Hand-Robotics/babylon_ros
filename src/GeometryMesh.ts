/*
 * Copyright (c) 2025 Lou Amadio and Ranch Hand Robotics, LLC
 * All rights reserved.
 */

import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';
import { IGeometry } from "./IGeometry";
import { Material } from "./Material";
import path from 'path';
import { readFileSync } from 'fs';

export class Mesh implements IGeometry {
    public uri: string = "";
    public scale: BABYLON.Vector3 = new BABYLON.Vector3(1.0, 1.0, 1.0);

    public meshes: BABYLON.AbstractMesh[] | undefined = undefined;
    public transform : BABYLON.TransformNode | undefined = undefined;
    public material : Material | undefined = undefined;
    public skeletons : BABYLON.Skeleton[] | undefined = undefined;
    private ext: string = "";
    private name: string = "mesh";
    private forcedExtension: string | undefined;
    private onLoadComplete?: () => void;
    private onLoadProgress?: (event: BABYLON.ISceneLoaderProgressEvent) => void;

    private normalizeExtension(ext: string | undefined): string {
        if (!ext) {
            return '';
        }

        const trimmed = ext.trim();
        if (!trimmed) {
            return '';
        }

        return trimmed.startsWith('.') ? trimmed.toLowerCase() : `.${trimmed.toLowerCase()}`;
    }

    private extensionFromUri(uri: string): string {
        const cleanUri = uri.split('#')[0].split('?')[0];
        const slash = cleanUri.lastIndexOf('/');
        const dot = cleanUri.lastIndexOf('.');

        if (dot > slash && dot >= 0) {
            return this.normalizeExtension(cleanUri.substring(dot));
        }

        return '';
    }

    private inferMimeType(ext: string): string {
        switch (ext) {
            case '.glb':
                return 'model/gltf-binary';
            case '.gltf':
                return 'model/gltf+json';
            case '.stl':
                return 'model/stl';
            case '.obj':
                return 'text/plain';
            case '.dae':
                return 'model/vnd.collada+xml';
            default:
                return 'application/octet-stream';
        }
    }

    private encodeBase64(input: string): string {
        // Browser webview path
        if (typeof btoa === 'function') {
            const bytes = new TextEncoder().encode(input);
            let binary = '';
            bytes.forEach((b) => {
                binary += String.fromCharCode(b);
            });
            return btoa(binary);
        }

        // Node/test path
        return Buffer.from(input, 'utf8').toString('base64');
    }

    private normalizeAsciiStl(content: string): string {
        // Some test and generated files include comment/header lines before `solid`.
        // Babylon STL loader can mis-detect these as binary STL.
        const solidIndex = content.search(/^\s*solid\b/im);
        if (solidIndex <= 0) {
            return content;
        }

        return content.slice(solidIndex);
    }

    private looksLikeAsciiStl(content: string): boolean {
        const hasSolid = /^\s*solid\b/im.test(content);
        const hasFacet = /\bfacet\s+normal\b/i.test(content);
        return hasSolid && hasFacet;
    }

    private async retryLoadAsAsciiStl(scene: BABYLON.Scene): Promise<void> {
        try {
            const response = await fetch(this.uri);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const stlText = await response.text();
            const normalizedStl = this.normalizeAsciiStl(stlText);

            if (!this.looksLikeAsciiStl(normalizedStl)) {
                throw new Error('Fallback only applies to ASCII STL content');
            }

            const meshData = this.encodeBase64(normalizedStl);

            BABYLON.SceneLoader.ImportMesh(
                null,
                '',
                'data:;base64,' + meshData,
                scene,
                (mesh, ps, sk, ag, tn, g, l, sm) => { this.meshCallback(scene, mesh, ps, sk, ag, tn, g, l, sm); },
                this.onLoadProgress,
                null,
                '.stl'
            );
        } catch {
            // Do not throw from fallback path; primary load already reported errors.
            if (this.onLoadComplete) {
                this.onLoadComplete();
            }
        }
    }

    constructor(uri: string, scale: BABYLON.Vector3, forcedExtension?: string) {
        this.uri = uri;
        this.scale = scale;
        this.forcedExtension = forcedExtension;
    }
    
    public setLoadCompleteCallback(callback: () => void): void {
        this.onLoadComplete = callback;
    }
    
    public setLoadProgressCallback(callback: (event: BABYLON.ISceneLoaderProgressEvent) => void): void {
        this.onLoadProgress = callback;
    }
    
    private meshCallback(scene: BABYLON.Scene, meshes : BABYLON.AbstractMesh[], particleSystems : BABYLON.IParticleSystem[] | undefined, skeletons : BABYLON.Skeleton[] | undefined, animationGroups: BABYLON.AnimationGroup[], transformNodes: BABYLON.TransformNode[], geometries: BABYLON.Geometry[], lights: BABYLON.Light[], spriteManagers: BABYLON.ISpriteManager[]) {
        // Get a pointer to the mesh
        if (meshes.length > 0 && this.transform != undefined) {
            this.meshes = meshes;
            if (this.transform != undefined) {
                const rootTransform = this.transform;
                const rootTransformNodes = transformNodes.filter(tn => !tn.parent);
                rootTransformNodes.forEach((tn) => {
                    tn.parent = rootTransform;
                });

                // Some loaders (notably GLB) can return root meshes without root transform nodes.
                // Parent those mesh roots so this.transform scaling/rotation is always applied.
                if (rootTransformNodes.length === 0) {
                    this.meshes.forEach((m) => {
                        if (!m.parent) {
                            m.parent = rootTransform;
                        }
                    });
                }

                if (this.ext.toLowerCase().indexOf('.glb') !== -1) {
                    this.meshes.forEach(m => {
                        if (this.transform != undefined) {
                            m.parent = this.transform;
                        }
                    });
                } else if (this.ext.toLowerCase().indexOf('.stl') !== -1) {
                    this.meshes.forEach(m => {
                        if (this.transform != undefined) {
                            m.addRotation(0, 0, Math.PI).addRotation(Math.PI/2, 0, 0);
                            // Invert the left handed mesh to conform to the right handed coodinate system
                            m.scaling = new BABYLON.Vector3(-1, 1, 1);
                            m.parent = this.transform;
                            
                            if (this.material != undefined && this.material.material != undefined) {
                                m.material = this.material.material;
                            }
                        }
                    });                
                } else if (this.ext.toLowerCase().indexOf('.obj') !== -1) {
                    this.meshes.forEach(m => {
                        if (this.transform != undefined) {
                            m.parent = this.transform;
                            
                            // For OBJ files, preserve materials from MTL file if they exist
                            // Only override if URDF material is explicitly defined
                            if (this.material != undefined && this.material.material != undefined) {
                                m.material = this.material.material;
                            } else if (m.material) {
                                // Enhance existing MTL materials for better appearance
                                const mat = m.material as BABYLON.StandardMaterial;
                                if (mat) {
                                    // Ensure proper lighting response
                                    if (!mat.diffuseColor || (mat.diffuseColor.r === 0 && mat.diffuseColor.g === 0 && mat.diffuseColor.b === 0)) {
                                        mat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
                                    }
                                    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Subtle specularity
                                    mat.backFaceCulling = true; // Normal culling for clean look
                                }
                            }
                        }
                    });
                } else if (this.ext.toLowerCase().indexOf('.3mf') !== -1) {
                    this.meshes.forEach(m => {
                        if (this.transform != undefined) {
                            m.parent = this.transform;
                            if (this.material != undefined && this.material.material != undefined) {
                                m.material = this.material.material;
                            }
                        }
                    });
                } 

                // Ensure transforms are up-to-date after dynamic reparenting/scaling.
                // Without this, world bounds can remain stale for the first frames,
                // making imported models (especially GLB) appear at incorrect scale.
                this.transform.computeWorldMatrix(true);
                rootTransformNodes.forEach((tn) => {
                    tn.computeWorldMatrix(true);
                });
                this.meshes.forEach((m) => {
                    m.computeWorldMatrix(true);
                    m.refreshBoundingInfo({});
                });
            }
        }
        
        // Call the load complete callback if set
        if (this.onLoadComplete) {
            this.onLoadComplete();
        }
    }


    public create(scene: BABYLON.Scene, mat : Material | undefined) : void {
        this.material = mat ?? this.material;

        if (this.uri.startsWith("file://"))
        {
            // Handle relative paths
            var filePath = this.uri.substring(7); 
            if (!filePath.startsWith("/")) {
                filePath = path.join(__dirname, filePath);
            }
            this.ext = filePath.substring(filePath.lastIndexOf('.'));
            if (this.forcedExtension) {
                this.ext = this.forcedExtension;
            }
            this.ext = this.normalizeExtension(this.ext);
            this.name = path.basename(filePath, this.ext);
            var meshdata = readFileSync(filePath).toString('base64');
            const mimeType = this.inferMimeType(this.ext);

            this.transform = new BABYLON.TransformNode(`mesh_${this.name}`, scene);
            this.transform.scaling = this.scale;

            // Force the file to be read as base64 encoded data blob
            BABYLON.SceneLoader.ImportMesh(
                null, 
                "", 
                `data:${mimeType};base64,` + meshdata, 
                scene, 
                (mesh, ps, sk, ag, tn, g, l, sm) => {this.meshCallback(scene, mesh, ps, sk, ag, tn, g, l,sm)}, 
                this.onLoadProgress, 
                null, 
                this.ext
            );
        } else {
            const cleanUri = this.uri.split('#')[0].split('?')[0];
            let filename = cleanUri.substring(cleanUri.lastIndexOf('/') + 1);
            if (filename) {
                let base = this.uri.substring(0, this.uri.lastIndexOf('/') + 1);
                this.ext = this.extensionFromUri(this.uri);
                if (this.forcedExtension) {
                    this.ext = this.forcedExtension;
                }
                this.ext = this.normalizeExtension(this.ext);
                this.name = filename.substring(0, filename.lastIndexOf('.'));
                this.transform = new BABYLON.TransformNode(`mesh_${this.name}`, scene);
                this.transform.scaling = this.scale;

                const isStl = this.ext.toLowerCase().indexOf('.stl') !== -1;
                BABYLON.SceneLoader.ImportMesh(
                    null, 
                    base, 
                    this.uri.substring(this.uri.lastIndexOf('/') + 1), 
                    scene, 
                    (mesh, ps, sk, ag, tn, g, l, sm) => {this.meshCallback(scene, mesh, ps, sk, ag, tn, g, l, sm)},
                    this.onLoadProgress,
                    isStl ? (() => { this.retryLoadAsAsciiStl(scene); }) : undefined,
                    this.ext || undefined
                );
            }
        }
    }

    public dispose(): void {
        if (this.skeletons != undefined) {
            this.skeletons.forEach(s => {
                s.bones.forEach(b => {
                    b.getChildMeshes().forEach(m => {
                        m.dispose();
                    });
                });
                
                s.dispose();
            });
        }

        if (this.meshes != undefined) {
            this.meshes.forEach(m => {
                m.dispose();
            });
        }
        this.transform?.dispose();
    }
}