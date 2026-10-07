import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { buildIcal, parseIcal } from "../netlify/lib/ical.mjs";
import { quote } from "../netlify/lib/pricing.mjs";
import { overlaps } from "../netlify/lib/bookings.mjs";
import { verifyWebhook } from "../netlify/lib/square.mjs";

const AIRBNB_SAMPLE = [
  "BEGIN:VCALENDAR",
  "PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN",
  "BEGIN:VEVENT",
  "DTEND;VALUE=DATE:20261015",
  "DTSTART;VALUE=DATE:20261010",
  "UID:abc@airbnb.com",
  "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HM\\n",
  " ABC123",
  "SUMMARY:Reserved",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261101",
  "UID:def@airbnb.com",
  "SUMMARY:Airbnb (Not available)",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("parses Airbnb iCal, end date exclusive, missing DTEND = one night", () => {
  assert.deepEqual(
    parseIcal(AIRBNB_SAMPLE).map(({ start, end }) => ({ start, end })),
    [
      { start: "2026-10-10", end: "2026-10-15" },
      { start: "2026-11-01", end: "2026-11-02" },
    ],
  );
});

test("exported iCal round-trips", () => {
  const ics = buildIcal([{ uid: "x@y", start: "2026-12-20", end: "2026-12-27", summary: "Reserved" }]);
  assert.match(ics, /DTSTART;VALUE=DATE:20261220/);
  assert.deepEqual(parseIcal(ics)[0].end, "2026-12-27");
});

test("checkout day can be the next check-in day", () => {
  const ranges = [{ start: "2026-10-10", end: "2026-10-15" }];
  assert.equal(overlaps(ranges, "2026-10-15", "2026-10-17"), false);
  assert.equal(overlaps(ranges, "2026-10-08", "2026-10-10"), false);
  assert.equal(overlaps(ranges, "2026-10-14", "2026-10-16"), true);
  assert.equal(overlaps(ranges, "2026-10-01", "2026-10-30"), true);
});

const P = { nightlyRate: 200, weekendRate: 250, cleaningFee: 100, taxRate: 0.12, taxExemptNights: 30, weeklyDiscount: 0.1, monthlyDiscount: 0.2, nightlyOverrides: { "2026-12-31": 400 } };

test("quote: weekend nights, cleaning, tax", () => {
  // Thu Oct 8 -> Sun Oct 11 = Thu, Fri, Sat nights
  const q = quote("2026-10-08", "2026-10-11", P);
  assert.equal(q.nights, 3);
  assert.equal(q.lodging, 70000);
  assert.equal(q.cleaning, 10000);
  assert.equal(q.tax, Math.round(80000 * 0.12));
  assert.equal(q.total, 80000 + 9600);
});

test("quote: override, weekly discount, 30+ nights tax exempt", () => {
  assert.equal(quote("2026-12-31", "2027-01-02", P).lodging, 40000 + 25000); // Thu override + Fri
  const week = quote("2026-10-05", "2026-10-12", P);
  assert.equal(week.discount, Math.round(week.lodging * 0.1));
  const month = quote("2026-10-01", "2026-11-01", P);
  assert.equal(month.tax, 0);
  assert.equal(month.discount, Math.round(month.lodging * 0.2));
});

test("webhook signature verification", () => {
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "secret";
  const url = "https://example.com/api/square-webhook";
  const body = '{"type":"payment.updated"}';
  const sig = crypto.createHmac("sha256", "secret").update(url + body).digest("base64");
  assert.equal(verifyWebhook({ signature: sig, body, url }), true);
  assert.equal(verifyWebhook({ signature: sig, body: body + " ", url }), false);
  assert.equal(verifyWebhook({ signature: undefined, body, url }), false);
});
