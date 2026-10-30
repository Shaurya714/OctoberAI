import { createServer } from 'vite';
import { spawn } from 'child_process';
import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

// 1. Build electron main & preload
const outDir = path.resolve('dist-electron');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Compiling Electron main and preload...');
await esbuild.build({
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.cjs',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['electron'],
});

await esbuild.build({
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.cjs',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['electron'],
});

// 2. Start Vite server
console.log('Starting Vite dev server...');
const server = await createServer({
  configFile: './vite.config.ts',
  server: {
    port: 5173,
  },
});
await server.listen();

const address = server.httpServer?.address();
const port = typeof address === 'object' && address ? address.port : 5173;
const devServerUrl = `http://localhost:${port}`;
console.log(`Vite dev server running at: ${devServerUrl}`);

// 3. Launch Electron
console.log('Launching Electron...');
const electronModule = await import('electron');
const electronPath = electronModule.default || electronModule;

const electronProcess = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
});

electronProcess.on('close', async (code) => {
  console.log(`Electron process exited with code ${code}`);
  await server.close();
  process.exit(code ?? 0);
});

process.on('SIGINT', async () => {
  electronProcess.kill();
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  electronProcess.kill();
  await server.close();
  process.exit(0);
});
