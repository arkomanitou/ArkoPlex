import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// All accounts, sessions and video bytes are fixtures. No real server is contacted.
const require = createRequire(
  process.env.ARKOPLEX_BROWSER_PACKAGE + "/package.json",
);
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const frontend = createRequire(root + "frontend/package.json");
const vite = fileURLToPath(
  new URL("../../bin/vite.js", "file://" + frontend.resolve("vite")),
);
const server = spawn(
  process.execPath,
  [vite, "preview", "--host", "127.0.0.1", "--port", "4174", "--strictPort"],
  { cwd: root + "frontend", stdio: "ignore" },
);
const origin = "http://127.0.0.1:4174";
const check = (label, value) => {
  assert(value, label);
  console.log("PASS " + label);
};
const clip = await readFile(new URL("./fixtures/player.webm", import.meta.url));
const errors = [];
const escapedCalls = [];
const negotiations = [];
const stoppedSessions = [];
let session = 0;
let browser;
let page;

const streams = (second) => [
  { Type: "Video", Index: 0, Codec: "vp8", Width: 160, Height: 90 },
  {
    Type: "Audio",
    Index: second ? 7 : 1,
    Language: "eng",
    Codec: "aac",
    Channels: 2,
  },
  {
    Type: "Audio",
    Index: second ? 12 : 2,
    Language: "fra",
    Codec: "aac",
    Channels: 2,
  },
  {
    Type: "Subtitle",
    Index: second ? 11 : 3,
    Language: "eng",
    Codec: "srt",
    DisplayTitle: "English",
  },
  {
    Type: "Subtitle",
    Index: second ? 20 : 4,
    Language: "fra",
    Codec: "srt",
    DisplayTitle: "Français",
  },
];
const item = (id) => ({
  Id: id,
  Type: "Episode",
  Name: id,
  SeriesId: "series",
  SeriesName: "Fixture",
  ParentIndexNumber: 1,
  IndexNumber: id === "episode-2" ? 2 : 1,
  MediaStreams: streams(id === "episode-2"),
  UserData: { PlaybackPositionTicks: 0 },
  RunTimeTicks: 900000000,
});
const hero = {
  Id: "episode-1",
  Name: "Lecture de test",
  Type: "Movie",
  RunTimeTicks: 900000000,
};

