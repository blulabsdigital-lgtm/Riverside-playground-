// Riverside playground: kitchen-restyle, the engine behind Kitchen style match.
// Its own Supabase project and its own function. It shares nothing with the bathroom visualiser.
//
// POST { photo: "data:image/jpeg;base64,...", style: { styleName, doors, unitColour, ... } }
//   1. check    a quick text-model look at the photo: is it a real kitchen we can redesign, and is there room for an island?
//   2. restyle  an image edit that refits the same kitchen, seen from the same spot, in the customer's chosen style.
// Reply: { ok: true, image: "data:image/jpeg;base64,...", ms } or { ok: false, code, message }.
//
// The photo is never stored and never logged. Logs hold timings and codes only.
// Everything above the "Server" section is a plain function, so it can be tested without Google.

/* ---------- Settings ---------- */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image";
const DEFAULT_CHECK_MODEL = "gemini-3.8-flash";
const DEFAULT_ORIGINS = "https://blulabsdigital-lgtm.github.io,http://127.0.0.1:8765,http://localhost:8765";
const IMAGE_SIZE = "1K";
const THINKING = "minimal";

// The page gives up after 90 s, so everything here finishes inside 85 s.
const BUDGET_MS = 85_000;
const CHECK_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 75_000;
const RETRY_MIN_MS = 30_000; // a second image attempt only starts with at least this much time left
const RETRY_PAUSE_MS = 1_000;

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_BODY_BYTES = 4_400_000; // a 3 MB photo is 4 MB as base64, plus the style
const MIN_EDGE = 240;

export const MSG = {
  photo: "We couldn't read that photo. Please try a JPEG or PNG taken on your phone.",
  tooLarge: "That photo is too large. Please use one under 3 MB.",
  tooSmall: "That photo is too small to redesign. Please use a larger one.",
  style: "Something went wrong with your design choices. Please start again.",
  request: "Something went wrong with that request. Please try again.",
  origin: "This website isn't allowed to use the kitchen design engine.",
  notKitchen: "That doesn't look like a kitchen. Try a photo taken from the doorway with the whole room in view.",
  notUsable: "We couldn't see the room clearly in that photo. Try one taken in daylight from the doorway, with nobody in the shot.",
  hourly: "You've made a lot of designs in the last hour. Please try again a little later.",
  daily: "We've reached today's limit for new designs. Please try again tomorrow.",
  busy: "Our design engine is very busy just now. Please try again in a few minutes.",
  slow: "Your design is taking longer than usual. Please try again in a minute.",
  noImage: "We couldn't create a design from this photo. Please try again, or use a different photo.",
  error: "Something went wrong while creating your design. Please try again.",
};

/* ---------- Config ---------- */

export type Config = {
  geminiKey: string;
  imageModel: string;
  checkModel: string;
  origins: string[];
  hourlyLimit: number;
  dailyCap: number;
  projectKeys: string[];
};

export function readConfig(get: (name: string) => string | undefined): Config {
  return {
    geminiKey: (get("GEMINI_API_KEY") ?? "").trim(),
    imageModel: (get("GEMINI_IMAGE_MODEL") ?? "").trim() || DEFAULT_IMAGE_MODEL,
    checkModel: (get("GEMINI_CHECK_MODEL") ?? "").trim() || DEFAULT_CHECK_MODEL,
    origins: parseOrigins((get("ALLOWED_ORIGINS") ?? "").trim() || DEFAULT_ORIGINS),
    hourlyLimit: wholeNumber(get("HOURLY_LIMIT_PER_IP"), 8),
    dailyCap: wholeNumber(get("DAILY_CAP"), 150),
    projectKeys: projectKeys(get("SUPABASE_ANON_KEY"), get("SUPABASE_PUBLISHABLE_KEYS")),
  };
}

function wholeNumber(v: string | undefined, fallback: number): number {
  const n = Number((v ?? "").trim());
  return (v ?? "").trim() !== "" && Number.isInteger(n) && n >= 0 ? n : fallback;
}

const normOrigin = (s: string) => s.trim().toLowerCase().replace(/\/+$/, "");

export function parseOrigins(list: string): string[] {
  return list.split(",").map(normOrigin).filter(Boolean);
}

// The project's own public keys, which Supabase gives every function. Empty when run elsewhere.
function projectKeys(anon: string | undefined, publishable: string | undefined): string[] {
  const keys: string[] = [];
  if (anon?.trim()) keys.push(anon.trim());
  try {
    const parsed: unknown = JSON.parse(publishable ?? "");
    if (isRecord(parsed)) for (const v of Object.values(parsed)) if (typeof v === "string" && v.trim()) keys.push(v.trim());
  } catch { /* not set */ }
  return keys;
}

/* ---------- Requests: origin, key, address ---------- */

