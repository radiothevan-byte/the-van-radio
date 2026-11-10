import json
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:4173"
fails=[]
def check(c,m):
    print(("PASS " if c else "FAIL ")+m)
    if not c: fails.append(m)
H={"Access-Control-Allow-Origin":"*"}
YT="https://www.youtube.com/watch?v=AaG9nV9gzdU"
UUID="e6c65bd6-3d2e-4c9b-9c1a-7513390190f8"
POST={"ok":True,"postcards":[{"id":UUID,"placeName":"Προάστιο","locationText":"","latitude":"37.9","longitude":"23.7","story":"Ιστορία","displayName":"Νίκος","songTitle":"Ένα τραγούδι","artist":"Κάποιος","musicUrl":YT,"photoUrl":""}]}
CSV='"Submission ID","Destination","Latitude","Longitude","Music Genre","Song Title","Artist","Music URL","User Message"\n"r1","Ναύπλιο","","","Rock","Διαδρομή","Ένας","%s","Μήνυμα"\n"r2","Σπέτσες","","","Pop","Άλλο","Άλλος","https://example.com/song","Μήνυμα2"\n'%YT
YT_STUB=open(__file__.replace("test_saved_song_player.py","test_song_player.py")).read().split('YT_STUB = """')[1].split('"""')[0]
def h(route):
    u=route.request.url
    if u.startswith(BASE): return route.continue_()
    if "approved_postcards" in u: return route.fulfill(status=200,content_type="application/json",headers=H,body=json.dumps(POST))
    if "sheet=Route" in u or "Route%20Submissions" in u: return route.fulfill(status=200,content_type="text/csv",headers=H,body=CSV)
    if "action=content" in u: return route.fulfill(status=200,content_type="application/json",headers=H,body='{"ok":true,"content":{"song":null,"poll":null}}')
    if "action=promotions" in u: return route.fulfill(status=200,content_type="application/json",headers=H,body='{"ok":true,"promotions":[]}')
    if u.startswith("https://www.youtube.com/iframe_api"): return route.fulfill(status=200,content_type="application/javascript",body=YT_STUB.replace("window.__yt={created:0","window.__yt={mode:null,created:0"))
    return route.abort()
