"""Van Atlas location Bottom Sheet. Needs the local harness (react-leaflet stub that renders cluster markers as .stub-marker)."""
import json, sys, io, base64
from playwright.sync_api import sync_playwright
from PIL import Image
BASE = "http://127.0.0.1:4173"
fails = []
def check(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
buf = io.BytesIO(); Image.new("RGB", (600, 400), (200, 120, 60)).save(buf, "JPEG")
DATA_URI = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
LONG = ("Μια πολύ μεγάλη ιστορία. " * 60).strip()
def pc(i, name, lat, lon, story, photo=True, song=True):
    return {"id": f"id-{i}", "placeName": name, "locationText": "", "latitude": str(lat), "longitude": str(lon), "story": story, "displayName": f"Φίλος {i}",
            "songTitle": f"Τραγούδι {i}" if song else "", "artist": f"Καλλιτέχνης {i}" if song else "", "musicUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" if song else "", "photoUrl": DATA_URI if photo else ""}
POSTS = [pc(1, "Ναύπλιο", 37.57, 22.80, LONG), pc(2, "Μήλος", 36.72, 24.42, "Ιστορία δύο", photo=False, song=False), pc(3, "Ναύπλιο", 37.57, 22.80, "Δεύτερη ιστορία", song=False)]
N_ROUTES = 40
def csv():
    rows = ["Submission ID,Destination,Latitude,Longitude,Music Genre,Song Title,Artist,Music URL,User Message,Created At,Status,User Name"]
    for i in range(N_ROUTES):
        rows.append(f'r{i},Ναύπλιο,37.57,22.80,Λαϊκό,Ρούτα {i},Τραγουδιστής {i},https://www.youtube.com/watch?v=dQw4w9WgXcQ,"Μήνυμα {i}",2026-01-01,,Χ')
    return "\n".join(rows)
def h(r):
    u = r.request.url; H = {"Access-Control-Allow-Origin": "*"}
    if u.startswith(BASE) or u.startswith("data:"): return r.continue_()
    if "docs.google.com" in u and "Route" in u: return r.fulfill(status=200, content_type="text/csv", headers=H, body=csv())
    if "approved_postcards" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps({"ok": True, "postcards": POSTS}))
    if "action=promotions" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"promotions":[]}')
    if "action=content" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"content":{"song":null,"poll":null}}')
    return r.abort()
