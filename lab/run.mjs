// Riverside lab runner: sends one experiment job to Google's image model (Nano Banana) and saves the results.
// Runs on GitHub Actions only, with the key in the GEMINI_API_KEY repository secret.
// Separate from the bathroom visualiser: nothing here reads, calls or changes it.
//
// Usage: node lab/run.mjs <job>    reads lab/jobs/<job>/job.json, writes images and summary.json to OUT_DIR.
//
// job.json: { "model": "gemini-3.1-flash-image", "size": "1K", "think": "minimal",
//             "items": [ { "id": "oak-floor", "prompt": "...", "images": ["lab/inputs/x.png"], "aspect": "1:1" } ] }

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
// Nano Banana 2.1 is Google's recommended image model from 6 Oct 2026 (about half the price of Nano Banana 2).
// If it is not available on this key, the runner falls back to Nano Banana 2.
const MODELS = ['gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-3-pro-image'];
const FALLBACK = 'gemini-3.1-flash-image';
const SIZES = ['1K', '2K'];
const ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const MAX_ITEMS = 12;
const TIMEOUT_MS = 120000;
// Rough cost per image in US dollars, for the summary only. Check Google's pricing page for current figures.
const COST = { 'gemini-nano-banana-2.1': 0.035, 'gemini-3.1-flash-image': 0.07, 'gemini-3-pro-image': 0.14 };

const job = process.argv[2] || '';
const outDir = process.env.OUT_DIR || 'lab-out';
const key = process.env.GEMINI_API_KEY || '';

async function main() {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(job)) throw new Error('Job name must be lower-case letters, numbers and hyphens.');
  await mkdir(outDir, { recursive: true });
  const spec = JSON.parse(await readFile(join('lab', 'jobs', job, 'job.json'), 'utf8'));
  let model = MODELS.includes(spec.model) ? spec.model : MODELS[0];
  const size = SIZES.includes(spec.size) ? spec.size : '1K';
  const think = spec.think === 'high' ? 'high' : 'minimal';
  const items = (spec.items || []).slice(0, MAX_ITEMS);
  const summary = { job, model, size, think, startedAt: new Date().toISOString(), items: [], estimatedCostUsd: 0 };

  if (!key) {
    summary.error = 'The GEMINI_API_KEY repository secret is not set, so nothing was generated.';
    await writeFile(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(summary.error);
    return;
  }

  for (const item of items) {
    const id = String(item.id || '').replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'item';
    const started = Date.now();
    const rec = { id, ok: false, ms: 0 };
    try {
      const input = [];
      for (const [i, path] of (item.images || []).entries()) {
        if (!/^lab\/[a-zA-Z0-9/_.-]+\.(png|jpe?g|webp)$/.test(path)) throw new Error('Bad image path: ' + path);
        const data = (await readFile(path)).toString('base64');
        const ext = extname(path).slice(1).toLowerCase();
        input.push({ type: 'text', text: item.imageLabels?.[i] || `INPUT IMAGE ${i + 1}:` });
        input.push({ type: 'image', mime_type: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', data });
      }
      input.push({ type: 'text', text: String(item.prompt || '') });
      const aspect = ASPECTS.includes(item.aspect) ? item.aspect : undefined;
      const body = {
        model: null,
        input,
        response_format: { type: 'image', mime_type: 'image/jpeg', image_size: size, ...(aspect ? { aspect_ratio: aspect } : {}) },
        generation_config: { thinking_level: think },
      };
      let { res, text } = await call({ ...body, model });
      // Unknown model on this key: switch to Nano Banana 2 for the rest of the job
      if ((res.status === 404 || (res.status === 400 && /model/i.test(text))) && model !== FALLBACK) {
        console.log(`${model} unavailable (${res.status}); falling back to ${FALLBACK}`);
        summary.fallbackFrom = model;
        model = FALLBACK;
        summary.model = model;
        ({ res, text } = await call({ ...body, model }));
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      const img = findImage(JSON.parse(text));
      if (!img) throw new Error('No image in the response: ' + findText(JSON.parse(text)).slice(0, 300));
      await writeFile(join(outDir, `${id}.jpg`), Buffer.from(img.data, 'base64'));
      rec.ok = true;
      summary.estimatedCostUsd += COST[model];
    } catch (e) {
      rec.error = String(e && e.message || e).replace(key, '[key]').slice(0, 400);
    }
    rec.ms = Date.now() - started;
    summary.items.push(rec);
    console.log(`${rec.ok ? 'ok  ' : 'FAIL'} ${id} ${rec.ms} ms${rec.error ? ' ' + rec.error : ''}`);
  }
  summary.finishedAt = new Date().toISOString();
  summary.estimatedCostUsd = Math.round(summary.estimatedCostUsd * 100) / 100;
  await writeFile(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
}

async function call(body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { res, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

function findImage(data) {
  if (data?.output_image?.data) return { data: data.output_image.data };
  let found = null;
  for (const step of Array.isArray(data?.steps) ? data.steps : []) {
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const b of step.content) if (b?.type === 'image' && b.data) found = { data: b.data };
  }
  return found;
}
function findText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  let out = '';
  for (const step of Array.isArray(data?.steps) ? data.steps : []) {
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const b of step.content) if (b?.type === 'text' && typeof b.text === 'string') out += b.text;
  }
  return out;
}

main().catch(async (e) => {
  console.error(String(e && e.message || e).replace(key || '\u0000', '[key]'));
  process.exitCode = 1;
});
