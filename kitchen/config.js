/* Kitchen engine settings for Kitchen style match.
   Fill these in after the Supabase project is created and the kitchen-restyle function is deployed
   (see engine/SETUP.md):
     url:     the Supabase project URL, for example 'https://abcd.supabase.co'
     anonKey: the project's anon (public) key. It is safe in the browser; the AI key stays in the function.
   While url is empty the engine is switched off: customers still add a photo and swipe, and they see
   the illustrated design from their swipes, never a pretend redesign of their photo. */
window.RV_KITCHEN_ENGINE = { url: '', anonKey: '' };
