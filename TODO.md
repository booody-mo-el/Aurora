# Aurora — delivery status

## English-language movie and TV discovery
- [x] Responsive English-language Aurora website with cinematic visual identity, Home, Discover, My List, search, and movie/TV detail pages.
- [x] TMDB-powered trending, popular movies and shows, search, title details, ratings, genres, descriptions, and poster/backdrop imagery where available.
- [x] Movie and TV entries retain their media type when opened and saved; the site does not host or stream copyrighted media and identifies TMDB as its source.

## Cinematic motion and visual effects
- [x] Night-sky/aurora gradients, subtle ambient drift, film-grain overlay, layered hero treatment, animated cards, and hover/focus transitions.
- [x] Short muted Aurora intro video with wordmark reveal, cinematic vignette/scale treatment, one-time-per-session playback, and reduced-motion handling.
- [x] Responsive edge spacing and mobile layout, including the community-review section.

## Supabase authentication and favorites
- [x] Email magic-link sign-in/account creation, session restoration, and sign-out.
- [x] Signed-in users can list, add, and remove their own saved titles; database errors are surfaced.
- [x] SQL schema and RLS policies restrict favorite reads/writes to the owner.

## Ratings and reviews
- [x] Every movie and TV detail page reads community reviews from Supabase and displays the current average and review count.
- [x] Signed-in users can publish a 1–10 rating with a required comment of up to 2,000 characters, and edit their own review; one review is allowed per user and title.
- [x] Review reads are public; Supabase RLS restricts review insert/update/delete to the review owner.
- [ ] Apply `supabase/schema.sql` in the Supabase SQL Editor to create/enable the favorites and review tables and policies.

## Runtime and verification
- [x] TMDB API proxy keeps its access token server-side; title-list requests fail independently so one unavailable collection does not blank the others.
- [x] TypeScript checks and Vite production build pass.
- [x] TMDB home, popular movie, popular TV, and detail API endpoints returned HTTP 200 in the current preview environment; intro MP4 is served by the app.
- [ ] In Supabase Dashboard, enable/configure email authentication and allowed redirect URLs; live review/favorite persistence depends on applying the SQL schema above.

## Production deployment
- [x] Production container installs the locked pnpm toolchain, builds the Vite site and compiled Express server, installs only runtime dependencies in its final stage, listens on the supplied `PORT` (default 3000), and serves the unauthenticated `/api/health` endpoint. Credentials are read only from runtime environment and are not copied into the image.