with sync_playwright() as p:
    b=p.chromium.launch()
    def new(w=390,saved=None):
        ctx=b.new_context(viewport={"width":w,"height":844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        if saved is not None: ctx.add_init_script("try{localStorage.setItem('tvr_my_van_songs',%s)}catch(e){}"%json.dumps(json.dumps(saved)))
        pg=ctx.new_page(); pg.errs=[]; pg.pages=[]; pg.on("pageerror",lambda e:pg.errs.append(str(e))); ctx.on("page",lambda q:pg.pages.append(q)); pg.route("**/*",h); return ctx,pg
    # 1) My Van > Songs: tap play -> in-app player
    SAVED=[{"id":"sotd:x1","title":"Πυρ Γυνή","artist":"Νεφέλη","musicUrl":YT,"placeName":""},{"id":"route-r2","title":"Άλλο","artist":"Άλλος","musicUrl":"https://example.com/song","placeName":"Σπέτσες"}]
    ctx,pg=new(saved=SAVED); pg.goto(BASE+"/myvan"); pg.wait_for_timeout(600); pg.locator(".myvan-tab",has_text="Songs").click(); pg.wait_for_timeout(300)
    links=pg.locator(".myvan-song-link"); check(links.count()==2,"two saved songs with a play control")
    check(pg.evaluate("document.querySelectorAll('a.myvan-song-link').length")==1 and pg.evaluate("document.querySelectorAll('button.myvan-song-link').length")==1,"YouTube song = in-app button; non-playable link stays an ordinary external link")
    check(pg.locator("a.myvan-song-link").get_attribute("href")=="https://example.com/song" and pg.locator("a.myvan-song-link").get_attribute("target")=="_blank","non-playable link unchanged (opens in new tab)")
    pg.locator("button.myvan-song-link").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(500)
    check(pg.locator(".sp-title").inner_text()=="Πυρ Γυνή" and "Νεφέλη" in pg.locator(".sp-artist").inner_text(),"My Van: player shows the saved title + artist")
    check(pg.evaluate("window.__yt.opts.videoId")=="AaG9nV9gzdU","My Van: plays the saved YouTube link inside the app")
    check("My Van" in pg.locator(".sp-head").inner_text() and "Song of the Day" not in pg.locator(".sp-head").inner_text(),"My Van: header says My Van, not 'Song of the Day'")
    check(pg.locator(".sp-save").count()==0 and pg.locator(".sp-share").count()==1,"My Van: no redundant save button; share is there")
    pg.locator(".sp-play").click(); pg.wait_for_timeout(700)
    check("play" in pg.evaluate("window.__yt.calls"),"My Van: play button starts the player")
    pg.locator(".sp-close").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sp-sheet").count()==0 and pg.locator(".myvan-song-row").count()==2 and len(pg.pages)==0,"closing returns to the list; no new browser tab opened")
    check(not pg.errs,"no page errors "+str(pg.errs)); ctx.close()
    # 2) Atlas: a postcard (shared link) with a YouTube link opens the player
    ctx,pg=new(); pg.goto(BASE+"/postcard/"+UUID); pg.wait_for_selector(".atlas-entry-card"); pg.wait_for_timeout(500)
    btn=pg.locator(".atlas-entry-link"); check(btn.count()==1 and btn.evaluate("e=>e.tagName")=="BUTTON","Atlas postcard: 'Listen' is now an in-app button")
    btn.click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(400)
    check(pg.locator(".sp-title").inner_text()=="Ένα τραγούδι" and pg.evaluate("window.__yt.opts.videoId")=="AaG9nV9gzdU","Atlas postcard: player with the song, plays our player")
    check("Van Atlas" in pg.locator(".sp-head").inner_text() and pg.locator(".sp-save").count()==0,"Atlas postcard: header 'Van Atlas', no song-save button (the postcard has its own + My Van)")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200); check(pg.locator(".sp-sheet").count()==0 and pg.locator(".atlas-entry-card").count()==1,"Escape closes, card stays")
    check(not pg.errs,"no page errors "+str(pg.errs)); ctx.close()
    # 3) Atlas route entries (text-only list): player + save heart
    ctx,pg=new(); pg.goto(BASE+"/atlas"); pg.wait_for_timeout(1500)
    tb=pg.locator(".postcard-map-toggle"); 
    if tb.count(): tb.first.click(); pg.wait_for_timeout(400)
    cards=pg.locator(".atlas-entry-card"); check(cards.count()>=2,"Atlas route entries listed (%d)"%cards.count())
    first=cards.filter(has_text="Διαδρομή").first
    first.locator(".atlas-entry-link").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(400)
    check(pg.locator(".sp-title").inner_text()=="Διαδρομή" and pg.evaluate("window.__yt.opts.videoId")=="AaG9nV9gzdU","Atlas route: opens the player with its song")
    check(pg.locator(".sp-save").get_attribute("aria-pressed")=="false" and pg.locator(".sp-heart").get_attribute("fill")=="none","Atlas route: not saved yet -> heart EMPTY")
    pg.locator(".sp-save").click(); pg.wait_for_timeout(250)
    saved=pg.evaluate("JSON.parse(localStorage.getItem('tvr_my_van_songs')||'[]')")
    check(len(saved)==1 and saved[0]["id"]=="route-r1" and saved[0]["musicUrl"]==YT,"Atlas route: heart saves the song to My Van: %s"%saved)
    check(pg.locator(".sp-heart").get_attribute("fill")=="currentColor" and pg.locator(".sp-sheet").count()==1,"heart FILLED, player stays open")
    pg.locator(".sp-close").click(); pg.wait_for_timeout(250)
    check("My Van" in first.locator(".atlas-entry-save").inner_text() and "atlas-entry-saved" in first.locator(".atlas-entry-save").get_attribute("class"),"the card's own button shows it is saved")
    # non-playable route link stays external
    sec=cards.filter(has_text="Άλλο").first
    check(sec.locator("a.atlas-entry-link").get_attribute("href")=="https://example.com/song","Atlas route with a non-YouTube link: still an external link")
    check(not pg.errs,"no page errors "+str(pg.errs)); ctx.close()
    # 4) layout
    for w in (320,390):
        ctx,pg=new(w,saved=SAVED); pg.goto(BASE+"/myvan"); pg.wait_for_timeout(500); pg.locator(".myvan-tab",has_text="Songs").click(); pg.locator("button.myvan-song-link").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(300)
        bb=pg.locator(".sp-sheet").bounding_box(); check(bb["x"]>=0 and bb["x"]+bb["width"]<=w+0.5 and pg.evaluate("document.documentElement.scrollWidth-innerWidth")<=0,"%dpx My Van player fits"%w); ctx.close()
    b.close()
print("FAILS",fails) if fails else print("ALL PASS")