export function originAllowed(origin: string, allowed: string[]): boolean {
  return allowed.includes(normOrigin(origin));
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && originAllowed(origin, allowed)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

// With JWT verification switched off on the platform, the function checks the project key itself.
export function keyAccepted(headers: Headers, keys: string[]): boolean {
  if (!keys.length) return true;
  const apikey = (headers.get("apikey") ?? "").trim();
  const bearer = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return keys.includes(apikey) || keys.includes(bearer);
}

export function clientIp(headers: Headers): string {
  const raw = (headers.get("x-forwarded-for") ?? "").split(",")[0] || headers.get("cf-connecting-ip") || headers.get("x-real-ip") || "";
  return raw.trim().slice(0, 64);
}

/* ---------- Abuse protection (best effort, in memory) ---------- */

export type Limit = "hour" | "day" | null;

// Per-address hourly limit and a daily cap for the whole engine. Lives in this worker's memory only,
// so it resets when the function cold-starts and is not shared between workers.
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private day = "";
  private dayCount = 0;
  private hourly: number;
  private daily: number;
  constructor(hourly: number, daily: number) {
    this.hourly = hourly;
    this.daily = daily;
  }

  peek(ip: string, now: number): Limit {
    this.roll(now);
    if (this.dayCount >= this.daily) return "day";
    if (ip && this.recent(ip, now).length >= this.hourly) return "hour";
    return null;
  }

  take(ip: string, now: number): Limit {
    const blocked = this.peek(ip, now);
    if (blocked) return blocked;
    this.dayCount++;
    if (ip) {
      this.hits.set(ip, [...this.recent(ip, now), now]);
      if (this.hits.size > 5000) this.prune(now);
    }
    return null;
  }

  private recent(ip: string, now: number): number[] {
    return (this.hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  }
  private roll(now: number) {
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.dayCount = 0; }
  }
  private prune(now: number) {
    for (const [ip, list] of this.hits) if (!list.some((t) => now - t < 3_600_000)) this.hits.delete(ip);
  }
}

/* ---------- Photo ---------- */

export type Mime = "image/jpeg" | "image/png" | "image/webp";
export type Photo = { ok: true; mime: Mime; b64: string; size: number; width: number; height: number; exif: boolean };
export type PhotoProblem = { ok: false; status: number; message: string };

const PHOTO_HEAD = /^data:image\/(jpeg|jpg|png|webp);base64,/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function checkPhoto(v: unknown): Photo | PhotoProblem {
  const bad = (status: number, message: string): PhotoProblem => ({ ok: false, status, message });
  if (typeof v !== "string") return bad(400, MSG.photo);
  const head = PHOTO_HEAD.exec(v.slice(0, 40));
  if (!head) return bad(400, MSG.photo);
  const b64 = v.slice(head[0].length);
  if (b64.length < 64 || b64.length % 4 !== 0 || !BASE64.test(b64)) return bad(400, MSG.photo);
  const size = (b64.length / 4) * 3 - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  if (size > MAX_PHOTO_BYTES) return bad(413, MSG.tooLarge);
  let bytes: Uint8Array;
  try { bytes = fromBase64(b64); } catch { return bad(400, MSG.photo); }
  const mime = sniffMime(bytes);
  if (!mime) return bad(400, MSG.photo);
  const dim = imageSize(bytes, mime);
  if (!dim) return bad(400, MSG.photo);
  if (Math.min(dim.width, dim.height) < MIN_EDGE) return bad(400, MSG.tooSmall);
  return { ok: true, mime, b64, size, width: dim.width, height: dim.height, exif: dim.exif };
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sniffMime(b: Uint8Array): Mime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

export function imageSize(b: Uint8Array, mime: Mime): { width: number; height: number; exif: boolean } | null {
  let w = 0, h = 0, exif = false;
  if (mime === "image/png") {
    if (b.length < 24 || ascii(b, 12, 4) !== "IHDR") return null;
    w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
    h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
  } else if (mime === "image/webp") {
    if (b.length < 30) return null;
    const kind = ascii(b, 12, 4);
    if (kind === "VP8 ") { w = (b[26] | (b[27] << 8)) & 0x3fff; h = (b[28] | (b[29] << 8)) & 0x3fff; }
    else if (kind === "VP8L") { w = 1 + (((b[22] & 0x3f) << 8) | b[21]); h = 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)); }
    else if (kind === "VP8X") { w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16)); h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16)); }
    else return null;
  } else {
    // JPEG: walk the markers to the first frame header.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; }
      if (m === 0xd9 || m === 0xda) return null;
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len < 2) return null;
      if (m === 0xe1 && ascii(b, i + 4, 4) === "Exif") exif = true;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        h = (b[i + 5] << 8) | b[i + 6];
        w = (b[i + 7] << 8) | b[i + 8];
        break;
      }
      i += 2 + len;
    }
  }
  return w > 0 && h > 0 ? { width: w, height: h, exif } : null;
}

