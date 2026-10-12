# Kitchen engine

`kitchen-restyle` is the Supabase Edge Function behind Kitchen style match. It takes the customer's kitchen photo and the style their swipes produced, and returns a photo of the same kitchen refitted in that style.

It lives in its own Supabase project (`riverside-playground`) and shares nothing with the bathroom visualiser at runtime: different project, different function, different secrets, no shared code. Only the way it calls Gemini (endpoint, request and reply shape, model names) follows the visualiser, because that pattern is proven.

Owner set-up steps are in [SETUP.md](SETUP.md).

## Files

| File | What it is |
|---|---|
| `kitchen-restyle/index.ts` | The whole function, one file, no imports. Paste it into the Supabase editor as it is. |
| `SETUP.md` | Plain-English set-up for the owner. |

The front end that calls it is `kitchen/engine.js`, configured by `kitchen/config.js`.

## Contract

`POST {project URL}/functions/v1/kitchen-restyle` with `Content-Type: application/json`, `apikey: {publishable or anon key}` and `Authorization: Bearer {same key}`.

```json
{ "photo": "data:image/jpeg;base64,...",
  "style": { "styleName": "Dark and dramatic", "twist": "Warm minimal", "doors": "shaker", "unitColour": "#28364C", "unitName": "ink blue",
             "worktop": "Marble-effect quartz", "splashback": "marble", "splashColour": null, "handles": "Brushed brass knobs",
             "wall": "Soft white", "floor": "Oak herringbone", "island": true, "pendants": "globe", "cooker": "hob",
             "hood": "canopy", "upper": "units" } }
```

| Result | HTTP | Body |
|---|---|---|
| Redesign | 200 | `{ "ok": true, "image": "data:image/jpeg;base64,...", "ms": 23000 }` |
| Not a kitchen, or the room cannot be seen | 200 | `{ "ok": false, "code": "not_kitchen", "message": "..." }` |
| Bad photo, bad style, wrong method, other website | 400, 403, 405 or 413 | `code: "bad_input"` |
| Hourly or daily limit | 429 | `code: "rate_limited"` |
| Google busy, out of quota or too slow | 503 | `code: "engine_busy"` |
| Anything else | 401, 500 or 502 | `code: "engine_error"` |

Every `message` is one plain British English sentence that is safe to show the customer. Google's own error text, the model's words and the key are never passed back. `OPTIONS` returns 204 with CORS headers for allowed origins.

## How a request is handled

1. **Gatekeeping.** Origin must be in `ALLOWED_ORIGINS` (requests with no Origin, such as a test from a terminal, are allowed). The `apikey` or bearer token must be one of this project's own keys, which Supabase provides to the function as `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_ANON_KEY`. Limits are checked before the body is read.
2. **Validation.** The body is read with a 4.4 MB cap. `photo` must be a base64 data URL of a JPEG, PNG or WebP of at most 3 MB; the real type and size are read from the image bytes, and the short edge must be at least 240 px. Enum fields must be from the contract's lists, colours must be hex, `island` must be a boolean. Free-text fields (`styleName`, `twist`, `unitName`, `worktop`, `handles`, `wall`, `floor`) must be short plain labels (40 characters, 6 words, letters, numbers, spaces and `-',&` only) with no instruction-like words; anything else is refused with `bad_input` rather than cleaned up and used.
3. **Check** (text model, 20 s timeout). Asks whether this is a real kitchen photo that can be redesigned, whether it already has an island, whether there is clearly room for one with a 1 m walkway all round, and for a short note on the camera position and fixed points. A clear "no" ends the request with `not_kitchen`. If the check itself fails for a passing reason, the redesign goes ahead without it; quota or key errors stop the request.
4. **Restyle** (image model, up to 75 s, inside an 85 s overall budget because the page gives up at 90 s). The prompt is built only from fixed rules, a catalogue of finish descriptions keyed by the whitelisted labels, and the cleaned check notes. One retry for a passing fault (network, 5xx, no image in the reply) when at least 30 s remain. The output aspect ratio is set to the closest supported ratio to the photo, so the frame stays the same.

The prompt's hard rules: same room, camera, framing and field of view; walls, windows, doors and ceiling unchanged; sink, cooker and fridge stay where they are; only work a kitchen fitter does changes (fronts and carcasses, worktop, splashback, handles, flooring, wall colour, lighting); an island only when the customer wants one and the check says there is clearly room (or, without a check, only if clearly room); clutter removed; looks like a real phone photo of a finished job, with the same daylight and grain, tiles at true scale, no showroom glow, no people, text or watermarks.

## Settings (Supabase secrets)

| Secret | Default | Notes |
|---|---|---|
| `GEMINI_API_KEY` | none, required | Google AI Studio key. Only ever stored here. |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-image` | Same image model as the bathroom visualiser. |
| `GEMINI_CHECK_MODEL` | `gemini-3.8-flash` | Same text model as the bathroom visualiser. |
| `ALLOWED_ORIGINS` | `https://blulabsdigital-lgtm.github.io,http://127.0.0.1:8765,http://localhost:8765` | Comma-separated, no paths. |
| `HOURLY_LIMIT_PER_IP` | `8` | Redesign requests per address per rolling hour. |
| `DAILY_CAP` | `150` | Redesign requests per UTC day across everyone. `0` pauses the engine. |

