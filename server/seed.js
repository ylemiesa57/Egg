// Validate data/prompts/*.json: `npm run seed`
// (The server loads these files itself on every start; this just reports problems.)
const { report } = require('./db');

console.log(`Loaded ${report.prompts} prompts, ${report.answers} answers.`);
for (const p of report.problems) console.warn('  ! ' + p);
if (report.problems.length) process.exitCode = 1;
