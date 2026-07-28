const { loadSheet } = require('./sheet-loader.js');
const isGFG = true;
const slug = 'missing-number-in-array1416';
const cleanSlug = isGFG ? slug.replace(/-*(\d+)$/, "").replace(/-+$/, "") : slug;

loadSheet('all_imported_sheets').then(combined => {
  const allProblems = combined?.['All Combined']?.['All Problems'] || [];
  const match = allProblems.find(p => {
    const pSlug = (p.slug || "").toLowerCase().replace(/-*(\d+)$/, "").replace(/-+$/, "");
    if (pSlug === cleanSlug) return true;
    return false;
  });
  console.log('Match found:', match);
});
