// Booking widget + photo gallery. No framework; dates are "YYYY-MM-DD" strings.
const $ = (s) => document.querySelector(s);
const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });

/* ---------- date helpers (UTC so DST never shifts a day) ---------- */
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const nights = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const pretty = (s) => toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/* ---------- state ---------- */
const state = {
  blocked: new Set(), // nights that are taken
  today: null,
  rules: null,
  checkIn: null,
  checkOut: null,
  view: null, // first of the displayed month, YYYY-MM-01
};

async function loadAvailability() {
  try {
    const res = await fetch("/api/availability");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    state.today = data.today;
    state.rules = data.rules;
    for (const r of data.blocked) for (let d = r.start; d < r.end; d = addDays(d, 1)) state.blocked.add(d);
    $("#from-price").textContent = money(data.rules.nightlyRate * 100);
    $("#per-night").textContent = "night";
    $("#bar-price").textContent = `${money(data.rules.nightlyRate * 100)} night`;
    restoreFromUrl();
    state.view = (state.checkIn || addDays(state.today, data.rules.advanceNoticeDays)).slice(0, 8) + "01";
    render();
  } catch (err) {
    $("#cal-months").innerHTML = "";
    showError(err.message || "Couldn't load availability. Please refresh to try again.");
  }
}

const earliest = () => addDays(state.today, state.rules.advanceNoticeDays);
const latest = () => addDays(state.today, state.rules.bookingWindowDays);

function rangeFree(a, b) {
  for (let d = a; d < b; d = addDays(d, 1)) if (state.blocked.has(d)) return false;
  return true;
}

function canCheckIn(d) {
  return d >= earliest() && d <= latest() && rangeFree(d, addDays(d, state.rules.minNights));
}

function canCheckOut(d) {
  if (!state.checkIn || d <= state.checkIn) return false;
  const n = nights(state.checkIn, d);
  return n >= state.rules.minNights && n <= state.rules.maxNights && rangeFree(state.checkIn, d);
}

const choosingCheckout = () => state.checkIn && !state.checkOut;

/* ---------- calendar rendering ---------- */
function render() {
  const months = $("#cal-months");
  months.innerHTML = "";
  months.append(renderMonth(state.view));

  const firstAllowed = earliest().slice(0, 8) + "01";
  $("#cal-prev").disabled = state.view <= firstAllowed;
  $("#cal-next").disabled = state.view >= latest().slice(0, 8) + "01";

  $("#label-in").textContent = state.checkIn ? pretty(state.checkIn) : "Add date";
  $("#label-out").textContent = state.checkOut ? pretty(state.checkOut) : "Add date";
  $("#field-in").classList.toggle("active", !choosingCheckout());
  $("#field-out").classList.toggle("active", !!choosingCheckout());
  $("#cal-hint").textContent = state.checkOut
    ? `${nights(state.checkIn, state.checkOut)} nights`
    : choosingCheckout()
      ? `Select checkout · ${state.rules.minNights}-night minimum`
      : "Select your check-in date";

  const ready = state.checkIn && state.checkOut;
  $("#reserve-btn").disabled = !ready;
  $("#reserve-btn").textContent = ready ? "Reserve" : "Check availability";
  syncUrl();
}

function renderMonth(first) {
  const wrap = document.createElement("div");
  wrap.className = "cal-month";
  const d0 = toDate(first);
  const title = d0.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  wrap.innerHTML = `<h5>${title}</h5>`;
  const grid = document.createElement("div");
  grid.className = "cal-grid";
  for (const w of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) grid.insertAdjacentHTML("beforeend", `<div class="cal-dow">${w}</div>`);
  for (let i = 0; i < d0.getUTCDay(); i++) grid.append(document.createElement("div"));

  const month = first.slice(0, 7);
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day";
    btn.textContent = Number(d.slice(8));
    btn.dataset.date = d;
    const selectable = choosingCheckout() ? canCheckOut(d) || canCheckIn(d) : canCheckIn(d);
    btn.disabled = !selectable;
    if (state.blocked.has(d) && btn.disabled && d !== state.checkOut) btn.classList.add("booked");
    else if (!btn.disabled && choosingCheckout() && canCheckOut(d) && !canCheckIn(d)) btn.classList.add("checkout-only");
    if (d === state.checkIn) btn.classList.add("start");
    if (d === state.checkOut) btn.classList.add("end");
    if (state.checkIn && state.checkOut && d > state.checkIn && d < state.checkOut) btn.classList.add("in-range");
    btn.setAttribute("aria-label", `${pretty(d)}${state.blocked.has(d) ? ", unavailable" : ""}`);
    grid.append(btn);
  }
  wrap.append(grid);
  return wrap;
}

$("#cal-months").addEventListener("click", (e) => {
  const d = e.target.closest(".cal-day")?.dataset.date;
  if (!d) return;
  if (choosingCheckout() && canCheckOut(d)) state.checkOut = d;
  else { state.checkIn = d; state.checkOut = null; }
  resetForm();
  render();
  if (state.checkOut) fetchQuote();
});

function shiftMonth(n) {
  const d = toDate(state.view);
  d.setUTCMonth(d.getUTCMonth() + n);
  state.view = fmt(d);
  render();
}
$("#cal-prev").addEventListener("click", () => shiftMonth(-1));
$("#cal-next").addEventListener("click", () => shiftMonth(1));
$("#cal-clear").addEventListener("click", () => { state.checkIn = state.checkOut = null; resetForm(); render(); });
$("#field-in").addEventListener("click", () => { state.checkIn = state.checkOut = null; resetForm(); render(); });
$("#field-out").addEventListener("click", () => { if (state.checkIn) { state.checkOut = null; resetForm(); render(); } });
$("#guests").addEventListener("change", () => { syncUrl(); if (state.checkOut) fetchQuote(); });

