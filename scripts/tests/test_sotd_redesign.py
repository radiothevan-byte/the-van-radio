"""Song of the Day redesign + Home tab outline icon. Run against the local harness (http://127.0.0.1:4173)."""
import json, sys
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:4173"; H = {"Access-Control-Allow-Origin": "*"}
fails = []
def check(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
YT = "https://www.youtube.com/watch?v=AaG9nV9gzdU"
def song(link): return {"id": "sotd-t", "title": "Πυρ Γυνή και Θάλασσα", "artist": "Νεφέλη Φασούλη", "link": link, "noteEl": "Μια θάλασσα.", "noteEn": "A sea."}
def mk(s):
    def h(r):
        u = r.request.url
        if u.startswith(BASE): return r.continue_()
        if "action=content" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps({"ok": True, "content": {"song": s, "poll": None}}))
        if "action=promotions" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"promotions":[]}')
        return r.abort()
    return h
with sync_playwright() as p:
    b = p.chromium.launch()
    def new(s, w=390):
        ctx = b.new_context(viewport={"width": w, "height": 844}, permissions=["clipboard-read", "clipboard-write"]); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        pg = ctx.new_page(); pg.errs = []; pg.reqs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.on("request", lambda r: pg.reqs.append(r.url)); pg.route("**/*", mk(s)); return ctx, pg
    for w in (390, 320):
        ctx, pg = new(song(YT), w); pg.goto(BASE + "/"); pg.wait_for_selector(".content-song"); pg.wait_for_timeout(500)
        c = pg.locator(".content-song"); txt = c.inner_text()
        check("THE VAN PRESENTS" in txt and "ΤΡΑΓΟΥΔΙ ΤΗΣ ΗΜΕΡΑΣ" in txt.upper() and "Πυρ Γυνή και Θάλασσα" in txt and "Νεφέλη Φασούλη" in txt and "Μια θάλασσα." in txt, f"{w}px card shows presents/kicker/title/artist/note")
        check(pg.locator(".content-cta").count() == 1 and "Παίξε" in pg.locator(".content-cta").inner_text(), "single Play action")
        check(pg.locator(".content-song").evaluate("e=>getComputedStyle(e).backgroundImage").count("url(") == 1, "existing brand image used as card art")
        check(not any("youtube" in r or "ytimg" in r for r in pg.reqs), "no YouTube request before the player is opened")
        check(pg.locator(".sotd-source").get_attribute("href") == YT, "original source link points at the song's own link")
        # save to My Van from the card
        pg.locator(".sotd-tool").first.click(); pg.wait_for_timeout(200)
        saved = json.loads(pg.evaluate("localStorage.getItem('tvr_my_van_songs')") or "[]")
        check(len(saved) == 1 and saved[0]["id"] == "sotd:sotd-t" and saved[0]["musicUrl"] == YT, "card heart saves to My Van (same record as the player)")
        check(pg.locator(".sotd-tool").first.get_attribute("aria-pressed") == "true", "heart shows saved state")
        check(pg.locator(".sp-sheet").count() == 0, "tool tap does not open the player")
        pg.locator(".sotd-tool").first.click(); pg.wait_for_timeout(200)
        check(json.loads(pg.evaluate("localStorage.getItem('tvr_my_van_songs')") or "[]") == [], "second tap removes it again")
        # share -> copies the song link (no native share sheet in the harness)
        pg.locator(".sotd-tool").nth(1).click(); pg.wait_for_timeout(400)
        check(pg.evaluate("navigator.clipboard.readText()") == YT or "youtube" in pg.evaluate("navigator.clipboard.readText()"), "share copies/shares the song link")
        # play still opens the in-app player; saved state is shared with the player
        pg.locator(".sotd-tool").first.click(); pg.wait_for_timeout(150)
        pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(400)
        check("Αποθηκεύτηκε" in pg.locator(".sp-save").inner_text(), "player opens and reflects the saved state")
        check(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px no horizontal overflow")
        # Home tab: outline icon like the others, no photo
        check(pg.locator(".tab-btn").first.locator("svg.tab-van-outline").count() == 1 and pg.locator(".tab-btn").first.locator("img").count() == 0, "Home tab uses the Van outline icon (no photo)")
        check(not pg.errs, "no page errors"); ctx.close()
    # non-playable link -> keeps the external 'Listen' link, no source row duplicate
    ctx, pg = new(song("https://example.com/track")); pg.goto(BASE + "/"); pg.wait_for_selector(".content-song")
    check(pg.locator("a.content-cta").count() == 1 and pg.locator(".sotd-source").count() == 0 and pg.locator(".sp-sheet").count() == 0, "non-playable link: external Listen link kept"); ctx.close()
    # My Van still lists a song saved from the card
    ctx, pg = new(song(YT)); pg.goto(BASE + "/"); pg.wait_for_selector(".content-song"); pg.locator(".sotd-tool").first.click(); pg.wait_for_timeout(200)
    pg.locator(".tab-btn").nth(2).click(); pg.wait_for_timeout(400); pg.locator(".myvan-tab", has_text="Songs").click(); pg.wait_for_timeout(300)
    check("Πυρ Γυνή και Θάλασσα" in pg.evaluate("document.body.innerText"), "song saved from the card appears in My Van"); ctx.close()
    b.close()
print("FAILS", fails) if fails else print("ALL PASS"); sys.exit(1 if fails else 0)
