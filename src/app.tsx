import { SettingsSection } from "spcr-settings";

// ============================================================================
// Cat Jam V3
// Character library + real beat sync, built on BlafKing's Cat-Jam Synced (MIT).
// V3 adds clean-room implementations of the feature ideas popularised by
// FixeQD's "Cat-Jam Synced (Reborn)": head-drop sync, party mode, a live
// debug overlay, local file import and a drops editor. No code was copied
// from the GPL-3.0 Reborn project; these are independent implementations.
//
// - Right-click the cat: quick-pick / settings popup
// - Left-click the cat: cycle character · Shift+click the cat: debug overlay
// - Sync uses Spotify's audio analysis (beats / bars / segments / loudness):
//   bounce on every beat, and for WebM the playback rate is continuously
//   steered so the character's next head drop lands on the next beat.
// ============================================================================

const settings = new SettingsSection("Cat Jam V3", "catjam-v3-settings");

const ASSET_BASE = "https://github.com/arjun-gulati/catjam-v3/raw/main/src/resources/";

// dropOffset / dropInterval describe the loop's head drops (seconds), measured
// from the source animation: the classic cat drops its head once per native
// beat (135.48 BPM = 0.4428s). The drops editor can retune any video.
const CHARACTERS = [
    { id: "classic",   name: "Classic Cat Jam",        file: "catjam.webm",       type: "webm", bpm: 135.48, dropOffset: 0.10, dropInterval: 0.4428 },
    { id: "rgb-webm",  name: "RGB Cat Jam (same cat)", file: "rgb-catjam.webm",   type: "webm", bpm: 135.48, dropOffset: 0.10, dropInterval: 0.4428 },
    { id: "rgb-pixel", name: "RGB Cat Jam (sticker)",  file: "catjam-rainbow.gif", type: "gif", bpm: 113 },
    { id: "maxwell",   name: "Maxwell (spinning cat)", file: "maxwell.gif",       type: "gif",  bpm: 122 },
    { id: "bongo",     name: "Bongo Cat",              file: "bongo-cat.gif",     type: "gif",  bpm: 150 },
    { id: "popcat",    name: "Pop Cat",                file: "popcat.gif",        type: "gif",  bpm: 108 },
    { id: "chipi",     name: "Chipi Chipi Chapa Chapa Cat", file: "chipi-cat.gif", type: "gif", bpm: 120 },
    { id: "happy",     name: "Happy Happy Happy Cat",  file: "happy-cat.gif",     type: "gif",  bpm: 127 },
    { id: "huh",       name: "Huh Cat",                file: "huh-cat.gif",       type: "gif",  bpm: 100 },
    { id: "nyan",      name: "Nyan Cat",               file: "nyan-cat.gif",      type: "gif",  bpm: 143 },
    { id: "local",     name: "Local file (yours)",     file: "",                  type: "local", bpm: 135.48 },
    { id: "custom",    name: "Custom URL (from Settings)", file: "",              type: "custom", bpm: 135.48 },
];

const BEAT_MODES = [
    { id: "subtle", name: "Beat bounce: Subtle",    scale: 0.07, rotate: 0 },
    { id: "full",   name: "Beat bounce: Full Jam",  scale: 0.18, rotate: 2 },
    { id: "chaos",  name: "Beat bounce: Chaos",     scale: 0.32, rotate: 6 },
    { id: "off",    name: "Beat bounce: Off",       scale: 0,    rotate: 0 },
];

// ---------------------------------------------------------------------------
// Persistent store (keys kept from V2 so your character choice carries over)
// ---------------------------------------------------------------------------
const store = {
    get(key, fallback) {
        try {
            const v = Spicetify.LocalStorage.get("catjam-v2:" + key);
            return v === null || v === undefined || v === "" ? fallback : v;
        } catch (e) {
            try { return window.localStorage.getItem("catjam-v2:" + key) ?? fallback; } catch (e2) { return fallback; }
        }
    },
    set(key, value) {
        try { Spicetify.LocalStorage.set("catjam-v2:" + key, String(value)); } catch (e) {
            try { window.localStorage.setItem("catjam-v2:" + key, String(value)); } catch (e2) {}
        }
    },
};

