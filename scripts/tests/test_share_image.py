"""Share postcard as an image: native share gets a PNG file (+ link in caption); the link share
button is unchanged; no file-sharing support or undrawable photo -> no image button. Local harness."""
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
LONG = "Μια πολύ μεγάλη ιστορία για τον τόπο που βρεθήκαμε με το van, τη θάλασσα, τα βράχια και το ηλιοβασίλεμα που δεν θα ξεχάσουμε ποτέ. " * 4
def pc(i, **kw):
    d = {"id": f"id-{i}", "placeName": "Τεχνητή Λίμνη Πλαστήρα", "locationText": "", "latitude": "39.3", "longitude": "21.7", "story": LONG,
         "displayName": "Poudras", "songTitle": "Είναι ωραία στον παράδεισο", "artist": "Τρύπες", "musicUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "photoUrl": DATA_URI}
    d.update(kw); return d
SHARE_JS = """
window.__calls=[];
navigator.canShare=(d)=>!!(d&&d.files&&d.files.length)||!!(d&&d.url);
navigator.share=async(d)=>{const rec={title:d.title,text:d.text,url:d.url,files:[]};
  for(const f of (d.files||[])){rec.files.push({name:f.name,type:f.type,size:f.size,data:await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f)})});}
  window.__calls.push(rec);};
"""
def mk(postcards):
    def h(r):
        u = r.request.url; H = {"Access-Control-Allow-Origin": "*"}
        if u.startswith(BASE) or u.startswith("data:"): return r.continue_()
        if "approved_postcards" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body=json.dumps({"ok": True, "postcards": postcards}))
        if "action=promotions" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"promotions":[]}')
        if "script.google.com" in u or "script.googleusercontent.com" in u: return r.fulfill(status=200, content_type="application/json", headers=H, body='{"ok":true,"routes":[]}')
        return r.abort()
    return h
def open_card(b, postcards, share=True, w=390):
    ctx = b.new_context(viewport={"width": w, "height": 844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}" + (SHARE_JS if share else ""))
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e))); pg.route("**/*", mk(postcards))
    pg.goto(BASE + "/atlas"); pg.wait_for_timeout(1200)
    pg.locator(".atlas-view-toggle button").nth(1).click(); pg.locator(".atlas-tile").first.click(); pg.wait_for_timeout(1500)
    return ctx, pg
with sync_playwright() as p:
    b = p.chromium.launch()
    for w in (390, 320):
        ctx, pg = open_card(b, [pc(1)], w=w)
        btns = pg.locator(".atlas-opened .atlas-postcard-actions .atlas-entry-save").all_inner_texts()
        check(btns == ["Μοιράσου", "Ως εικόνα", "+ My Van"], f"{w}px actions: link share + image share + My Van %s" % btns)
        check(pg.evaluate("document.documentElement.scrollWidth-innerWidth") <= 0, f"{w}px no horizontal overflow")
        pg.locator(".atlas-opened .atlas-postcard-actions .atlas-entry-save").nth(0).click(); pg.wait_for_timeout(300)
        c = pg.evaluate("window.__calls"); check(len(c) == 1 and c[0]["files"] == [] and c[0]["url"].endswith("/postcard/id-1"), "link button unchanged: shares only the link")
        pg.locator(".atlas-opened .atlas-postcard-actions .atlas-entry-save").nth(1).click(); pg.wait_for_timeout(800)
        c = pg.evaluate("window.__calls"); check(len(c) == 2 and len(c[1]["files"]) == 1, "image button shares exactly one file")
        if len(c) == 2 and c[1]["files"]:
            f = c[1]["files"][0]; check(f["type"] == "image/png" and f["name"].endswith(".png") and f["size"] > 20000, "PNG file: %s %s" % (f["type"], f["size"]))
            check("/postcard/id-1" in c[1]["text"], "caption carries the postcard link")
            raw = base64.b64decode(f["data"].split(",", 1)[1]); im = Image.open(io.BytesIO(raw)); check(im.size == (1080, 1350), "image is 1080x1350: %s" % (im.size,))
            if w == 390: im.save("share_card.png")
        check(not pg.errs, "no page errors " + str(pg.errs)); ctx.close()
    # card without a photo or song still renders; no song fields
    ctx, pg = open_card(b, [pc(2, photoUrl="", songTitle="", artist="", musicUrl="", story="Σύντομη ιστορία")])
    pg.locator(".atlas-opened .atlas-postcard-actions .atlas-entry-save").nth(1).click(); pg.wait_for_timeout(800)
    c = pg.evaluate("window.__calls"); check(len(c) == 1 and len(c[0]["files"]) == 1, "no photo / no song: image still produced")
    if c and c[0]["files"]: Image.open(io.BytesIO(base64.b64decode(c[0]["files"][0]["data"].split(",", 1)[1]))).save("share_card_min.png")
    ctx.close()
    # browser without file sharing -> no image button, link share intact
    ctx, pg = open_card(b, [pc(1)], share=False)
    check(pg.locator(".atlas-opened .atlas-postcard-actions .atlas-entry-save").all_inner_texts() == ["Μοιράσου", "+ My Van"], "no file-share support -> no image button")
    ctx.close()
    # photo that cannot be drawn (cross-origin, no CORS) -> no image button
    ctx, pg = open_card(b, [pc(1, photoUrl="https://img.example.com/x.jpg")])
    check("Ως εικόνα" not in pg.locator(".atlas-opened .atlas-postcard-actions").inner_text(), "undrawable photo -> no image button (link share only)")
    ctx.close(); b.close()
print("FAILS", fails) if fails else print("ALL PASS"); sys.exit(1 if fails else 0)
