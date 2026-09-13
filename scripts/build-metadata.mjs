import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Local source identity only. Never reads deployment configuration or environment secrets. */
export function readBuildMetadata(root = fileURLToPath(new URL('../', import.meta.url))) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  try {
    return {
      version,
      revision: git('rev-parse', 'HEAD'),
      sourceDate: git('show', '-s', '--format=%cs', 'HEAD'),
      modified: git('status', '--porcelain', '--untracked-files=normal').length > 0,
    };
  } catch {
    return { version, revision: 'unversioned', sourceDate: '', modified: true };
  }
}