function getCharacter() {
    const id = store.get("character", "classic");
    return CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
}
function getBeatMode() {
    const id = store.get("beat-mode", "full");
    return BEAT_MODES.find(m => m.id === id) || BEAT_MODES[1];
}
function getIntensity() {
    const v = Number(store.get("intensity", "100"));
    return isNaN(v) ? 1 : Math.min(2, Math.max(0, v / 100));
}
let localSessionURL = "";
function characterURL(character) {
    if (character.id === "custom") {
        const url = String(settings.getFieldValue("catjam-webm-link") || "");
        return url || ASSET_BASE + "catjam.webm";
    }
    if (character.id === "local") {
        if (localSessionURL) return localSessionURL;
        return store.get("local-file-data", "") || ASSET_BASE + "catjam.webm";
    }
    return ASSET_BASE + character.file;
}
function characterType(character, url) {
    if (character.id === "custom" || character.id === "local") {
        if (url.startsWith("data:")) return url.startsWith("data:image") ? "gif" : "webm";
        return /\.(gif|webp|png|apng)(\?|#|$)/i.test(url) ? "gif" : "webm";
    }
    return character.type;
}
function characterBPM(character) {
    if (character.id === "custom" || character.id === "local") {
        const custom = Number(settings.getFieldValue("catjam-webm-bpm"));
        if (custom) return custom;
    }
    return character.bpm;
}
function dropGrid(character) {
    // Per-character editor overrides win over the built-in grid
    const o = Number(store.get("drops-offset:" + character.id, ""));
    const i = Number(store.get("drops-interval:" + character.id, ""));
    const offset = !isNaN(o) && store.get("drops-offset:" + character.id, "") !== "" ? o : character.dropOffset;
    const interval = !isNaN(i) && i > 0 ? i : character.dropInterval;
    if (offset === undefined || !interval) return null;
    return { offset, interval };
}

// ---------------------------------------------------------------------------
// Audio data
// ---------------------------------------------------------------------------
let audioData = null;

async function fetchAudioData(retryDelay = 200, maxRetries = 10) {
    try {
        return await Spicetify.getAudioData();
    } catch (error) {
        const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
        if (message.includes("Cannot read properties of undefined") && maxRetries > 0) {
            await new Promise(r => setTimeout(r, retryDelay));
            return fetchAudioData(retryDelay, maxRetries - 1);
        }
        console.warn("[CAT-JAM V3] Could not fetch audio data:", error);
        return null;
    }
}
function tempoRate() {
    const trackBPM = audioData?.track?.tempo;
    if (!trackBPM) return 1;
    const rate = trackBPM / characterBPM(getCharacter());
    return Math.min(2.5, Math.max(0.4, rate));
}

// ---------------------------------------------------------------------------
// Live stats (for the debug overlay)
// ---------------------------------------------------------------------------
const stats = {
    fps: 0, frames: 0, fpsStamp: performance.now(),
    lastDriftMs: null as any, beatHits: [] as boolean[],
    instantBpm: 0, recentBeatTimes: [] as number[],
    loudnessDb: null as any, nextBeatInMs: null as any,
    targetRate: 1, party: false, partyOffAt: 0,
};
function recordBeatFired(driftMs) {
    stats.lastDriftMs = driftMs;
    stats.beatHits.push(Math.abs(driftMs) < 90);
    if (stats.beatHits.length > 50) stats.beatHits.shift();
    const now = performance.now();
    stats.recentBeatTimes.push(now);
    if (stats.recentBeatTimes.length > 7) stats.recentBeatTimes.shift();
    if (stats.recentBeatTimes.length >= 3) {
        const gaps = [];
        for (let i = 1; i < stats.recentBeatTimes.length; i++) gaps.push(stats.recentBeatTimes[i] - stats.recentBeatTimes[i - 1]);
        gaps.sort((a, b) => a - b);
        const median = gaps[Math.floor(gaps.length / 2)];
        if (median > 0) stats.instantBpm = Math.round(60000 / median);
    }
}
function beatAccuracy() {
    if (!stats.beatHits.length) return null;
    return Math.round((stats.beatHits.filter(Boolean).length / stats.beatHits.length) * 100);
}

// ---------------------------------------------------------------------------
// Beat engine
// ---------------------------------------------------------------------------
let beatTimer = null;
let progressAnchorMs = 0;
let progressAnchorStamp = 0;
let beatIdx = 0;
let barIdx = 0;
let lastDriftCheck = 0;
let lastRateSteer = 0;

function anchorProgress() {
    try { progressAnchorMs = Spicetify.Player.getProgress(); } catch (e) { progressAnchorMs = 0; }
    progressAnchorStamp = performance.now();
}
function estimatedProgressMs() {
    if (!Spicetify.Player.isPlaying()) return progressAnchorMs;
    return progressAnchorMs + (performance.now() - progressAnchorStamp);
}
function lowerBound(items, seconds) {
    let lo = 0, hi = items.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (items[mid].start < seconds) lo = mid + 1; else hi = mid;
    }
    return lo;
}
function getBeats() {
    if (audioData?.beats?.length) return audioData.beats;
    const tempo = audioData?.track?.tempo || 120;
    const duration = audioData?.track?.duration || 300;
    const interval = 60 / tempo;
    const beats = [];
    for (let t = 0; t < duration; t += interval) beats.push({ start: t, duration: interval });
    return beats;
}
function getBars() {
    if (audioData?.bars?.length) return audioData.bars;
    return getBeats().filter((_, i) => i % 4 === 0);
}
function segmentAt(seconds) {
    const segments = audioData?.segments;
    if (!segments?.length) return null;
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (seconds >= s.start && seconds < s.start + s.duration) return s;
    }
    return null;
}
function loudnessFactorAt(seconds) {
    const s = segmentAt(seconds);
    if (!s) return 1;
    const loud = Math.max(-35, Math.min(0, s.loudness_max ?? -15));
    return 0.7 + ((loud + 35) / 35) * 0.6;
}
function resetBeatPointers() {
    const nowSec = estimatedProgressMs() / 1000;
    beatIdx = lowerBound(getBeats(), nowSec);
    barIdx = lowerBound(getBars(), nowSec);
}
function currentMedia() {
    return document.getElementById("catjam-media") as any;
}
function pulse(strength, isBar) {
    const mode = getBeatMode();
    const intensity = getIntensity();
    if (!mode.scale || !intensity) return;
    const wrap = document.getElementById("catjam-v2-pulse");
    if (!wrap) return;
    const beats = getBeats();
    const intervalMs = beats[1] ? Math.max(110, Math.min(500, (beats[1].duration || 0.45) * 1000 * 0.95)) : 280;
    const s = mode.scale * strength * intensity * (isBar ? 1.45 : 1);
    const r = mode.rotate * (Math.random() > 0.5 ? 1 : -1) * (isBar ? 1.4 : 1);
    try {
        wrap.animate(
            [
                { transform: "scale(1, 1) rotate(0deg) translateY(0)" },
                { transform: `scale(${1 + s}, ${1 - s * 0.75}) rotate(${r}deg) translateY(${isBar ? 3 : 1}px)`, offset: 0.35 },
                { transform: "scale(1, 1) rotate(0deg) translateY(0)" },
            ],
            { duration: intervalMs, easing: "ease-out" }
        );
    } catch (e) {}
}

