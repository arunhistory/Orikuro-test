# X Timeline diagnosis

Checked 2026-08-23.

The official profile timeline embed currently remains as the fallback anchor text (`Posts by @orikuro_2027`) on the live integration path even when the official `twitter-timeline` markup and widgets loader are used.

The current X oEmbed documentation still emits a `twitter-timeline` anchor plus `platform.x.com/widgets.js`, but current real-world verification reports show profile timeline rendering itself is failing while single-post embeds continue to work.

Recommended production replacement for OC:

1. Use X API v2 `GET /2/users/{id}/tweets` for the OC-owned account.
2. Fetch server-side only (Cloudflare Worker / server function), never from browser JS.
3. Cache the latest posts for at least 15–60 minutes.
4. Store the Bearer Token as a server-side secret.
5. Render the cached posts as native OC cards and link each card to the original post on X.
6. Keep the current profile link as a fallback if the API is unavailable.

This avoids depending on the currently unreliable profile timeline widget and lets OC control layout, caching, fallback, and cost.
