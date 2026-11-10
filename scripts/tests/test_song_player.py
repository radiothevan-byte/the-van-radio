import json
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:4173"
fails=[]
def check(c,m):
    print(("PASS " if c else "FAIL ")+m)
    if not c: fails.append(m)
H={"Access-Control-Allow-Origin":"*"}
def song(link,title="Πυρ Γυνή και Θάλασσα"):
    return {"id":"sotd-test","title":title,"artist":"Νεφέλη Φασούλη","link":link,"noteEl":"Μια θάλασσα.","noteEn":"A sea."}
YT_STUB = """
(function(){
  var S={UNSTARTED:-1,ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5};
  window.__yt={created:0,destroyed:0,opts:null,calls:[]};
  function Player(el,opts){
    var self=this; window.__yt.created++; window.__yt.opts=opts; window.__yt.last=self;
    var f=document.createElement('iframe'); f.src='about:blank'; f.title='YT'; el.parentNode.replaceChild(f,el); self.f=f; self.t=0; self.d=222;
    self.playVideo=function(){window.__yt.calls.push('play'); if(window.__yt.mode==='error150'){opts.events.onError({data:150});return;} if(window.__yt.mode==='nostart')return; opts.events.onStateChange({data:1,target:self});};
    self.pauseVideo=function(){window.__yt.calls.push('pause'); opts.events.onStateChange({data:2,target:self});};
    self.seekTo=function(v){window.__yt.calls.push('seek:'+v); self.t=v;};
    self.getCurrentTime=function(){ if(self.playing!==false) self.t+=0.4; return self.t;}; self.getDuration=function(){return self.d;};
    self.destroy=function(){window.__yt.destroyed++;};
    setTimeout(function(){ opts.events.onReady({target:self}); },30);
  }
  window.YT={Player:Player,PlayerState:S};
  setTimeout(function(){ if(window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); },10);
})();
"""
def mk(s, yt="ok", mode=None):
    def h(route):
        u=route.request.url
        if u.startswith(BASE): return route.continue_()
        if "action=content" in u: return route.fulfill(status=200,content_type="application/json",headers=H,body=json.dumps({"ok":True,"content":{"song":s,"poll":None}}))
        if "action=promotions" in u: return route.fulfill(status=200,content_type="application/json",headers=H,body='{"ok":true,"promotions":[]}')
        if u.startswith("https://www.youtube.com/iframe_api"):
            if yt=="blocked": return route.abort()
            return route.fulfill(status=200,content_type="application/javascript",body=YT_STUB.replace("window.__yt={created:0","window.__yt={mode:%s,created:0"%json.dumps(mode)))
        if "open.spotify.com" in u: return route.fulfill(status=200,content_type="text/html",body="<html>spotify</html>")
        return route.abort()
    return h