// Party mode: auto-activates on fast + loud sections (>=130 BPM, >= -10 dB),
// flashes on the beat, 1s cooldown before switching off. Rainbow via CSS
// filters on the media itself (works for video and GIF alike).
function updateParty(progressSec) {
    const enabled = store.get("party-mode", "1") === "1";
    const seg = segmentAt(progressSec);
    const bpm = audioData?.track?.tempo || stats.instantBpm || 0;
    const loud = seg ? (seg.loudness_max ?? -99) : -99;
    stats.loudnessDb = seg ? Math.round(loud) : null;
    const hot = enabled && bpm >= 130 && loud >= -10;
    const now = performance.now();
    if (hot) { stats.party = true; stats.partyOffAt = now + 1000; }
    else if (stats.party && now > stats.partyOffAt) stats.party = false;
    const media = currentMedia();
    if (media) {
        const want = stats.party ? "catjam-party-on" : "";
        if (media.dataset.party !== want) {
            media.dataset.party = want;
            media.style.filter = stats.party
                ? "saturate(2.2) hue-rotate(0deg) drop-shadow(0 0 10px rgba(255,0,255,0.55))"
                : "";
            media.style.animation = stats.party ? "catjamPartyHue 0.9s linear infinite" : "";
        }
    }
}

// Head-drop steering (WebM only): continuously nudge playbackRate so the
// video's next head drop lands on the next music beat. Rate target is
// time-until-drop / time-until-beat, clamped 0.75-1.35, lerped for smoothness.
function steerRateToDrops(progressSec) {
    const media = currentMedia();
    if (!media || media.tagName !== "VIDEO") return;
    const grid = dropGrid(getCharacter());
    const base = tempoRate();
    if (!grid || !media.duration || isNaN(media.duration)) { setRate(media, base); return; }
    const beats = getBeats();
    const bi = lowerBound(beats, progressSec);
    if (bi >= beats.length) { setRate(media, base); return; }
    const tUntilBeat = beats[bi].start - progressSec;
    stats.nextBeatInMs = Math.round(tUntilBeat * 1000);
    const vt = media.currentTime;
    const posInGrid = (vt - grid.offset) % grid.interval;
    const sinceDrop = posInGrid < 0 ? posInGrid + grid.interval : posInGrid;
    const tUntilDrop = grid.interval - sinceDrop;
    if (tUntilBeat <= 0.02) { setRate(media, base); return; }
    let target = tUntilDrop / tUntilBeat;
    target = Math.min(1.35, Math.max(0.75, target));
    // Blend with the plain tempo rate so a bad grid can never hijack playback
    target = target * 0.7 + base * 0.3;
    stats.targetRate = target;
    setRate(media, media.playbackRate + (target - media.playbackRate) * 0.25);
}
function setRate(media, rate) {
    if (!media || media.tagName !== "VIDEO") return;
    const r = Math.min(2.5, Math.max(0.4, rate));
    if (Math.abs(media.playbackRate - r) > 0.005) {
        try { media.playbackRate = r; } catch (e) {}
    }
    stats.targetRate = r;
}