const ASPECTS = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

// The supported output shape closest to the photo, so the frame stays the same. Null when none is close.
export function nearestAspect(width: number, height: number): string | null {
  if (!width || !height) return null;
  const r = Math.log(width / height);
  let best: string | null = null, gap = Infinity;
  for (const a of ASPECTS) {
    const [x, y] = a.split(":").map(Number);
    const d = Math.abs(Math.log(x / y) - r);
    if (d < gap) { gap = d; best = a; }
  }
  return gap <= Math.log(1.04) ? best : null;
}

/* ---------- Style ---------- */

const DOORS = ["shaker", "slab", "fluted"] as const;
const SPLASHBACKS = ["marble", "metro", "zellige", "plain"] as const;
const PENDANTS = ["globe", "dome", "linear", "none"] as const;
const COOKERS = ["range", "hob"] as const;
const HOODS = ["canopy", "chimney", "none"] as const;
const UPPERS = ["units", "shelves", "none"] as const;

export type Style = {
  styleName: string;
  twist: string | null;
  doors: typeof DOORS[number];
  unitColour: string;
  unitName: string;
  worktop: string;
  splashback: typeof SPLASHBACKS[number];
  splashColour: string | null;
  handles: string;
  wall: string;
  floor: string;
  island: boolean;
  pendants: typeof PENDANTS[number];
  cooker: typeof COOKERS[number];
  hood: typeof HOODS[number];
  upper: typeof UPPERS[number];
};

// Words that have no place in a kitchen finish name. Anything carrying them is refused.
const BLOCKED = /\b(ignore|disregard|forget|instructions?|prompts?|system|override|assistant|previous|rules?|text|captions?|labels?|logos?|watermarks?|signatures?|write|writing|words?|letters?|people|person|man|woman|child|children|faces?|nude|naked|blood|weapons?|guns?)\b/i;

// A short plain label: letters, numbers, spaces, hyphens, apostrophes, commas and ampersands only.
export function cleanText(v: unknown, max = 40): string | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFKC").replace(/[‘’ʼ]/g, "'").replace(/[‐-—]/g, "-").replace(/\s+/g, " ").trim();
  if (!s || s.length > max || s.split(" ").length > 6) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 ,'&-]*$/.test(s) || BLOCKED.test(s)) return null;
  return s;
}

export function cleanHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ("#" + s.slice(1).split("").map((c) => c + c).join("")).toUpperCase();
  return null;
}

function oneOf<T extends string>(v: unknown, list: readonly T[]): T | null {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
}

const absent = (v: unknown) => v === undefined || v === null || v === "";

export function sanitiseStyle(v: unknown): { ok: true; style: Style } | { ok: false; field: string } {
  if (!isRecord(v)) return { ok: false, field: "style" };
  const no = (field: string) => ({ ok: false as const, field });
  const styleName = cleanText(v.styleName);
  if (!styleName) return no("styleName");
  const twist = absent(v.twist) ? null : cleanText(v.twist);
  if (!absent(v.twist) && !twist) return no("twist");
  const doors = oneOf(v.doors, DOORS);
  if (!doors) return no("doors");
  const unitColour = cleanHex(v.unitColour);
  if (!unitColour) return no("unitColour");
  const unitName = cleanText(v.unitName);
  if (!unitName) return no("unitName");
  const worktop = cleanText(v.worktop);
  if (!worktop) return no("worktop");
  const splashback = oneOf(v.splashback, SPLASHBACKS);
  if (!splashback) return no("splashback");
  const splashColour = absent(v.splashColour) ? null : cleanHex(v.splashColour);
  if (!absent(v.splashColour) && !splashColour) return no("splashColour");
  const handles = cleanText(v.handles);
  if (!handles) return no("handles");
  const wall = cleanText(v.wall);
  if (!wall) return no("wall");
  const floor = cleanText(v.floor);
  if (!floor) return no("floor");
  if (typeof v.island !== "boolean") return no("island");
  const pendants = oneOf(v.pendants, PENDANTS);
  if (!pendants) return no("pendants");
  const cooker = oneOf(v.cooker, COOKERS);
  if (!cooker) return no("cooker");
  const hood = oneOf(v.hood, HOODS);
  if (!hood) return no("hood");
  const upper = oneOf(v.upper, UPPERS);
  if (!upper) return no("upper");
  return {
    ok: true,
    style: { styleName, twist, doors, unitColour, unitName, worktop, splashback, splashColour, handles, wall, floor, island: v.island, pendants, cooker, hood, upper },
  };
}

