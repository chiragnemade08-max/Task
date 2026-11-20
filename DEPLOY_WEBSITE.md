# Deploy Taskschedular AI as a website

This project is an Expo Router app with an Express API and PostgreSQL database.
The website build is static, while the Express server handles `/api/*` and serves
the exported website from `dist/`.

## Build

Use Node.js 20 or newer:

```bash
npm ci
npm run web:build
npm run server:build
npm run server:prod
```

The server listens on `PORT` (default `5000`). Deploy the whole repository as a
Node web service; do not deploy only the `dist/` folder if you need login, tasks,
friends, AI timetable parsing, or cloud persistence.

## Required server environment variables

Configure these in the hosting provider's private environment-variable settings.
Never put secret values in source code or send them in chat.

- `DATABASE_URL` — PostgreSQL connection string.
- `OPENAI_API_KEY` — required for AI timetable features.
- `SENDER_EMAIL` and `SENDER_APP_PASSWORD` — required for email-based password reset.
- `PORT` — normally supplied automatically by the hosting provider.
- `CORS_ORIGINS` — only needed if the website and API use different domains;
  comma-separated exact origins such as `https://your-site.example`.

For a single-domain deployment, leave `EXPO_PUBLIC_API_URL` and
`EXPO_PUBLIC_DOMAIN` unset. The browser client uses the website's own origin,
so the API is same-origin and session cookies remain first-party.

If frontend and API are hosted on separate domains, set
`EXPO_PUBLIC_API_URL` at **web build time** to the full HTTPS API origin, and set
`CORS_ORIGINS` on the API service to the exact frontend origin. Cross-site
cookie authentication may require additional server cookie settings and should
be tested before relying on separate domains.

## Database

Create a PostgreSQL database and set `DATABASE_URL`. Apply the Drizzle schema
using the project's existing migration/push workflow (`npm run db:push`) from
a trusted deployment environment. Back up the database before schema changes.

## Important

- A static frontend by itself is not enough: the Express API and PostgreSQL
  database are needed for accounts and saved user data.
- The first deployment still needs provider setup, environment variables, and
  a database. Free tiers can sleep, impose limits, or change pricing.
- Test sign-up, sign-in, password reset email, task creation, friend sync, and
  refresh/deep links on the deployed HTTPS domain.
- This preparation does not create a live public URL automatically.
