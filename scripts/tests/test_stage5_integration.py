"""Final integration: navigation between all sections, consistent layout, no overflow/errors on
phone and desktop widths, redesigned sections reachable from every entry point. Harness: http://127.0.0.1:4173"""
import json, sys
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:4173"; H = {"Access-Control-Allow-Origin": "*"}
fails = []
def check(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
SONG = {"id": "s1", "title": "Πυρ Γυνή και Θάλασσα", "artist": "Νεφέλη Φασούλη", "link": "https://www.youtube.com/watch?v=AaG9nV9gzdU", "noteEl": "Μια θάλασσα.", "noteEn": "A sea."}
def h(r):
    u = r.request.url
    if u.startswith(BASE) or u.startswith("data:"): return r.continue_()
    if "action=content" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps({"ok": True, "content": {"song": SONG, "poll": None}}))
    if "action=promotions" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"promotions":[]}')
    if "approved_postcards" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps({"ok": True, "postcards": [{"id": "p1", "placeName": "Ναύπλιο", "locationText": "", "latitude": "37.56", "longitude": "22.8", "story": "Ιστορία", "displayName": "Νίκος", "songTitle": "", "artist": "", "musicUrl": "", "photoUrl": ""}]}))
    return r.abort()
def ov(pg): return pg.evaluate("document.documentElement.scrollWidth-innerWidth")
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, hh in (("android-412", 412, 915), ("phone-390", 390, 844), ("small-320", 320, 640), ("desktop-1280", 1280, 800)):
        ctx = b.new_context(viewport={"width": w, "height": hh}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.route("**/*", h)
        pg.goto(BASE + "/"); pg.wait_for_selector(".content-song"); pg.wait_for_timeout(600)
        check(pg.locator(".tab-btn").count() == 4 and [x.strip() for x in pg.locator(".tab-label").all_inner_texts()] == ["Home", "Journeys", "My Van", "About"], f"{name}: main nav Home/Journeys/My Van/About unchanged")
        check(pg.locator(".content-song").count() == 1 and ov(pg) <= 0, f"{name}: Home with the redesigned Song of the Day, no overflow")
        for sel, path, probe in ((".hub-card-atlas", "/atlas", ".atlas-view-toggle"), (".hub-card-half >> nth=0", "/route", ".route-rows-view"), (".hub-card-half >> nth=1", "/postcards", ".pc-form")):
            pg.goto(BASE + "/"); pg.wait_for_selector(".hub-card"); pg.locator(sel).click(); pg.wait_for_timeout(1000)
            check(pg.evaluate("location.pathname") == path and pg.locator(probe).count() >= 1, f"{name}: Home -> {path} shows the redesigned screen")
            check(ov(pg) <= 0, f"{name}: {path} no horizontal overflow")
        # redesigned screens reach each other / back to Home through the unchanged main nav
        for i, label in enumerate(["Journeys", "My Van", "About", "Home"]):
            pg.locator(".tab-btn").nth(["Home", "Journeys", "My Van", "About"].index(label)).click(); pg.wait_for_timeout(500)
            check(ov(pg) <= 0, f"{name}: tab {label} opens, no overflow")
        check(pg.locator(".tab-btn").first.locator("svg.tab-van-outline").count() == 1, f"{name}: Home tab outline icon")
        # Roadbook entry points still lead into Route / Postcards
        pg.goto(BASE + "/roadbook"); pg.wait_for_timeout(500); pg.locator(".roadbook-dot").last.click(); pg.wait_for_timeout(900)
        pg.locator(".roadbook-cta-row .pill-btn").first.click(); pg.wait_for_selector(".roadbook-choice-card"); pg.locator(".roadbook-choice-card .roadbook-hub-btn").nth(0).click(); pg.wait_for_timeout(500)
        check(pg.evaluate("location.pathname") == "/route" and pg.locator(".route-rows-view").count() == 1, f"{name}: Roadbook -> Pick the Route")
        check(not errs, f"{name}: no page errors {errs[:1]}"); ctx.close()
    b.close()
print("FAILS", fails) if fails else print("ALL PASS"); sys.exit(1 if fails else 0)
