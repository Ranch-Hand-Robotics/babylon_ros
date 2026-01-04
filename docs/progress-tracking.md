# Progress Tracking

When loading URDF files with meshes from disk or the network, it can take several seconds depending on the size and number of assets. Babylon ROS provides a progress tracking API that allows you to display a loading progress bar or other user feedback during asset loading.

## Overview

The `RobotScene` class provides a `setLoadProgressCallback` method that allows you to register a callback function that will be called periodically during mesh loading with progress updates.

## API

```typescript
setLoadProgressCallback(callback: (loaded: number, total: number, progress: number) => void): void
```

### Parameters

- `callback`: A function that receives three parameters:
  - `loaded`: Number of meshes that have completed loading
  - `total`: Total number of meshes to load
  - `progress`: Overall loading progress as a percentage (0-100)

## Usage Example

### Basic Progress Bar

```typescript
import { RobotScene } from '@ranchhandrobotics/babylon_ros';

// Create your robot scene
const robotScene = new RobotScene();
await robotScene.createScene(canvas);

// Set up the progress callback before loading the URDF
robotScene.setLoadProgressCallback((loaded, total, progress) => {
    console.log(`Loading: ${loaded}/${total} meshes (${progress.toFixed(1)}%)`);
    
    // Update your progress bar UI
    updateProgressBar(progress);
});

// Load the URDF - progress updates will be called automatically
const urdfText = await fetch('path/to/robot.urdf').then(r => r.text());
await robotScene.applyURDF(urdfText);
```

### HTML Progress Bar Example

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        #progress-container {
            width: 100%;
            background-color: #f0f0f0;
            border-radius: 5px;
            margin: 20px 0;
            display: none;
        }
        
        #progress-bar {
            width: 0%;
            height: 30px;
            background-color: #4CAF50;
            border-radius: 5px;
            text-align: center;
            line-height: 30px;
            color: white;
            transition: width 0.3s ease;
        }
        
        #loading-text {
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <canvas id="renderCanvas"></canvas>
    
    <div id="progress-container">
        <div id="progress-bar">0%</div>
    </div>
    <div id="loading-text"></div>
    
    <script src="./ros.js"></script>
    <script>
        const progressContainer = document.getElementById('progress-container');
        const progressBar = document.getElementById('progress-bar');
        const loadingText = document.getElementById('loading-text');
        
        async function loadRobot() {
            const canvas = document.getElementById('renderCanvas');
            const robotScene = new babylon_ros.RobotScene();
            await robotScene.createScene(canvas);
            
            // Show progress bar
            progressContainer.style.display = 'block';
            
            // Set up progress tracking
            robotScene.setLoadProgressCallback((loaded, total, progress) => {
                // Update progress bar
                progressBar.style.width = progress + '%';
                progressBar.textContent = Math.round(progress) + '%';
                
                // Update loading text
                loadingText.textContent = `Loading meshes: ${loaded}/${total}`;
                
                // Hide progress bar when complete
                if (progress >= 100) {
                    setTimeout(() => {
                        progressContainer.style.display = 'none';
                        loadingText.textContent = 'Loading complete!';
                    }, 500);
                }
            });
            
            // Load your URDF
            const urdfResponse = await fetch('path/to/robot.urdf');
            const urdfText = await urdfResponse.text();
            await robotScene.applyURDF(urdfText);
        }
        
        window.addEventListener('load', loadRobot);
    </script>
</body>
</html>
```

### React Example

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { RobotScene } from '@ranchhandrobotics/babylon_ros';

function RobotViewer() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loadProgress, setLoadProgress] = useState(0);
    const [loadingInfo, setLoadingInfo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        const loadRobot = async () => {
            if (!canvasRef.current) return;
            
            setIsLoading(true);
            const robotScene = new RobotScene();
            await robotScene.createScene(canvasRef.current);
            
            // Set up progress tracking
            robotScene.setLoadProgressCallback((loaded, total, progress) => {
                setLoadProgress(progress);
                setLoadingInfo(`Loading meshes: ${loaded}/${total}`);
                
                if (progress >= 100) {
                    setTimeout(() => {
                        setIsLoading(false);
                    }, 500);
                }
            });
            
            // Load URDF
            const urdfResponse = await fetch('/path/to/robot.urdf');
            const urdfText = await urdfResponse.text();
            await robotScene.applyURDF(urdfText);
        };
        
        loadRobot();
    }, []);
    
    return (
        <div>
            <canvas ref={canvasRef} style={{ width: '100%', height: '600px' }} />
            
            {isLoading && (
                <div style={{ width: '100%', marginTop: '20px' }}>
                    <div style={{ 
                        width: '100%', 
                        backgroundColor: '#f0f0f0', 
                        borderRadius: '5px' 
                    }}>
                        <div style={{ 
                            width: `${loadProgress}%`, 
                            height: '30px', 
                            backgroundColor: '#4CAF50',
                            borderRadius: '5px',
                            textAlign: 'center',
                            lineHeight: '30px',
                            color: 'white',
                            transition: 'width 0.3s ease'
                        }}>
                            {Math.round(loadProgress)}%
                        </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>{loadingInfo}</div>
                </div>
            )}
        </div>
    );
}

export default RobotViewer;
```

## Notes

- The progress callback is optional. If not set, mesh loading will proceed silently.
- Progress updates are based on both the number of meshes loaded and the download progress of each individual mesh.
- The callback will be called multiple times during loading as progress is made.
- When `progress` reaches 100, all meshes have been fully loaded.
- The callback is particularly useful for URDFs with large mesh files or when loading from slow network connections.

## See Also

- [API Overview](api-overview.md)
- [URDF Loading](urdf.md)
