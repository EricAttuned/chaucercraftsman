import { blockedRanges } from "../lib/bookings.mjs";
import { listing, pricing } from "../lib/config.mjs";
import { todayIn } from "../lib/dates.mjs";
import { json } from "../lib/http.mjs";

export default async () => {
  try {
    const ranges = await blockedRanges();
    return json({
      blocked: ranges.map(({ start, end }) => ({ start, end })),
      today: todayIn(listing.timezone),
      listing,
      rules: {
        minNights: pricing.minNights,
        maxNights: pricing.maxNights,
        bookingWindowDays: pricing.bookingWindowDays,
        advanceNoticeDays: pricing.advanceNoticeDays,
        nightlyRate: pricing.nightlyRate,
      },
    });
  } catch (err) {
    console.error(err);
    return json({ error: "We couldn't load the calendar right now. Please try again shortly." }, 503);
  }
};

export const config = { path: "/api/availability" };