// Plain words for a colour code, because image models follow words better than hex.
export function describeHex(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), c = max - min, l = (max + min) / 2;
  const s = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (c) hue = max === r ? 60 * (((g - b) / c + 6) % 6) : max === g ? 60 * ((b - r) / c + 2) : 60 * ((r - g) / c + 4);
  const light = l < 0.18 ? "very dark" : l < 0.35 ? "dark" : l < 0.55 ? "mid" : l < 0.75 ? "light" : "pale";
  if (c < 0.06) {
    if (l > 0.9) return c < 0.015 && l > 0.96 ? "white" : "off-white";
    if (l < 0.15) return "near-black";
    const tint = c >= 0.025 ? (hue >= 15 && hue <= 75 ? "warm " : hue >= 180 && hue <= 260 ? "cool " : "") : "";
    return `${light} ${tint}grey`;
  }
  if (hue >= 15 && hue < 55) {
    if (l >= 0.75) return s < 0.3 ? "beige" : hue >= 38 ? "cream" : "pale sand";
    if (s < 0.65) return l < 0.4 ? "dark brown" : l < 0.55 ? "mid brown" : "light tan";
  }
  const name = hue < 15 ? "red" : hue < 40 ? "orange" : hue < 65 ? "yellow" : hue < 90 ? "olive" : hue < 165 ? "green"
    : hue < 195 ? "teal" : hue < 255 ? "blue" : hue < 290 ? "violet" : hue < 335 ? "plum" : "red";
  return `${light} ${s < 0.35 ? "muted " : ""}${name}`;
}

/* ---------- Prompts ---------- */

export const CHECK_PROMPT = [
  "You are screening photos for a kitchen redesign tool. Reply with JSON only, no other text, in exactly this shape:",
  '{"kitchen": true or false, "usable": true or false, "has_island": true or false, "island_space": true or false, "reason": "short phrase", "camera": "one sentence", "fixed": "one sentence"}',
  '"kitchen" is true only if this is a real photo of the inside of a real home kitchen or kitchen-diner, with fitted units, a worktop or kitchen appliances in view, so that a redesign of this same room makes sense. Drawings, renders, floor plans, screenshots, adverts, other rooms, outdoor scenes, and close-ups of people, pets or objects are not kitchens.',
  '"usable" is false if the room is too dark or blurred to see, if it is a close-up of one cupboard or appliance with no wider view, or if a person fills a large part of the frame.',
  '"has_island" is true only if the room already has a kitchen island or peninsula.',
  '"island_space" is true only if the open floor you can see is clearly big enough for an island about 1 m deep and 2 m long with at least 1 metre of clear walkway on every side. If unsure, false.',
  '"camera": where the camera stands, how high, which way it looks, and what the left, right, top and bottom edges of the photo cut through.',
  '"fixed": where the sink, the cooker or hob, the fridge, the windows and the doors are in the frame. Say "not visible" for any you cannot see.',
].join("\n");

const RULES = [
  "You are editing a real phone photo of a customer's kitchen. Show the same kitchen after a complete refit by Riverside Construction Group, a premium kitchen company in London. The result must look like a phone photo of the finished Riverside job, taken from exactly the same spot once the work is done.",
  "SAME ROOM, SAME CAMERA: identical camera position, height, angle, lens, framing and field of view. The left, right, top and bottom edges of the photo show the same parts of the room as the original, no wider and no narrower. Do not zoom, crop, rotate, mirror or step back.",
  "STRUCTURE IS FROZEN: every wall, corner, ceiling (shape and height), beam, chimney breast, step, window (position, size, frame, glazing, sill and blind) and door or opening stays exactly where it is, at the same size. Never add, remove, move or resize a window, door, wall or opening. No structural changes of any kind.",
  "SERVICES STAY WHERE THEY ARE: the sink stays in the same position (if it is under a window, it stays under that window), the cooker or hob stays in the same position, and the fridge stays in the same position (a freestanding fridge may become an integrated fridge behind a matching tall door in the same place). The base units stay on the same walls with the same overall run lengths. Radiators stay where they are; a wall-mounted boiler may be hidden inside a matching wall unit in the same spot.",
  "ONLY KITCHEN-FITTER WORK CHANGES: door fronts, drawer fronts, carcasses, end panels and plinths; worktop; splashback; handles; sink and tap in the same place; cooker, hob and extractor in the same place; flooring; wall paint; lighting. Nothing else in the room changes.",
  "PHOTO REALISM: photorealistic, a genuine phone photo of a real finished kitchen, not a render or a showroom. Keep the same daylight, light direction, colour temperature, exposure and slight grain as the original photo. No glowing or over-bright showroom light, no lens flare, no haze, no glossy CGI look.",
  "WORKMANSHIP AT TRUE SCALE: tiles at their real size with thin, straight, even grout lines; consistent 2 to 3 mm door gaps; straight worktop edges and plinths; doors, drawers and appliances in correct perspective; reflections that match this room.",
  "TIDY AND EMPTY: remove clutter, small appliances, bins, cleaning products, papers, magnets, tea towels, people and pets. Worktops clear apart from at most one or two simple items, such as a wooden board or a bowl. No text, logos, labels, signs or watermarks anywhere. No people.",
  "If any part of the design below would break these rules, follow the rules and leave that part out.",
].join("\n\n");

