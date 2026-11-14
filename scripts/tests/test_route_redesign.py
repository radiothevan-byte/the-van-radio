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
        check(pg.locator(".route-row").count() == 6 and pg.locator(".route-send-btn").count() == 1, "form: 6 rows + one send button (no wizard steps)")
        check(pg.locator(".route-progress-seg").count() == 0, "old step-by-step progress bar is gone")
        check(pg.locator(".route-leaflet-wrap, .route-board").count() >= 1, "map preview at the top")
        send = pg.locator(".route-send-btn"); n0 = len(posts)
        send.click(); pg.wait_for_timeout(300)
        check(len(posts) == n0 and pg.locator(".route-row-missing").count() == 4, "empty -> send blocked, 4 required rows flagged (destination, genre, song, name)")
        # destination (sheet with the same search + Leaflet map)
        pg.locator('[data-row=destination]').click(); pg.wait_for_selector(".route-sheet")
        pg.fill(".route-search-input", "Μήλος"); pg.keyboard.press("Enter"); pg.wait_for_timeout(700)
        pg.locator(".route-search-result").first.click(); pg.wait_for_timeout(400)
        check(pg.locator(".route-sheet .route-leaflet-wrap").count() >= 1, "destination sheet: Leaflet map still present")
        pg.locator(".route-sheet-done").click(); pg.wait_for_timeout(300)
        check(pg.locator(".route-sheet").count() == 0 and "Μήλος" in pg.locator('[data-row=destination]').inner_text(), "destination row shows the chosen place")
        # genre
        pg.locator('[data-row=genre]').click(); pg.wait_for_selector(".route-sheet")
        cards = pg.locator(".route-genre-card"); check(cards.count() == 7, "7 genre options unchanged")
        cards.nth(1).click(); pg.wait_for_timeout(300)
        check(pg.locator(".route-sheet").count() == 0 and pg.locator('[data-row=genre]').inner_text().strip() != "", "choosing a genre fills the row")
        # name / song / link / story: same inputs, same limits
        lens = {}
        pg.locator('[data-row=name]').click(); pg.wait_for_selector(".route-sheet"); lens["name"] = pg.locator(".route-sheet .route-input").get_attribute("maxlength"); pg.locator(".route-sheet .route-input").fill("Νίκος"); pg.locator(".route-sheet-done").click()
        pg.locator('[data-row=song]').click(); pg.wait_for_selector(".route-sheet"); ins = pg.locator(".route-sheet .route-input"); lens["song"] = [ins.nth(0).get_attribute("maxlength"), ins.nth(1).get_attribute("maxlength")]
        ins.nth(0).fill("Τίτλος"); pg.locator(".route-sheet-done").click(); pg.wait_for_timeout(200)
        send.click(); pg.wait_for_timeout(300)
        check(len(posts) == n0 and pg.locator(".route-row-missing").count() == 1, "missing artist -> still blocked, only the song row flagged")
        pg.locator('[data-row=song]').click(); pg.wait_for_selector(".route-sheet"); pg.locator(".route-sheet .route-input").nth(1).fill("Καλλιτέχνης"); pg.locator(".route-sheet-done").click()
        pg.locator('[data-row=link]').click(); pg.wait_for_selector(".route-sheet"); lens["link"] = pg.locator(".route-sheet .route-input").get_attribute("maxlength"); pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
        check(pg.locator(".route-sheet").count() == 0, "Escape closes a sheet")
        pg.locator('[data-row=story]').click(); pg.wait_for_selector(".route-sheet"); lens["story"] = pg.locator(".route-sheet .route-textarea").get_attribute("maxlength"); pg.locator(".route-sheet-done").click()
        check(lens == {"name": "60", "song": ["80", "80"], "link": "300", "story": "500"}, "maxLength limits unchanged: %s" % lens)
        pg.screenshot(path=f"rt_form_{w}.png", full_page=True)
        if w == 390:
            pg.locator(".route-send-btn").click()
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
