const fs = require('node:fs');
const path = require('node:path');

const words = [
  'Fold', 'Shatter', 'Melt', 'Tangle', 'Moss', 'Orrery', 'Hollow',
  'Tesseract', 'Membrane', 'Caustic', 'Rust', 'Feather', 'Labyrinth',
  'Tension', 'Mirage', 'Spore', 'Kelp', 'Pendulum', 'Erosion', 'Cocoon',
  'Bolt', 'Echo', 'Magma', 'Nest', 'Veil', 'Anamorph', 'Burrow', 'Hive',
  'Portal', 'Dissolve',
];

const existingTitles = {
  12: 'Feather — Birds of Northern Colorado',
  13: 'Labyrinth — A Garden for Getting Lost',
  15: 'Mirage — A Little Desert Illusion',
  16: 'From spore to more',
  17: 'Kelp Courier — A Dash Through the Kelp Forest',
  18: "Pendulum — A 360° Newton's Cradle",
  19: 'Erosion — Carve a Canyon with Rain',
  20: 'A Little Light Within — A Tiny World Inside a Cocoon',
  22: 'Canyon Chimes — Touch the Stone, Hear the Canyon Answer',
  23: 'Magma Pulse — Follow the Pulse Through the Mountain',
};

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

function findPreview(root, day) {
  for (const folder of ['', 'public']) {
    for (const extension of ['png', 'jpg', 'jpeg', 'webp', 'svg']) {
      const relative = [String(day), folder, `social-preview.${extension}`]
        .filter(Boolean).join('/');
      if (isFile(path.join(root, ...relative.split('/')))) return relative;
    }
  }
  return null;
}

function projectTitle(root, day, word) {
  if (existingTitles[day]) return existingTitles[day];
  const readme = path.join(root, String(day), 'README.md');
  if (!isFile(readme)) return word;
  const heading = fs.readFileSync(readme, 'utf8').match(/^#\s+(.+?)\s*#*\s*$/m);
  return heading ? heading[1] : word;
}

function replaceSection(text, start, end, content) {
  const first = text.indexOf(start);
  const last = text.indexOf(end);
  if (first === -1 || last === -1 || last < first ||
      text.indexOf(start, first + start.length) !== -1 ||
      text.indexOf(end, last + end.length) !== -1) {
    throw new Error(`Expected exactly one ordered pair of markers: ${start} and ${end}`);
  }
  const indent = text.slice(text.lastIndexOf('\n', last - 1) + 1, last);
  if (!/^\s*$/.test(indent)) throw new Error(`Marker must be on its own line: ${end}`);
  return text.slice(0, first + start.length) + '\n' + content + '\n' + indent + text.slice(last);
}

function updateDays(root) {
  const days = words.map((word, index) => {
    const day = index + 1;
    const preview = isFile(path.join(root, String(day), 'index.html'))
      ? findPreview(root, day) : null;
    return { day, word, preview, title: preview ? projectTitle(root, day, word) : null };
  });

  const cards = days.map(({ day, word, preview }) => {
    const number = String(day).padStart(2, '0');
    const info = `<div class="day-info"><div><span class="day-number">Day ${number}</span><h2 class="day-word">${word}</h2></div><span class="status">${preview ? 'Explore ↗' : 'Prompt'}</span></div>`;
    return preview
      ? `      <li class="day-card complete">
        <a href="./${day}/" aria-label="Day ${day}: ${word} — open project">
          <img class="preview" src="./${preview}" alt="" loading="lazy" decoding="async">
          ${info}
        </a>
      </li>`
      : `      <li class="day-card">
        <div class="prompt-art" aria-hidden="true"></div>
        ${info}
      </li>`;
  }).join('\n');

  const links = days.filter(day => day.preview).map(({ day, title }) => {
    const label = title.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    return `- Day ${day}: [${label}](https://gregpuzzles1.github.io/codevember-2026/${day}/)`;
  }).join('\n');

  const htmlPath = path.join(root, 'index.html');
  const readmePath = path.join(root, 'README.md');
  const html = replaceSection(fs.readFileSync(htmlPath, 'utf8'),
    '<!-- days:start -->', '<!-- days:end -->', cards);
  const readme = replaceSection(fs.readFileSync(readmePath, 'utf8'),
    '<!-- days:start -->', '<!-- days:end -->', links);
  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(readmePath, readme);
}

if (require.main === module) updateDays(path.resolve(__dirname, '..'));

module.exports = { updateDays };
