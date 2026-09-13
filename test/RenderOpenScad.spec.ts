// Exercise the actual viewer + GeometryMesh TS; mock only conversion and scene
// infrastructure so GLB loader completion/errors can be controlled separately.
jest.mock('../src/openscad', () => ({ convertOpenSCAD: jest.fn() }));
jest.mock('babylonjs-loaders', () => ({}));
jest.mock('babylonjs', () => ({
  Vector3: class { constructor(public x: number, public y: number, public z: number) {} },
  Color4: class {},
  TransformNode: class {
    scaling: unknown;
    computeWorldMatrix() {}
    dispose() {}
  },
  SceneLoader: { ImportMesh: jest.fn() },
}));
jest.mock('../src/RobotScene', () => ({
  RobotScene: class {
    scene = {};
    currentRobot: unknown;
    async createScene() {}
    createUI() {}
    frameModel = jest.fn();
  },
}));
jest.mock('../src/Material', () => ({ Material: class {} }));
jest.mock('../src/Visual', () => ({ Visual: class {} }));
jest.mock('../src/Link', () => ({ Link: class { visuals: any[] = []; } }));
jest.mock('../src/Robot', () => ({
  Robot: class {
    links = new Map();
    create(scene: unknown) {
      this.links.get('base_link').visuals[0].geometry.create(scene);
    }
    dispose() { this.links.get('base_link').visuals[0].geometry.dispose(); }
  },
}));

import { RenderOpenScadDirect, RenderOpenScadMain } from '../src/RenderOpenScad';
import { convertOpenSCAD } from '../src/openscad';
import { SceneLoader } from 'babylonjs';

const convert = convertOpenSCAD as jest.Mock;
const imports = SceneLoader.ImportMesh as jest.Mock;
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const source = '/* [Deck] */\nbays = 3;\ncube(1);';
const output = { success: true, outputData: new Uint8Array([1]) };
function loaded(index = imports.mock.calls.length - 1) {
  const mesh = { parent: null, computeWorldMatrix() {}, refreshBoundingInfo() {}, dispose: jest.fn() };
  imports.mock.calls[index][4]([mesh], [], [], [], [], [], [], []);
  return mesh;
}

describe('direct viewer promises and preview safety', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    convert.mockReset().mockResolvedValue(output);
    imports.mockReset();
    document.body.innerHTML = '';
    URL.createObjectURL = jest.fn(() => 'blob:test');
    URL.revokeObjectURL = jest.fn();
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
  const viewer = () => RenderOpenScadDirect({ canvas: document.createElement('canvas') });

  test('loadModelData and setConfiguration wait for GLB, not just conversion', async () => {
    const api = await viewer();
    let ready = false;
    const initial = api.loadModelData(source, 'model').then(() => { ready = true; });
    await tick();
    expect(ready).toBe(false);
    jest.advanceTimersByTime(1000);
    await tick();
    expect(ready).toBe(false);
    const oldMesh = loaded();
    await initial;
    ready = false;
    const update = api.setConfiguration({ bays: 4 }).then(() => { ready = true; });
    await tick();
    expect(ready).toBe(false);
    expect(oldMesh.dispose).not.toHaveBeenCalled();
    expect(convert.mock.calls[1][0].parameterOverrides).toEqual({ bays: 4 });
    loaded();
    await update;
    expect(oldMesh.dispose).toHaveBeenCalledTimes(1);
  });

  test('direct load, configuration and explicit preview propagate conversion failure', async () => {
    const api = await viewer();
    convert.mockRejectedValue(new Error('Expected worker failure'));
    await expect(api.loadModelData(source, 'model')).rejects.toThrow('Expected worker failure');
    await expect(api.setConfiguration({ bays: 4 })).rejects.toThrow('Expected worker failure');
    await expect(api.convertAndPreview()).rejects.toThrow('Expected worker failure');
    expect(imports).not.toHaveBeenCalled();
  });

  test('GLB errors reject and preserve the old preview; empty loads also reject', async () => {
    const api = await viewer();
    const initial = api.loadModelData(source, 'model');
    await tick();
    const oldMesh = loaded();
    await initial;
    (URL.revokeObjectURL as jest.Mock).mockClear();
    const update = api.setConfiguration({ bays: 4 });
    const rejected = expect(update).rejects.toThrow('Invalid GLB');
    await tick();
    imports.mock.calls[1][6](null, 'Invalid GLB');
    await rejected;
    expect(oldMesh.dispose).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    const empty = api.convertAndPreview();
    const noMeshes = expect(empty).rejects.toThrow('no meshes');
    await tick();
    imports.mock.calls[2][4]([], [], [], [], [], [], [], []);
    await noMeshes;
  });

  test('older conversion cannot replace a newer successful render', async () => {
    const api = await viewer();
    let resolveOld!: (value: typeof output) => void;
    convert.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const old = api.loadModelData(source, 'model');
    const rejected = expect(old).rejects.toThrow('superseded');
    const current = api.setConfiguration({ bays: 4 });
    await tick();
    const currentMesh = loaded();
    await current;
    resolveOld(output);
    await rejected;
    expect(imports).toHaveBeenCalledTimes(1);
    expect(currentMesh.dispose).not.toHaveBeenCalled();
  });

  test('older GLB completion is disposed, not installed or framed', async () => {
    const api = await viewer();
    const old = api.loadModelData(source, 'model');
    const rejected = expect(old).rejects.toThrow('superseded');
    await tick();
    const current = api.setConfiguration({ bays: 4 });
    await tick();
    const currentMesh = loaded(1);
    await current;
    const oldMesh = loaded(0);
    await rejected;
    expect(oldMesh.dispose).toHaveBeenCalled();
    expect(currentMesh.dispose).not.toHaveBeenCalled();
  });

  test('options pass timeout and progress; warning and observer errors are logged', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const progress = jest.fn(() => { throw new Error('host observer'); });
    const api = await RenderOpenScadDirect({ canvas: document.createElement('canvas'),
      conversionTimeout: 120000, onConversionProgress: progress });
    const result = api.loadModelData(source, 'model');
    expect(convert.mock.calls[0][0].timeout).toBe(120000);
    convert.mock.calls[0][2].onProgress('WARNING: missing preview import');
    await tick();
    loaded();
    await result;
    expect(progress).toHaveBeenCalledWith('Loading GLB preview...');
    expect(warning).toHaveBeenCalled();
  });

  test('standalone click and host command failures are caught', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<canvas id="renderCanvas"></canvas><button id="convertButton"></button>';
    window.modelViewerHost = { modelData: source, autoConvertOnLoad: false };
    await RenderOpenScadMain();
    convert.mockRejectedValue(new Error('worker failed'));
    document.getElementById('convertButton')!.click();
    window.dispatchEvent(new MessageEvent('message', { data: {
      source: 'babylon_ros.host', command: 'applyConfiguration', configuration: { bays: 4 },
    } }));
    await tick();
    expect(errorLog).toHaveBeenCalledTimes(2);
    delete window.modelViewerHost;
  });
});