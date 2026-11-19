// Scheduled Journeys: the Journey sheet may have a "Publish Date" column. A row stays hidden in the app until that
// day (Greece time). No date / unreadable date = live (so every existing Journey keeps working, fail-open).

// Today as "YYYY-MM-DD" in Greek time (the show is Greek; the phone's own timezone must not move the go-live moment).
export function athensToday(now = new Date()) {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  } catch (e) { /* fall through */ }
  const d = now; const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// Accepts 2026-11-20, 2026-11-20T00:00:00, 11/20/2026 (Sheets' US export), 20/11/2026 and 20.11.2026. Returns "YYYY-MM-DD" or "".
export function normalizeSheetDate(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  const z = (n) => String(n).padStart(2, "0");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${z(m[2])}-${z(m[3])}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) {
    let a = +m[1], b = +m[2];
    let day, mon;
    if (a > 12) { day = a; mon = b; }          // 20/11/2026
    else if (b > 12) { mon = a; day = b; }     // 11/20/2026
    else { mon = a; day = b; }                 // ambiguous: Sheets' own CSV export is month/day
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return "";
    return `${m[3]}-${z(mon)}-${z(day)}`;
  }
  return "";
}

export function journeyIsLive(publishDate, today = athensToday()) {
  const d = normalizeSheetDate(publishDate);
  if (!d) return true;
  return d <= today;
}
