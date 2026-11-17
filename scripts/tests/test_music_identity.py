# "Η μουσική ταυτότητα" under the Song of the Day player: full / partial / no data, EL + EN, 320/390/desktop/landscape.
import json, sys
from playwright.sync_api import sync_playwright
BASE = "http://127.0.0.1:4173"
fails = []
def check(c, m):
    print(("PASS " if c else "FAIL ") + m)
    if not c: fails.append(m)
H = {"Access-Control-Allow-Origin": "*"}
YT = "https://www.youtube.com/watch?v=AaG9nV9gzdU"
POLL = {"id": "p1", "questionEl": "Ποιο ταξίδι σου ταιριάζει;", "questionEn": "Which trip?", "options": [{"index": 0, "el": "Θάλασσα", "en": "Sea"}, {"index": 1, "el": "Βουνό", "en": "Mountain"}], "votes": [1, 2], "end": None}
def song(identity=None, **kw):
    s = {"id": "sotd-id", "title": "Πυρ Γυνή και Θάλασσα", "artist": "Νεφέλη Φασούλη", "link": YT, "noteEl": "Μια θάλασσα.", "noteEn": "A sea."}
    s.update(kw)
    if identity is not None: s["identity"] = identity
    return s
YT_STUB = """(function(){var S={UNSTARTED:-1,ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5};window.__yt={created:0,calls:[]};
function Player(el,opts){var self=this;window.__yt.created++;var f=document.createElement('iframe');f.src='about:blank';el.parentNode.replaceChild(f,el);self.t=0;self.d=222;
self.playVideo=function(){window.__yt.calls.push('play');opts.events.onStateChange({data:1,target:self});};self.pauseVideo=function(){window.__yt.calls.push('pause');opts.events.onStateChange({data:2,target:self});};
self.seekTo=function(v){self.t=v;};self.getCurrentTime=function(){return self.t;};self.getDuration=function(){return self.d;};self.destroy=function(){};setTimeout(function(){opts.events.onReady({target:self});},30);}
window.YT={Player:Player,PlayerState:S};setTimeout(function(){if(window.onYouTubeIframeAPIReady)window.onYouTubeIframeAPIReady();},10);})();"""
def mk(s):
    def h(route):
        u = route.request.url
        if u.startswith(BASE): return route.continue_()
        if "action=content" in u: return route.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps({"ok": True, "content": {"song": s, "poll": POLL}}))
        if "action=promotions" in u: return route.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"promotions":[]}')
        if u.startswith("https://www.youtube.com/iframe_api"): return route.fulfill(status=200, content_type="application/javascript", body=YT_STUB)
        return route.abort()
    return h