try {
  for (let tries = 0; ; tries++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Preview is starting. */
    }
    if (tries > 80) throw new Error("Preview server did not start");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1000, height: 600 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  context.setDefaultTimeout(15000);
  await context.addInitScript(() => {
    window.playerTestEvents = [];
    for (const type of [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
      "click",
    ]) {
      document.addEventListener(
        type,
        (event) =>
          window.playerTestEvents.push({
            type,
            pointer: event.pointerType,
            target: event.target?.getAttribute?.("data-testid"),
          }),
        true,
      );
    }
    localStorage.setItem("jf_server", "https://jellyfin.invalid");
    if (!localStorage.getItem("jf_user"))
      localStorage.setItem("jf_user", "alice");
    localStorage.setItem("jf_token", "fixture-token");
    localStorage.setItem("i18nextLng", "en");
    localStorage.setItem(
      "seerrAutoLoginDisabled:https://jellyfin.invalid",
      "true",
    );
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    };
    const json = (body) =>
      route.fulfill({
        headers,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.hostname === "jellyfin.invalid") {
      if (request.method() === "OPTIONS")
        return route.fulfill({ headers, status: 204 });
      if (/\/Images\//.test(url.pathname))
        return route.fulfill({
          headers,
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#102030"/></svg>',
        });
      if (/\/Subtitles\//.test(url.pathname))
        return route.fulfill({
          headers,
          contentType: "text/vtt",
          body: "WEBVTT\n\n",
        });
      if (/\/stream\.webm$/i.test(url.pathname)) {
        const range = request.headers().range?.match(/bytes=(\d+)-(\d*)/);
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2]
          ? Math.min(Number(range[2]), clip.length - 1)
          : clip.length - 1;
        return route.fulfill({
          status: range ? 206 : 200,
          headers: {
            ...headers,
            "Accept-Ranges": "bytes",
            "Content-Length": String(end - start + 1),
            ...(range
              ? { "Content-Range": `bytes ${start}-${end}/${clip.length}` }
              : {}),
          },
          contentType: "video/webm",
          body: clip.subarray(start, end + 1),
        });
      }
      const playback = url.pathname.match(/\/Items\/([^/]+)\/PlaybackInfo$/);
      if (playback) {
        negotiations.push({
          id: playback[1],
          audio: Number(
            url.searchParams.get("AudioStreamIndex") ??
              url.searchParams.get("audioStreamIndex"),
          ),
          subtitle: Number(
            url.searchParams.get("SubtitleStreamIndex") ??
              url.searchParams.get("subtitleStreamIndex"),
          ),
        });
        return json({
          PlaySessionId: `fixture-session-${++session}`,
          MediaSources: [
            {
              Id: playback[1],
              Container: "webm",
              SupportsDirectPlay: true,
              MediaStreams: streams(playback[1] === "episode-2"),
            },
          ],
        });
      }
      if (url.pathname.endsWith("/Sessions/Playing/Stopped"))
        stoppedSessions.push(request.postDataJSON());
      if (request.method() !== "GET")
        return route.fulfill({ headers, status: 204 });
      if (/\/Users\/(alice|bob|Me)$/.test(url.pathname))
        return json({
          Id: "alice",
          Name: "Alice",
          Policy: { IsAdministrator: false },
          Configuration: {
            AudioLanguagePreference: "eng",
            SubtitleLanguagePreference: "eng",
          },
        });
      if (url.pathname.endsWith("/Episodes"))
        return json({
          Items: [item("episode-1"), item("episode-2")],
          TotalRecordCount: 2,
        });
      if (url.pathname.endsWith("/Items")) {
        const id = url.searchParams.get("ids") || url.searchParams.get("Ids");
        return json({ Items: id ? [item(id)] : [hero], TotalRecordCount: 1 });
      }
      if (/\/Items\/episode-[12]$/.test(url.pathname)) return json(hero);
      return json({ Items: [], TotalRecordCount: 0 });
    }
    if (url.origin !== origin) {
      escapedCalls.push(request.url());
      return route.abort();
    }
    if (url.pathname === "/api/arkoplex/config")
      return json({
        serverName: "ArkoPlex",
        nightPulseEnabled: true,
        homeScreenSections: [
          { type: "mediaBar", enabled: true, showFavoriteButton: false },
        ],
      });
    if (url.pathname.startsWith("/api/")) return json({});
    return route.continue();
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.locator(".arko-primary-action").first().click();
  await page.waitForURL("**/play/episode-1**");
  const video = page.locator("video");
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
  );
  await page.waitForFunction(
    () =>
      document.querySelector("video").seekable.length > 0 &&
      document.querySelector("video").seekable.end(0) > 60,
  );
  check(
    "Le bouton Lire entre réellement en plein écran",
    await page.evaluate(
      () => document.fullscreenElement === document.documentElement,
    ),
  );
  await video.evaluate((v) => {
    v.pause();
    v.currentTime = 30;
    v.volume = 0.4;
  });
  await page.waitForFunction(() => !document.querySelector("video").seeking);
  check(
    "La fixture vidéo permet une recherche réelle à trente secondes",
    await video.evaluate((v) => Math.abs(v.currentTime - 30) < 0.5),
  );
  const surface = page.getByTestId("player-gesture-surface");
  const bounds = await surface.boundingBox();
  const xLeft = bounds.x + bounds.width * 0.25;
  const xRight = bounds.x + bounds.width * 0.75;
  const y = bounds.y + bounds.height * 0.5;
  const doubleTap = async (x) => {
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x, y);
  };
  await doubleTap(xRight);
  await page
    .getByTestId("player-gesture-feedback")
    .getByText("+10 s", { exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelector("video").currentTime >= 39.5,
  );
  check(
    "Le double appui avance sans changer pause/lecture",
    await video.evaluate((v) => v.paused && v.currentTime <= 40.5),
  );
  await doubleTap(xLeft);
  await page.waitForFunction(
    () => document.querySelector("video").currentTime <= 30.5,
  );
  check(
    "Le double appui recule de dix secondes",
    await video.evaluate((v) => v.currentTime >= 29.5 && v.paused),
  );
  const cdp = await context.newCDPSession(page);
  const swipe = async (x, endX, endY) => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 5; step++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: x + ((endX - x) * step) / 5, y: y + ((endY - y) * step) / 5 },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  await swipe(xRight, xRight, y - 70);
  const volume = await video.evaluate((v) => v.volume);
  check(
    "Le glissement droit augmente le volume sans pause parasite",
    volume > 0.5 && (await video.evaluate((v) => v.paused)),
  );
  await swipe(xLeft, xLeft, y - 70);
  const brightness = await video.evaluate((v) => v.style.filter);
  check(
    "Le glissement gauche éclaircit la vidéo",
    brightness !== "brightness(1)" && brightness.startsWith("brightness("),
  );
  const time = await video.evaluate((v) => v.currentTime);
  await swipe(xRight, xRight - 90, y);
  check(
    "Un déplacement horizontal ne déclenche ni saut ni lecture",
    (await video.evaluate(
      (v) => v.paused && Math.abs(v.currentTime - 30) < 0.5,
    )) && Math.abs(time - 30) < 0.5,
  );

  await page.mouse.move(xLeft, y);
  await page
    .locator("button")
    .filter({ has: page.locator(".lucide-audio-lines") })
    .click();
  await page
    .getByRole("menuitemradio", { name: "fra - aac", exact: true })
    .click();
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return (
      video?.readyState >= 2 &&
      new URL(video.currentSrc).searchParams.get("AudioStreamIndex") === "2"
    );
  });
  await page.mouse.move(xLeft, y);
  await page
    .getByRole("button", { name: /^(subtitles|sous.titres)$/i })
    .click();
  await page
    .getByRole("menuitemradio", { name: "Français", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
  );
  await page.mouse.move(xLeft, y);
  await page.locator('a[href^="/play/episode-2"]').first().click();
  await page.waitForURL("**/play/episode-2**");
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return (
      video?.readyState >= 2 &&
      video.currentSrc.includes("/episode-2/") &&
      new URL(video.currentSrc).searchParams.get("AudioStreamIndex") === "12"
    );
  });
  check(
    "Le plein écran survit au chargement de l’épisode suivant",
    await page.evaluate(
      () => document.fullscreenElement === document.documentElement,
    ),
  );
  await page.waitForFunction(
    (expected) => {
      const v = document.querySelector("video");
      return (
        v &&
        Math.abs(v.volume - expected.volume) < 0.01 &&
        v.style.filter === expected.brightness
      );
    },
    { volume, brightness },
  );
  check(
    "Volume et luminosité suivent le nouvel épisode",
    await video.evaluate(
      (v, expected) =>
        Math.abs(v.volume - expected.volume) < 0.01 &&
        v.style.filter === expected.brightness,
      { volume, brightness },
    ),
  );
  check(
    "Les langues sont renégociées avec les indices du nouvel épisode",
    negotiations.some(
      (n) => n.id === "episode-2" && n.audio === 12 && n.subtitle === -1,
    ),
  );
  await page.mouse.move(xLeft, y);
  await page
    .getByRole("button", { name: /^(subtitles|sous.titres)$/i })
    .click();
  check(
    "La piste française est sélectionnée après changement d’indice",
    (await page
      .getByRole("menuitemradio", { name: "Français", exact: true })
      .getAttribute("aria-checked")) === "true",
  );
  await page.getByRole("menuitemradio", { name: /off|désactiv/i }).click();
  await video.evaluate((v) => {
    v.volume = 0;
    v.muted = true;
  });
  await page.evaluate(() => document.exitFullscreen());
  await page.mouse.move(xLeft, y);
  await page.locator('a[href^="/play/episode-1"]').first().click();
  await page.waitForURL("**/play/episode-1**");
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
  );
  check(
    "Une sortie volontaire du plein écran reste respectée à l’épisode suivant",
    await page.evaluate(() => !document.fullscreenElement),
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
  );
  check(
    "Le silence et le volume nul sont conservés après rechargement",
    await video.evaluate((v) => v.muted && v.volume === 0),
  );
  await page.mouse.move(xLeft, y);
  await page
    .getByRole("button", { name: /^(subtitles|sous.titres)$/i })
    .click();
  check(
    "Les sous-titres restent désactivés après rechargement",
    (await page
      .getByRole("menuitemradio", { name: /off|désactiv/i })
      .getAttribute("aria-checked")) === "true",
  );
  await page.keyboard.press("Escape");
  await mkdir(root + "browser-artifacts", { recursive: true });
  await page.screenshot({ path: root + "browser-artifacts/player-touch.png" });
  check(
    "Le passage à un autre épisode arrête la session précédente",
    stoppedSessions.some(
      (s) =>
        s.ItemId === "episode-1" &&
        s.PlaySessionId?.startsWith("fixture-session-"),
    ),
  );
  check("Aucune erreur JavaScript", errors.length === 0);
  check("Aucun accès hors des fixtures", escapedCalls.length === 0);
} catch (error) {
  console.error(
    await page
      ?.evaluate(() => {
        const video = document.querySelector("video");
        return {
          media: video && {
            time: video.currentTime,
            duration: video.duration,
            paused: video.paused,
            seekable: video.seekable.length ? video.seekable.end(0) : null,
          },
          feedback: document.querySelector(
            '[data-testid="player-gesture-feedback"]',
          )?.textContent,
          events: window.playerTestEvents?.slice(-14),
        };
      })
      .catch(() => null),
  );
  console.error({ errors, escapedCalls, negotiations });
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
