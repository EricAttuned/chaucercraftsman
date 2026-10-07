import crypto from "node:crypto";
import {
  HOLD_MINUTES,
  blockedRanges,
  listBookings,
  isActive,
  overlaps,
  saveBooking,
  validateStay,
} from "../lib/bookings.mjs";
import { listing } from "../lib/config.mjs";
import { json } from "../lib/http.mjs";
import { quote } from "../lib/pricing.mjs";
import { createPaymentLink } from "../lib/square.mjs";

const clean = (s, max) => String(s ?? "").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const stay = { checkIn: body.checkIn, checkOut: body.checkOut, guests: Number(body.guests) };
  const invalid = validateStay(stay);
  if (invalid) return json({ error: invalid }, 400);

  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  const phone = clean(body.phone, 40);
  const message = clean(body.message, 1000);
  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Please enter a valid email." }, 400);
  if (!body.agreeToRules) return json({ error: "Please agree to the house rules." }, 400);

  try {
    if (overlaps(await blockedRanges(), stay.checkIn, stay.checkOut)) {
      return json({ error: "Sorry, some of those nights were just booked. Please pick other dates." }, 409);
    }
  } catch (err) {
    console.error(err);
    return json({ error: "We couldn't check availability right now. Please try again shortly." }, 503);
  }

  const price = quote(stay.checkIn, stay.checkOut);
  const now = new Date();
  const booking = {
    id: crypto.randomUUID(),
    status: "pending",
    ...stay,
    name,
    email,
    phone,
    message,
    quote: price,
    total: price.total,
    createdAt: now.toISOString(),
    holdUntil: new Date(now.getTime() + HOLD_MINUTES * 60000).toISOString(),
  };
  await saveBooking(booking);

  // Two guests could race for the same dates; the earlier hold wins.
  const rival = (await listBookings()).find(
    (b) =>
      b.id !== booking.id &&
      isActive(b) &&
      b.checkIn < booking.checkOut &&
      booking.checkIn < b.checkOut &&
      (b.status === "confirmed" || b.createdAt <= booking.createdAt),
  );
  if (rival) {
    await saveBooking({ ...booking, status: "cancelled", cancelReason: "race" });
    return json({ error: "Sorry, someone else is booking those nights right now. Please pick other dates." }, 409);
  }

  const origin = process.env.URL || new URL(req.url).origin;
  const nights = `${price.nights} night${price.nights === 1 ? "" : "s"}`;
  try {
    const link = await createPaymentLink({
      idempotencyKey: booking.id,
      referenceId: booking.id.slice(0, 40),
      itemName: `${listing.name}: ${stay.checkIn} to ${stay.checkOut} (${nights})`,
      note: `${name}, ${stay.guests} guest${stay.guests === 1 ? "" : "s"}, ${stay.checkIn} to ${stay.checkOut}`.slice(0, 500),
      amountCents: price.total,
      redirectUrl: `${origin}/confirmed.html?booking=${booking.id}`,
      email,
      phone,
    });
    await saveBooking({ ...booking, orderId: link.order_id, paymentLinkId: link.id });
    return json({ url: link.url, bookingId: booking.id });
  } catch (err) {
    console.error(err);
    await saveBooking({ ...booking, status: "cancelled", cancelReason: "payment-link-failed" });
    return json({ error: "We couldn't start checkout. Please try again, or contact us directly." }, 502);
  }
};

export const config = { path: "/api/checkout" };
