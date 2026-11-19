"""Journeys with a future "Publish Date" are hidden in the app; blank or past dates are live. Local harness (stubbed sheet CSV)."""
import datetime, zoneinfo
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:4173"
fails = 0
def check(name, cond):
    global fails
    print(("PASS " if cond else "FAIL ") + name)
    if not cond: fails += 1
ath = datetime.datetime.now(zoneinfo.ZoneInfo("Europe/Athens")).date()
tom = (ath + datetime.timedelta(days=1)).isoformat(); yes = (ath - datetime.timedelta(days=1)).isoformat(); today = ath.isoformat()
def csv(rows): return "\n".join(",".join('"%s"' % c for c in r) for r in rows)
HEAD = ["Title", "Date", "Description", "Audio URL", "Image URL", "Publish Date"]
ROWS = [HEAD,
  ["Journey #1 Old", "2026-01-10", "d", "https://a/1.mp3", "", ""],
  ["Journey #2 Yesterday", "2026-02-10", "d", "https://a/2.mp3", "", yes],
  ["Journey #3 Today", "2026-03-10", "d", "https://a/3.mp3", "", today],
  ["Journey #4 Tomorrow", "2026-04-10", "d", "https://a/4.mp3", "", tom]]
def run(rows, label):
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        def h(r):
            u = r.request.url
            if u.startswith(BASE) or u.startswith("data:"): return r.continue_()
            if "gviz" in u and "sheet=Journey" in u: return r.fulfill(status=200, content_type="text/csv", headers={"Access-Control-Allow-Origin": "*"}, body=csv(rows))
            return r.abort()
        pg.route("**/*", h); pg.goto(BASE + "/journeys"); pg.wait_for_timeout(1500)
        txt = pg.locator("body").inner_text(); b.close(); return txt, errs
txt, errs = run(ROWS, "scheduled")
check("blank Publish Date = live", "Journey #1 Old" in txt)
check("past date = live", "Journey #2 Yesterday" in txt)
check("today = live", "Journey #3 Today" in txt)
check("tomorrow = HIDDEN", "Journey #4 Tomorrow" not in txt)
check("no page errors", not errs)
txt2, _ = run([r[:5] for r in ROWS], "no column")
check("sheet WITHOUT Publish Date column: everything live (backwards compatible)", "Journey #4 Tomorrow" in txt2)
print("FAILS", fails)
