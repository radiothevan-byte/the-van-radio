"""Postcards from the Road redesign: presentation changed; fields, required status, payload,
and the approved-only gallery must NOT. Run against the local harness (http://127.0.0.1:4173)."""
import json, sys, io, base64
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = "http://127.0.0.1:4173"
fails = []
def check(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
buf = io.BytesIO(); Image.new("RGB", (600, 400), (200, 120, 60)).save(buf, "JPEG"); PHOTO = buf.getvalue()
DATA_URI = "data:image/jpeg;base64," + base64.b64encode(PHOTO).decode()
def pc(i, name, story, photo=True):
    return {"id": f"id-{i}", "placeName": name, "locationText": "", "latitude": str(37 + i * .3), "longitude": str(23 + i * .3),
            "story": story, "displayName": f"Φίλος {i}", "songTitle": "Τραγούδι" if i == 1 else "", "artist": "Καλλιτέχνης" if i == 1 else "",
            "musicUrl": "", "photoUrl": DATA_URI if photo else ""}
POSTS = [pc(1, "Ναύπλιο", "Ιστορία ένα"), pc(2, "Μήλος", "Ιστορία δύο"), pc(3, "Χανιά", "Ιστορία τρία", photo=False)]
posted = []
def mk(postcards):
    def h(r):
        u = r.request.url; H = {"Access-Control-Allow-Origin": "*"}
        if u.startswith(BASE) or u.startswith("data:"): return r.continue_()
        if "nominatim.openstreetmap.org/search" in u:
            return r.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps([{"display_name": "Μήλος, Κυκλάδες, Ελλάδα", "lat": "36.72", "lon": "24.42", "name": "Μήλος", "type": "island"}]))
        if "approved_postcards" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps({"ok": True, "postcards": postcards}))
        if "action=promotions" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"promotions":[]}')
        if "script.google.com" in u or "script.googleusercontent.com" in u:
            if r.request.method == "POST": posted.append(json.loads(r.request.post_data)); return r.fulfill(status=200, content_type="text/plain", headers=H, body='{"ok":true,"photo_saved":true}')
            return r.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"routes":[]}')
        return r.abort()
    return h