def sheet_box(pg): return pg.evaluate("(()=>{const r=document.querySelector('.atlas-sheet').getBoundingClientRect();return {t:r.top,b:r.bottom,h:r.height,l:r.left,r:r.right}})()")
def tab_top(pg): return pg.evaluate("document.querySelector('.tab-bar').getBoundingClientRect().top")
with sync_playwright() as p:
    b = p.chromium.launch()
    def new(w=390, h_=844, lang="el"):
        ctx = b.new_context(viewport={"width": w, "height": h_}, has_touch=False); ctx.add_init_script("try{localStorage.setItem('tvr_lang','%s')}catch(e){}" % lang)
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.route("**/*", h); return ctx, pg
    def marker(pg, name):
        # the Ναύπλιο cluster has the most entries (N_ROUTES + 2)
        ms = pg.locator(".stub-marker"); n = ms.count()
        for i in range(n):
            t = ms.nth(i).get_attribute("title") or ""
            if name in t: return ms.nth(i)
        return ms.first
    for (w, hh) in [(390, 844), (320, 568), (412, 915)]:
        ctx, pg = new(w, hh); pg.goto(BASE + "/atlas"); pg.wait_for_timeout(1300)
        tag = f"[{w}x{hh}]"
        check(pg.locator(".stub-marker").count() == 2, f"{tag} two map pins")
        pg.evaluate("document.querySelector('.stub-map').setAttribute('data-keep','1'); window.__y0=window.scrollY")
        h0 = pg.evaluate("document.documentElement.scrollHeight")
        marker(pg, "Ναύπλιο").click(); pg.wait_for_timeout(500)
        check(pg.locator(".atlas-sheet").count() == 1 and pg.locator(".atlas-sheet").get_attribute("data-snap") == "half", f"{tag} sheet opens expanded")
        check(pg.locator(".atlas-detail-panel").count() == 0, f"{tag} nothing listed below the map any more")
        check(pg.evaluate("window.scrollY") == 0 and pg.evaluate("document.documentElement.scrollHeight") == h0, f"{tag} page did not scroll / grow")
        check(pg.locator(".atlas-sheet-title").inner_text() == "Ναύπλιο", f"{tag} title = location name")
        sub = pg.locator(".atlas-sheet-sub").inner_text()
        check(sub == f"{N_ROUTES + 2} καταχωρίσεις · {N_ROUTES} τραγούδια · 2 καρτ ποστάλ", f"{tag} subtitle counts: {sub}")
        bx = sheet_box(pg); tt = tab_top(pg)
        check(abs(bx["b"] - tt) <= 1.5, f"{tag} sheet sits right above the tab bar ({bx['b']:.0f} vs {tt:.0f})")
        check(bx["h"] <= hh * 0.55 and bx["h"] > 150, f"{tag} expanded height reasonable {bx['h']:.0f}")
        check(pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0, f"{tag} no horizontal overflow")
        check(pg.evaluate("!!document.querySelector('[data-keep=\"1\"]')"), f"{tag} map stays mounted")
        # content preserved
        body = pg.locator(".atlas-sheet-body")
        check(pg.locator(".atlas-sheet-entry .atlas-entry-card:not(.atlas-postcard)").count() == 30, f"{tag} first 30 route entries listed")
        first = pg.locator(".atlas-sheet-entry").first
        t0 = first.inner_text()
        check("Ρούτα 0" in t0 and "Τραγουδιστής 0" in t0 and "Λαϊκό" in t0 and "Μήνυμα 0" in t0, f"{tag} route entry keeps song/artist/genre/message")
        check(first.locator("button[aria-label*='My Van']").count() == 1 and first.locator("button:has-text('Άκου'), button:has-text('Ακου'), button").count() >= 2, f"{tag} route entry keeps listen + My Van")
        more = pg.locator(".atlas-sheet-more"); check(more.count() == 1, f"{tag} 'see more' button for a big location")
        more.scroll_into_view_if_needed(); more.click(); pg.wait_for_timeout(300)
        check(pg.locator(".atlas-sheet-entry .atlas-entry-card:not(.atlas-postcard)").count() == N_ROUTES, f"{tag} after 'more' all {N_ROUTES} route entries are there")
        check(pg.locator(".atlas-sheet-h").count() == 2, f"{tag} two section headings (routes + postcards)")
        # postcard with the whole story + photo + music + actions
        full_story = pg.evaluate("[...document.querySelectorAll('.atlas-sheet .pcard-msg')].map(e=>e.textContent)")
        check(LONG in full_story, f"{tag} postcard story shown in full, not shortened")
        check(pg.locator(".atlas-sheet .pcard-front img").count() == 2 and pg.locator(".atlas-sheet .pcard-song").count() == 1, f"{tag} postcard photo + music info kept")
        check(pg.locator(".atlas-sheet .atlas-postcard-actions button[aria-label*='My Van']").count() == 2, f"{tag} postcard My Van actions kept")
        # three states
        pg.locator(".atlas-sheet-btn-fold").click(); pg.wait_for_timeout(450)
        bx = sheet_box(pg); check(pg.locator(".atlas-sheet").get_attribute("data-snap") == "collapsed" and 90 <= bx["h"] <= 100, f"{tag} collapsed height {bx['h']:.0f}")
        check(pg.locator(".atlas-sheet-body").count() == 0 and pg.locator(".atlas-sheet-title").inner_text() == "Ναύπλιο", f"{tag} collapsed shows name + count only")
        pg.locator(".atlas-sheet-btn-fold").click(); pg.wait_for_timeout(450)
        check(pg.locator(".atlas-sheet").get_attribute("data-snap") == "half", f"{tag} expand again")
        pg.locator(".atlas-sheet-btn-size").click(); pg.wait_for_timeout(450)
        bx = sheet_box(pg); check(pg.locator(".atlas-sheet").get_attribute("data-snap") == "full" and bx["t"] <= 14 and abs(bx["b"] - tab_top(pg)) <= 1.5, f"{tag} full height top={bx['t']:.0f}")
        if (w, hh) == (390, 844): pg.screenshot(path="sheet_full_390.png")
        check(pg.locator(".atlas-sheet-body").evaluate("e=>e.scrollHeight>e.clientHeight"), f"{tag} full: content scrolls inside the sheet")
        st = pg.evaluate("window.scrollY"); pg.locator(".atlas-sheet-body").evaluate("e=>e.scrollTo(0,e.scrollHeight)"); pg.wait_for_timeout(100)
        check(pg.evaluate("window.scrollY") == st, f"{tag} scrolling the sheet does not scroll the page")
        # keyboard on the handle
        pg.locator(".atlas-sheet-grab").focus(); pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(350)
        check(pg.locator(".atlas-sheet").get_attribute("data-snap") == "half", f"{tag} ArrowDown on the handle steps down")
        pg.keyboard.press("ArrowDown"); pg.wait_for_timeout(350)
        check(pg.locator(".atlas-sheet").get_attribute("data-snap") == "collapsed", f"{tag} ArrowDown again collapses")
        pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(350); pg.keyboard.press("ArrowUp"); pg.wait_for_timeout(350)
        check(pg.locator(".atlas-sheet").get_attribute("data-snap") == "full", f"{tag} ArrowUp x2 -> full")
        pg.screenshot(path=f"sheet_{w}.png")
        # close with the button, map still mounted
        pg.locator(".atlas-sheet-btn[aria-label='Κλείσιμο']").click(); pg.wait_for_timeout(300)
        check(pg.locator(".atlas-sheet").count() == 0, f"{tag} close button closes")
        check(pg.evaluate("!!document.querySelector('[data-keep=\"1\"]')"), f"{tag} map still mounted after close")
        # second location replaces content, resets to expanded
        marker(pg, "Ναύπλιο").click(); pg.wait_for_timeout(300)
        marker(pg, "Μήλος").click(); pg.wait_for_timeout(300)
        check(pg.locator(".atlas-sheet-title").inner_text() == "Μήλος" and pg.locator(".atlas-sheet").count() == 1, f"{tag} picking another pin swaps the content")
        # Escape closes
        pg.keyboard.press("Escape"); pg.wait_for_timeout(250)
        check(pg.locator(".atlas-sheet").count() == 0, f"{tag} Escape closes")
        check(not pg.errs, f"{tag} no page errors {pg.errs}")
        ctx.close()
    # ---- drag / swipe with the pointer ----
    ctx, pg = new(390, 844); pg.goto(BASE + "/atlas"); pg.wait_for_timeout(1200); marker(pg, "Ναύπλιο").click(); pg.wait_for_timeout(400)
    g = pg.locator(".atlas-sheet-head").bounding_box(); x = g["x"] + 120; y0 = g["y"] + 20
    pg.mouse.move(x, y0); pg.mouse.down(); pg.mouse.move(x, y0 - 120, steps=6); pg.mouse.move(x, y0 - 320, steps=6); pg.mouse.up(); pg.wait_for_timeout(450)
    check(pg.locator(".atlas-sheet").get_attribute("data-snap") == "full", "swipe up from expanded -> full")
    g = pg.locator(".atlas-sheet-head").bounding_box(); y0 = g["y"] + 20
    pg.mouse.move(x, y0); pg.mouse.down(); pg.mouse.move(x, y0 + 200, steps=6); pg.mouse.move(x, y0 + 700, steps=8); pg.mouse.up(); pg.wait_for_timeout(450)
    sn = pg.locator(".atlas-sheet").get_attribute("data-snap") if pg.locator(".atlas-sheet").count() else "closed"
    check(sn in ("collapsed", "closed"), f"long swipe down -> {sn}")
    if sn == "collapsed":
        g = pg.locator(".atlas-sheet-head").bounding_box(); y0 = g["y"] + 20
        pg.mouse.move(x, y0); pg.mouse.down(); pg.mouse.move(x, y0 + 60, steps=5); pg.mouse.up(); pg.wait_for_timeout(450)
        check(pg.locator(".atlas-sheet").count() == 0, "swipe down from collapsed -> closes")
    # tap on the handle cycles states
    marker(pg, "Ναύπλιο").click(); pg.wait_for_timeout(300)
    pg.locator(".atlas-sheet-grab").click(); pg.wait_for_timeout(350)
    check(pg.locator(".atlas-sheet").get_attribute("data-snap") == "full", "handle tap: expanded -> full")
    check(not pg.errs, f"no errors {pg.errs}"); ctx.close()
    # ---- English ----
    ctx, pg = new(390, 844, "en"); pg.goto(BASE + "/atlas"); pg.wait_for_timeout(1200); marker(pg, "Ναύπλιο").click(); pg.wait_for_timeout(300)
    check(pg.locator(".atlas-sheet-sub").inner_text() == f"{N_ROUTES + 2} entries · {N_ROUTES} songs · 2 postcards", "EN subtitle: " + pg.locator(".atlas-sheet-sub").inner_text())
    check(pg.locator(".atlas-sheet-h").first.inner_text().startswith("Music routes"), "EN section heading")
    ctx.close()
    # ---- desktop side panel ----
    ctx, pg = new(1440, 900); pg.goto(BASE + "/atlas"); pg.wait_for_timeout(1200); marker(pg, "Ναύπλιο").click(); pg.wait_for_timeout(500)
    bx = sheet_box(pg); col = pg.evaluate("(()=>{const r=document.querySelector('.app-root').getBoundingClientRect();return {l:r.left,r:r.right}})()")
    check(bx["l"] >= col["r"] and bx["r"] <= 1440 and bx["h"] > 700, f"desktop: side panel right of the app column {bx}")
    check(pg.locator(".atlas-sheet-btn-fold").is_hidden() and pg.locator(".atlas-sheet-grab").is_hidden(), "desktop: no bottom-sheet controls")
    pg.screenshot(path="sheet_desktop.png"); ctx.close()
    # ---- with the mini player on, the sheet clears it ----
    ctx, pg = new(390, 844); pg.goto(BASE + "/journeys"); pg.wait_for_timeout(600); pg.locator(".ep-row .play-btn-sm").first.click(); pg.wait_for_timeout(500)
    pg.locator(".tab-btn", has_text="Home").click(); pg.wait_for_timeout(300); pg.locator(".hub-card-atlas").click(); pg.wait_for_timeout(1000)
    marker(pg, "Ναύπλιο").click(); pg.wait_for_timeout(500)
    mp = pg.evaluate("(()=>{const e=document.querySelector('.mini-player');return e?e.getBoundingClientRect().top:null})()")
    bx = sheet_box(pg)
    check(mp is not None and bx["b"] <= mp + 1.5, f"mini player stays visible below the sheet (sheet bottom {bx['b']:.0f}, mini top {mp})")
    pg.screenshot(path="sheet_mini.png"); ctx.close()
    b.close()
print("\nFAILS:", fails) if fails else print("\nALL PASS")
sys.exit(1 if fails else 0)
