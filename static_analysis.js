const fs = require('fs');
const path = require('path');

const jsFiles = fs.readdirSync('.').filter(f => f.endsWith('.js') && f !== 'update_bg.js' && !f.startsWith('test_') && f !== 'static_analysis.js');
const dashboardFiles = fs.existsSync('dashboard_modules') ? fs.readdirSync('dashboard_modules').filter(f => f.endsWith('.js')).map(f => 'dashboard_modules/' + f) : [];
const allFiles = [...jsFiles, ...dashboardFiles];

let report = '# Automated Static Analysis Report\n\n';

const checks = [
    { name: 'Swallowed Errors', regex: /catch\s*\([^)]*\)\s*\{\s*\}/g },
    { name: 'DOM innerHTML', regex: /\.innerHTML\s*=/g },
    { name: 'Missing await on storage', regex: /(?<!await\s+)chrome\.storage\.local\.(set|get)/g },
    { name: 'Hardcoded URL', regex: /https?:\/\/(?!firestore\.googleapis\.com|api\.github\.com|leetcode\.com|geeksforgeeks\.org|avatars\.githubusercontent\.com)[^\s"']+/g },
    { name: 'eval or setTimeout string', regex: /eval\(|setTimeout\(['"]/g },
    { name: 'Console logs (Production leak)', regex: /console\.(log|debug|info)\(/g },
    { name: 'Magic Numbers', regex: /(?<![A-Za-z0-9_$])(setTimeout|setInterval)\(.*,\s*\d+\)/g }
];

allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    let fileReport = `## ${file}\n`;
    let foundIssues = false;

    // Check line by line
    lines.forEach((line, i) => {
        const lineNum = i + 1;
        
        checks.forEach(check => {
            if (line.match(check.regex)) {
                fileReport += `- Line ${lineNum}: [${check.name}] \`${line.trim()}\`\n`;
                foundIssues = true;
            }
        });
    });

    if (foundIssues) {
        report += fileReport + '\n';
    }
});

fs.writeFileSync('static_analysis.md', report);
console.log('Static analysis complete. See static_analysis.md');