with sync_playwright() as p:
    b = p.chromium.launch()
    def new(w, postcards):
        ctx = b.new_context(viewport={"width": w, "height": 844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.route("**/*", mk(postcards)); return ctx, pg
    for w in (390, 320):
        # ---- submission form ----
        ctx, pg = new(w, POSTS); pg.goto(BASE + "/postcards"); pg.wait_for_timeout(700)
        check(pg.locator(".pc-hero-img").count() == 1, f"{w}px form hero image shown")
        check(pg.locator(".pc-section").count() == 5, "5 grouped sections")
        inputs = pg.locator("input.route-input"); ta = pg.locator("textarea.route-textarea")
        check(inputs.count() == 4 and ta.count() == 1 and pg.locator("input[type=file]").count() == 1 and pg.locator(".postcard-consent input[type=checkbox]").count() == 1, "same fields: name, story, photo, 3 optional song fields, consent")
        check([inputs.nth(i).get_attribute("maxlength") for i in range(4)] == ["60", "80", "80", "300"] and ta.get_attribute("maxlength") == "1000", "maxLength unchanged")
        send = pg.locator(".pc-submit-row .pill-btn"); check(send.is_disabled(), "empty -> send disabled")
        inputs.nth(0).fill("Νίκος"); ta.fill("Μια ιστορία"); check(send.is_disabled(), "name+story only -> still disabled")
        pg.fill(".route-search-input", "Μήλος"); pg.keyboard.press("Enter"); pg.wait_for_timeout(700); pg.locator(".route-search-result").first.click(); pg.wait_for_timeout(500)
        check(send.is_disabled(), "no photo/consent -> disabled")
        pg.set_input_files("input[type=file]", {"name": "a.jpg", "mimeType": "image/jpeg", "buffer": PHOTO}); pg.wait_for_timeout(600)
        check(pg.locator(".pc-polaroid .postcard-preview-img").count() == 1, "photo preview shown (polaroid frame)")
        check(send.is_disabled(), "no consent -> disabled")
        pg.locator(".postcard-consent input").check(); check(send.is_enabled(), "all required -> enabled (song fields optional)")
        check(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px form: no horizontal overflow")
        if w == 390:
            pg.screenshot(path="pc_form_390.png", full_page=True)
            send.click(); pg.wait_for_selector(".pc-success-card", timeout=20000); pg.wait_for_timeout(400)
            check(len(posted) == 1, "exactly one submission")
            if posted:
                d = posted[0]
                check(sorted(d.keys()) == sorted(["form_type", "place_name", "location_text", "latitude", "longitude", "story", "display_name", "song_title", "artist", "music_url", "photo_base64", "photo_mime", "consent"]), "payload keys unchanged")
                check(d["consent"] is True and d["form_type"] == "postcard" and d["song_title"] is None and d["music_url"] is None, "consent=true, optional fields null")
            pg.screenshot(path="pc_success_390.png")
        check(not pg.errs, "no page errors"); ctx.close()
        # ---- gallery (Atlas) ----
        ctx, pg = new(w, POSTS); pg.goto(BASE + "/atlas"); pg.wait_for_timeout(1200)
        check(pg.locator(".atlas-view-toggle button").count() == 2, f"{w}px Map/Postcards toggle present")
        check(pg.locator(".route-leaflet-wrap").count() == 1, "map view is default and Leaflet map present")
        pg.locator(".atlas-view-toggle button").nth(1).click(); pg.wait_for_timeout(400)
        check(pg.locator(".atlas-tile").count() == 3, "grid shows exactly the 3 approved postcards")
        check(pg.locator(".atlas-tile-img").count() == 2 and pg.locator(".atlas-tile-text").count() == 1, "photo tiles use the existing photoUrl; no-photo one is a text tile")
        src = pg.locator(".atlas-tile-img").first.get_attribute("src"); check(src == DATA_URI, "photo URL unchanged (same image)")
        if w == 390: pg.screenshot(path="pc_grid_390.png", full_page=True)
        pg.locator(".atlas-tile").first.click(); pg.wait_for_timeout(300)
        check(pg.locator(".atlas-opened .atlas-postcard").count() == 1 and "Ιστορία ένα" in pg.locator(".atlas-opened").inner_text() and "Ναύπλιο" in pg.locator(".atlas-opened").inner_text(), "tile opens the postcard card (place + story)")
        check("Τραγούδι" in pg.locator(".atlas-opened").inner_text(), "song line shown")
        if w == 390: pg.screenshot(path="pc_open_390.png", full_page=True)
        pg.locator(".atlas-opened .atlas-entry-save").last.click(); pg.wait_for_timeout(300)
        check("My Van" in pg.locator(".atlas-opened .atlas-entry-save").last.inner_text(), "save to My Van still works")
        pg.locator(".atlas-back-btn").click(); pg.wait_for_timeout(300)
        check(pg.locator(".atlas-tile").count() == 3 and pg.locator(".atlas-opened").count() == 0, "back returns to the gallery")
        pg.locator(".atlas-view-toggle button").nth(0).click(); pg.wait_for_timeout(500)
        check(pg.locator(".route-leaflet-wrap").count() == 1, "back to map view")
        check(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px gallery: no horizontal overflow")
        check(not pg.errs, "no page errors"); ctx.close()
    # no postcards -> no toggle (map-only like before)
    ctx, pg = new(390, []); pg.goto(BASE + "/atlas"); pg.wait_for_timeout(1000)
    check(pg.locator(".atlas-view-toggle").count() == 0, "no approved postcards -> no toggle"); ctx.close()
    b.close()
print("FAILS", fails) if fails else print("ALL PASS"); sys.exit(1 if fails else 0)
