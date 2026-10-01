// Re-sync data/prompts/*.json into the database: `npm run seed`
const { seed } = require('./db');

const report = seed();
console.log(`Seeded ${report.prompts} prompts, ${report.answers} answers.`);
for (const p of report.problems) console.warn('  ! ' + p);
