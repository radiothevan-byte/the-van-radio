// Node (vm) test of the Apps Script music-identity logic with MusicBrainz/YouTube-shaped fixtures.
// Run: node scripts/tests/test_identity_script.mjs
import fs from "fs"; import vm from "vm"; import assert from "assert";
const src = fs.readFileSync(new URL("../../apps-script/AppWebhookScript.gs.txt", import.meta.url), "utf8");

function makeCtx({ routes = {}, props = {}, sheetRows = null }) {
  const calls = [];
  const ctx = {
    console, Date, JSON, Math, Object, Array, String, parseInt, isFinite, RegExp, Error,
    Utilities: { sleep() {}, formatDate: (d) => d.toISOString().slice(0, 10) },
    Session: { getScriptTimeZone: () => "UTC" },
    CacheService: { getScriptCache: () => ({ remove() {}, get: () => null, put() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null }) },
    Logger: { log() {} },
    UrlFetchApp: {
      fetch(url) {
        calls.push(url);
        for (const [needle, body] of Object.entries(routes)) {
          if (url.includes(needle)) {
            if (typeof body === "number") return { getResponseCode: () => body, getContentText: () => "" };
            return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
          }
        }
        return { getResponseCode: () => 404, getContentText: () => "" };
      },
    },
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, calls };
}
const rec = (o) => ({ id: "r1", score: 100, title: "Song", "artist-credit": [{ name: "Artist", artist: { name: "Artist" } }], "first-release-date": "1995-03-01", releases: [], ...o });
const album = (title, date, extra = {}) => ({ title, status: "Official", date, "release-group": { "primary-type": "Album", "secondary-types": [] }, ...extra });
const work = (id) => ({ relations: [{ type: "performance", "target-type": "work", work: { id }, attributes: [] }] });
const wcred = (...rels) => ({ relations: rels.map(([type, name]) => ({ type, "target-type": "artist", artist: { name } })) });

let n = 0; const ok = (name, fn) => { fn(); n++; console.log("ok -", name); };

// ---- title / artist helpers ----
{
  const { ctx } = makeCtx({});
  const P = (t) => JSON.parse(JSON.stringify(ctx.idParseTitle_(t)));
  ok("title: remaster/noise removed, no flags", () => assert.deepEqual(P("Song (Remastered 2011)"), { base: "song", flags: [] }));
  ok("title: live flag from bracket", () => assert.deepEqual(P("Song (Live at Wembley 1986)"), { base: "song", flags: ["live"] }));
  ok("title: suffix flag", () => assert.deepEqual(P("Song - Acoustic Version"), { base: "song", flags: ["acoustic"] }));
  ok("title: Live Forever is a title, not a flag", () => assert.deepEqual(P("Live Forever"), { base: "live forever", flags: [] }));
  ok("title: greek accents/final sigma", () => assert.equal(ctx.idParseTitle_("Η Αγάπη Μας").base, ctx.idParseTitle_("η αγαπη μασ").base));
  ok("artist: single exact", () => assert.ok(ctx.idArtistMatch_("Artist", [["Artist"]], "Artist")));
  ok("artist: different artist rejected", () => assert.ok(!ctx.idArtistMatch_("Artist", [["Other"]], "Other")));
  ok("artist: featuring set equal", () => assert.ok(ctx.idArtistMatch_("A & B", [["A"], ["B"]], "A feat. B")));
  ok("artist: partial credit rejected", () => assert.ok(!ctx.idArtistMatch_("A", [["A"], ["B"]], "A feat. B")));
  ok("year guard", () => { assert.equal(ctx.idYear_("1995-03-01"), 1995); assert.equal(ctx.idYear_("n/a"), ""); assert.equal(ctx.idYear_(1850), ""); });
}

