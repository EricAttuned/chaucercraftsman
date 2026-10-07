import { addDays } from "./dates.mjs";

// Minimal iCalendar parser for Airbnb/VRBO-style feeds. Returns
// [{ start, end, summary, uid }] where start/end are YYYY-MM-DD and end is
// exclusive (the checkout day), matching how Airbnb exports blocked nights.
export function parseIcal(text) {
  // Unfold continuation lines (RFC 5545 §3.1).
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur?.start) {
        if (!cur.end || cur.end <= cur.start) cur.end = addDays(cur.start, 1);
        events.push(cur);
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const name = line.slice(0, idx).split(";")[0].toUpperCase();
      const value = line.slice(idx + 1).trim();
      if (name === "DTSTART") cur.start = icalDate(value);
      else if (name === "DTEND") cur.end = icalDate(value);
      else if (name === "SUMMARY") cur.summary = value;
      else if (name === "UID") cur.uid = value;
    }
  }
  return events.filter((e) => e.start);
}

function icalDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Builds an iCal feed of blocked date ranges for Airbnb to import.
export function buildIcal(events, { prodId = "-//Chaucer Craftsman//Direct Bookings//EN" } = {}) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${prodId}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    out.push(
      "BEGIN:VEVENT",
      `UID:${esc(e.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${e.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${e.end.replace(/-/g, "")}`,
      `SUMMARY:${esc(e.summary || "Reserved")}`,
      "END:VEVENT",
    );
  }
  out.push("END:VCALENDAR");
  return out.join("\r\n") + "\r\n";
}
