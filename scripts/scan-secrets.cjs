const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
// Static high-confidence patterns only. Never echo secret values to CI logs.
const rules = [
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\b/],
  ['OpenAI secret key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['Stripe secret key', /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/],
  ['Hardcoded Spotify secret', /\b(?:spotify_client_secret|client_secret)\b\s*[:=]\s*['"][A-Za-z0-9_-]{24,}['"]/i],
  ['Supabase service role key', /\b(?:SUPABASE_SERVICE_ROLE_KEY|service_role_key)\b\s*[:=]\s*['"][A-Za-z0-9._-]{40,}['"]/i]
];
let files = [];
try {
  files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    .split('\0').filter(Boolean);
} catch (error) {
  console.error('Secret scan could not enumerate tracked files.');
  process.exit(2);
}
const findings = [];
let scanned = 0;
for (const file of files) {
  if (!/\.(?:ts|tsx|js|jsx|cjs|mjs|json|ya?ml|java|gradle|xml|md|properties|env|sh|ps1|html|css)$/.test(file)) continue;
  if (/^(?:package-lock\.json|third_party\/|assets\/|node_modules\/)/.test(file)) continue;
  let stat;
  try { stat = fs.statSync(file); } catch { continue; }
  if (stat.size > 1024 * 1024) continue;
  const contents = fs.readFileSync(file, 'utf8');
  scanned++;
  contents.split(/\r?\n/).forEach((line, index) => {
    for (const [kind, regex] of rules) {
      if (regex.test(line)) findings.push(file + ':' + (index + 1) + ' — ' + kind);
    }
  });
}
if (findings.length) {
  console.error('Potential committed secrets (values omitted; rotate confirmed exposures):');
  for (const finding of findings) console.error('  ' + finding);
  process.exit(1);
}
console.log('PASS: no high-confidence secrets detected in ' + scanned + ' tracked text files. This is not a substitute for full git-history and dependency audits.');
