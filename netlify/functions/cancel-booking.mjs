import { getBooking, saveBooking } from "../lib/bookings.mjs";
import { json } from "../lib/http.mjs";

// Host-only: frees up the dates of a direct booking after you refund it in
// Square. POST /api/admin/cancel  { "id": "...", "key": "<ADMIN_KEY>" }
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { id, key } = await req.json().catch(() => ({}));
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return json({ error: "Not allowed" }, 403);
  const b = await getBooking(id);
  if (!b) return json({ error: "Booking not found." }, 404);
  await saveBooking({ ...b, status: "cancelled", cancelledAt: new Date().toISOString() });
  return json({ ok: true });
};

export const config = { path: "/api/admin/cancel" };
