# TaskSchedular AI — website deployment

This project has been prepared for a browser-based Expo web build served by the existing Express API.

## Build

```bash
npm ci
npm run build
npm run start:production
```

The web export is written to `dist/`; the Express server serves it and the `/api` endpoints from the same origin. This avoids needing Replit-specific domains and avoids production CORS configuration for a single-host deployment.

## Required hosting environment variables

Configure these in the hosting provider's private environment-variable settings (do not put secrets in source code):

- `DATABASE_URL` — PostgreSQL connection string.
- `OPENAI_API_KEY` — required for AI timetable features.
- `SENDER_EMAIL` and `SENDER_APP_PASSWORD` — required for password-reset email delivery using the configured Gmail transport.
- `NODE_ENV=production`
- `PORT` — normally supplied automatically by the hosting provider.

If the API is hosted separately from the website, set `EXPO_PUBLIC_API_URL` to the HTTPS API origin at **web build time**, and set `CORS_ORIGINS` on the API service to the exact website origin(s), comma-separated. For a single-host deployment, leave both unset.

## Important

- A ZIP is not itself a live website. It must be uploaded to a Node.js hosting provider and connected to a PostgreSQL database.
- Keep all credentials in the hosting provider's environment settings. Never commit them or send them in chat.
- This package has not been deployed or verified against a live database, email account, or AI API key. Hosting free-tier limits and sleep policies vary.
- Test sign-up, sign-in, password reset, timetable creation, friends sync, and PDF export on an actual Android phone after deployment.