/* ---------- quote + checkout ---------- */
function showError(msg) {
  const el = $("#error");
  el.textContent = msg || "";
  el.hidden = !msg;
}

function resetForm() {
  $("#quote").hidden = true;
  $("#guest-form").hidden = true;
  $("#reserve-btn").hidden = false;
  showError("");
}

async function fetchQuote() {
  showError("");
  const q = new URLSearchParams({ checkIn: state.checkIn, checkOut: state.checkOut, guests: $("#guests").value });
  const res = await fetch(`/api/quote?${q}`);
  const data = await res.json();
  if (!res.ok) { $("#quote").hidden = true; return showError(data.error); }
  const rate = Math.round(data.lodging / data.nights);
  const rows = [
    [`${money(rate)} × ${data.nights} night${data.nights === 1 ? "" : "s"}`, money(data.lodging)],
    data.discount ? [data.discountLabel, `−${money(data.discount)}`, "save"] : null,
    data.cleaning ? ["Cleaning fee", money(data.cleaning)] : null,
    data.tax ? ["Berkeley occupancy tax", money(data.tax)] : null,
  ].filter(Boolean);
  $("#quote").innerHTML =
    rows.map(([a, b, cls]) => `<div class="row ${cls || ""}"><span>${a}</span><span>${b}</span></div>`).join("") +
    `<div class="row total"><span>Total</span><span>${money(data.total)}</span></div>` +
    `<div class="row save"><span>No booking service fee</span><span>$0</span></div>`;
  $("#quote").hidden = false;
}

$("#reserve-btn").addEventListener("click", () => {
  $("#guest-form").hidden = false;
  $("#reserve-btn").hidden = true;
  $("#guest-form [name=name]").focus();
});

$("#guest-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.reportValidity()) return;
  const btn = $("#pay-btn");
  btn.disabled = true;
  btn.textContent = "Starting secure checkout…";
  showError("");
  const f = new FormData(form);
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkIn: state.checkIn,
        checkOut: state.checkOut,
        guests: Number($("#guests").value),
        name: f.get("name"),
        email: f.get("email"),
        phone: f.get("phone"),
        message: f.get("message"),
        agreeToRules: f.get("agreeToRules") === "on",
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    window.location.href = data.url;
  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
    btn.disabled = false;
    btn.textContent = "Continue to secure payment";
    if (/booked|booking those/.test(err.message || "")) {
      state.blocked.clear();
      loadAvailability();
    }
  }
});

/* ---------- shareable URL (?in=&out=&guests=) ---------- */
function syncUrl() {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of [["in", state.checkIn], ["out", state.checkOut], ["guests", $("#guests").value]]) v ? p.set(k, v) : p.delete(k);
  history.replaceState(null, "", `${location.pathname}${p.size ? "?" + p : ""}${location.hash}`);
}

function restoreFromUrl() {
  const p = new URLSearchParams(location.search);
  const g = p.get("guests");
  if (g && /^[1-5]$/.test(g)) $("#guests").value = g;
  const a = p.get("in"), b = p.get("out");
  if (a && /^\d{4}-\d{2}-\d{2}$/.test(a) && canCheckIn(a)) {
    state.checkIn = a;
    if (b && /^\d{4}-\d{2}-\d{2}$/.test(b) && canCheckOut(b)) { state.checkOut = b; fetchQuote(); }
  }
}

/* ---------- photos ---------- */
let photos = [];
let current = 0;

async function loadPhotos() {
  photos = await (await fetch("/photos.json")).json();
  const rooms = [...new Set(photos.map((p) => p.room))];
  const slug = (r) => "room-" + r.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  $("#gallery-rooms").innerHTML = rooms.map((r) => `<a href="#${slug(r)}">${r}</a>`).join("");
  $("#gallery-body").innerHTML = rooms
    .map((r) => {
      const items = photos
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.room === r)
        .map(({ p, i }, n) => `<button data-index="${i}"><img loading="lazy" src="/images/${n % 3 === 0 ? "full" : "thumb"}/${p.file}" alt="${p.alt}"></button>`)
        .join("");
      return `<h3 id="${slug(r)}">${r}</h3><div class="gallery-grid">${items}</div>`;
    })
    .join("");
  $("#show-all").textContent = `Show all ${photos.length} photos`;
}

function openLightbox(i) {
  current = (i + photos.length) % photos.length;
  const p = photos[current];
  $("#lb-img").src = `/images/full/${p.file}`;
  $("#lb-img").alt = p.alt;
  $("#lb-cap").textContent = `${p.alt} · ${current + 1} / ${photos.length}`;
  if (!$("#lightbox").open) $("#lightbox").showModal();
}

document.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-photo]");
  if (tile && photos.length) openLightbox(photos.findIndex((p) => p.file === tile.dataset.photo));
  const g = e.target.closest("#gallery-body [data-index]");
  if (g) openLightbox(Number(g.dataset.index));
});
$("#show-all").addEventListener("click", () => $("#gallery").showModal());
$("#gallery-close").addEventListener("click", () => $("#gallery").close());
$("#gallery-rooms").addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (!a) return;
  e.preventDefault();
  $(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" });
});
$("#lb-close").addEventListener("click", () => $("#lightbox").close());
$("#lb-prev").addEventListener("click", () => openLightbox(current - 1));
$("#lb-next").addEventListener("click", () => openLightbox(current + 1));
document.addEventListener("keydown", (e) => {
  if (!$("#lightbox").open) return;
  if (e.key === "ArrowLeft") openLightbox(current - 1);
  if (e.key === "ArrowRight") openLightbox(current + 1);
});

loadPhotos();
loadAvailability();
