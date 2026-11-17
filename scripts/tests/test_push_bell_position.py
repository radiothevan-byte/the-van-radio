from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:4173"; fails=[]
def check(c,m):
    print(("PASS " if c else "FAIL ")+m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch()
    for w in (320,360,390,430):
        ctx=b.new_context(viewport={"width":w,"height":700},device_scale_factor=2); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
        pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.route("**/*",lambda r: r.continue_() if r.request.url.startswith(BASE) else r.abort())
        pg.goto(BASE+"/"); pg.wait_for_timeout(1500)
        bell=pg.locator(".push-bell"); check(bell.count()==1,"%dpx bell present"%w)
        if not bell.count(): continue
        bb=bell.bounding_box(); lt=pg.locator(".lang-toggle").bounding_box(); cp=pg.locator(".copilot-btn").bounding_box(); lv=pg.locator(".live-btn").bounding_box()
        check(bb["x"]+bb["width"]<=lt["x"]+0.5 and lt["x"]-(bb["x"]+bb["width"])<=14,"%dpx bell immediately LEFT of EL|EN (gap %.1f)"%(w,lt["x"]-(bb["x"]+bb["width"])))
        check(abs((bb["y"]+bb["height"]/2)-(lt["y"]+lt["height"]/2))<=3,"%dpx same row as EL|EN"%w)
        check(bb["y"]>=cp["y"]+cp["height"]-1 and bb["y"]>=lv["y"]+lv["height"]-1,"%dpx bell below Co-pilot/Live (no overlap)"%w)
        check(bb["x"]>=0 and pg.evaluate("document.documentElement.scrollWidth-innerWidth")<=0,"%dpx no overflow"%w)
        bell.click(); pg.wait_for_timeout(400)
        pop=pg.locator(".push-pop"); 
        if pop.count():
            pb=pop.bounding_box(); check(pb["width"]>=min(280,w-40)-1 and pb["x"]>=0 and pb["x"]+pb["width"]<=w+0.5,"%dpx popover inside viewport"%w)
        else: check(False,"%dpx popover opens"%w)
        if w==390: pg.screenshot(path="bell_390_open.png")
        pg.keyboard.press("Escape"); pg.mouse.click(5,600); pg.wait_for_timeout(200)
        if w in (320,390): pg.screenshot(path="bell_%d.png"%w)
        check(not errs,"%dpx no page errors %s"%(w,errs)); ctx.close()
    b.close()
print("FAILS",fails) if fails else print("ALL PASS")