const MOODS: Record<string, string> = {
  "classic shaker": "timeless and warm: painted Shaker cabinetry and traditional details",
  "sleek modern": "clean lines, handleless fronts and nothing out of place",
  "warm minimal": "natural timber, soft plaster tones and textured tiles; calm but never cold",
  "dark and dramatic": "deep colour, polished stone and brass",
  "urban loft": "concrete, black steel and brick; honest materials with real character",
};

const DOOR_WORDS: Record<Style["doors"], string> = {
  shaker: "Shaker doors (a flat centre panel inside a square-edged frame)",
  slab: "flat slab doors with no frame or moulding",
  fluted: "fluted doors (fine vertical reeding across each front)",
};

const WORKTOPS: Record<string, string> = {
  "marble-effect quartz": "white marble-effect quartz, 20 to 30 mm thick, with soft grey veining and a crisp square edge",
  "white quartz": "plain white quartz, 20 to 30 mm thick, with a crisp square edge",
  "solid oak": "solid oak, about 40 mm thick, oiled, with visible staves",
  "concrete-effect": "concrete-effect quartz in mid grey with a soft matt finish",
  "nero marble-effect": "black Nero marble-effect quartz with fine white veining",
  "pale terrazzo": "pale terrazzo with small warm-toned chips",
};

const FLOORS: Record<string, string> = {
  "oak boards": "wide engineered oak boards in a natural matt finish",
  "oak herringbone": "engineered oak herringbone parquet in a natural matt finish",
  "smoked oak boards": "wide smoked oak engineered boards, dark and matt",
  "large-format porcelain": "large-format porcelain tiles, about 600 by 1200 mm, in a pale stone colour with thin grout",
  "black and white chequer": "black and white chequerboard tiles, about 300 by 300 mm, laid square to the room",
  "polished concrete-effect": "polished concrete-effect large-format porcelain in mid grey",
};

const WALLS: Record<string, string> = {
  "warm white": "painted warm white", "soft white": "painted soft white", "chalk white": "painted chalk white",
  "stone white": "painted stone white", "linen": "painted a soft linen colour", "pale grey": "painted pale grey",
  "plaster pink": "finished in soft plaster pink", "terracotta": "painted warm terracotta",
  "concrete grey": "finished in concrete-grey microcement",
  "exposed brick": "painted warm white, with the one plain wall behind the units finished in red-brown brick slips",
};

const METALS: Record<string, string> = { "brushed brass": "brushed brass", "matt black": "matt black", "polished chrome": "polished chrome" };
const HANDLE_SHAPES: Record<string, string> = { knobs: "round knobs", "cup handles": "cup handles", "bar handles": "slim bar handles" };

const SPLASH_WORDS: Record<Style["splashback"], string> = {
  marble: "a single marble-effect slab (white with soft grey veining), running from the worktop up to the wall units or shelves",
  metro: "metro tiles, about 75 by 150 mm, laid in brick bond with thin grout",
  zellige: "handmade zellige-style glazed square tiles, about 100 by 100 mm, with gentle variation in shade and surface",
  plain: "a plain painted-glass splashback",
};

const COOKER_WORDS: Record<Style["cooker"], string> = {
  range: "a freestanding range cooker, about 1000 mm wide, standing where today's cooker or hob is",
  hob: "a built-in induction hob set into the worktop where today's cooker or hob is, with a built-in oven below it",
};

const HOOD_WORDS: Record<Style["hood"], string> = {
  canopy: "a boxed-in canopy hood above the cooker, painted or plastered to match the walls",
  chimney: "a slim chimney extractor above the hob",
  none: "no visible cooker hood (a hidden downdraft or ceiling extractor), so the wall above the cooker stays clear",
};

const UPPER_WORDS: Record<Style["upper"], string> = {
  units: "wall units in the same door style and colour as the base units, where wall units are now (or on plain wall above the worktop if there are none); never in front of a window",
  shelves: "open floating timber shelves instead of wall units, with only a few plates or jars on them; never in front of a window",
  none: "no wall units or shelves, just a clean wall above the splashback",
};

const PENDANT_WORDS: Record<Style["pendants"], string> = {
  globe: "two or three glass globe pendant lights",
  dome: "two or three metal dome pendant lights",
  linear: "one slim linear pendant light",
  none: "",
};

