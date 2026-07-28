import { getBuiltinManifest, denormalizeSheetData, loadSheet, clearSheetCache } from './sheet-loader.js';

async function test() {
  const data = await loadSheet('all_imported_sheets');
  const problems = data?.['All Combined']?.['All Problems'] || [];
  console.log('Total combined problems:', problems.length);
  
  const missing = problems.find(p => p.slug && p.slug.includes('missing-number-in-array'));
  console.log('Found missing-number-in-array?', missing);
}
test().catch(console.error);
