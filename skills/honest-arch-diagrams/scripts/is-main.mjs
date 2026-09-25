// Entry-point check shared by scripts and adapters. Zero dependencies.
//
// `import.meta.url === \`file://${process.argv[1]}\`` silently skips main() when the script
// runs through an npm bin symlink (node_modules/.bin, the npx cache): Node resolves the
// module URL to the real file but leaves argv[1] as the symlink. It also misses paths with
// spaces (URL-encoded) and Windows drive letters. Compare real file paths instead.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** True when the module at `metaUrl` is the file Node was asked to run. */
export function isMain(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