function beatTick() {
    stats.frames++;
    const nowFps = performance.now();
    if (nowFps - stats.fpsStamp >= 500) {
        stats.fps = Math.round((stats.frames * 1000) / (nowFps - stats.fpsStamp));
        stats.frames = 0; stats.fpsStamp = nowFps;
    }
    if (!Spicetify.Player.isPlaying()) return;
    const now = performance.now();
    if (now - lastDriftCheck > 500) {
        lastDriftCheck = now;
        const real = (() => { try { return Spicetify.Player.getProgress(); } catch (e) { return estimatedProgressMs(); } })();
        // Only a real seek (>600ms jump) re-anchors; normal progress noise must
        // not reset the engine every second (that killed sync in early versions)
        if (Math.abs(real - estimatedProgressMs()) > 600) {
            anchorProgress();
            resetBeatPointers();
        }
    }
    const progressSec = estimatedProgressMs() / 1000;
    const beats = getBeats();
    const bars = getBars();
    let firedBar = false;
    while (barIdx < bars.length && bars[barIdx].start <= progressSec) { barIdx++; firedBar = true; }
    let firedBeat = false;
    let beatStart = 0;
    let beatCountFired = 0;
    while (beatIdx < beats.length && beats[beatIdx].start <= progressSec) {
        beatStart = beats[beatIdx].start;
        beatIdx++; firedBeat = true; beatCountFired++;
    }
    if (firedBeat && beatCountFired === 1) {
        recordBeatFired(Math.round((progressSec - beatStart) * 1000));
        pulse(loudnessFactorAt(beatStart), firedBar);
    } else if (firedBar) {
        pulse(loudnessFactorAt(progressSec), true);
    }
    updateParty(progressSec);
    if (now - lastRateSteer > 90) {
        lastRateSteer = now;
        steerRateToDrops(progressSec);
    }
    // Smooth loop: jump just before the end instead of native-loop stutter
    const media = currentMedia();
    if (media && media.tagName === "VIDEO" && media.duration && media.currentTime > media.duration - 0.15) {
        try { media.currentTime = 0.02; } catch (e) {}
    }
    renderDebug();
}
function startBeatEngine() {
    stopBeatEngine();
    anchorProgress();
    resetBeatPointers();
    beatTimer = setInterval(beatTick, 30);
}
function stopBeatEngine() {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
}

