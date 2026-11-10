from playwright.sync_api import sync_playwright
INIT=open('test_nav.py').read().split('INIT="""')[1].split('"""')[0]
fails=[]
def check(c,m):
    print(("PASS " if c else "FAIL ")+m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h in ((390,844),(320,640)):
        c=b.new_context(viewport={"width":w,"height":h},device_scale_factor=2); c.add_init_script(INIT); pg=c.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.goto("http://127.0.0.1:4173/roadbook"); pg.wait_for_timeout(500)
        pg.locator(".roadbook-dot").last.click(); pg.wait_for_timeout(1200)
        cta=pg.locator(".roadbook-cta-row .pill-btn").first; check("θέση" in cta.inner_text(),"%dpx slide 07 has the 'choose your seat' button: %s"%(w,cta.inner_text()))
        cta.click(); pg.wait_for_selector(".roadbook-choice-card"); pg.wait_for_timeout(300)
        hb=pg.locator(".roadbook-choice-card .roadbook-hub-btn"); check(hb.count()==2,"%dpx overlay shows hub-style buttons"%w)
        t=hb.all_inner_texts(); check(t[0].startswith("Pick the Route") and t[1].startswith("Postcards from the Road"),"Route + Postcards, like slide 06")
        check(all("data:image/webp" in (hb.nth(i).get_attribute("style") or "") and hb.nth(i).locator("img").count()==1 for i in range(2)),"same artwork + icons as Home/06")
        bb=pg.locator(".roadbook-choice-card").bounding_box(); check(bb["x"]>=0 and bb["x"]+bb["width"]<=w and bb["y"]>=0 and bb["y"]+bb["height"]<=h,"%dpx overlay card fits the screen"%w)
        check(pg.evaluate("document.documentElement.scrollWidth-innerWidth")<=0,"no horizontal overflow")
        if w==390: pg.screenshot(path="rb07_390.png")
        if w==320: pg.screenshot(path="rb07_320.png")
        pg.locator(".roadbook-choice-card .pill-btn").click(); pg.wait_for_timeout(200); check(pg.locator(".roadbook-choice-card").count()==0,"Cancel closes")
        cta.click(); pg.wait_for_selector(".roadbook-choice-card"); pg.wait_for_timeout(400); pg.mouse.click(5,5); pg.wait_for_timeout(400); check(pg.locator(".roadbook-choice-card").count()==0,"tap outside closes")
        for i,exp in enumerate(["/route","/postcards"]):
            pg.goto("http://127.0.0.1:4173/roadbook"); pg.wait_for_timeout(300); pg.locator(".roadbook-dot").last.click(); pg.wait_for_timeout(1000)
            pg.locator(".roadbook-cta-row .pill-btn").first.click(); pg.wait_for_selector(".roadbook-choice-card"); pg.locator(".roadbook-choice-card .roadbook-hub-btn").nth(i).click(); pg.wait_for_timeout(300)
            check(pg.evaluate("location.pathname")==exp,"%dpx %s navigates"%(w,exp))
        check(not errs,"no page errors"); c.close()
    b.close()
print("FAILS",fails) if fails else print("ALL PASS")
