import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const reviewsDir = join(root, 'src/content/reviews');
const authorsDir = join(root, 'src/content/authors');

function parseYamlFields(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv && !(kv[1] in out)) out[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return parseYamlFields(m ? m[1] : text);
}

const authorNames = {};
const authorEmails = {};
for (const f of readdirSync(authorsDir)) {
  if (!f.endsWith('.yaml')) continue;
  const fm = parseYamlFields(readFileSync(join(authorsDir, f), 'utf8'));
  const slug = f.replace(/\.yaml$/, '');
  authorNames[slug] = fm.name ?? slug;
  if (fm.email) authorEmails[fm.email] = slug;
}

const rows = [];
for (const f of readdirSync(reviewsDir)) {
  if (!f.endsWith('.mdx')) continue;
  const slug = f.replace(/\.mdx$/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
  const fm = parseFrontmatter(readFileSync(join(reviewsDir, f), 'utf8'));
  const author = fm.author ?? '';
  if (!author) continue;
  rows.push({ slug, author, author_name: authorNames[author] ?? author });
}

const esc = (s) => s.replace(/'/g, "''");
const statements = rows.map(
  (r) =>
    `INSERT INTO reviews (slug, author, author_name) VALUES ('${esc(r.slug)}', '${esc(r.author)}', '${esc(r.author_name)}') ON CONFLICT(slug) DO UPDATE SET author = excluded.author, author_name = excluded.author_name;`,
);
for (const [email, author] of Object.entries(authorEmails)) {
  statements.push(
    `INSERT INTO authors_auth (email, author, author_name) VALUES ('${esc(email)}', '${esc(author)}', '${esc(authorNames[author] ?? author)}') ON CONFLICT(email) DO UPDATE SET author = excluded.author, author_name = excluded.author_name;`,
  );
}
const sql = statements.join('\n');

const flag = process.argv.includes('--local') ? '--local' : '--remote';
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'gearpro-metrics', flag, '--command', sql, '-y'],
  { stdio: 'inherit' },
);
console.log(`[metrics] synced ${rows.length} reviews (${flag}).`);
