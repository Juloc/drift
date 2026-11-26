// How the tools start headless Chromium: with the machine's real graphics when there is a render node we may open (/dev/dri/renderD128: ANGLE on EGL, measured 46 frames a second at
// shot=tal in the high tier against 0.6 with software), else with software graphics (SwiftShader). DRIFT_GL=software forces software, DRIFT_GL=gpu forces the graphics.
import { accessSync, constants } from 'node:fs';
const node = '/dev/dri/renderD128';
const canGpu = (() => { try { accessSync(node, constants.R_OK | constants.W_OK); return true; } catch { return false; } })();
export const GPU = process.env.DRIFT_GL === 'gpu' || (process.env.DRIFT_GL !== 'software' && canGpu);
export const GL_FLAGS = GPU ? ['--use-gl=angle', '--use-angle=gl-egl', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
