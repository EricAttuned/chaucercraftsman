# The Chaucer Craftsman: direct-booking site

A website for the Poets Corner craftsman where guests can see the photos, check live
availability (synced with Airbnb), and book and pay through **Square** without Airbnb's
guest service fee.

```
public/                 the website (plain HTML/CSS/JS)
  index.html            listing page + booking widget
  confirmed.html        page guests land on after paying
  admin.html            your private list of direct bookings
  photos.json           photo order, rooms and captions for the gallery
  images/full|thumb/    optimized photos (generated from the uploads on main)
netlify/functions/      small server functions (availability, quote, checkout, webhook, iCal feed)
netlify/lib/config.mjs  ← prices, minimum stay, tax, check-in times. Edit this.
```

## How it works

1. **Airbnb → website:** the site reads your Airbnb iCal export link, so any night booked or
   blocked on Airbnb shows as unavailable here (refreshed every 5 minutes).
2. **Guest books:** they pick dates and see the price (nightly rate, cleaning fee, Berkeley
   occupancy tax), enter their details, and go to a **Square-hosted checkout page**. Their
   dates are held for 30 minutes while they pay.
3. **Payment confirmed:** Square sends the guest a receipt and notifies you. The booking is
   marked confirmed (through a Square webhook, with a check when the guest returns as backup).
4. **Website → Airbnb:** the site publishes its own calendar feed at
   `https://<your-site>/calendar.ics`. Import it into Airbnb, and direct bookings block those
   nights on Airbnb.

> **Sync gap:** Airbnb only re-reads imported calendars about every 3 hours. After a direct
> booking, open Airbnb → Calendar → Availability → your imported calendar → **Refresh**, or
> block the dates by hand, so no one books the same nights on Airbnb in that window.

## Setup (about 30 minutes, one time)

### 1. Deploy to Netlify (free)
1. Sign in at [netlify.com](https://app.netlify.com) with GitHub → **Add new site → Import an existing project** → pick `chaucercraftsman`.
2. Leave the build settings as they are (`netlify.toml` handles them) → **Deploy**.
3. Optional: **Domain settings** → add your own domain.

Bookings are stored in Netlify Blobs, which needs no database setup.

### 2. Connect Square
1. Go to [developer.squareup.com](https://developer.squareup.com/apps) and sign in with your Square account → **Create an app** (name it anything).
2. Open the app → switch the toggle at the top to **Production** → **Credentials** → copy the **Production access token**.
3. **Locations** (left menu) → copy your **Location ID**.
4. **Webhooks → Subscriptions → Add subscription**:
   - URL: `https://<your-site>/api/square-webhook`
   - Events: `payment.created` and `payment.updated`
   - Save, then copy the **Signature key**.

To try it with fake cards first, use the **Sandbox** credentials and leave
`SQUARE_ENVIRONMENT` unset. Square's test card is `4111 1111 1111 1111`.

### 3. Add environment variables in Netlify
**Site configuration → Environment variables**:

| Name | Value |
|---|---|
| `AIRBNB_ICAL_URL` | your Airbnb export link (`https://www.airbnb.com/calendar/ical/1091351118417823262.ics?t=…`). For more than one (e.g. VRBO), separate them with commas. |
| `SQUARE_ACCESS_TOKEN` | from step 2 |
| `SQUARE_LOCATION_ID` | from step 2 |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | from step 2 |
| `SQUARE_ENVIRONMENT` | `production` (leave unset for sandbox testing) |
| `ADMIN_KEY` | a long random password for `/admin.html` |
| `CALENDAR_FEED_KEY` | optional: a random string that makes the calendar feed private |

Then **Deploys → Trigger deploy** so the functions pick them up.

### 4. Send direct bookings to Airbnb
Airbnb → **Calendar** → your listing → **Availability** → **Connect calendars** →
**Connect to another website** → **Import**:
- Calendar address: `https://<your-site>/calendar.ics` (add `?key=<CALENDAR_FEED_KEY>` if you set one)
- Name: `Direct bookings`

### 5. Set your prices
Edit `netlify/lib/config.mjs` (on GitHub, the pencil icon works fine): `nightlyRate`,
`weekendRate`, `cleaningFee`, `minNights`, discounts, holiday `nightlyOverrides`, and check-in
times. Committing redeploys the site automatically. The nightly rate is $350; the cleaning
fee ($150) and 2-night minimum are defaults, so adjust them if they differ from Airbnb.

## Day-to-day

- **New booking:** Square emails you the payment. Guest details (name, email, phone, note)
  are in `/admin.html`. Send the guest the address and check-in instructions.
- **Cancel/refund:** refund the guest in the Square dashboard, then click **Cancel** in
  `/admin.html` to release the dates.
- **Block dates:** block them on Airbnb as usual; the website picks them up within minutes.
- **Change photos:** add the file to `public/images/full` and `public/images/thumb`
  (about 1800px and 720px wide), then add a line to `public/photos.json`.

## Things to double-check before going live

- **Tax:** the quote adds Berkeley's Transient Occupancy Tax (`taxRate`, 12% now). On
  direct bookings *you* remit it, not Airbnb. Confirm the rate and your registration with the
  City of Berkeley.
- **Berkeley short-term-rental rules:** the city requires your zoning certificate (STR
  registration) number on every listing ad. Add it to the footer in `public/index.html`.
- **House rules and cancellation policy:** the "Things to know" section in `index.html` has
  sensible defaults. Edit it to match your Airbnb rules.

## Local preview & tests

```
npm install
npm test                 # unit tests (iCal parsing, pricing, webhook signatures)
npm run preview          # http://localhost:8888, uses an in-memory store
```
