// Everything you may want to tweak lives here. Prices are in US dollars.
// Secrets (Square token, Airbnb iCal URL) are NOT here; they are Netlify
// environment variables (see README).
export const listing = {
  name: "The Chaucer Craftsman",
  timezone: "America/Los_Angeles",
  checkInTime: "4:00 PM",
  checkOutTime: "11:00 AM",
  maxGuests: 5, // infants in the crib don't count
};

export const pricing = {
  // TODO: set your real rates. Defaults are placeholders.
  nightlyRate: 275,
  // Optional per-night overrides, e.g. holidays or graduation weekends.
  // Keys are YYYY-MM-DD (the night of), values are the nightly rate.
  nightlyOverrides: {},
  weekendRate: null, // set e.g. 300 to charge more for Fri/Sat nights
  cleaningFee: 150,
  minNights: 2,
  maxNights: 60,
  // Berkeley Transient Occupancy Tax. Airbnb collects this for you on Airbnb
  // bookings; on direct bookings you collect and remit it yourself. Confirm
  // the current rate with the City of Berkeley before going live.
  taxRate: 0.12,
  // Stays of 30+ nights are generally exempt from TOT in California cities.
  taxExemptNights: 30,
  weeklyDiscount: 0.1, // 7+ nights
  monthlyDiscount: 0.2, // 28+ nights
  bookingWindowDays: 365, // how far ahead guests can book
  advanceNoticeDays: 1, // 1 = no same-day check-ins
};
