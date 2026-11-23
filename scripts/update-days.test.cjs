const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { updateDays } = require('./update-days.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codevember-days-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'index.html'),
    '<ol>\n  <!-- days:start -->\n  old\n  <!-- days:end -->\n</ol>\n');
  fs.writeFileSync(path.join(root, 'README.md'),
    '# Project\n\n<!-- days:start -->\nold\n<!-- days:end -->\n\nOther content\n');
  return root;
}

function write(root, file, contents = '') {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

test('detects complete projects and generates both files idempotently', (t) => {
  const root = fixture(t);
  write(root, '24/index.html');
  write(root, '24/public/social-preview.jpg');
  write(root, '24/README.md', '# A [Little] Nest\n');
  write(root, '25/index.html');
  write(root, '26/social-preview.png');
  updateDays(root);

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.equal((html.match(/class="day-card/g) || []).length, 30);
  assert.match(html, /href="\.\/24\/"/);
  assert.match(html, /src="\.\/24\/public\/social-preview\.jpg"/);
  assert.doesNotMatch(html, /href="\.\/2[56]\/"/);
  assert.ok(readme.includes('Day 24: [A \\[Little\\] Nest](https://gregpuzzles1.github.io/codevember-2026/24/)'));
  assert.doesNotMatch(readme, /Day 2[56]:/);
  assert.match(readme, /Other content/);

  updateDays(root);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), html);
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), readme);

  write(root, '25/social-preview.webp');
  updateDays(root);
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /Day 25: \[Veil\]/);

  fs.unlinkSync(path.join(root, '24', 'public', 'social-preview.jpg'));
  updateDays(root);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /href="\.\/24\/"/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /Day 24:/);
});

test('rejects invalid markers before writing either file', (t) => {
  const root = fixture(t);
  const htmlPath = path.join(root, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  fs.writeFileSync(path.join(root, 'README.md'), '# Missing markers\n');
  assert.throws(() => updateDays(root), /Expected exactly one ordered pair/);
  assert.equal(fs.readFileSync(htmlPath, 'utf8'), html);
});