// ---- MusicBrainz: full data ----
{
  const { ctx, calls } = makeCtx({ routes: {
    "recording/?query": { recordings: [rec({ releases: [album("Late Album", "1996-01-01"), album("First Album", "1995-05-05"), { title: "Hits", status: "Official", date: "1990-01-01", "release-group": { "primary-type": "Album", "secondary-types": ["Compilation"] } }] })] },
    "recording/r1?inc=work-rels": work("w1"),
    "work/w1": wcred(["composer", "Comp One"], ["lyricist", "Lyr One"], ["arranger", "Arr"]),
  } });
  const r = ctx.identityLookup_("Song", "Artist", "");
  ok("full: composer/lyricist/album/year", () => { assert.equal(r.composer, "Comp One"); assert.equal(r.lyricist, "Lyr One"); assert.equal(r.album, "First Album"); assert.equal(r.year, 1995); });
  ok("full: source records MBIDs", () => assert.match(r.source, /rec r1.*work w1/));
  ok("full: only 3 MB calls", () => assert.equal(calls.length, 3));
}
// ---- partial: single only, bare "writer" credit ----
{
  const { ctx } = makeCtx({ routes: {
    "recording/?query": { recordings: [rec({ releases: [{ title: "Single", status: "Official", date: "1995-01-01", "release-group": { "primary-type": "Single", "secondary-types": [] } }] })] },
    "recording/r1?inc=work-rels": work("w1"),
    "work/w1": wcred(["writer", "Someone"]),
  } });
  const r = ctx.identityLookup_("Song", "Artist", "");
  ok("partial: no album, writer ignored, year kept", () => { assert.equal(r.composer, ""); assert.equal(r.lyricist, ""); assert.equal(r.album, ""); assert.equal(r.year, 1995); });
}
// ---- none: no results / wrong artist / wrong version / low score ----
for (const [name, recs] of [
  ["none: empty", []],
  ["none: other artist (cover)", [rec({ "artist-credit": [{ name: "Cover Band", artist: { name: "Cover Band" } }] })]],
  ["none: live on MB but studio requested", [rec({ disambiguation: "live, 1999" })]],
  ["none: low score", [rec({ score: 60 })]],
  ["none: video entry", [rec({ video: true })]],
]) {
  const { ctx } = makeCtx({ routes: { "recording/?query": { recordings: recs } } });
  ok(name, () => assert.equal(ctx.identityLookup_("Song", "Artist", ""), null));
}
// ---- version agreement ----
{
  const { ctx } = makeCtx({ routes: {
    "recording/?query": { recordings: [rec({ disambiguation: "live, 1999", "first-release-date": "1999-01-01", releases: [album("Live Album", "1999-02-02", { "release-group": { "primary-type": "Album", "secondary-types": ["Live"] } })] })] },
    "recording/r1?inc=work-rels": work("w1"), "work/w1": wcred(["composer", "C"]),
  } });
  const r = ctx.identityLookup_("Song (Live)", "Artist", "");
  ok("live requested + live recording: matches live album/year", () => { assert.equal(r.album, "Live Album"); assert.equal(r.year, 1999); assert.equal(r.composer, "C"); });
}
// ---- ambiguity guards ----
{
  const { ctx } = makeCtx({ routes: {
    "recording/?query": { recordings: [rec({ id: "r1", "first-release-date": "1995-01-01" }), rec({ id: "r2", "first-release-date": "2010-01-01" })] },
    "recording/r1?inc=work-rels": work("w1"), "recording/r2?inc=work-rels": work("w2"),
  } });
  const r = ctx.identityLookup_("Song", "Artist", "");
  ok("ambiguous works + years: no credits, no year", () => { assert.equal(r, null); });
}
// ---- HTTP error propagates (retry next run, not recorded as None) ----
{
  const { ctx } = makeCtx({ routes: { "recording/?query": 500 } });
  ok("http error throws", () => assert.throws(() => ctx.identityLookup_("Song", "Artist", ""), /http-500/));
}
// ---- YouTube Topic description (optional key) ----
{
  const desc = "Provided to YouTube by Label\n\nSong · Artist\n\nThe Album\n\n℗ 2005 Label\n\nReleased on: 2005-01-01\n\nComposer: Yt Comp\nLyricist: Yt Lyr\n\nAuto-generated by YouTube.";
  const routes = { "googleapis.com/youtube": { items: [{ snippet: { description: desc } }] }, "recording/?query": { recordings: [] } };
  const { ctx } = makeCtx({ routes, props: { YOUTUBE_API_KEY: "k" } });
  const r = ctx.identityLookup_("Song", "Artist", "https://www.youtube.com/watch?v=abcdefghijk");
  ok("youtube topic: composer/lyricist/album", () => { assert.equal(r.composer, "Yt Comp"); assert.equal(r.lyricist, "Yt Lyr"); assert.equal(r.album, "The Album"); assert.equal(r.year, ""); });
  const { ctx: c2 } = makeCtx({ routes: { ...routes }, props: { YOUTUBE_API_KEY: "k" } });
  ok("youtube: different artist line rejected", () => assert.equal(c2.identityLookup_("Song", "Someone Else", "https://youtu.be/abcdefghijk"), null));
  const { ctx: c3, calls } = makeCtx({ routes });
  c3.identityLookup_("Song", "Artist", "https://youtu.be/abcdefghijk");
  ok("youtube: no key -> API never called", () => assert.ok(!calls.some((u) => u.includes("googleapis"))));
  const up = "Uploaded by a fan\nSong · Artist\nComposer: Fan";
  const { ctx: c4 } = makeCtx({ routes: { "googleapis.com/youtube": { items: [{ snippet: { description: up } }] }, "recording/?query": { recordings: [] } }, props: { YOUTUBE_API_KEY: "k" } });
  ok("youtube: ordinary upload description ignored", () => assert.equal(c4.identityLookup_("Song", "Artist", "https://youtu.be/abcdefghijk"), null));
}

