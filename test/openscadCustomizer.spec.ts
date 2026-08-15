import {
  createOpenSCADParameterProfile,
  parseOpenSCADParameterProfile,
} from '../src/openscadCustomizer';

describe('OpenSCAD parameter profiles', () => {
  test('creates a native OpenSCAD parameter file', () => {
    expect(createOpenSCADParameterProfile({ width: 12, enabled: true })).toEqual({
      fileFormatVersion: '1',
      parameterSets: {
        Default: { width: 12, enabled: true },
      },
    });
  });

  test('parses profiles with multiple parameter sets', () => {
    const profile = parseOpenSCADParameterProfile(JSON.stringify({
      fileFormatVersion: '1',
      parameterSets: {
        Draft: { quality: 8 },
        Final: { quality: 64, size: [10, 20, 30] },
      },
    }));

    expect(profile.parameterSets.Final).toEqual({ quality: 64, size: [10, 20, 30] });
  });

  test('rejects unsupported parameter values', () => {
    expect(() => parseOpenSCADParameterProfile(JSON.stringify({
      fileFormatVersion: '1',
      parameterSets: { Default: { nested: { value: 1 } } },
    }))).toThrow(/unsupported value/i);
  });
});