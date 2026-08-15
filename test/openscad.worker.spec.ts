import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  convertOpenSCADWithNodeWorker,
  isOpenSCADNodeWorkerAvailable,
} from '../src/openscad';

describe('OpenSCAD Node worker include resolution', () => {
  test(
    'resolves nested relative includes from subdirectories',
    async () => {
      if (!isOpenSCADNodeWorkerAvailable()) {
        // Build output not present in some lightweight test contexts.
        return;
      }

      const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), 'openscad-worker-subdir-'),
      );

      try {
        const subDir = path.join(tempRoot, 'sub');
        const nestedDir = path.join(subDir, 'nested');
        await fs.mkdir(nestedDir, { recursive: true });

        await fs.writeFile(
          path.join(nestedDir, 'inner.scad'),
          'module inner_part() { sphere(1); }\n',
          'utf8',
        );

        await fs.writeFile(
          path.join(subDir, 'outer.scad'),
          'use <nested/inner.scad>\nmodule outer_part() { inner_part(); }\n',
          'utf8',
        );

        const mainPath = path.join(tempRoot, 'main.scad');
        await fs.writeFile(
          mainPath,
          'use <sub/outer.scad>\nouter_part();\n',
          'utf8',
        );

        const outputPath = await convertOpenSCADWithNodeWorker(
          mainPath,
          undefined,
          {
            timeout: 120000,
            outputFormat: 'stl',
            workspaceRoot: tempRoot,
            configuredLibraryPaths: [],
          },
        );

        expect(outputPath).toBeTruthy();

        if (!outputPath) {
          return;
        }

        const stat = await fs.stat(outputPath);
        expect(stat.size).toBeGreaterThan(0);
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
      }
    },
    180000,
  );
});
