import { convertOpenSCAD } from '../src/openscad';

describe('browser conversion lifecycle (actual TypeScript API)', () => {
  let worker: any;
  const request = { scadContent: 'cube(1);', filename: 'model.scad', timeout: 120000 };
  beforeEach(() => {
    jest.useFakeTimers();
    worker = { postMessage: jest.fn(), terminate: jest.fn() };
    (globalThis as any).Worker = jest.fn(() => worker);
    URL.createObjectURL = jest.fn(() => 'blob:test');
    URL.revokeObjectURL = jest.fn();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete (globalThis as any).Worker;
  });
  const message = (data: object) => worker.onmessage({ data });

  test('optional progress forwards stages without settling; success cleans up', async () => {
    const progress = jest.fn();
    const result = convertOpenSCAD(request, undefined, { onProgress: progress });
    expect(progress.mock.calls.map(args => args[0])).toEqual([
      'Creating OpenSCAD worker', 'Starting OpenSCAD worker',
    ]);
    message({ success: true, progress: 'Initializing OpenSCAD WASM...' });
    expect(progress).toHaveBeenLastCalledWith('Initializing OpenSCAD WASM...');
    expect(worker.terminate).not.toHaveBeenCalled();
    const output = { success: true, outputData: new Uint8Array([1]) };
    message(output);
    await expect(result).resolves.toEqual(output);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(worker.onmessage).toBeNull();
  });

  test('old two-argument API works and inline worker URL is released', async () => {
    const result = convertOpenSCAD(request, 'self.onmessage = () => {};');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    message({ success: true });
    await expect(result).resolves.toEqual({ success: true });
  });

  test('observer exceptions are logged, not fatal', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = convertOpenSCAD(request, undefined, {
      onProgress: () => { throw new Error('host bug'); },
    });
    message({ success: true, progress: 'Loading fonts' });
    message({ success: true });
    await expect(result).resolves.toEqual({ success: true });
    expect(warning).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['timeout', 'failure', 'error', 'messageerror', 'postMessage'])
  ('%s terminates the worker and rejects with stage context', async failure => {
    if (failure === 'postMessage') worker.postMessage.mockImplementation(() => {
      throw new Error('DataCloneError');
    });
    const result = convertOpenSCAD(request);
    const rejected = expect(result).rejects.toThrow(/stage: /);
    if (failure !== 'postMessage') {
      message({ success: true, progress: 'Loading OpenSCAD fonts...' });
      if (failure === 'timeout') {
        const lateMessage = worker.onmessage;
        jest.advanceTimersByTime(120000);
        lateMessage({ data: { success: true } });
      }
      if (failure === 'failure') message({ success: false, error: 'bad SCAD' });
      if (failure === 'error') worker.onerror({ message: 'NetworkError' });
      if (failure === 'messageerror') worker.onmessageerror();
    }
    await rejected;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('timeout error identifies the last observed stage', async () => {
    const result = convertOpenSCAD(request);
    const rejected = expect(result).rejects.toThrow(
      'timed out after 120000ms (stage: Initializing OpenSCAD WASM...)');
    message({ success: true, progress: 'Initializing OpenSCAD WASM...' });
    jest.advanceTimersByTime(120000);
    await rejected;
  });

  test('worker construction failure also releases inline URL', async () => {
    (globalThis.Worker as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('CSP blocked worker');
    });
    await expect(convertOpenSCAD(request, 'script')).rejects.toThrow('CSP blocked worker');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(jest.getTimerCount()).toBe(0);
  });
});