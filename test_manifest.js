const manifestPath = 'data/builtin-sheets/manifest.json';
const fs = require('fs');
console.log('Manifest exists?', fs.existsSync(manifestPath));
if (fs.existsSync(manifestPath)) {
  console.log('Contents:', fs.readFileSync(manifestPath, 'utf8').substring(0, 100));
}