const known = (table: Record<string, string>, label: string) => table[label.toLowerCase()];

function handleWords(label: string): string {
  if (label.toLowerCase() === "handleless") {
    return "none, the doors are handleless, with a slim recessed finger-pull groove in the unit colour";
  }
  const m = /^(brushed brass|matt black|polished chrome) (knobs|cup handles|bar handles)$/i.exec(label);
  if (m) return `${METALS[m[1].toLowerCase()]} ${HANDLE_SHAPES[m[2].toLowerCase()]} on every door and drawer`;
  return `"${label}" on every door and drawer`;
}

export type Room = {
  kitchen: boolean | null;
  usable: boolean | null;
  hasIsland: boolean | null;
  islandSpace: boolean | null;
  camera: string;
  fixed: string;
};

function islandWords(s: Style, room: Room | null): string[] {
  const lights = PENDANT_WORDS[s.pendants];
  if (room?.hasIsland) {
    return [
      "Island: keep the existing island exactly where it is, at the same size, and refit it to match the new units and worktop. Do not add a second island.",
      lights ? `Above the island: ${lights}.` : "Above the island: flush ceiling downlights only.",
    ];
  }
  if (!s.island) return ["Island: do not add an island or a peninsula."];
  const build = "one island in the open floor area, in the same door style and colour as the units with the same worktop, about 900 mm deep, sitting squarely on the floor in correct perspective, with at least 1 metre of clear walkway on every side";
  if (room?.islandSpace === true) {
    return [`Island: there is room, so add ${build}.`, lights ? `Above the island: ${lights}.` : ""].filter(Boolean);
  }
  if (room?.islandSpace === false) {
    return ["Island: do not add an island. This room does not have the floor space for one with a 1 metre walkway all round, so the design uses the walls only. No pendant lights."];
  }
  return [
    `Island: add ${build}, but only if the open floor in this photo clearly allows it. If there is any doubt, do not add one.`,
    lights ? `If you add an island, hang ${lights} above it; otherwise no pendant lights.` : "",
  ].filter(Boolean);
}

export function buildRestylePrompt(s: Style, room: Room | null): string {
  const mood = known(MOODS, s.styleName);
  const twistMood = s.twist ? known(MOODS, s.twist) : "";
  const twist = s.twist ? `, with a light touch of "${s.twist}"${twistMood ? ` (${twistMood})` : ""} in small details only` : "";
  const unit = `${s.unitName} (colour reference ${s.unitColour}, a ${describeHex(s.unitColour)})`;
  const splashColour = s.splashColour ? ` in ${describeHex(s.splashColour)} (colour reference ${s.splashColour})` : "";
  const splash = s.splashback === "marble" ? SPLASH_WORDS.marble : SPLASH_WORDS[s.splashback] + splashColour;
  const worktop = known(WORKTOPS, s.worktop) ?? `"${s.worktop}"`;
  const floor = known(FLOORS, s.floor) ?? `"${s.floor}"`;
  const walls = known(WALLS, s.wall) ?? `painted "${s.wall}"`;
  const design = [
    `THE NEW KITCHEN, IN THE CUSTOMER'S CHOSEN STYLE: "${s.styleName}"${mood ? ` (${mood})` : ""}${twist}. The finishes listed here come first.`,
    `- Units: ${DOOR_WORDS[s.doors]} on every base and tall unit${s.upper === "units" ? " and every wall unit" : ""}, in ${unit}.`,
    `- Handles: ${handleWords(s.handles)}.`,
    `- Worktop: ${worktop}.`,
    `- Splashback: ${splash}.`,
    `- Cooking: ${COOKER_WORDS[s.cooker]}. Extractor: ${HOOD_WORDS[s.hood]}.`,
    `- Above the worktop: ${UPPER_WORDS[s.upper]}.`,
    `- Floor: ${floor}, running through the whole visible floor.`,
    `- Walls: ${walls}.`,
    ...islandWords(s, room).map((x) => `- ${x}`),
    "- Lighting: slim recessed ceiling downlights and a soft warm LED strip under the wall units or shelves, with daylight from the window still the main light.",
  ].join("\n");
  const notes = room && (room.camera || room.fixed)
    ? `\n\nWHAT THIS PHOTO SHOWS (from a first look; these stay as they are):${room.camera ? `\nCamera: ${room.camera}` : ""}${room.fixed ? `\nFixed points: ${room.fixed}` : ""}`
    : "";
  return `${RULES}\n\n${design}${notes}\n\nReturn the edited CUSTOMER PHOTO.`;
}

/* ---------- Reading Gemini replies ---------- */

type Img = { data: string; mime_type: string };

