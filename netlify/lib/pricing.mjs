import { pricing as P } from "./config.mjs";
import { eachNight, nightsBetween, parseDate } from "./dates.mjs";

const cents = (dollars) => Math.round(dollars * 100);

// Returns a price breakdown in cents. Throws on invalid input.
export function quote(checkIn, checkOut, pricing = P) {
  const nights = nightsBetween(checkIn, checkOut);
  let lodging = 0;
  for (const night of eachNight(checkIn, checkOut)) {
    const dow = parseDate(night).getUTCDay(); // 5 = Fri, 6 = Sat
    const rate =
      pricing.nightlyOverrides?.[night] ??
      (pricing.weekendRate && (dow === 5 || dow === 6) ? pricing.weekendRate : pricing.nightlyRate);
    lodging += cents(rate);
  }
  const discountRate =
    nights >= 28 ? pricing.monthlyDiscount || 0 : nights >= 7 ? pricing.weeklyDiscount || 0 : 0;
  const discount = Math.round(lodging * discountRate);
  const cleaning = cents(pricing.cleaningFee || 0);
  const taxable = lodging - discount + cleaning;
  const taxExempt = pricing.taxExemptNights && nights >= pricing.taxExemptNights;
  const tax = taxExempt ? 0 : Math.round(taxable * (pricing.taxRate || 0));
  return {
    nights,
    lodging,
    discount,
    discountLabel: discount ? (nights >= 28 ? "Monthly discount" : "Weekly discount") : null,
    cleaning,
    tax,
    total: taxable + tax,
    currency: "USD",
  };
}
