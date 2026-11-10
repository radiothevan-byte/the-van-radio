from playwright.sync_api import sync_playwright
INIT=open('test_nav.py').read().split('INIT="""')[1].split('"""')[0]
fails=[]
def check(c,m):
    print(("PASS " if c else "FAIL ")+m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b=p.chromium.launch()
    for w,h in ((390,844),(320,640)):
        c=b.new_context(viewport={"width":w,"height":h}); c.add_init_script(INIT); pg=c.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.goto("http://127.0.0.1:4173/roadbook"); pg.wait_for_timeout(500)
        base=pg.evaluate("document.querySelector('.roadbook-track').clientHeight")
        btns=pg.locator(".roadbook-hub-btn"); check(btns.count()==3,"%dpx three hub buttons in slide 06"%w)
        t=btns.all_inner_texts(); check(t[0].startswith("Pick the Route") and t[1].startswith("Postcards from the Road") and t[2].startswith("The Van Atlas"),"order: Route, Postcards, Atlas")
        check(all(btns.nth(i).locator("img").count()==1 for i in range(3)),"each button shows its icon image")
        check(all("url(" in (btns.nth(i).get_attribute("style") or "") and "data:image/webp" in (btns.nth(i).get_attribute("style") or "") for i in range(3)),"each button has its artwork background (same images as Home)")
        btns.first.scroll_into_view_if_needed(); pg.wait_for_timeout(1000)
        m=pg.evaluate("""()=>{const s=document.querySelectorAll('.roadbook-slide-content')[5]; return [s.scrollHeight>s.clientHeight+1, document.documentElement.scrollWidth-innerWidth]}""")
        check(m[0] is False and m[1]<=0,"%dpx slide 06 fits without inner scrolling, no horizontal overflow"%w)
        a=pg.locator(".roadbook-arrow-next").bounding_box(); ph=pg.locator(".roadbook-slide-photo").nth(5).bounding_box()
        check(ph["y"]<=a["y"]+a["height"]/2<=ph["y"]+ph["height"],"%dpx carousel arrows stay on the photo"%w)
        pg.locator(".roadbook-dot").first.click(); pg.wait_for_timeout(1300)
        check(pg.evaluate("document.querySelector('.roadbook-track').clientHeight")==base,"%dpx other slides keep their usual height (%d)"%(w,base))
        check(not errs,"no page errors"); c.close()
    # EN
    c=b.new_context(viewport={"width":390,"height":844}); c.add_init_script("localStorage.setItem('tvr_lang','en')"); c.add_init_script(INIT); pg=c.new_page(); pg.goto("http://127.0.0.1:4173/roadbook"); pg.wait_for_timeout(500)
    check("Choose a destination" in pg.locator(".roadbook-hub-btn").first.inner_text(),"EN texts on the buttons"); c.close()
    b.close()
print("FAILS",fails) if fails else print("ALL PASS")