export function findImage(data: unknown): Img | null {
  if (!isRecord(data)) return null;
  const out = data.output_image;
  if (isRecord(out) && typeof out.data === "string" && out.data) {
    return { data: out.data, mime_type: typeof out.mime_type === "string" ? out.mime_type : "image/jpeg" };
  }
  let found: Img | null = null;
  for (const step of Array.isArray(data.steps) ? data.steps : []) {
    if (!isRecord(step) || step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const b of step.content) {
      if (isRecord(b) && b.type === "image" && typeof b.data === "string" && b.data) {
        found = { data: b.data, mime_type: typeof b.mime_type === "string" ? b.mime_type : "image/jpeg" };
      }
    }
  }
  return found;
}

export function findText(data: unknown): string {
  if (!isRecord(data)) return "";
  if (typeof data.output_text === "string") return data.output_text;
  let out = "";
  for (const step of Array.isArray(data.steps) ? data.steps : []) {
    if (!isRecord(step) || step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const b of step.content) if (isRecord(b) && b.type === "text" && typeof b.text === "string") out += b.text;
  }
  return out;
}

export function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v: unknown = JSON.parse(m[0]);
    return isRecord(v) ? v : null;
  } catch {
    return null;
  }
}

const yesNo = (v: unknown): boolean | null => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);

