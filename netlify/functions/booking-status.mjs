import { confirmBooking, getBooking } from "../lib/bookings.mjs";
import { json } from "../lib/http.mjs";
import { isOrderPaid } from "../lib/square.mjs";

// Called by the confirmation page after Square redirects the guest back.
// Checks Square directly, so bookings confirm even if a webhook is missed.
export default async (req) => {
  const id = new URL(req.url).searchParams.get("booking");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Missing booking." }, 400);
  let b = await getBooking(id);
  if (!b) return json({ error: "Booking not found." }, 404);
  if (b.status === "pending" && b.orderId) {
    try {
      if (await isOrderPaid(b.orderId)) b = await confirmBooking(b);
    } catch (err) {
      console.error(err);
    }
  }
  const expired = b.status === "pending" && new Date(b.holdUntil) < new Date();
  return json({
    status: expired ? "expired" : b.status,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    guests: b.guests,
    name: b.name.split(" ")[0],
    total: b.total,
  });
};

export const config = { path: "/api/booking-status" };