// ---------------------------------------------------------------------------
// Debug overlay (Shift+click the cat, or from the right-click menu)
// ---------------------------------------------------------------------------
let debugVisible = false;
let lastDebugRender = 0;
function ensureDebugStyle() {
    if (document.getElementById("catjam-party-style")) return;
    const style = document.createElement("style");
    style.id = "catjam-party-style";
    style.textContent = "@keyframes catjamPartyHue { from { filter: saturate(2.2) hue-rotate(0deg) drop-shadow(0 0 10px rgba(255,0,255,0.55)); } to { filter: saturate(2.2) hue-rotate(360deg) drop-shadow(0 0 10px rgba(0,255,255,0.55)); } }";
    document.head.appendChild(style);
}
function toggleDebug(force) {
    debugVisible = force !== undefined ? force : !debugVisible;
    const el = document.getElementById("catjam-v3-debug");
    if (!debugVisible) { el?.remove(); return; }
    if (el) return;
    const box = document.createElement("div");
    box.id = "catjam-v3-debug";
    box.style.cssText = "position:fixed;left:12px;bottom:110px;z-index:999998;background:rgba(10,10,10,0.88);color:#7dff8a;border:1px solid rgba(125,255,138,0.35);border-radius:8px;padding:10px 12px;font-family:monospace;font-size:11px;line-height:1.65;pointer-events:none;min-width:210px;white-space:pre;";
    document.body.appendChild(box);
    renderDebug(true);
}
function renderDebug(force = false) {
    if (!debugVisible) return;
    const now = performance.now();
    if (!force && now - lastDebugRender < 250) return;
    lastDebugRender = now;
    const box = document.getElementById("catjam-v3-debug");
    if (!box) return;
    const media = currentMedia();
    const acc = beatAccuracy();
    const track = (() => { try { return Spicetify.Player.data?.item?.name || ""; } catch (e) { return ""; } })();
    box.textContent =
        `CAT JAM V3 · DEBUG\n` +
        `track      ${track ? String(track).slice(0, 26) : "-"}\n` +
        `character  ${getCharacter().name}\n` +
        `tempo      ${audioData?.track?.tempo ? Math.round(audioData.track.tempo) : "-"} BPM · instant ${stats.instantBpm || "-"}\n` +
        `beat acc   ${acc === null ? "-" : acc + "%"} (last 50 beats)\n` +
        `drift      ${stats.lastDriftMs === null ? "-" : stats.lastDriftMs + " ms"}\n` +
        `next beat  ${stats.nextBeatInMs === null ? "-" : stats.nextBeatInMs + " ms"}\n` +
        `loudness   ${stats.loudnessDb === null ? "-" : stats.loudnessDb + " dB"}\n` +
        `rate       ${media && media.tagName === "VIDEO" ? media.playbackRate.toFixed(2) + "x → " + stats.targetRate.toFixed(2) + "x" : "(gif: bounce only)"}\n` +
        `party      ${stats.party ? "ON 🌈" : "off"}\n` +
        `fps        ${stats.fps}`;
}

// ---------------------------------------------------------------------------
// The character element
// ---------------------------------------------------------------------------
async function waitForElement(selector, maxAttempts = 50, interval = 100) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const element = document.querySelector(selector);
        if (element) return element;
        await new Promise(r => setTimeout(r, interval));
        attempts++;
    }
    throw new Error(`Element ${selector} not found after ${maxAttempts} attempts.`);
}
function buildMediaElement(character) {
    const url = characterURL(character);
    const type = characterType(character, url);
    let media;
    if (type === "gif") {
        media = document.createElement("img");
        media.src = url;
        media.alt = character.name;
    } else {
        media = document.createElement("video");
        media.setAttribute("muted", "true");
        media.muted = true;
        media.setAttribute("autoplay", "true");
        media.setAttribute("playsinline", "true");
        // No native loop attribute: the engine smooth-loops just before the end
        media.src = url;
        media.playbackRate = tempoRate();
    }
    media.id = "catjam-media";
    media.style.width = "100%";
    media.style.height = "100%";
    media.style.objectFit = "contain";
    media.style.display = "block";
    media.draggable = false;
    return media;
}
async function createJamElement() {
    try {
        ensureDebugStyle();
        const selectedPosition = settings.getFieldValue("catjam-webm-position");
        const isBottom = selectedPosition !== "Left (Library)";
        const targetSelector = isBottom ? ".main-nowPlayingBar-right" : ".main-yourLibraryX-libraryItemContainer";
        let leftSize = Number(settings.getFieldValue("catjam-webm-position-left-size"));
        if (!leftSize) leftSize = 100;
        const target = await waitForElement(targetSelector);
        document.getElementById("catjam-v2")?.remove();

        const pulseWrap = document.createElement("div");
        pulseWrap.id = "catjam-v2-pulse";
        pulseWrap.style.width = "100%";
        pulseWrap.style.height = "100%";
        pulseWrap.style.transformOrigin = "50% 85%";

        const container = document.createElement("div");
        container.id = "catjam-v2";
        container.title = "Cat Jam V3 — left-click: next character · right-click: menu · shift+click: debug overlay";
        container.style.cursor = "pointer";
        container.style.flex = "none";
        if (isBottom) {
            container.style.width = "65px";
            container.style.height = "65px";
        } else {
            container.style.width = `${leftSize}%`;
            container.style.maxWidth = "300px";
            container.style.aspectRatio = "1";
            container.style.position = "absolute";
            container.style.bottom = "0";
            container.style.zIndex = "2";
        }
        pulseWrap.appendChild(buildMediaElement(getCharacter()));
        container.appendChild(pulseWrap);

        container.addEventListener("click", (e) => {
            if (e.shiftKey) { e.stopPropagation(); toggleDebug(); return; }
            if (menuOpen) { closeMenu(); return; }
            e.stopPropagation();
            cycleCharacter(1);
        });
        container.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMenu(e.clientX, e.clientY);
        });

        if (target.firstChild) target.insertBefore(container, target.firstChild);
        else target.appendChild(container);
        syncPlayState();
    } catch (error) {
        console.error("[CAT-JAM V3] Could not create jam element: ", error);
    }
}
function syncPlayState() {
    const media = currentMedia();
    if (media && media.tagName === "VIDEO") {
        if (Spicetify.Player.isPlaying()) { media.play?.().catch(() => {}); }
        else media.pause?.();
    }
    if (Spicetify.Player.isPlaying()) startBeatEngine();
    else stopBeatEngine();
}
async function applyCharacter(id) {
    store.set("character", id);
    const pulseWrap = document.getElementById("catjam-v2-pulse");
    if (!pulseWrap) { await createJamElement(); return; }
    pulseWrap.replaceChildren(buildMediaElement(getCharacter()));
    syncPlayState();
    try { Spicetify.showNotification(`Cat Jam: ${getCharacter().name}`); } catch (e) {}
}
function cycleCharacter(step) {
    const ids = CHARACTERS.map(c => c.id);
    const current = getCharacter().id;
    const next = ids[(ids.indexOf(current) + step + ids.length) % ids.length];
    applyCharacter(next);
}

