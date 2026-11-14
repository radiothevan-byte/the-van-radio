"""Pick the Route redesign: presentation changed, fields/validation/payload must NOT.
Run against the local harness (http://127.0.0.1:4173)."""
import json, sys
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:4173"
fails = []
def check(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
posts = []
def handler(r):
    u = r.request.url
    if u.startswith(BASE): return r.continue_()
    if "nominatim.openstreetmap.org/search" in u:
        return r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
            body=json.dumps([{"display_name": "Μήλος, Κυκλάδες, Ελλάδα", "lat": "36.72", "lon": "24.42", "name": "Μήλος", "type": "island"}]))
    if "script.google.com" in u or "script.googleusercontent.com" in u:
        if r.request.method == "POST": posts.append(json.loads(r.request.post_data))
        return r.fulfill(status=200, content_type="text/plain", headers={"Access-Control-Allow-Origin": "*"}, body="ok")
    if "action=promotions" in u: return r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body='{"ok":true,"promotions":[]}')
    return r.abort()
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in ((390, 844), (320, 640)):
        ctx = b.new_context(viewport={"width": w, "height": h}); ctx.add_init_script("localStorage.setItem('tvr_lang','el')")
        pg = ctx.new_page(); pg.route("**/*", handler); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE + "/route"); pg.wait_for_timeout(600)
        check(pg.locator(".route-hero-steps li").count() == 4, f"{w}px intro shows the 4 steps")
        pg.locator("button.pill-btn").first.click(); pg.wait_for_timeout(400)
        check(pg.locator(".route-progress-seg").count() == 4, "progress bar has 4 segments")
        pg.fill(".route-search-input", "Μήλος"); pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
        pg.locator(".route-search-result").first.click(); pg.wait_for_timeout(400)
        check(pg.locator(".route-leaflet-wrap").count() >= 1, "Leaflet map still present")
        nxt = pg.locator("button.pill-btn", has_text="Συνέχεια"); check(nxt.is_enabled(), "destination chosen -> Continue enabled"); nxt.click(); pg.wait_for_timeout(300)
        cards = pg.locator(".route-genre-card"); check(cards.count() == 7, "7 genre options unchanged")
        nxt = pg.locator("button.pill-btn", has_text="Συνέχεια"); check(nxt.is_disabled(), "no genre -> Continue disabled")
        cards.nth(1).click(); nxt.click(); pg.wait_for_timeout(300)
        ins = pg.locator(".route-input"); ta = pg.locator(".route-textarea")
        check(ins.count() == 4 and ta.count() == 1, "song step: 4 inputs + 1 textarea (same fields)")
        check([ins.nth(i).get_attribute("maxlength") for i in range(4)] == ["60", "80", "80", "300"] and ta.get_attribute("maxlength") == "500", "maxLength limits unchanged")
        nxt = pg.locator("button.pill-btn", has_text="Συνέχεια")
        check(nxt.is_disabled(), "empty -> Continue disabled")
        ins.nth(0).fill("Νίκος"); ins.nth(1).fill("Τίτλος"); check(nxt.is_disabled(), "missing artist -> still disabled")
        ins.nth(2).fill("Καλλιτέχνης"); check(nxt.is_enabled(), "name+title+artist -> enabled (link & story optional)")
        nxt.click(); pg.wait_for_timeout(500)
        check(pg.locator(".route-ticket").count() == 1, "journey summary card shown")
        if w == 390:
            pg.locator(".route-launch-btn").click()
            pg.wait_for_selector(".route-arrived", timeout=90000); pg.screenshot(path="rt_arrived.png")
            check("ΕΦΤΑΣΕΣ" in pg.locator(".route-arrived").inner_text(), "arrival message ΕΦΤΑΣΕΣ preserved")
            check(pg.locator(".route-arrived-card").count() == 1 and "Τίτλος" in pg.locator(".route-arrived-card").inner_text(), "arrival card shows destination + song")
            pg.wait_for_timeout(500)
            check(len(posts) == 1, "exactly one webhook submission")
            if posts:
                keys = sorted(posts[0].keys())
                check(keys == sorted(["destination_name","latitude","longitude","user_name","music_genre","song_title","artist","music_url","user_message","source","status"]), "payload keys unchanged")
                check(posts[0]["music_url"] is None and posts[0]["user_message"] is None and posts[0]["status"] == "new", "optional fields null, status 'new'")
        check(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px no horizontal overflow")
        check(not errs, "no page errors"); ctx.close()
    b.close()
print("FAILS", fails) if fails else print("ALL PASS"); sys.exit(1 if fails else 0)
