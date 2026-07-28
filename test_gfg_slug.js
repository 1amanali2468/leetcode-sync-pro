const fs = require('fs');
const sheet = JSON.parse(fs.readFileSync('data/builtin-sheets/gfg_160.json', 'utf8'));
for (const topic in sheet) {
  for (const subtopic in sheet[topic]) {
    for (const p of sheet[topic][subtopic]) {
      if (p.slug && p.slug.includes('missing-number')) {
        console.log('Found:', p);
      }
    }
  }
}
