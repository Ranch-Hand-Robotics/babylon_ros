import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type WebpackConfig */
const webConfig = {
    entry: './src/ros.ts',
    output: {
        path: path.resolve(__dirname, 'web'),
        filename: 'ros.js',
        library: {
            type: 'module' // Changed from 'umd' to 'module' for ESM
        },
        environment: {
            module: true // Enable outputting ESM
        },
        chunkFormat: 'module' // Use ESM for chunks
    },
    experiments: {
        outputModule: true // Enable ESM output
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.mjs'],
        extensionAlias: {
            '.js': ['.ts', '.js'],
            '.mjs': ['.mts', '.mjs']
        },
        fallback: {
            // Webpack 5 no longer polyfills Node.js core modules automatically.
            "stream": 'stream-browserify',
            "timers": 'timers-browserify'
        }
    },
    module: {
        rules: [{
            test: /\.tsx?$/,
            exclude: /node_modules/,
            use: [{
                loader: 'ts-loader',
            }]
        }, {
            // Process node_modules source maps when available
            test: /\.js$/,
            include: /node_modules/,
            use: ['source-map-loader'],
            enforce: 'pre'
        }]
    },
    // Don't fail on missing source maps from dependencies
    ignoreWarnings: [
        { 
            module: /node_modules/, 
            message: /source-map-loader/ 
        }
    ]
};

const appConfig = {
    ...webConfig,
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'ros.js',
        library: {
            type: 'module' // Changed from 'umd' to 'module' for ESM
        },
        environment: {
            module: true // Enable outputting ESM
        },
        chunkFormat: 'module' // Use ESM for chunks
    },
    externals: {
        // Updated externals to use ESM format
        'babylonjs': 'babylon',
        'babylonjs-materials': 'babylonMaterials',
        'babylonjs-gui': 'babylonGUI'
    }
};

export default [webConfig, appConfig];