// ---- sheet level: tick writes once, Manual is never overwritten, read side hides empty identity ----
{
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const hdr = ["ID","Title","Artist","Link URL","Note EL","Note EN","Publish Date","Status","Source","Created At","Published At"];
  function fakeSheet(data) {
    const cell = (r, c) => ({ setValue(v) { while (data[r - 1].length < c) data[r - 1].push(""); data[r - 1][c - 1] = v; return this; }, setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }, setDataValidation() { return this; } });
    return {
      getLastRow: () => data.length, getLastColumn: () => Math.max(...data.map((r) => r.length)),
      getRange: (r, c, nr, nc) => nr === undefined ? cell(r, c) : (nr === 500 ? cell(r, c) : { getValues: () => data.slice(r - 1, r - 1 + nr).map((row) => { const o = row.slice(c - 1, c - 1 + nc); while (o.length < nc) o.push(""); return o; }) }),
    };
  }
  const data = [hdr.slice(),
    ["a", "Song", "Artist", "", "", "", today, "Published", "", "", ""],
    ["b", "Other", "Someone", "", "", "", today, "Scheduled", "", "", ""],
  ];
  const sheet = fakeSheet(data);
  const { ctx, calls } = makeCtx({ routes: {
    "recording/?query": { recordings: [rec({ releases: [album("First Album", "1995-05-05")] })] },
    "recording/r1?inc=work-rels": work("w1"), "work/w1": wcred(["composer", "C"], ["lyricist", "L"]),
  } });
  ctx.SpreadsheetApp = { openById: () => ({ getSheetByName: (n) => n === ctx.SONG_SHEET_NAME ? sheet : null }), newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }) };
  ok("tick: processes rows, adds columns", () => assert.equal(ctx.contentIdentityTick_(), 2));
  ok("tick: row 1 filled", () => { const h = data[0]; const g = (c) => data[1][h.indexOf(c)]; assert.equal(g("Composer"), "C"); assert.equal(g("Lyricist"), "L"); assert.equal(g("Album"), "First Album"); assert.equal(g("Release Year"), 1995); assert.equal(g("Identity Status"), "Auto"); });
  const before = calls.length;
  ok("tick: second run makes no API calls (stored once)", () => { assert.equal(ctx.contentIdentityTick_(), 0); assert.equal(calls.length, before); });
  const h = data[0];
  data[2][h.indexOf("Composer")] = "Typed By Hand"; data[2][h.indexOf("Identity Status")] = "Manual";
  ok("manual correction survives", () => { ctx.contentIdentityTick_(); assert.equal(data[2][h.indexOf("Composer")], "Typed By Hand"); });
  ok("read side: identity object only with values", () => {
    const out = JSON.parse(JSON.stringify(ctx.buildPublishedContent_()));
    assert.deepEqual(out.song.identity, { composer: "C", lyricist: "L", album: "First Album", year: 1995 });
    assert.equal(out.song.title, "Song");
    data[1][h.indexOf("Composer")] = data[1][h.indexOf("Lyricist")] = data[1][h.indexOf("Album")] = data[1][h.indexOf("Release Year")] = "";
    const out2 = JSON.parse(JSON.stringify(ctx.buildPublishedContent_()));
    assert.ok(!("identity" in out2.song));
  });
}
console.log(`\n${n} checks passed`);
