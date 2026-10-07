import { json } from "../lib/http.mjs";
import { squareFetch } from "../lib/square.mjs";

// Host-only: confirms the Square settings work, without charging anything.
export default async (req) => {
  if (!process.env.ADMIN_KEY || req.headers.get("x-admin-key") !== process.env.ADMIN_KEY) {
    return json({ error: "Not allowed" }, 403);
  }
  const env = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const report = {
    environment: env,
    accessTokenSet: Boolean(process.env.SQUARE_ACCESS_TOKEN),
    locationIdSet: Boolean(process.env.SQUARE_LOCATION_ID),
    webhookKeySet: Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),
    airbnbCalendarSet: Boolean(process.env.AIRBNB_ICAL_URL),
  };
  try {
    const { locations = [] } = await squareFetch("/v2/locations");
    report.tokenWorks = true;
    report.locations = locations.map((l) => ({ id: l.id, name: l.name, status: l.status, currency: l.currency }));
    const loc = locations.find((l) => l.id === process.env.SQUARE_LOCATION_ID);
    report.locationFound = Boolean(loc);
    report.locationActive = loc?.status === "ACTIVE";
    report.canTakeCards = loc ? (loc.capabilities || []).includes("CREDIT_CARD_PROCESSING") : false;
  } catch (err) {
    report.tokenWorks = false;
    report.squareError = err.message;
    if (/UNAUTHORIZED|401|access token/i.test(err.message)) {
      report.hint =
        env === "sandbox"
          ? "Square rejected the token. If it's a Production token, set SQUARE_ENVIRONMENT to production and redeploy."
          : "Square rejected the token. Copy the Production access token again and redeploy.";
    }
  }
  report.ok = Boolean(report.tokenWorks && report.locationFound && report.locationActive && report.canTakeCards);
  return json(report);
};

export const config = { path: "/api/admin/square-check" };
