# Tapping a journey opens a player: cover, title, seek bar, transport controls (live for the loaded journey), favourite, share.
src = open(__file__.replace("test_journey_player.py", "test_postcards_redesign.py")).read().split("with sync_playwright()")[0]
exec(src)
from playwright.sync_api import sync_playwright
fails = 0
def check(name, cond):
    global fails
    print(("PASS " if cond else "FAIL ") + name)
    if not cond: fails += 1
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}); ctx.add_init_script("try{localStorage.setItem('tvr_lang','el')}catch(e){}")
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.route("**/*", mk(POSTS))
    pg.goto(BASE + "/journeys"); pg.wait_for_timeout(900)
    pg.locator(".ep-clickable").nth(1).click(); pg.wait_for_timeout(500)
    check("player opens on tap", pg.locator(".jp-overlay").count() == 1 and pg.locator(".jp-art img").count() == 1)
    check("title + date shown", pg.locator(".jp-head .detail-title").inner_text().strip() != "" and pg.locator(".jp-head .detail-date").count() == 1)
    check("seek bar present, inactive until the journey is loaded", pg.locator(".jp-seek-input").count() == 1 and pg.locator(".jp-seek-input").is_disabled())
    check("only the play button before loading", pg.locator(".jp-controls button").count() == 1)
    check("favourite + share present", pg.locator(".jp-actions button").count() == 2)
    pg.locator(".jp-controls button[aria-label='play']").click(); pg.wait_for_timeout(600)
    check("after play: -10 / prev / play / next / +10", pg.locator(".jp-controls button").count() == 5)
    fav = pg.locator(".jp-actions button[aria-label='favorite']"); fav.click(); pg.wait_for_timeout(200)
    check("favourite toggles", fav.get_attribute("aria-pressed") == "true")
    pg.locator(".detail-close").click(); pg.wait_for_timeout(300)
    check("close returns to the list", pg.locator(".jp-overlay").count() == 0)
    check("no page errors", not errs)
    b.close()
print("FAILS", fails)
