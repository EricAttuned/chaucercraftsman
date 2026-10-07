import { listBookings } from "../lib/bookings.mjs";
import { json } from "../lib/http.mjs";

// Host-only list of direct bookings, used by /admin.html.
export default async (req) => {
  const key = req.headers.get("x-admin-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return json({ error: "Not allowed" }, 403);
  const bookings = (await listBookings())
    .filter((b) => b.status !== "cancelled" || b.cancelledAt)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  return json({ bookings });
};

export const config = { path: "/api/admin/bookings" };
