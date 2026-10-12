// Exports the ten kitchen cards from assets/kitchen-art.js to tools/blender/kitchen-cards.json,
// so the Blender generator builds exactly the kitchens the swipe cards show.
// Usage: node tools/blender/export-cards.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const src = await readFile(join(root, 'assets', 'kitchen-art.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(src, sandbox, { filename: 'kitchen-art.js' });
const { CARDS, STYLES } = sandbox.window.KitchenArt;
const out = {
  source: 'assets/kitchen-art.js',
  exportedAt: new Date().toISOString(),
  cards: JSON.parse(JSON.stringify(CARDS)),
  styles: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, { name: v.name, blurb: v.blurb }])),
};
await writeFile(join(here, 'kitchen-cards.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${out.cards.length} cards: ${out.cards.map((c) => c.id).join(', ')}`);
