# Local demo, no paid calls

1. With Node.js 20 or newer, run `npm ci --ignore-scripts`.
2. Run `npm run demo` and open `http://127.0.0.1:5070`.
3. Browse **Library**, or open **Try Agent Memory** in the demo banner, load its overview, approve the lesson, then open it from **My Lessons** and download it.

`npm run check` validates TypeScript. While the demo is running, `npm run test:demo` checks all 100 bundled lesson renders and the overview/build/read/progress/download loop.

This entry reuses `public/` and the real Blueprint renderer with `prebuilt/` fixtures. The visible demo notice identifies its limits: requested topics select the nearest cached lesson, no new AI content is generated, and saved lessons/progress reset when the server restarts. Unsupported uploads, AI follow-ups, skills, payments and auth actions return an explicit disabled response.

The launcher drops inherited provider/database credentials and does not load `.env`. The demo server imports no production provider, database or auth modules and binds only to loopback. Do not deploy this entry. `PORT=5071 npm run demo` selects another local port; use `DEMO_BASE_URL=http://127.0.0.1:5071 npm run test:demo` for its smoke check.

The normal `npm start` entry requires PostgreSQL and Auth.js settings. With `ALS_MOCK_MODE=1`, it runs real authentication and cached lessons without provider keys. See `docs/auth-and-launch.md`; production deployment remains a separate verification step.