JWT verification must be switched off for this function (see SETUP.md, step 7), because the platform's JWT check rejects the new `sb_publishable_` keys when they arrive as a bearer token, and `kitchen/engine.js` sends the key in both headers. The function does its own key check instead. A legacy anon key also works, with or without platform verification.

## Abuse protection and its limits

- The hourly and daily limits are kept in the function's memory. They reset whenever the function cold-starts, and each running copy keeps its own count, so under load the real ceiling can be a few times higher than the setting. Good enough for a demo; for production, keep the counts in a proper store, for example a small Supabase table with RLS on and only the service role allowed to write, updated with an atomic `insert ... on conflict ... returning`, or a Redis counter such as Upstash.
- The address comes from `X-Forwarded-For` (first entry), which a caller can influence. The daily cap is the real spend ceiling.
- Allowed origins stop other websites using the engine from a browser. They do not stop a script that fakes the header; the limits do.
- Requests refused for bad input are not counted against the limits; accepted ones count whether or not the photo turns out to be a kitchen.

## Privacy and logs

The photo is never stored and never logged. Each request writes one JSON log line with timings and codes only, for example:

```json
{"fn":"kitchen-restyle","code":"ok","status":200,"ms":24113,"check_ms":3880,"check":"ok","island":"no_space","image_ms":20201,"tries":1}
```

Other fields that can appear: `upstream` (Google's HTTP status, or `timeout`, `network`, `no_image`), `note` (`no_gemini_key`, `bad_project_key`, `photo`, `style:<field name>`) and `ip: "none"` when no address header arrived. No address, key, photo, image or customer text is logged.

## Cost

Two Gemini calls per redesign (the check and the image), roughly 5p to 10p in total. A non-kitchen photo stops after the check and costs a fraction of a penny. `DAILY_CAP` bounds the daily spend.

## Verification so far

Done in the build container, where there is no network access to Google:

- Type-checked with `deno check` (Deno 2.9.6) and linted with `deno lint`, both clean. Also type-checked with plain `tsc` 6 in strict mode using a small Deno type shim (not shipped).
- 255 Node tests against the compiled function: config parsing, CORS, key check, address, rate limiter (including day roll-over and pruning), photo validation with real JPEG, PNG and WebP files (types, sizes, EXIF, large metadata before the frame header, over 3 MB, too small, wrong declared type, junk), all 180 style objects the real front end can send (all accepted, all finishes found in the catalogue), injection and junk in every free-text field, colour words, prompt contents for every island case, reply parsing, and the whole handler end to end with Google mocked: success, not a kitchen, unusable photo, check failures, quota, bad key, retry on 503, no retry on 400 or 429, no image twice, the overall budget, a real abort of a hung call and of a hung reply body, limits, origins, preflight, project keys, body caps, and that logs never contain the address, key or image.
- The real file served by Deno with Google mocked, driven by the real Kitchen style match page in Chromium at 390 px and 1280 px wide: the redesign appears, the not-a-kitchen message shows, the busy path retries once and falls back to the illustrated design, CORS works, no layout overflow.

Not verified, because it needs the live services:

- The real Gemini replies: that the models accept these requests, how good the redesigns look, how well they keep the room and camera, and how well the island judgement works. Try it on a real kitchen photo first (SETUP.md, step 12).
- Running on Supabase's edge runtime itself (it is Deno-based and the function uses only `Deno.serve`, `Deno.env` and web standard APIs), the exact names of the dashboard settings, and which address header Supabase passes through.
