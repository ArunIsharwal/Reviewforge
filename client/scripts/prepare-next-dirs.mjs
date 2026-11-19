import fs from 'fs';
import path from 'path';

function copyDirStructure(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const srcChild = path.join(src, entry.name);
      const destChild = path.join(dest, entry.name);
      if (!fs.existsSync(destChild)) {
        fs.mkdirSync(destChild, { recursive: true });
      }
      copyDirStructure(srcChild, destChild);
    }
  }
}

function precreateSegments(baseDir, outAppDir) {
  function scan(dir, relPath = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scan(fullPath, childRel);
      } else if (
        entry.name.startsWith('page.') ||
        entry.name.startsWith('layout.') ||
        entry.name.startsWith('not-found.') ||
        entry.name.startsWith('error.')
      ) {
        const segName = relPath ? path.basename(relPath) : '_root';
        const targetSeg = path.join(outAppDir, relPath, `${segName}.segments`, segName);
        if (!fs.existsSync(targetSeg)) {
          fs.mkdirSync(targetSeg, { recursive: true });
        }
      }
    }
  }
  scan(baseDir);
}

// Core Next.js chunk and cache directories
[
  '.next/server/app',
  '.next/types/app',
  '.next/server/pages',
  '.next/static',
  '.next/static/chunks',
  '.next/static/chunks/app',
  '.next/static/chunks/next',
  '.next/static/chunks/next/dist',
  '.next/static/chunks/next/dist/client',
  '.next/static/chunks/next/dist/client/components',
].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Special Next.js internal segments
[
  '_not-found.segments/_not-found',
  '_global-error.segments/_global-error',
  '(auth)/login.segments/login',
  '(auth)/register.segments/register',
  '(auth)/forgot-password.segments/forgot-password',
  '(auth)/reset-password.segments/reset-password',
  '(workspace)/feedback.segments/feedback',
  '(workspace)/review-cycles.segments/review-cycles',
  '(workspace)/employees.segments/employees',
  '(workspace)/departments.segments/departments',
  '(workspace)/settings.segments/settings',
  '(workspace)/analytics.segments/analytics',
  '(workspace)/calibration.segments/calibration',
  '(workspace)/okrs.segments/okrs',
  '(workspace)/reviews.segments/reviews',
  '(workspace)/studio.segments/studio',
  '(workspace)/audit-log.segments/audit-log',
].forEach((rel) => {
  const p = path.join('.next', 'server', 'app', rel);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

precreateSegments('src/app', '.next/server/app');

copyDirStructure('src/app', '.next/server/app');
copyDirStructure('src/app', '.next/types/app');
copyDirStructure('src/app', '.next/static/chunks/app');

console.log('Pre-created all .next route directories successfully.');
