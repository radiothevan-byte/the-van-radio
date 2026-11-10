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
POST={"ok":True,"postcards":[{"id":"old-1","placeName":"Παλιά","locationText":"","latitude":"37.8","longitude":"23.6","story":"Παλιά ιστορία","displayName":"Άννα","songTitle":"Παλιό τραγούδι","artist":"Καλλιτέχνης Π","musicUrl":YT,"photoUrl":""},{"id":UUID,"placeName":"Προάστιο","locationText":"","latitude":"37.9","longitude":"23.7","story":"Ιστορία","displayName":"Νίκος","songTitle":"Ένα τραγούδι","artist":"Κάποιος","musicUrl":YT,"photoUrl":""}]}
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
    def new(w=390,saved=None,cards=None):
        ctx=b.new_context(viewport={"width":w,"height":844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        if saved is not None: ctx.add_init_script("try{localStorage.setItem('tvr_my_van_songs',%s)}catch(e){}"%json.dumps(json.dumps(saved)))
        if cards is not None: ctx.add_init_script("try{localStorage.setItem('tvr_my_van_postcards',%s)}catch(e){}"%json.dumps(json.dumps(cards)))
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
    # 5) Saved postcards with a song link
    # 5a) saving from Atlas keeps the song details
    ctx,pg=new(); pg.goto(BASE+"/postcard/"+UUID); pg.wait_for_selector(".atlas-entry-card"); pg.wait_for_timeout(400)
    pg.locator(".atlas-entry-save",has_text="My Van").click(); pg.wait_for_timeout(250)
    sc=pg.evaluate("JSON.parse(localStorage.getItem('tvr_my_van_postcards')||'[]')")
    check(len(sc)==1 and sc[0]["musicUrl"]==YT and sc[0]["songTitle"]=="Ένα τραγούδι" and sc[0]["artist"]=="Κάποιος","saving a postcard stores its song title/artist/link: %s"%sc)
    pg.goto(BASE+"/myvan"); pg.wait_for_timeout(500); pg.locator(".myvan-tab",has_text="Postcards").click(); pg.wait_for_timeout(300)
    check("Ένα τραγούδι — Κάποιος" in pg.locator(".myvan-postcard-song").inner_text(),"My Van > Postcards shows the song line")
    pg.locator(".myvan-postcard-card button.myvan-song-link").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(400)
    check(pg.locator(".sp-title").inner_text()=="Ένα τραγούδι" and pg.evaluate("window.__yt.opts.videoId")=="AaG9nV9gzdU" and "My Van" in pg.locator(".sp-head").inner_text(),"saved postcard: ▶ opens our player with the song")
    pg.locator(".sp-play").click(); pg.wait_for_timeout(600); check("play" in pg.evaluate("window.__yt.calls"),"saved postcard: plays in our player")
    pg.locator(".sp-close").click(); pg.wait_for_timeout(250); check(pg.locator(".myvan-postcard-card").count()==1 and not pg.errs,"closing keeps the saved postcard; no errors "+str(pg.errs)); ctx.close()
    # 5b) postcards saved earlier (no song stored) get their song looked up from the approved list
    OLD=[{"id":"old-1","placeName":"Παλιά","story":"Παλιά ιστορία","photoUrl":""},{"id":"gone-1","placeName":"Χωρίς","story":"Δεν υπάρχει πια","photoUrl":""}]
    ctx,pg=new(cards=OLD); pg.goto(BASE+"/myvan"); pg.wait_for_timeout(500); pg.locator(".myvan-tab",has_text="Postcards").click(); pg.wait_for_timeout(1200)
    check(pg.locator(".myvan-postcard-card").count()==2 and pg.locator(".myvan-postcard-song").count()==1,"older saved postcards: song found for the one still approved, none invented for the other")
    pg.locator(".myvan-postcard-card button.myvan-song-link").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(300)
    check(pg.locator(".sp-title").inner_text()=="Παλιό τραγούδι","older saved postcard opens its song"); pg.keyboard.press("Escape")
    check(not pg.errs,"no page errors"); ctx.close()
    # 5c) postcard without song: unchanged card
    ctx,pg=new(cards=[{"id":"n-1","placeName":"Χωρίς τραγούδι","story":"Ιστορία","photoUrl":"","songTitle":"","artist":"","musicUrl":""}]); pg.goto(BASE+"/myvan"); pg.wait_for_timeout(500); pg.locator(".myvan-tab",has_text="Postcards").click(); pg.wait_for_timeout(500)
    check(pg.locator(".myvan-postcard-song").count()==0 and pg.locator(".myvan-postcard-card").count()==1,"saved postcard without a song: no song row"); ctx.close()
    # 5d) non-playable link stays external; layout
    ctx,pg=new(cards=[{"id":"x-1","placeName":"Ε","story":"Ι","photoUrl":"","songTitle":"Τ","artist":"Α","musicUrl":"https://example.com/s"}]); pg.goto(BASE+"/myvan"); pg.wait_for_timeout(500); pg.locator(".myvan-tab",has_text="Postcards").click(); pg.wait_for_timeout(400)
    check(pg.locator(".myvan-postcard-card a.myvan-song-link").get_attribute("href")=="https://example.com/s","saved postcard with a non-YouTube link: external link as before"); ctx.close()
    for w in (320,390):
        ctx,pg=new(w,cards=[{"id":"l-1","placeName":"Μια πολύ μεγάλη τοποθεσία","story":"Ιστορία","photoUrl":"","songTitle":"Ένας πολύ μεγάλος τίτλος τραγουδιού που πιάνει πολλές γραμμές","artist":"Καλλιτέχνης","musicUrl":YT}]); pg.goto(BASE+"/myvan"); pg.wait_for_timeout(500); pg.locator(".myvan-tab",has_text="Postcards").click(); pg.wait_for_timeout(400)
        check(pg.evaluate("document.documentElement.scrollWidth-innerWidth")<=0,"%dpx saved postcard with long song: no overflow"%w)
        bb=pg.locator(".myvan-postcard-song .myvan-song-link").bounding_box(); check(bb and bb["x"]+bb["width"]<=w,"%dpx play button inside the card"%w); ctx.close()
    b.close()
print("FAILS",fails) if fails else print("ALL PASS")
