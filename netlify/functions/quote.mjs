import { blockedRanges, overlaps, validateStay } from "../lib/bookings.mjs";
import { json } from "../lib/http.mjs";
import { quote } from "../lib/pricing.mjs";

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const stay = { checkIn: q.get("checkIn"), checkOut: q.get("checkOut"), guests: q.get("guests") || 1 };
  const invalid = validateStay(stay);
  if (invalid) return json({ error: invalid }, 400);
  try {
    if (overlaps(await blockedRanges(), stay.checkIn, stay.checkOut)) {
      return json({ error: "Some of those nights are already booked." }, 409);
    }
  } catch (err) {
    console.error(err);
    return json({ error: "We couldn't check availability right now. Please try again shortly." }, 503);
  }
  return json(quote(stay.checkIn, stay.checkOut));
};

export const config = { path: "/api/quote" };