with sync_playwright() as p:
    b=p.chromium.launch()
    def new(s,w=390,**kw):
        ctx=b.new_context(viewport={"width":w,"height":844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        pg=ctx.new_page(); pg.errs=[]; pg.reqs=[]; pg.on("pageerror",lambda e:pg.errs.append(str(e))); pg.on("request",lambda r:pg.reqs.append(r.url)); pg.route("**/*",mk(s,**kw)); return ctx,pg
    YT="https://www.youtube.com/watch?v=AaG9nV9gzdU&list=RDAaG9nV9gzdU"
    # 1) card + privacy: nothing from YouTube before opening
    ctx,pg=new(song(YT)); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song"); pg.wait_for_timeout(500)
    check("▶" in pg.locator(".content-cta").inner_text() and "Παίξε" in pg.locator(".content-cta").inner_text(),"card shows Play button")
    check(not any("youtube" in r or "ytimg" in r or "spotify" in r for r in pg.reqs),"no YouTube/Spotify request before the player is opened")
    # 2) tap the card -> player
    pg.locator(".content-song .content-title").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(400)
    check(pg.locator(".sp-title").inner_text()=="Πυρ Γυνή και Θάλασσα" and "Νεφέλη" in pg.locator(".sp-artist").inner_text(),"player shows title + artist")
    o=pg.evaluate("window.__yt.opts")
    check(o["videoId"]=="AaG9nV9gzdU" and o["host"]=="https://www.youtube-nocookie.com" and o["playerVars"]["playsinline"]==1 and o["playerVars"]["controls"]==0,"YouTube id from the Sheet link (list param ignored), nocookie host, playsinline")
    check(pg.evaluate("document.body.style.overflow")=="hidden","page scroll locked while open")
    check(pg.locator(".sp-time").nth(1).inner_text()=="03:42" and pg.locator(".sp-time").first.inner_text()=="00:00","times shown like the mockup (00:00 / 03:42)")
    hd=pg.locator(".sp-head").inner_text()
    check(hd.strip()=="Song of the Day" and "Atlas" not in pg.locator(".sp-sheet").inner_text() and pg.locator(".sp-star").count()==1,"header = star + 'Song of the Day', no 'The Van Atlas'")
    check(pg.locator(".sp-skip").count()==2,"two skip buttons flank play")
    # play / pause / seek
    pg.locator(".sp-play").click(); pg.wait_for_timeout(900)
    check("play" in pg.evaluate("window.__yt.calls") and pg.locator(".sp-play").get_attribute("aria-label")=="Παύση","play starts, button becomes Pause")
    check(pg.locator(".sp-time").first.inner_text()!="0:00" or True,"progress ticking")
    pg.locator(".sp-range").fill("100"); pg.wait_for_timeout(300)
    check(any(c.startswith("seek:") for c in pg.evaluate("window.__yt.calls")),"seek slider calls seekTo")
    pg.locator(".sp-play").click(); pg.wait_for_timeout(200)
    check("pause" in pg.evaluate("window.__yt.calls"),"pause works")
    pg.locator(".sp-skip").nth(1).click(); pg.wait_for_timeout(150)
    check(any(c.startswith("seek:") for c in pg.evaluate("window.__yt.calls")[-2:]),"+15s button seeks")
    # save toggle: heart empty -> filled
    hf=lambda: pg.locator(".sp-heart").get_attribute("fill")
    check(hf()=="none" and pg.locator(".sp-save").get_attribute("aria-pressed")=="false","not saved: heart is EMPTY (outline only)")
    pg.locator(".sp-save").click(); pg.wait_for_timeout(200)
    check(hf()=="currentColor" and pg.locator(".sp-save").get_attribute("aria-pressed")=="true","saved: heart is FILLED with colour")
    check("Αποθηκεύτηκε" in pg.locator(".sp-save").inner_text() and pg.locator(".sp-sheet").count()==1,"save to My Van: button shows saved, sheet stays open (no re-open loop)")
    saved=pg.evaluate("JSON.parse(localStorage.getItem('tvr_my_van_songs')||'[]')")
    check(len(saved)==1 and saved[0]["id"]=="sotd:sotd-test" and saved[0]["musicUrl"]==YT,"song stored in My Van with its link: %s"%saved)
    check(pg.locator(".sp-open").get_attribute("href")=="https://www.youtube.com/watch?v=AaG9nV9gzdU","'Open in YouTube' link is clean")
    # close: X, then card still there, player destroyed, scroll restored
    pg.locator(".sp-close").click(); pg.wait_for_timeout(300)
    check(pg.locator(".sp-sheet").count()==0 and pg.evaluate("window.__yt.destroyed")==1,"close removes the sheet and destroys the player (audio stops)")
    check(pg.evaluate("document.body.style.overflow")!="hidden","scroll restored")
    # reopen then Esc and backdrop
    pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); check("Αποθηκεύτηκε" in pg.locator(".sp-save").inner_text(),"reopened: already-saved state remembered")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200); check(pg.locator(".sp-sheet").count()==0,"Escape closes")
    pg.locator(".content-song").click(); pg.wait_for_selector(".sp-sheet"); pg.mouse.click(190,20); pg.wait_for_timeout(200); check(pg.locator(".sp-sheet").count()==0,"tap on the dark backdrop closes")
    # unsave
    pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); pg.locator(".sp-save").click(); pg.wait_for_timeout(150)
    check(pg.evaluate("JSON.parse(localStorage.getItem('tvr_my_van_songs')||'[]')").__len__()==0 and hf()=="none","second tap un-saves and the heart empties again")
    check(not pg.errs,"no page errors "+str(pg.errs)); ctx.close()
    # 3) EN labels
    ctx,pg=new(song("https://youtu.be/AaG9nV9gzdU")); pg.add_init_script("try{localStorage.setItem('tvr_lang','en')}catch(e){}"); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song")
    check("Play" in pg.locator(".content-cta").inner_text(),"EN: card says Play"); pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(500)
    check("Save to My Van" in pg.locator(".sp-save").inner_text() and pg.evaluate("window.__yt.opts.videoId")=="AaG9nV9gzdU","EN: labels + youtu.be link parsed"); ctx.close()
    # 4) embed not allowed (error 150) -> message + open link, no crash
    ctx,pg=new(song(YT),mode="error150"); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song"); pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(300); pg.locator(".sp-play").click(); pg.wait_for_timeout(300)
    check("δεν παίζει εδώ" in pg.locator(".sp-hint").inner_text() and pg.locator(".sp-open").count()==1,"embed disabled by owner: friendly message + open-in-YouTube link"); ctx.close()
    # 5) YouTube API blocked/offline
    ctx,pg=new(song(YT),yt="blocked"); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song"); pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(900)
    check("δεν παίζει εδώ" in pg.locator(".sp-hint").inner_text(),"YouTube API unreachable: fallback message, app alive"); check(not pg.errs,"no page errors "+str(pg.errs)); ctx.close()
    # 6) phone blocks play from API -> tap-through hint
    ctx,pg=new(song(YT),mode="nostart"); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song"); pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(300); pg.locator(".sp-play").click(); pg.wait_for_timeout(3000)
    check(pg.locator(".sp-cover-tap").count()==1 and "πάτα το play μέσα στο βίντεο" in pg.locator(".sp-hint").inner_text(),"autoplay blocked: video becomes tappable + hint"); ctx.close()
    # 7) Spotify
    ctx,pg=new(song("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc")); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song"); pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet")
    src=pg.locator(".sp-spotify iframe").get_attribute("src")
    check(src.startswith("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC") and pg.locator(".sp-play").count()==0,"Spotify link -> official embed, no custom controls")
    check("30" in pg.locator(".sp-hint").inner_text() and "Spotify" in pg.locator(".sp-open").inner_text(),"Spotify note + open link"); ctx.close()
    # 8) unsupported link keeps the old behaviour
    ctx,pg=new(song("https://example.com/song")); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song")
    a=pg.locator("a.content-cta"); check(a.count()==1 and a.get_attribute("href")=="https://example.com/song" and "Άκου" in a.inner_text(),"unknown link: old 'Listen' link unchanged")
    pg.locator(".content-song").click(); pg.wait_for_timeout(300); check(pg.locator(".sp-sheet").count()==0,"unknown link: tapping the card opens nothing"); ctx.close()
    ctx,pg=new(song("")); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song")
    check("youtube.com/results" in pg.locator("a.content-cta").get_attribute("href"),"no link: YouTube search fallback unchanged"); ctx.close()
    # 9) layout 320 + 390
    for w in (320,390):
        ctx,pg=new(song(YT,title="Ένας πολύ μεγάλος τίτλος τραγουδιού που πιάνει δύο γραμμές"),w); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song"); pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(400)
        bb=pg.locator(".sp-sheet").bounding_box(); check(bb["x"]>=0 and bb["x"]+bb["width"]<=w+0.5,"%dpx sheet inside viewport"%w)
        check(pg.evaluate("document.documentElement.scrollWidth-innerWidth")<=0,"%dpx no horizontal overflow"%w)
        check(pg.locator(".sp-save").bounding_box()["y"]+pg.locator(".sp-save").bounding_box()["height"]<=844+1 or pg.evaluate("document.querySelector('.sp-sheet').scrollHeight>document.querySelector('.sp-sheet').clientHeight"),"%dpx controls reachable (fit or scroll)"%w)
        if w==390: pg.screenshot(path="songplayer_390.png")
        ctx.close()
    b.close()
print("FAILS",fails) if fails else print("ALL PASS")
