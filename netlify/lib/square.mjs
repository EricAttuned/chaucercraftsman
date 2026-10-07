import crypto from "node:crypto";

// Thin wrapper around the Square REST API (no SDK needed).
const VERSION = "2025-01-23";

function baseUrl() {
  if (process.env.SQUARE_API_BASE) return process.env.SQUARE_API_BASE; // tests only
  return process.env.SQUARE_ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export async function squareFetch(path, { method = "GET", body } = {}) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not set");
  const res = await fetch(baseUrl() + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.errors?.map((e) => e.detail || e.code).join("; ") || res.statusText;
    throw new Error(`Square ${method} ${path} failed: ${detail}`);
  }
  return data;
}

// Creates a hosted Square checkout page for a single line item.
export async function createPaymentLink({ idempotencyKey, itemName, note, amountCents, redirectUrl, email, phone, referenceId }) {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error("SQUARE_LOCATION_ID is not set");
  const pre = {};
  if (email) pre.buyer_email = email;
  // Square rejects malformed numbers, so only prefill clear US numbers.
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) pre.buyer_phone_number = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) pre.buyer_phone_number = `+${digits}`;
  const { payment_link } = await squareFetch("/v2/online-checkout/payment-links", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey,
      order: {
        location_id: locationId,
        reference_id: referenceId,
        line_items: [
          {
            name: itemName,
            note,
            quantity: "1",
            base_price_money: { amount: amountCents, currency: "USD" },
          },
        ],
        metadata: { booking_id: referenceId },
      },
      checkout_options: { redirect_url: redirectUrl, ask_for_shipping_address: false },
      pre_populated_data: pre,
      payment_note: note,
    },
  });
  return payment_link; // { id, url, order_id, ... }
}

// True once the order has been fully paid.
export async function isOrderPaid(orderId) {
  const { order } = await squareFetch(`/v2/orders/${encodeURIComponent(orderId)}`);
  if (!order) return false;
  const due = order.net_amount_due_money?.amount;
  const paidTenders = (order.tenders || []).length > 0;
  return order.state === "COMPLETED" || (paidTenders && due === 0);
}

// Square signs webhooks with HMAC-SHA256 over (notification URL + raw body).
export function verifyWebhook({ signature, body, url }) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signature) return false;
  const expected = crypto.createHmac("sha256", key).update(url + body).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
