This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase heartbeat

The `Supabase Heartbeat` GitHub Actions workflow performs a small read from the `deals` table every six hours and can also be run manually.

Add these repository Actions secrets before running it:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the Supabase publishable key)

The workflow fails clearly if either secret is missing or Supabase does not return a successful response.


## Automated Keepa discovery

The `Keepa Discovery` workflow calls the deployed app's protected automation endpoint and rotates through four initial streams:

- `woodworking_core`
- `outdoor_power_tools`
- `tech_deals`
- `dad_power`

Required Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KEEPA_API_KEY`
- `AUTOMATION_SECRET`

Required GitHub Actions secrets:

- `APP_URL` — the deployed app origin, such as `https://example.vercel.app`
- `AUTOMATION_SECRET` — the same random value configured in Vercel

After deployment, run the workflow manually for one stream before relying on the schedule. Discovery writes results to `deal_candidates`.

The `Enrich Deal Candidates` workflow processes up to 50 queued records per hour. It batches Keepa product requests, hydrates current public data through Amazon Creators API, applies brand tiers and scoring, and stores the review payload in `deal_candidates.raw_data.enrichment` with status `enriched`. It does not publish deals automatically.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Public and admin PWA projects

Deploy this repository as **two separate Vercel projects** so browsers install the
public Deals experience and the authenticated Posting Desk as distinct PWAs:

1. Create a public project from this repository. Leave `APP_SURFACE` unset (or
   set it to `public`) in every Vercel environment. Its root URL remains the
   Wooden Robot Deals feed.
2. Create a second project from the same repository and branch. Set
   `APP_SURFACE=admin` in Production, Preview, and Development. Its root URL
   redirects to `/admin/deal-schedule`, and its root-scoped manifest includes
   `/login` and `/auth/callback` in the installed application's navigation
   scope.
3. Configure the existing Supabase and server-side secrets independently on
   both projects. Add each project's callback URL to the Supabase authentication
   redirect allow list; for the admin project that is
   `https://<admin-domain>/auth/callback`.

Do not assign both projects the same production domain: each origin publishes a
different root-scoped `/manifest.webmanifest` and service-worker registration.

/data/ignored-asins.json has been deprecated. Moved to Supabase.