// ---------------------------------------------------------------------------
// Local file import: pick a .webm/.gif/.webp from the computer. Small files
// are kept as a data URL in local storage (survive restarts); oversized ones
// fall back to a session-only object URL.
// ---------------------------------------------------------------------------
function pickLocalFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".webm,.gif,.webp,.mp4,video/webm,image/gif,image/webp";
    input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (file.size <= 3_500_000) {
            const reader = new FileReader();
            reader.onload = () => {
                store.set("local-file-data", String(reader.result));
                applyCharacter("local");
            };
            reader.readAsDataURL(file);
        } else {
            localSessionURL = URL.createObjectURL(file);
            applyCharacter("local");
            try { Spicetify.showNotification("Big file: local character works until Spotify restarts"); } catch (e) {}
        }
    });
    input.click();
}

// ---------------------------------------------------------------------------
// Drops editor: retune the head-drop grid for the current video character.
// Duration is read from the video itself, never typed by hand.
// ---------------------------------------------------------------------------
function openDropsEditor() {
    const character = getCharacter();
    const grid = dropGrid(character) || { offset: 0, interval: 60 / characterBPM(character) };
    const media = currentMedia();
    const duration = media && media.tagName === "VIDEO" && media.duration ? media.duration.toFixed(2) + "s" : "(GIF: drops apply to WebM only)";
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:12px;color:#fff;font-size:14px;";
    wrap.innerHTML =
        `<div>Head-drop grid for <b>${character.name}</b><br>Video duration: ${duration}</div>` +
        `<label>First head drop at (seconds)<br><input id="cj-drop-offset" type="number" step="0.01" min="0" value="${grid.offset}" style="width:120px;padding:6px;margin-top:4px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;"></label>` +
        `<label>Time between head drops (seconds)<br><input id="cj-drop-interval" type="number" step="0.001" min="0.05" value="${grid.interval}" style="width:120px;padding:6px;margin-top:4px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;"></label>` +
        `<div style="display:flex;gap:8px;"><button id="cj-drop-save" style="padding:8px 14px;border-radius:16px;border:0;background:#1db954;color:#000;font-weight:700;cursor:pointer;">Save</button>` +
        `<button id="cj-drop-reset" style="padding:8px 14px;border-radius:16px;border:0;background:#444;color:#fff;cursor:pointer;">Reset to built-in</button></div>` +
        `<div style="font-size:12px;opacity:0.7">Tip: play the video, note when the head drops, set the first drop and the gap between drops. The engine steers playback so a drop lands on every beat.</div>`;
    try {
        Spicetify.PopupModal.display({ title: "Drops editor", content: wrap, isLarge: false });
    } catch (e) { return; }
    setTimeout(() => {
        const save = document.getElementById("cj-drop-save");
        const reset = document.getElementById("cj-drop-reset");
        save?.addEventListener("click", () => {
            const o = (document.getElementById("cj-drop-offset") as any)?.value;
            const i = (document.getElementById("cj-drop-interval") as any)?.value;
            if (o !== undefined && o !== "") store.set("drops-offset:" + character.id, o);
            if (i !== undefined && i !== "") store.set("drops-interval:" + character.id, i);
            try { Spicetify.PopupModal.hide(); } catch (e) {}
        });
        reset?.addEventListener("click", () => {
            store.set("drops-offset:" + character.id, "");
            store.set("drops-interval:" + character.id, "");
            try { Spicetify.PopupModal.hide(); } catch (e) {}
        });
    }, 50);
}

