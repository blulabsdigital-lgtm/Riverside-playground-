# Riverside playground

Three demo tools for Riverside Construction Group, built by Blulabs to test with Alex. They follow the same formula as the bathroom visualiser: a few taps, a strong visual straight away, a guide price, and a tidy brief for Alex so the first call is about the project, not about collecting details.

These are pure front-end demos. Nothing is sent anywhere, there is no AI image generation, and every visual is drawn in the browser.

## The tools

| Tool | Folder | For the customer | For Alex |
|---|---|---|---|
| Kitchen style match | `kitchen/` | Swipe ten kitchens, get a named style, a kitchen designed from their picks and a guide price. About 30 seconds. | A style brief: what they loved and rejected, palette, spec, size, budget and questions for the call. |
| Grow your home | `extension/` | Pick a house, drag the back wall out, tap the roof for a loft. Live extra space, guide price, weeks on site and planning route. | A project brief for his biggest jobs: house, project, budget, planning route and survey questions. |
| Riverside Live (the unique one) | `live/` | A live page for their build: an illustration that builds itself stage by stage, progress, who is on site, photos, timeline and anything needed from them. | The crew updates it with one tap, so no "how's it going?" calls, fewer chasing messages, and a review request at handover. |

`index.html` is the playground home page linking all three.

## How to test

- Open the home page on a phone and try each tool.
- **Kitchen style match:** swipe right on what you like. Pick a size at the end, then press "Book a design consultation" and use "Use demo details" to see what Alex receives.
- **Grow your home:** drag the gold handle on the back of the house, tap the "+" on the roof, then book.
- **Riverside Live:** on a laptop, both phones sit side by side. Press "Mark stage done" on the crew phone and watch the customer's page update. On a phone, switch between the two tabs. "Reset the demo" puts it back to the start. Two tabs in the same browser stay in sync.

## Placeholders to confirm with Alex

- **Kitchen guide prices:** compact £15k–£20k, medium £20k–£28k, large £28k–£36k, open-plan from £36k. These sit inside his published £15k–£40k+. They live in `kitchen/app.js` under `SIZES`.
- **Extension and loft figures:** cost per m², loft prices and weeks are in `extension/app.js` under `HOUSES` and `RATE`, inside his published ranges.
- **Planning wording:** this is general England permitted development guidance (3 m / 4 m, prior approval up to 6 m / 8 m, loft volume 40 / 50 m³), worded as "usually" and "likely".
- **Riverside Live:** the job, crew names and stages are made up for the demo.
- **Kitchen pictures:** these are illustrations. Each kitchen in `assets/kitchen-art.js` takes an optional `photo` URL, so Alex's own kitchen photos can replace the drawings.

## Files

- `assets/riverside.css`: shared black and gold look (same colours as the visualiser).
- `assets/riverside.js`: header, toast, confetti, the details form and the "What Alex receives" brief.
- `assets/kitchen-art.js`: the kitchen illustration engine and the ten kitchens.
- `assets/house.js`: the house illustration engine, used by Grow your home and Riverside Live.
- `tests/`: Playwright scripts used to check each flow at 390 px and desktop width.

## To make them real

- Send each brief to Alex by WhatsApp and email, the same way the visualiser does (Supabase function plus Resend).
- Riverside Live needs a small database, a crew login and one private link per customer.
