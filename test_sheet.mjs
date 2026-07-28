import { loadSheet } from './sheet-loader.js';
loadSheet('all_imported_sheets').then(data => {
  console.log('Result has keys:', Object.keys(data));
  console.log('All Combined has problems:', data?.['All Combined']?.['All Problems']?.length);
}).catch(console.error);