// ---------------------------------------------------------------------------
// Right-click quick-pick / settings popup (our own, version-proof)
// ---------------------------------------------------------------------------
let menuOpen = false;
function closeMenu() {
    menuOpen = false;
    document.getElementById("catjam-v2-menu")?.remove();
    document.removeEventListener("click", menuOutsideClick, true);
    document.removeEventListener("keydown", menuEsc, true);
}
function menuOutsideClick(e) {
    const menu = document.getElementById("catjam-v2-menu");
    if (menu && !menu.contains(e.target)) closeMenu();
}
function menuEsc(e) { if (e.key === "Escape") closeMenu(); }
function menuRow({ label, thumbCharacter, checked, bold, onClick }) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:13px;color:#fff;";
    if (bold) row.style.fontWeight = "700";
    row.addEventListener("mouseenter", () => { row.style.background = "rgba(255,255,255,0.12)"; });
    row.addEventListener("mouseleave", () => { row.style.background = "transparent"; });
    row.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    if (thumbCharacter) {
        const url = characterURL(thumbCharacter);
        const type = characterType(thumbCharacter, url);
        let thumb;
        if (type === "gif") { thumb = document.createElement("img"); thumb.src = url; }
        else {
            thumb = document.createElement("video");
            thumb.src = url; thumb.muted = true; thumb.loop = true; thumb.autoplay = true; thumb.setAttribute("playsinline", "true");
        }
        thumb.style.cssText = "width:36px;height:36px;object-fit:cover;border-radius:6px;flex:none;background:#000;";
        row.appendChild(thumb);
    }
    const text = document.createElement("span");
    text.textContent = label;
    text.style.flex = "1";
    row.appendChild(text);
    const check = document.createElement("span");
    check.textContent = checked ? "✓" : "";
    check.style.cssText = "width:16px;flex:none;";
    row.appendChild(check);
    return row;
}
function menuDivider() {
    const d = document.createElement("div");
    d.style.cssText = "height:1px;background:rgba(255,255,255,0.15);margin:6px 4px;";
    return d;
}
function menuHeading(text) {
    const h = document.createElement("div");
    h.textContent = text;
    h.style.cssText = "font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.6);padding:6px 10px 4px;";
    return h;
}
function openMenu(x, y) {
    closeMenu();
    menuOpen = true;
    const menu = document.createElement("div");
    menu.id = "catjam-v2-menu";
    menu.style.cssText = "position:fixed;z-index:999999;width:276px;max-height:78vh;overflow-y:auto;background:#282828;border:1px solid rgba(255,255,255,0.12);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.55);padding:8px;user-select:none;";
    menu.addEventListener("contextmenu", (e) => e.preventDefault());

    menu.appendChild(menuHeading("Pick your jammer"));
    const currentId = getCharacter().id;
    for (const character of CHARACTERS) {
        menu.appendChild(menuRow({
            label: character.name,
            thumbCharacter: character.id === "custom" ? null : character,
            checked: character.id === currentId,
            onClick: () => {
                closeMenu();
                if (character.id === "local" && !store.get("local-file-data", "") && !localSessionURL) pickLocalFile();
                else applyCharacter(character.id);
            },
        }));
    }
    menu.appendChild(menuRow({ label: "📁 Use a local file…", onClick: () => { closeMenu(); pickLocalFile(); } }));
    menu.appendChild(menuRow({ label: "🎯 Drops editor (sync this video)…", onClick: () => { closeMenu(); openDropsEditor(); } }));

    menu.appendChild(menuDivider());
    menu.appendChild(menuHeading("Beat sync"));
    const modeId = getBeatMode().id;
    for (const mode of BEAT_MODES) {
        menu.appendChild(menuRow({
            label: mode.name,
            checked: mode.id === modeId,
            onClick: () => { store.set("beat-mode", mode.id); closeMenu(); },
        }));
    }
    // Bounce intensity slider
    const sliderWrap = document.createElement("div");
    sliderWrap.style.cssText = "padding:4px 10px 2px;font-size:13px;color:#fff;";
    const sliderLabel = document.createElement("div");
    sliderLabel.textContent = `Bounce intensity: ${Math.round(getIntensity() * 100)}%`;
    sliderWrap.appendChild(sliderLabel);
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "200"; slider.step = "10";
    slider.value = String(Math.round(getIntensity() * 100));
    slider.style.width = "100%";
    slider.addEventListener("input", () => {
        store.set("intensity", slider.value);
        sliderLabel.textContent = `Bounce intensity: ${slider.value}%`;
    });
    slider.addEventListener("click", (e) => e.stopPropagation());
    sliderWrap.appendChild(slider);
    menu.appendChild(sliderWrap);

    menu.appendChild(menuDivider());
    const partyOn = store.get("party-mode", "1") === "1";
    menu.appendChild(menuRow({
        label: "🌈 Party mode (auto on fast + loud)",
        checked: partyOn,
        onClick: () => { store.set("party-mode", partyOn ? "0" : "1"); closeMenu(); },
    }));
    const randomOn = store.get("random-per-song", "0") === "1";
    menu.appendChild(menuRow({
        label: "Random character every song",
        checked: randomOn,
        onClick: () => { store.set("random-per-song", randomOn ? "0" : "1"); closeMenu(); },
    }));
    menu.appendChild(menuRow({
        label: "🐛 Debug overlay (or Shift+click the cat)",
        checked: debugVisible,
        onClick: () => { closeMenu(); toggleDebug(); },
    }));

    menu.appendChild(menuDivider());
    const credit = document.createElement("div");
    credit.style.cssText = "font-size:11px;line-height:1.5;color:rgba(255,255,255,0.65);padding:4px 10px 2px;cursor:pointer;";
    credit.textContent = "🙏 Thanks to BlafKing (original creator) and FixeQD (Reborn, feature inspiration) — click to open the original repo";
    credit.addEventListener("click", () => {
        closeMenu();
        try { window.open("https://github.com/BlafKing/spicetify-cat-jam-synced", "_blank"); } catch (e) {}
    });
    menu.appendChild(credit);

    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + "px";
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + "px";
    setTimeout(() => {
        document.addEventListener("click", menuOutsideClick, true);
        document.addEventListener("keydown", menuEsc, true);
    }, 0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    while (!Spicetify?.Player?.addEventListener || !Spicetify?.getAudioData) {
        await new Promise(r => setTimeout(r, 100));
    }
    console.log("[CAT-JAM V3] Extension loaded.");

    settings.addInput("catjam-webm-link", "Custom character URL (GIF / WebP / WebM) — used by the 'Custom URL' character", "");
    settings.addInput("catjam-webm-bpm", "Custom / local character's native BPM (Example: 135.48)", "");
    settings.addDropDown("catjam-webm-position", "Position where the character should be rendered", ["Bottom (Player)", "Left (Library)"], 0);
    settings.addInput("catjam-webm-position-left-size", "Size on the left library in % (Default: 100)", "");
    settings.addButton("catjam-reload", "Right-click the cat for characters, party mode and sync; Shift+click it for the debug overlay", "Save and reload", () => { createJamElement(); });
    settings.pushSettings();

    audioData = await fetchAudioData();
    await createJamElement();
    if (Spicetify.Player.isPlaying()) startBeatEngine();

    Spicetify.Player.addEventListener("onplaypause", () => {
        anchorProgress();
        syncPlayState();
    });

    Spicetify.Player.addEventListener("songchange", async () => {
        stats.beatHits = [];
        stats.recentBeatTimes = [];
        stats.instantBpm = 0;
        stats.lastDriftMs = null;
        if (store.get("random-per-song", "0") === "1") {
            const pool = CHARACTERS.filter(c => c.id !== "custom" && c.id !== "local" && c.id !== getCharacter().id);
            const pick = pool[Math.floor(Math.random() * pool.length)];
            store.set("character", pick.id);
            const pulseWrap = document.getElementById("catjam-v2-pulse");
            if (pulseWrap) pulseWrap.replaceChildren(buildMediaElement(pick));
        }
        audioData = await fetchAudioData();
        // Seamless: no forced restart of the video on a new track; the drop
        // steering + bounce re-align to the new song without a visible jump.
        anchorProgress();
        resetBeatPointers();
        syncPlayState();
    });
}

export default main;
