# Setting up the kitchen engine

This switches on the real redesign in Kitchen style match: a customer adds a photo of their kitchen, swipes, and sees their own kitchen refitted in the style they picked.

It takes about 15 minutes, all in the Supabase dashboard, much like the bathroom visualiser. The kitchen engine gets its own project, so nothing you do here touches the bathroom visualiser.

## What you need

- Your Supabase login (the Blulabs organisation).
- Your Google AI Studio key, the one that starts with `AIza`. The key the bathroom visualiser uses works. You can also make a separate key so you can see the kitchen spend on its own (step 8).
- About 15 minutes.

## Steps

1. **Sign in to Supabase** at supabase.com and check the organisation switcher at the top left says **Blulabs**.

2. **Create a new project.** Press **New project** and fill in:
   - Name: `riverside-playground`
   - Database password: press **Generate a password** and save it in your password manager. The engine never uses it.
   - Region: **West EU (London)**.
   - Plan: Free is fine.

   Press **Create new project** and wait a minute or two until it says it is ready. Do not use the `riverside-visualiser` project for this. The two must stay separate.

3. **Start a new function.** In the left sidebar, open **Edge Functions**, press **Deploy a new function** and choose **Via Editor**.

4. **Name it `kitchen-restyle`.** Use exactly that name, all lower case with a hyphen. The kitchen page looks for this name.

5. **Paste the code.** Open `engine/kitchen-restyle/index.ts` in the riverside-playground repository on GitHub and press the **Copy raw file** button (two overlapping squares, top right of the code). In the Supabase editor, select everything that is already there, delete it, and paste.

6. **Deploy.** Press **Deploy function** at the bottom and wait for the success message (10 to 30 seconds).

7. **Switch off JWT verification for this function.** Open the function's **Details** page. Find the setting about JWT verification (it may be called **Verify JWT with legacy secret** or **Enforce JWT verification**), switch it off and save.

   This is needed because the kitchen page uses the new publishable key, which the platform's JWT check does not understand. The function checks the key itself instead, and only accepts this project's own key. Browsers will also only let pages on the playground's own web address use it.

8. **Add the Google key as a secret.** In the left sidebar, open **Edge Functions**, then **Secrets**. Add:
   - Name: `GEMINI_API_KEY`
   - Value: your Google AI Studio key.

   Press **Save**. Secrets work straight away; you do not need to deploy again.

   If you would like to track kitchen spend separately, go to aistudio.google.com, open **Get API key**, create a new key called "Riverside playground", and use that one here instead.

9. **Optional settings.** You can add any of these as secrets too. Leave them out to use the defaults.

   | Name | Default | What it does |
   |---|---|---|
   | `DAILY_CAP` | `150` | The most redesigns in one day, across everyone. Set it to `0` to pause the engine. |
   | `HOURLY_LIMIT_PER_IP` | `8` | The most redesigns one connection can ask for in an hour. |
   | `ALLOWED_ORIGINS` | the playground address and the local test address | Only change this if the playground moves to a different web address. Separate addresses with commas. |

10. **Copy two values for the kitchen page.**
    - **Project URL:** press **Connect** at the top of the dashboard (or open **Project Settings**, then **Data API**). It looks like `https://abcdefghijkl.supabase.co`.
    - **Publishable key:** open **Project Settings**, then **API Keys**. Copy the **publishable** key, which starts with `sb_publishable_`.

    If you chose to leave JWT verification on in step 7, copy the **anon** key from the **Legacy API keys** tab instead (it starts with `eyJ`). Legacy keys are being retired by Supabase, so the publishable key is the better choice.

11. **Put them in the kitchen page.** Open `kitchen/config.js` and fill in the two values:

    ```js
    window.RV_KITCHEN_ENGINE = { url: 'https://abcdefghijkl.supabase.co', anonKey: 'sb_publishable_...' };
    ```

    Or just send the Project URL and the publishable key to Claude and it will do this for you. Never send the Google key.

12. **Try it on your own kitchen.** Open Kitchen style match on your phone, add a photo of your kitchen taken from the doorway with the whole room in view, and swipe. The redesign should appear about 20 to 40 seconds after the last swipe. Hold the picture to see your kitchen as it is today.

## Cost

Each redesign makes two calls to Google: a quick check that the photo is a kitchen, then the redesign itself. That comes to roughly 5p to 10p per redesign. With the default daily cap of 150, the most it can spend in a day is roughly £8 to £15. A photo that is not a kitchen costs a fraction of a penny, because it stops after the quick check.

It is worth setting a budget alert on the Google account the key belongs to.

## Keys, in plain terms

- **The publishable key (or anon key) is safe to be public.** It sits in the web page by design, and anyone can see it. Someone determined could still use it from a script, which is why the hourly limit and the daily cap exist: `DAILY_CAP` sets the most the engine can cost in a day, whoever is calling it.
- **The Google key must only ever live in Supabase secrets.** Never put it in `kitchen/config.js`, on GitHub, in an email or in a chat. If it ever leaks, delete it in Google AI Studio, make a new one and paste the new one into the `GEMINI_API_KEY` secret.

## Privacy

The customer's photo goes from their phone to the function and on to Google to make the redesign. It is never saved and never written to the logs. The logs only show timings and result codes.

## If something goes wrong

- **The page shows the illustrated design and says it could not redesign the photo.** Open **Edge Functions**, then `kitchen-restyle`, then **Logs**. Each redesign writes one line with a `code`:
  - `ok`: it worked.
  - `not_kitchen`: the photo did not look like a kitchen, or the room could not be seen clearly.
  - `rate_limited`: the hourly or daily limit was reached.
  - `engine_busy`: Google was busy, out of quota, or took too long.
  - `engine_error` with `"note":"no_gemini_key"`: the `GEMINI_API_KEY` secret is missing (step 8).
  - `engine_error` with `"status":401`: the key in `kitchen/config.js` is not this project's key (step 10).
- **No log line appears at all.** JWT verification is probably still on (step 7), or the Project URL in `kitchen/config.js` is wrong.
- **To pause the engine,** set `DAILY_CAP` to `0`. Customers then see the illustrated design from their swipes, as before. To switch it off completely, empty the `url` in `kitchen/config.js`.

## Updating the function later

Open **Edge Functions**, then `kitchen-restyle`, then **Code**. Select everything, paste the new version, and press **Deploy updates**. The secrets stay as they are.
