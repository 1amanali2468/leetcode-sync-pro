const fs = require('fs');

function checkFileExists(file) {
  if (!fs.existsSync(file)) {
    console.log('MISSING FILE:', file);
  }
}

// Check if all imported scripts actually exist
const htmlFiles = ['popup.html', 'dashboard.html', 'login.html'];
for (const html of htmlFiles) {
  const content = fs.readFileSync(html, 'utf8');
  const scripts = [...content.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  scripts.forEach(script => {
    // some might be external, ignore http
    if (!script.startsWith('http')) {
      checkFileExists(script);
    }
  });
  console.log(html, 'scripts:', scripts);
}