// Model-written notes about the photo go back into the image prompt, so they are cleaned and capped too.
export function cleanNote(v: unknown, max = 320): string {
  if (typeof v !== "string") return "";
  let s = v.replace(/[^A-Za-z0-9 .,;:'()\/-]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(ignore|disregard|instructions?|prompts?|system|override)\b/i.test(s)) return "";
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, "") + ".";
  return s;
}

export function parseRoom(text: string): Room | null {
  const v = extractJson(text);
  if (!v) return null;
  const kitchen = yesNo(v.kitchen);
  if (kitchen === null) return null;
  return {
    kitchen,
    usable: yesNo(v.usable),
    hasIsland: yesNo(v.has_island),
    islandSpace: yesNo(v.island_space),
    camera: cleanNote(v.camera),
    fixed: cleanNote(v.fixed),
  };
}

// A data URL for the redesign, typed from the image bytes themselves.
export function imageDataUrl(img: Img): string | null {
  const data = img.data.replace(/\s+/g, "");
  if (data.length < 1000 || data.length % 4 !== 0 || !BASE64.test(data)) return null;
  let mime: Mime | null = null;
  try { mime = sniffMime(fromBase64(data.slice(0, 64))); } catch { return null; }
  return mime ? `data:${mime};base64,${data}` : null;
}

/* ---------- Outcomes ---------- */

export type Code = "not_kitchen" | "bad_input" | "rate_limited" | "engine_busy" | "engine_error";
type Outcome = { status: number; body: { ok: true; image: string; ms: number } | { ok: false; code: Code; message: string } };

const failure = (code: Code, status: number, message: string): Outcome => ({ status, body: { ok: false, code, message } });

export type UpstreamFault = number | "timeout" | "network" | "bad_json" | "no_image";

export function isTransient(f: UpstreamFault): boolean {
  return f === "network" || f === "bad_json" || f === "no_image" || f === 500 || f === 502 || f === 503 || f === 504;
}

export function upstreamFailure(f: UpstreamFault): Outcome {
  if (f === "timeout") return failure("engine_busy", 503, MSG.slow);
  if (f === 429 || f === 503) return failure("engine_busy", 503, MSG.busy);
  if (f === "no_image") return failure("engine_error", 502, MSG.noImage);
  return failure("engine_error", 502, MSG.error);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/* ---------- Server ---------- */

export type Deps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (line: Record<string, unknown>) => void;
};

type Stats = Record<string, string | number>;

async function readCapped(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}

async function callGemini(d: Deps, key: string, body: unknown, timeoutMs: number): Promise<{ ok: true; data: unknown } | { ok: false; fault: UpstreamFault }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs));
  try {
    const res = await d.fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, fault: res.status };
    try { return { ok: true, data: JSON.parse(text) }; } catch { return { ok: false, fault: "bad_json" }; }
  } catch {
    return { ok: false, fault: ctrl.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

async function restyle(req: Request, cfg: Config, d: Deps, limiter: RateLimiter, stats: Stats, t0: number): Promise<Outcome> {
  const origin = req.headers.get("origin");
  if (origin !== null && !originAllowed(origin, cfg.origins)) return failure("bad_input", 403, MSG.origin);
  if (req.method !== "POST") return failure("bad_input", 405, MSG.request);
  if (!keyAccepted(req.headers, cfg.projectKeys)) { stats.note = "bad_project_key"; return failure("engine_error", 401, MSG.error); }
  if (!cfg.geminiKey) { stats.note = "no_gemini_key"; return failure("engine_error", 500, MSG.error); }

  const ip = clientIp(req.headers);
  if (!ip) stats.ip = "none";
  const early = limiter.peek(ip, d.now());
  if (early) return failure("rate_limited", 429, early === "day" ? MSG.daily : MSG.hourly);

  const text = await readCapped(req, MAX_BODY_BYTES);
  if (text === null) return failure("bad_input", 413, MSG.tooLarge);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return failure("bad_input", 400, MSG.request); }
  if (!isRecord(body)) return failure("bad_input", 400, MSG.request);
  const photo = checkPhoto(body.photo);
  if (!photo.ok) { stats.note = "photo"; return failure("bad_input", photo.status, photo.message); }
  const clean = sanitiseStyle(body.style);
  if (!clean.ok) { stats.note = "style:" + clean.field; return failure("bad_input", 400, MSG.style); }

  const blocked = limiter.take(ip, d.now());
  if (blocked) return failure("rate_limited", 429, blocked === "day" ? MSG.daily : MSG.hourly);
  const deadline = t0 + BUDGET_MS;

  // Step 1: is it a kitchen we can redesign? If this quick look fails for a passing reason, carry on without it.
  const c0 = d.now();
  const check = await callGemini(d, cfg.geminiKey, {
    model: cfg.checkModel,
    input: [{ type: "text", text: CHECK_PROMPT }, { type: "image", mime_type: photo.mime, data: photo.b64 }],
  }, CHECK_TIMEOUT_MS);
  stats.check_ms = d.now() - c0;
  let room: Room | null = null;
  if (check.ok) {
    room = parseRoom(findText(check.data));
    stats.check = room ? "ok" : "unread";
  } else {
    stats.check = String(check.fault);
    // Out of quota, or the key is refused: the image call would fail the same way, so stop here.
    if (check.fault === 429 || check.fault === 401 || check.fault === 403) return upstreamFailure(check.fault);
  }
  if (room?.kitchen === false) return failure("not_kitchen", 200, MSG.notKitchen);
  if (room?.usable === false) return failure("not_kitchen", 200, MSG.notUsable);
  if (room) stats.island = room.hasIsland ? "existing" : room.islandSpace ? "space" : "no_space";

  // Step 2: the redesign. One retry for a passing fault, only when there is time for it.
  const aspect = photo.exif ? null : nearestAspect(photo.width, photo.height);
  const request = {
    model: cfg.imageModel,
    input: [
      { type: "text", text: "CUSTOMER PHOTO (edit this one and return it):" },
      { type: "image", mime_type: photo.mime, data: photo.b64 },
      { type: "text", text: buildRestylePrompt(clean.style, room) },
    ],
    response_format: { type: "image", mime_type: "image/jpeg", image_size: IMAGE_SIZE, ...(aspect ? { aspect_ratio: aspect } : {}) },
    generation_config: { thinking_level: THINKING },
  };
  let fault: UpstreamFault = "timeout";
  let tries = 0;
  const i0 = d.now();
  while (tries < 2) {
    const left = deadline - d.now();
    if (left < 5_000) break;
    tries++;
    const r = await callGemini(d, cfg.geminiKey, request, Math.min(IMAGE_TIMEOUT_MS, left));
    if (r.ok) {
      const img = findImage(r.data);
      const url = img ? imageDataUrl(img) : null;
      if (url) {
        stats.image_ms = d.now() - i0;
        stats.tries = tries;
        return { status: 200, body: { ok: true, image: url, ms: d.now() - t0 } };
      }
      fault = "no_image";
    } else {
      fault = r.fault;
    }
    if (!isTransient(fault) || tries >= 2 || deadline - d.now() < RETRY_MIN_MS) break;
    await d.sleep(RETRY_PAUSE_MS);
  }
  stats.image_ms = d.now() - i0;
  stats.tries = tries;
  stats.upstream = String(fault);
  return upstreamFailure(fault);
}

export function createHandler(cfg: Config, deps: Partial<Deps> = {}): (req: Request) => Promise<Response> {
  const d: Deps = {
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => console.log(JSON.stringify(line)),
    ...deps,
  };
  const limiter = new RateLimiter(cfg.hourlyLimit, cfg.dailyCap);

  return async (req: Request): Promise<Response> => {
    const t0 = d.now();
    const cors = corsHeaders(req.headers.get("origin"), cfg.origins);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const stats: Stats = {};
    let out: Outcome;
    try {
      out = await restyle(req, cfg, d, limiter, stats, t0);
    } catch (e) {
      stats.note = "crash:" + (e instanceof Error ? e.name : "unknown");
      out = failure("engine_error", 500, MSG.error);
    }
    d.log({ fn: "kitchen-restyle", code: out.body.ok ? "ok" : out.body.code, status: out.status, ms: d.now() - t0, ...stats });
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  };
}

Deno.serve(createHandler(readConfig((name) => Deno.env.get(name))));
