import json, time
src = open('/home/claude/the-van-radio2/scripts/tests/test_postcards_redesign.py').read().split("with sync_playwright()")[0]
exec(src)
from playwright.sync_api import sync_playwright
A={"id":"a","title":"Μπαϊ Μπαϊ","artist":"Νεφέλη Φασούλη","link":"https://www.youtube.com/watch?v=42hbZ1lK6Gg","noteEl":"x","noteEn":"x"}
B={"id":"b","title":"Όνειρα δολάρια","artist":"Δημήτρης Μυστακίδης","link":"https://www.youtube.com/watch?v=VnTMm9puetg","noteEl":"y","noteEn":"y"}
cur={"song":B}; calls=[0]
def handler(r):
    u=r.request.url
    if "action=content" in u:
        calls[0]+=1
        return r.fulfill(status=200,content_type="application/json",headers={"Access-Control-Allow-Origin":"*"},body=json.dumps({"ok":True,"content":{"song":cur["song"],"poll":None}}))
    return mk(POSTS)(r)
fails=0
def check(name,cond):
    global fails
    print(("PASS " if cond else "FAIL ")+name)
    if not cond: fails+=1
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1. yesterday's cache must not be served as fresh
    ctx=b.new_context(viewport={"width":390,"height":844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
    yday=int(time.time()*1000)-3*60*1000-0  # 3 minutes old (inside the 5-min window) ...
    import datetime
    midnight=datetime.datetime.now().replace(hour=0,minute=0,second=0,microsecond=0).timestamp()*1000
    ts=int(midnight)-60*1000  # ... but from before local midnight => previous day
    ctx.add_init_script("try{localStorage.setItem('tvr_content_cache_v1', JSON.stringify({t:%d,data:{song:%s,poll:null}}))}catch(e){}" % (ts, json.dumps(A)))
    pg=ctx.new_page(); pg.route("**/*",handler); pg.goto(BASE+"/"); pg.wait_for_timeout(1200)
    txt=pg.inner_text(".content-song")
    check("new day: previous-day cache is replaced by server song", "Όνειρα δολάρια" in txt and "Μπαϊ" not in txt)
    # 2. foreground refresh after the cache goes stale
    cur["song"]=A
    pg.evaluate("()=>{const c=JSON.parse(localStorage.getItem('tvr_content_cache_v1')); c.t=Date.now()-6*60*1000; localStorage.setItem('tvr_content_cache_v1', JSON.stringify(c));}")
    n=calls[0]
    pg.evaluate("()=>{window.dispatchEvent(new Event('focus'))}"); pg.wait_for_timeout(900)
    txt=pg.inner_text(".content-song")
    check("foreground after >5 min: refetches and shows the new song", calls[0]==n+1 and "Μπαϊ" in txt)
    # 3. within 5 minutes same day: no extra request
    n=calls[0]; pg.evaluate("()=>{window.dispatchEvent(new Event('focus'))}"); pg.wait_for_timeout(500)
    check("foreground within 5 min: no new request", calls[0]==n)
    # 4. server failure keeps what is on screen
    pg.unroute("**/*"); 
    def failh(r):
        if "action=content" in r.request.url: return r.abort()
        return mk(POSTS)(r)
    pg.route("**/*",failh)
    pg.evaluate("()=>{const c=JSON.parse(localStorage.getItem('tvr_content_cache_v1')); c.t=Date.now()-6*60*1000; localStorage.setItem('tvr_content_cache_v1', JSON.stringify(c));}")
    pg.evaluate("()=>{window.dispatchEvent(new Event('focus'))}"); pg.wait_for_timeout(900)
    check("server failure: song stays visible", "Μπαϊ" in pg.inner_text(".content-song"))
    b.close()
print("FAILS",fails)
