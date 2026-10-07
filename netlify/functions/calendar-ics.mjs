import { listBookings } from "../lib/bookings.mjs";
import { buildIcal } from "../lib/ical.mjs";

// The feed you paste into Airbnb → Calendar → Availability → Connect calendars
// → "Import calendar". Lists confirmed direct bookings so Airbnb blocks them.
export default async (req) => {
  const key = process.env.CALENDAR_FEED_KEY;
  if (key && new URL(req.url).searchParams.get("key") !== key) {
    return new Response("Not found", { status: 404 });
  }
  const events = (await listBookings())
    .filter((b) => b.status === "confirmed")
    .map((b) => ({ uid: `${b.id}@chaucercraftsman`, start: b.checkIn, end: b.checkOut, summary: "Reserved (direct booking)" }));
  return new Response(buildIcal(events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
};

export const config = { path: "/calendar.ics" };
