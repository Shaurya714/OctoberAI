import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';

const outDir = path.resolve('dist-electron');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Building Electron main & preload...');

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

console.log('Electron main & preload build complete.');
