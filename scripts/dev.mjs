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

// Compile native helpers on Windows if csc is present
if (process.platform === 'win32') {
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  const cscPath32 = 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe';
  const compiler = fs.existsSync(cscPath) ? cscPath : fs.existsSync(cscPath32) ? cscPath32 : null;
  const csSource = path.resolve('electron/ActiveWindow.cs');
  const exeOut = path.resolve('dist-electron/ActiveWindow.exe');
  if (compiler && fs.existsSync(csSource)) {
    try {
      const { execFileSync } = await import('child_process');
      execFileSync(compiler, ['/nologo', `/out:${exeOut}`, csSource]);
      console.log('Compiled ActiveWindow.exe helper');
    } catch (e) {
      console.warn('Could not compile ActiveWindow.exe, fallback will be used', e);
    }
  }

  // Compile native offline SpeechRecognizer helper
  const speechCsSource = path.resolve('electron/SpeechRecognizer.cs');
  const speechExeOut = path.resolve('dist-electron/SpeechRecognizer.exe');
  const speechDll = 'C:\\Windows\\Microsoft.Net\\assembly\\GAC_MSIL\\System.Speech\\v4.0_4.0.0.0__31bf3856ad364e35\\System.Speech.dll';
  if (compiler && fs.existsSync(speechCsSource) && fs.existsSync(speechDll)) {
    try {
      const { execFileSync } = await import('child_process');
      execFileSync(compiler, ['/nologo', `/r:${speechDll}`, `/out:${speechExeOut}`, speechCsSource]);
      console.log('Compiled SpeechRecognizer.exe helper');
    } catch (e) {
      console.warn('Could not compile SpeechRecognizer.exe helper', e);
    }
  }
}

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
