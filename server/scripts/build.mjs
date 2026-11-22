import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

const candidates = [
  path.join(serverDir, 'node_modules/typescript/bin/tsc'),
  path.join(serverDir, '../node_modules/typescript/bin/tsc'),
  path.join(serverDir, 'node_modules/typescript/lib/tsc.js'),
  path.join(serverDir, '../node_modules/typescript/lib/tsc.js'),
];

let tscPath = candidates.find((p) => fs.existsSync(p));

if (tscPath) {
  console.log(`Compiling server TypeScript using: ${tscPath}`);
  execSync(`node "${tscPath}" --project "${path.join(serverDir, 'tsconfig.json')}"`, {
    stdio: 'inherit',
    cwd: serverDir,
  });
} else {
  console.log('Compiling server TypeScript using PATH tsc...');
  execSync(`tsc --project "${path.join(serverDir, 'tsconfig.json')}"`, {
    stdio: 'inherit',
    cwd: serverDir,
  });
}
console.log('Server TypeScript build completed successfully.');
