const path = require("path");
const CopyWebpackPlugin = require('copy-webpack-plugin');
const fs = require('fs');

// Resolve openscad-wasm build directory
const openscadBuildDir = path.resolve(__dirname, 'openscad-wasm-build', 'build');

// Verify openscad.js exists
function getOpenSCADPath() {
  if (fs.existsSync(path.join(openscadBuildDir, 'openscad.js'))) {
    return path.join(openscadBuildDir, 'openscad.js');
  }
  // Fallback: if the build directory doesn't exist, we'll handle it gracefully
  console.warn('⚠️  openscad-wasm-build not found. Run "npm run download-openscad" first.');
  return null;
}

const openscadPath = getOpenSCADPath();

// Create copy patterns for webpack
const copyPatterns = openscadPath ? [
  {
    from: openscadBuildDir,
    to: 'openscad-wasm-build/dist',
    globOptions: {
      ignore: ['**/version.json'] // Don't copy metadata
    }
  }
] : [];

/** @type WebpackConfig */
const webConfig = {
    entry: './src/ros.ts',
    output: {
        path: path.resolve(__dirname, 'web'),
        filename: 'ros.js',
        globalObject: 'this',
        library: {
            name: 'babylon_ros',
            type: 'umd'
        }
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
        fallback: {
            // Webpack 5 no longer polyfills Node.js core modules automatically.
            // see https://webpack.js.org/configuration/resolve/#resolvefallback
            // for the list of Node.js core module polyfills.
            "stream": require.resolve("stream-browserify"),
        "timers": require.resolve("timers-browserify"),
        "url": false
        }
    },
    devtool: 'source-map',
    plugins: copyPatterns.length > 0 ? [
        new CopyWebpackPlugin({
            patterns: copyPatterns
        })
    ] : [],
    module: {
        rules: [{
            test: /\.tsx?$/,
            exclude: /node_modules/,
            use: [{
                loader: 'ts-loader',
            }]
    
        }]
    }
}

const appConfig = {
    ...webConfig,
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'ros.js',
        globalObject: 'this',
        library: {
            name: 'babylon_ros',
            type: 'umd'
        }
    },    
    externals: {
        babylonjs: {
            commonjs: 'babylonjs',
            commonjs2: 'babylonjs',
            amd: 'babylonjs',
            root: '_'
        },
    }
}

const nodeWorkerConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/workers/openscadWorker.ts',
  output: {
    path: path.resolve(__dirname, 'dist/workers'),
    filename: 'openscadWorker.node.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'source-map',
  infrastructureLogging: {
    level: "log",
  },
};

const browserWorkerConfig = {
  target: 'webworker',
  mode: 'none',
  entry: './src/workers/openscadWorker.ts',
  output: {
    path: path.resolve(__dirname, 'dist/workers'),
    filename: 'openscadWorker.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      fs: false,
      path: false,
      url: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'source-map',
  infrastructureLogging: {
    level: "log",
  },
};

const nodeOpenSCADUtilsConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/openscad.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'openscad.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  devtool: 'source-map',
  infrastructureLogging: {
    level: "log",
  },
};

module.exports = [webConfig, appConfig, nodeWorkerConfig, browserWorkerConfig, nodeOpenSCADUtilsConfig]
