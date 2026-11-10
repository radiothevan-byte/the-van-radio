import json
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:4173"
fails=[]
def check(c,m):
    print(("PASS " if c else "FAIL ")+m)
    if not c: fails.append(m)
UUID="e6c65bd6-3d2e-4c9b-9c1a-7513390190f8"
POST={"ok":True,"postcards":[
 {"id":UUID,"placeName":"Προάστιο","locationText":"","latitude":"37.9","longitude":"23.7","story":"Η ιστορία της διαφημισμένης καρτ ποστάλ","displayName":"Νίκος","songTitle":"","artist":"","musicUrl":"","photoUrl":""},
 {"id":"other-1","placeName":"Ναύπλιο","locationText":"","latitude":"37.56","longitude":"22.80","story":"Άλλη ιστορία","displayName":"Μαρία","songTitle":"","artist":"","musicUrl":"","photoUrl":""}]}
def promos(items): return json.dumps({"ok":True,"promotions":items})
def P(id,target,place,title="Μελλοντική διαδρομή;"):
    return {"id":id,"title":title,"subtitle":"sub","imageUrl":"","ctaEl":"Δες το μέρος","ctaEn":"Check the place","targetUrl":target,"placement":place,"type":"COMMUNITY","priority":1,"start":None,"end":None,"status":"approved","language":"ALL"}
def mk(plist):
    def h(route):
        u=route.request.url
        if u.startswith(BASE): return route.continue_()
        H={"Access-Control-Allow-Origin":"*"}
        if "approved_postcards" in u: return route.fulfill(status=200,content_type="application/json",headers=H,body=json.dumps(POST))
        if "action=promotions" in u: return route.fulfill(status=200,content_type="application/json",headers=H,body=promos(plist))
        return route.abort()
    return h
with sync_playwright() as p:
    b=p.chromium.launch()
    def new(plist,w=390):
        ctx=b.new_context(viewport={"width":w,"height":844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        pg=ctx.new_page(); pg.errs=[]; pg.on("pageerror",lambda e:pg.errs.append(str(e))); pg.route("**/*",mk(plist)); return ctx,pg
    # 1) promo in Atlas strip -> tap -> shows that postcard (Atlas already open)
    ctx,pg=new([P("a","/postcard/"+UUID,"ATLAS_FEATURED")]); pg.goto(BASE+"/atlas"); pg.wait_for_timeout(1200)
    check(pg.locator(".promo-card").count()==1,"postcard promo is shown in Atlas (was hidden before)")
    check(pg.locator(".atlas-shared").count()==0,"nothing opened before the tap")
    pg.locator(".promo-card").click(); pg.wait_for_timeout(700)
    t=pg.locator(".atlas-shared").inner_text() if pg.locator(".atlas-shared").count() else ""
    check("Η ιστορία της διαφημισμένης καρτ ποστάλ" in t,"tap opens the advertised postcard inside Atlas")
    check(pg.evaluate("location.pathname")=="/atlas","stays on /atlas")
    pg.locator(".promo-card").click(); pg.wait_for_timeout(400)
    check(pg.locator(".atlas-shared").count()==1,"second tap is harmless (same card)")
    check(not pg.errs,"no page errors "+str(pg.errs)); ctx.close()
    # 2) promo on Home -> tap -> Atlas tab with the card
    ctx,pg=new([P("h","/postcard/"+UUID,"HOME_FEATURED")]); pg.goto(BASE+"/"); pg.wait_for_timeout(1200)
    check(pg.locator(".promo-card").count()==1,"postcard promo shown on Home")
    pg.locator(".promo-card").click(); pg.wait_for_timeout(1200)
    check(pg.evaluate("location.pathname")=="/atlas","Home promo navigates to /atlas")
    check("Η ιστορία της διαφημισμένης καρτ ποστάλ" in (pg.locator(".atlas-shared").inner_text() if pg.locator(".atlas-shared").count() else ""),"Home promo opens the postcard")
    # back button returns to home
    pg.go_back(); pg.wait_for_timeout(500); check(pg.evaluate("location.pathname")=="/","Back returns to Home"); ctx.close()
    # 3) switch to a different postcard via a second promo
    ctx,pg=new([P("a","/postcard/other-1","ATLAS_FEATURED")]); pg.goto(BASE+"/postcard/"+UUID); pg.wait_for_timeout(1200)
    check("Η ιστορία της διαφημισμένης" in pg.locator(".atlas-shared").inner_text(),"shared link still works (regression)")
    pg.locator(".promo-card").click(); pg.wait_for_timeout(600)
    check("Άλλη ιστορία" in pg.locator(".atlas-shared").inner_text(),"tapping a promo replaces the shown postcard"); ctx.close()
    # 4) unknown id: no crash, no card
    ctx,pg=new([P("a","/postcard/does-not-exist","ATLAS_FEATURED")]); pg.goto(BASE+"/atlas"); pg.wait_for_timeout(1200)
    pg.locator(".promo-card").click(); pg.wait_for_timeout(600)
    check(pg.locator(".atlas-shared").count()==0 and not pg.errs,"unknown postcard id: nothing shown, no errors"); ctx.close()
    # 5) other target kinds unaffected + bad targets still hidden
    ctx,pg=new([P("t","/journeys","ATLAS_FEATURED"),P("bad","/postcard/","HOME_FEATURED"),P("bad2","/postcard/a b","HOME_FEATURED")]); pg.goto(BASE+"/atlas"); pg.wait_for_timeout(1000)
    pg.locator(".promo-card").click(); pg.wait_for_timeout(500)
    check(pg.evaluate("location.pathname")=="/journeys","tab promo (/journeys) still works")
    pg.goto(BASE+"/"); pg.wait_for_timeout(800); check(pg.locator(".promo-card").count()==0,"malformed /postcard/ targets stay hidden"); ctx.close()
    # 6) layout 320
    ctx,pg=new([P("a","/postcard/"+UUID,"ATLAS_FEATURED")],320); pg.goto(BASE+"/atlas"); pg.wait_for_timeout(1200); pg.locator(".promo-card").click(); pg.wait_for_timeout(600)
    check(pg.evaluate("document.documentElement.scrollWidth-innerWidth")<=0,"320px: no horizontal overflow"); ctx.close()
    b.close()
print("FAILS",fails) if fails else print("ALL PASS")
