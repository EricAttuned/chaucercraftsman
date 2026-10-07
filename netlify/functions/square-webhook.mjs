import { confirmBooking, findByOrderId } from "../lib/bookings.mjs";
import { isOrderPaid, verifyWebhook } from "../lib/square.mjs";

// Subscribe to "payment.created" and "payment.updated" in the Square
// Developer dashboard, pointing at https://<your-site>/api/square-webhook
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const body = await req.text();
  const url = process.env.SQUARE_WEBHOOK_URL || `${process.env.URL || new URL(req.url).origin}/api/square-webhook`;
  if (!verifyWebhook({ signature: req.headers.get("x-square-hmacsha256-signature"), body, url })) {
    return new Response("Invalid signature", { status: 401 });
  }
  const event = JSON.parse(body);
  const payment = event?.data?.object?.payment;
  if (payment?.order_id && payment.status === "COMPLETED") {
    const b = await findByOrderId(payment.order_id);
    if (b && b.status !== "confirmed" && (await isOrderPaid(b.orderId))) await confirmBooking(b);
  }
  return new Response("ok");
};

export const config = { path: "/api/square-webhook" };