FULL = {"composer": "Μάνος Χατζιδάκις", "lyricist": "Νίκος Γκάτσος", "album": "Ο Μεγάλος Ερωτικός", "year": 1972}
with sync_playwright() as p:
    b = p.chromium.launch()
    def open_player(s, w=390, h=844, lang="el"):
        ctx = b.new_context(viewport={"width": w, "height": h}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','%s')}catch(e){}" % lang)
        pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.route("**/*", mk(s))
        pg.goto(BASE + "/"); pg.wait_for_selector(".content-song"); pg.locator(".content-song .content-title").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(300)
        return ctx, pg
    # 1) full data
    for w, h in [(390, 844), (320, 640), (1280, 800), (844, 390)]:
        ctx, pg = open_player(song(FULL), w, h)
        box = pg.locator(".sp-identity")
        check(box.count() == 1, f"[{w}x{h}] section present")
        check(pg.locator(".sp-identity-h").inner_text().strip().lower() == "η μουσική ταυτότητα", f"[{w}x{h}] heading text")
        rows = pg.locator(".sp-identity-row")
        labels = [rows.nth(i).locator(".sp-identity-label").inner_text() for i in range(rows.count())]
        vals = [rows.nth(i).locator(".sp-identity-value").inner_text() for i in range(rows.count())]
        check(labels == ["Μουσική", "Στίχοι", "Άλμπουμ", "Έτος κυκλοφορίας"], f"[{w}x{h}] four labelled rows in order: {labels}")
        check(vals == ["Μάνος Χατζιδάκις", "Νίκος Γκάτσος", "Ο Μεγάλος Ερωτικός", "1972"], f"[{w}x{h}] values: {vals}")
        txt = box.inner_text()
        check("Πυρ Γυνή" not in txt and "Νεφέλη" not in txt, f"[{w}x{h}] title/artist not repeated inside the section")
        check(box.locator("img").count() == 0, f"[{w}x{h}] no image inside the section")
        check(pg.evaluate("document.querySelector('.sp-sheet').scrollWidth <= document.querySelector('.sp-sheet').clientWidth + 1"), f"[{w}x{h}] no horizontal overflow")
        check(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), f"[{w}x{h}] page not wider than viewport")
        check(pg.locator(".sp-title").count() == 1 and pg.locator(".sp-artist").count() == 1 and pg.locator(".sp-yt, iframe").count() >= 1, f"[{w}x{h}] player + title/artist still there")
        if (w, h) in [(390, 844), (320, 640), (1280, 800), (844, 390)]:
            pg.locator(".sp-identity").scroll_into_view_if_needed(); pg.wait_for_timeout(150)
            pg.screenshot(path=f"identity_full_{w}x{h}.png")
        check(not pg.errs, f"[{w}x{h}] no page errors {pg.errs}")
        ctx.close()
    # 2) partial: only composer + album, rest hidden
    ctx, pg = open_player(song({"composer": "Κάποιος Συνθέτης", "album": "Ένα Άλμπουμ"}))
    labels = [pg.locator(".sp-identity-label").nth(i).inner_text() for i in range(pg.locator(".sp-identity-label").count())]
    check(labels == ["Μουσική", "Άλμπουμ"], f"partial: only available fields {labels}")
    check(pg.locator(".sp-identity-row[data-field=lyrics], .sp-identity-row[data-field=year]").count() == 0, "partial: no empty rows / placeholders")
    pg.screenshot(path="identity_partial_390.png"); ctx.close()
    # 3) none: absent, empty object, garbage values, bad year
    for name, ident in [("absent", None), ("empty object", {}), ("blank strings", {"composer": " ", "lyricist": "", "album": "", "year": ""}), ("bad year", {"year": 1492}), ("not an object", "x")]:
        ctx, pg = open_player(song(ident))
        check(pg.locator(".sp-identity").count() == 0 and "μουσική ταυτότητα" not in pg.locator(".sp-sheet").inner_text().lower(), f"none ({name}): whole section omitted")
        check(pg.locator(".sp-title").count() == 1, f"none ({name}): player intact")
        ctx.close()
    # 4) English
    ctx, pg = open_player(song(FULL), lang="en")
    check(pg.locator(".sp-identity-h").inner_text().strip().lower() == "music identity", "EN heading")
    check([pg.locator(".sp-identity-label").nth(i).inner_text() for i in range(4)] == ["Music", "Lyrics", "Album", "Year released"], "EN labels")
    ctx.close()
    # 5) long names wrap, no overflow at 320
    long = {"composer": "Πολύ Μεγάλο Όνομα Συνθέτη Και Δεύτερο Όνομα, Άλλος Συνθέτης Με Μακρύ Όνομα", "lyricist": "Στιχουργός", "album": "Ένας Εξαιρετικά Μακρύς Τίτλος Άλμπουμ Που Δεν Χωράει Σε Μία Γραμμή Καθόλου", "year": 1999}
    ctx, pg = open_player(song(long), 320, 640)
    check(pg.evaluate("document.querySelector('.sp-sheet').scrollWidth <= document.querySelector('.sp-sheet').clientWidth + 1"), "long names: no horizontal overflow at 320")
    pg.locator(".sp-identity").scroll_into_view_if_needed(); pg.screenshot(path="identity_long_320.png"); ctx.close()
    # 6) player controls + poll still work with identity present
    ctx, pg = open_player(song(FULL))
    pg.locator(".sp-play").click(); pg.wait_for_timeout(500)
    check("play" in pg.evaluate("window.__yt.calls") and pg.locator(".sp-play").get_attribute("aria-label") == "Παύση", "play/pause still works")
    pg.locator(".sp-close").click(); pg.wait_for_timeout(200)
    check(pg.locator(".sp-sheet").count() == 0, "player closes")
    check(pg.locator(".content-poll, .poll-card, [class*=poll]").count() >= 1, "poll card still rendered")
    ctx.close()
    # 7) saved songs / other players never show identity
    b.close()
print("\nFAILS:", fails) if fails else print("\nALL PASS")
sys.exit(1 if fails else 0)
