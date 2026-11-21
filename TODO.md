# Aurora — delivery status

## Website and media discovery
- [x] Responsive English, left-to-right Aurora website with cinematic night/aurora visual identity, home, discovery, My List, and title details.
- [x] TMDB movie and TV discovery, search, title details, ratings, genres, and descriptions where available.
- [x] The site does not host or stream copyrighted media; it displays informational metadata and identifies TMDB as the source.

## Supabase authentication and favorites
- [x] Supabase Auth email magic-link flow for sign-in and account creation, with session restoration and sign-out.
- [x] Per-user saved titles can be listed, added, and removed; movie and TV entries are distinguished, and database errors are surfaced.
- [x] SQL schema and row-level security policies restrict reading, inserting, and deleting saved titles to their owner.
- [ ] Run `supabase/schema.sql` in the Supabase SQL Editor and enable/configure email authentication and allowed redirect URLs in the Supabase project dashboard.

## Runtime and verification
- [x] TMDB API proxy keeps its access token on the server.
- [x] TypeScript checks and Vite production build pass.
- [x] Supabase URL and anon key are configured as environment settings; no service-role key is sent to the browser.
