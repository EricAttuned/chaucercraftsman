import { getStore } from "@netlify/blobs";
import { pricing, listing } from "./config.mjs";
import { parseIcal } from "./ical.mjs";
import { addDays, nightsBetween, parseDate, todayIn } from "./dates.mjs";

// Direct bookings live in a Netlify Blobs store, one JSON doc per booking:
//   { id, status: "pending" | "confirmed" | "cancelled", checkIn, checkOut,
//     guests, name, email, phone, total, orderId, paymentLinkId, createdAt, holdUntil }
// A "pending" booking holds its dates for HOLD_MINUTES while the guest pays.
export const HOLD_MINUTES = 30;

// LOCAL_MEMORY_STORE=1 swaps in an in-memory store for local testing only.
const memory = new Map();
const memoryStore = {
  async setJSON(k, v) { memory.set(k, JSON.stringify(v)); },
  async get(k) { return memory.has(k) ? JSON.parse(memory.get(k)) : null; },
  async list() { return { blobs: [...memory.keys()].map((key) => ({ key })) }; },
};
const store = () =>
  process.env.LOCAL_MEMORY_STORE === "1" ? memoryStore : getStore({ name: "bookings", consistency: "strong" });

export async function saveBooking(b) {
  await store().setJSON(b.id, b);
  return b;
}

export async function getBooking(id) {
  return store().get(id, { type: "json" });
}

export async function listBookings() {
  const s = store();
  const { blobs } = await s.list();
  const docs = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return docs.filter(Boolean);
}

export function isActive(b, now = Date.now()) {
  if (b.status === "confirmed") return true;
  return b.status === "pending" && new Date(b.holdUntil).getTime() > now;
}

// Blocked ranges from Airbnb (and any other feeds), cached briefly.
let feedCache = { at: 0, ranges: [] };
const FEED_TTL_MS = 5 * 60 * 1000;

export async function airbnbBlocks() {
  const urls = (process.env.AIRBNB_ICAL_URL || "").split(/[\s,]+/).filter(Boolean);
  if (!urls.length) return [];
  if (Date.now() - feedCache.at < FEED_TTL_MS) return feedCache.ranges;
  const results = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url, { headers: { "User-Agent": "ChaucerCraftsman/1.0" } });
      if (!res.ok) throw new Error(`Calendar feed returned ${res.status}`);
      return parseIcal(await res.text());
    }),
  );
  const ranges = results.flat().map((e) => ({ start: e.start, end: e.end, source: "airbnb" }));
  feedCache = { at: Date.now(), ranges };
  return ranges;
}

// All unavailable ranges [start, end) from every source.
export async function blockedRanges({ excludeId } = {}) {
  const [external, bookings] = await Promise.all([airbnbBlocks(), listBookings()]);
  const direct = bookings
    .filter((b) => b.id !== excludeId && isActive(b))
    .map((b) => ({ start: b.checkIn, end: b.checkOut, source: "direct" }));
  return [...external, ...direct];
}

export function overlaps(ranges, checkIn, checkOut) {
  return ranges.some((r) => r.start < checkOut && checkIn < r.end);
}

// Returns an error message, or null if the request is bookable.
export function validateStay({ checkIn, checkOut, guests }) {
  const a = parseDate(checkIn);
  const b = parseDate(checkOut);
  if (!a || !b) return "Please choose check-in and check-out dates.";
  if (b <= a) return "Check-out must be after check-in.";
  const today = todayIn(listing.timezone);
  if (checkIn < addDays(today, pricing.advanceNoticeDays)) return "That check-in date is too soon to book online.";
  if (checkIn > addDays(today, pricing.bookingWindowDays)) return "That's too far out to book just yet.";
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < pricing.minNights) return `The minimum stay is ${pricing.minNights} nights.`;
  if (nights > pricing.maxNights) return `The maximum stay is ${pricing.maxNights} nights.`;
  const g = Number(guests);
  if (!Number.isInteger(g) || g < 1 || g > listing.maxGuests) return `The home sleeps up to ${listing.maxGuests} guests.`;
  return null;
}

export async function findByOrderId(orderId) {
  return (await listBookings()).find((b) => b.orderId === orderId) || null;
}

// Marks a booking confirmed. If the hold had lapsed and the dates were taken
// in the meantime, it is still confirmed (the guest has paid) but flagged so
// you can sort it out by hand.
export async function confirmBooking(b) {
  if (b.status === "confirmed") return b;
  const others = await blockedRanges({ excludeId: b.id });
  b.status = "confirmed";
  b.confirmedAt = new Date().toISOString();
  if (overlaps(others, b.checkIn, b.checkOut)) b.conflict = true;
  return saveBooking(b);
}
