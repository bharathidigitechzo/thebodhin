// Fixes Metro bundler on Windows inside OneDrive/cloud-synced folders.
// Windows Cloud Files (OneDrive) assign NTFS reparse points (0x9000a01a) to files/folders.
// When Metro calls readlink on these non-symlink files, Windows returns EINVAL.
// This patch ensures Metro treats EINVAL as non-fatal instead of crashing with:
// "Failed to construct transformer: Error: EINVAL: invalid argument, readlink"

const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../node_modules/@expo/metro-file-map/build/index.js');

if (!fs.existsSync(targetFile)) {
  process.exit(0);
}

let content = fs.readFileSync(targetFile, 'utf8');
let modified = false;

// 1. Patch #maybeReadLink catch
if (!content.includes("err.code === 'EINVAL'")) {
  const targetCode = `                fileMetadata[_constants.default.SYMLINK] = (0, _normalizePathSeparatorsToPosix.default)(this.#pathUtils.resolveSymlinkToNormal(normalPath, symlinkTarget));\n            });`;
  const replacementCode = `                fileMetadata[_constants.default.SYMLINK] = (0, _normalizePathSeparatorsToPosix.default)(this.#pathUtils.resolveSymlinkToNormal(normalPath, symlinkTarget));\n            }).catch((err) => {\n                if (err && (err.code === 'EINVAL' || err.code === 'UNKNOWN' || err.code === 'ENOENT')) {\n                    fileMetadata[_constants.default.SYMLINK] = 0;\n                    return;\n                }\n                throw err;\n            });`;

  if (content.includes(targetCode)) {
    content = content.replace(targetCode, replacementCode);
    modified = true;
  }
}

// 2. Patch readLinkErrors fatal throw
if (!content.includes("'EINVAL',\n                'UNKNOWN'")) {
  const targetBlock = `            if ([\n                'ENOENT',\n                'EACCESS'\n            ].includes(error.code ?? '')) {`;
  const replacementBlock = `            if ([\n                'ENOENT',\n                'EACCESS',\n                'EINVAL',\n                'UNKNOWN'\n            ].includes(error.code ?? '')) {`;

  if (content.includes(targetBlock)) {
    content = content.replace(targetBlock, replacementBlock);
    modified = true;
  }
}

if (modified) {
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log('✅ Patched @expo/metro-file-map for Windows/OneDrive compatibility.');
}
