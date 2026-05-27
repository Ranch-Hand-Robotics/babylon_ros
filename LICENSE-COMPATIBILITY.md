# License Compatibility and Compliance Guide

## Overview

`babylon_ros` uses a mixed-license distribution model:

- Core library code is distributed under the MIT License.
- OpenSCAD runtime artifacts downloaded from `openscad-wasm` are GPL-2.0-or-later.

This guide summarizes practical redistribution considerations for those combined artifacts.

## Core Package License

The primary `babylon_ros` source is MIT-licensed (see `LICENSE`).

## OpenSCAD Runtime Components

When OpenSCAD support is built/downloaded, runtime files are included from:

- Repository: https://github.com/Ranch-Hand-Robotics/openscad-wasm
- License: GPL-2.0-or-later
- Typical files: `openscad.js`, `openscad.wasm.js`, `openscad.wasm`, `openscad.fonts.js`

## Redistribution Guidance

### If you distribute MIT-only outputs

If your distribution does **not** include OpenSCAD runtime artifacts, MIT obligations apply to what you distribute.

### If you distribute outputs including OpenSCAD runtime artifacts

If your package/bundle includes OpenSCAD runtime artifacts, GPL-2.0-or-later obligations apply to that distribution, including preserving notices and providing access to corresponding source as required by GPL.

## Source Availability

Relevant sources:

- `babylon_ros`: https://github.com/Ranch-Hand-Robotics/babylon_ros
- `openscad-wasm`: https://github.com/Ranch-Hand-Robotics/openscad-wasm

## Compliance Checklist

When redistributing bundles that include OpenSCAD runtime artifacts, ensure you:

- [ ] Include MIT license text for `babylon_ros` code you distribute.
- [ ] Include GPL-2.0-or-later attribution/notices for OpenSCAD runtime artifacts.
- [ ] Preserve all copyright and license notices.
- [ ] Provide access to corresponding source for GPL-covered distributed components.

## Notes

This document is informational and not legal advice. For specific obligations in your distribution model, consult qualified legal counsel.
