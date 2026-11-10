import json,re
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:4173"
src=open(__file__.replace("audit_player_layout.py","test_song_player.py")).read()
STUB=src.split('YT_STUB = """')[1].split('"""')[0]
YT="https://www.youtube.com/watch?v=AaG9nV9gzdU"
LONG="Ένας πολύ μεγάλος τίτλος τραγουδιού που πιάνει δύο ή και τρεις γραμμές στην οθόνη του κινητού"
def song(t): return {"id":"s1","title":t,"artist":"Νεφέλη Φασούλη και ένας πολύ μεγάλος καλλιτέχνης","link":YT,"noteEl":"Μια θάλασσα.","noteEn":"A sea.","date":"2026-11-10"}
VPS=[("iPhone SE",320,568,2),("small",360,640,3),("iPhone 8",375,667,2),("iPhone 14",390,844,3),("iPhone Pro Max",430,932,3),("landscape",844,390,3),("landscape SE",667,320,2),("iPad",768,1024,2),("desktop",1280,800,1)]
rows=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,w,h,dpr in VPS:
        for title in ("Πυρ Γυνή και Θάλασσα",LONG):
            ctx=b.new_context(viewport={"width":w,"height":h},device_scale_factor=dpr if name in("iPhone 14","landscape") else 1); ctx.add_init_script("localStorage.setItem('tvr_lang','el')")
            pg=ctx.new_page(); S=song(title)
            def mkh(S):
              def hnd(r):
                u=r.request.url
                if u.startswith(BASE): return r.continue_()
                if "action=content" in u: return r.fulfill(status=200,content_type="application/json",headers={"Access-Control-Allow-Origin":"*"},body=json.dumps({"ok":True,"content":{"song":S,"poll":None}}))
                if u.startswith("https://www.youtube.com/iframe_api"): return r.fulfill(status=200,content_type="application/javascript",body=STUB)
                return r.abort()
              return hnd
            pg.route("**/*",mkh(S)); pg.goto(BASE+"/"); pg.wait_for_selector(".content-song"); pg.locator(".content-cta").click(); pg.wait_for_selector(".sp-sheet"); pg.wait_for_timeout(700)
            m=pg.evaluate("""()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]};
              const sh=document.querySelector('.sp-sheet');return {vw:innerWidth,vh:innerHeight,sheet:r('.sp-sheet'),close:r('.sp-close'),yt:r('.sp-yt iframe')||r('.sp-yt'),cover:r('.sp-cover'),ytw:(document.querySelector('.sp-yt iframe')||{}).offsetWidth,yth:(document.querySelector('.sp-yt iframe')||{}).offsetHeight,play:r('.sp-play'),open:r('.sp-open'),save:r('.sp-save'),share:r('.sp-share'),
              scrolls:sh.scrollHeight>sh.clientHeight+1,hscroll:document.documentElement.scrollWidth-innerWidth,sheetHscroll:sh.scrollWidth-sh.clientWidth}}""")
            sh=m["sheet"]; issues=[]
            if sh[0]<0 or sh[0]+sh[2]>m["vw"]+0.5: issues.append("sheet outside horizontally")
            if sh[3]>m["vh"]+0.5: issues.append("sheet taller than screen")
            for k in("close","play","open","save","share"):
                e=m[k]
                if not e: issues.append(k+" missing"); continue
                if e[0]<0 or e[0]+e[2]>m["vw"]+0.5: issues.append(k+" outside horizontally")
                if e[1]<0 or (e[1]+e[3]>m["vh"]+0.5 and not m["scrolls"]): issues.append(k+" below screen")
            cv=m["cover"]; yt=m["yt"]
            if cv and yt:
                if abs(yt[2]-(cv[2]-4))>3 or abs(yt[3]-(cv[3]-4))>3: issues.append("video not filling frame %s vs %s"%(yt,cv))
                if (m["yth"] or 0)<200: issues.append("iframe layout height %s <200"%m["yth"])
            if m["hscroll"]>0 or m["sheetHscroll"]>0: issues.append("horizontal overflow")
            print("%-14s %4dx%-4d %-4s sheet=%s yt=%s layout=%sx%s scroll=%s %s"%(name,w,h,"LONG" if title==LONG else "norm",sh,m["yt"],m["ytw"],m["yth"],m["scrolls"],"ISSUES: "+"; ".join(issues) if issues else "ok"))
            if title==LONG and name in("iPhone SE","landscape","iPad","iPhone 14"): pg.screenshot(path="audit_%s.png"%name.replace(" ","_"))
            ctx.close()
    b.close()
