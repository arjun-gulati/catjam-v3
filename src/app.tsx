import { SettingsSection } from "spcr-settings";

// ============================================================================
// Cat Jam V2 Reborn
// A character library + real beat sync, forked from BlafKing/spicetify-cat-jam-synced
//
// - Right-click the cat: quick-pick menu (characters, beat mode, random)
// - Left-click the cat: cycle to the next character
// - Beat sync uses Spotify's own audio analysis (beats / bars / segments),
//   not just the track tempo: the character bounces on every real beat,
//   bounces harder on bars and loud sections, and WebM loops re-sync on bars.
// ============================================================================

const settings = new SettingsSection("Cat Jam V2 Reborn", "catjam-v2-reborn-settings");

const ASSET_BASE = "https://github.com/arjun-gulati/catjam-v2-reborn/raw/main/src/resources/";

// Native BPM = the tempo the character's loop was made at. Used to speed up /
// slow down WebM characters. GIF characters cannot change speed, so for them
// the beat bounce below is what carries the sync.
const CHARACTERS = [
    { id: "classic",   name: "Classic Cat Jam",        file: "catjam.webm",       type: "webm", bpm: 135.48 },
    { id: "rgb-webm",  name: "RGB Cat Jam (same cat)", file: "rgb-catjam.webm",   type: "webm", bpm: 135.48 },
    { id: "rgb-pixel", name: "RGB Cat Jam (sticker)",  file: "catjam-rainbow.gif", type: "gif", bpm: 113 },
    { id: "maxwell",   name: "Maxwell (spinning cat)", file: "maxwell.gif",       type: "gif",  bpm: 122 },
    { id: "bongo",     name: "Bongo Cat",              file: "bongo-cat.gif",     type: "gif",  bpm: 150 },
    { id: "popcat",    name: "Pop Cat",                file: "popcat.gif",        type: "gif",  bpm: 108 },
    { id: "chipi",     name: "Chipi Chipi Chapa Chapa Cat", file: "chipi-cat.gif", type: "gif", bpm: 120 },
    { id: "happy",     name: "Happy Happy Happy Cat",  file: "happy-cat.gif",     type: "gif",  bpm: 127 },
    { id: "huh",       name: "Huh Cat",                file: "huh-cat.gif",       type: "gif",  bpm: 100 },
    { id: "nyan",      name: "Nyan Cat",               file: "nyan-cat.gif",      type: "gif",  bpm: 143 },
    { id: "custom",    name: "Custom URL (from Settings)", file: "",              type: "custom", bpm: 135.48 },
];

const BEAT_MODES = [
    { id: "subtle", name: "Beat bounce: Subtle",    scale: 0.07, rotate: 0 },
    { id: "full",   name: "Beat bounce: Full Jam",  scale: 0.18, rotate: 2 },
    { id: "chaos",  name: "Beat bounce: Chaos",     scale: 0.32, rotate: 6 },
    { id: "off",    name: "Beat bounce: Off",       scale: 0,    rotate: 0 },
];

// ---------------------------------------------------------------------------
// Small persistent store (Spicetify.LocalStorage, falling back to localStorage)
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
function characterURL(character) {
    if (character.id === "custom") {
        const url = String(settings.getFieldValue("catjam-webm-link") || "");
        return url || ASSET_BASE + "catjam.webm";
    }
    return ASSET_BASE + character.file;
}
function characterType(character, url) {
    if (character.id !== "custom") return character.type;
    return /\.(gif|webp|png|apng)(\?|#|$)/i.test(url) ? "gif" : "webm";
}
function characterBPM(character) {
    if (character.id === "custom") {
        const custom = Number(settings.getFieldValue("catjam-webm-bpm"));
        if (custom) return custom;
    }
    return character.bpm;
}

// ---------------------------------------------------------------------------
// Audio data + playback rate (kept from v1, minus the danceability detour:
// the analysis beats below are what actually sync the character now)
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
        console.warn("[CAT-JAM V2] Could not fetch audio data:", error);
        return null;
    }
}

function getPlaybackRate() {
    const character = getCharacter();
    const trackBPM = audioData?.track?.tempo;
    if (!trackBPM) return 1;
    const rate = trackBPM / characterBPM(character);
    return Math.min(2.5, Math.max(0.4, rate));
}

// ---------------------------------------------------------------------------
// Beat engine: a rAF loop that interpolates the player progress between
// Spotify's progress events, fires a bounce exactly on each analysed beat,
// a bigger bounce + WebM loop reset on each bar, scaled by segment loudness.
// If a track has no analysis beats, it synthesises a beat grid from tempo,
// so the bounce (the visible sync) still happens on every track.
// ---------------------------------------------------------------------------
let beatTimer = null;
let progressAnchorMs = 0;
let progressAnchorStamp = 0;
let beatIdx = 0;
let barIdx = 0;
let lastDriftCheck = 0;

function anchorProgress() {
    try {
        progressAnchorMs = Spicetify.Player.getProgress();
    } catch (e) { progressAnchorMs = 0; }
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
    // Fallback grid from tempo (analysis missing / loading)
    const tempo = audioData?.track?.tempo || 120;
    const duration = audioData?.track?.duration || 300;
    const interval = 60 / tempo;
    const beats = [];
    for (let t = 0; t < duration; t += interval) beats.push({ start: t, duration: interval });
    return beats;
}
function getBars() {
    if (audioData?.bars?.length) return audioData.bars;
    const beats = getBeats();
    return beats.filter((_, i) => i % 4 === 0);
}
function loudnessFactorAt(seconds) {
    const segments = audioData?.segments;
    if (!segments?.length) return 1;
    // segments are sorted; linear scan from a cached-ish position is fine at beat rate
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        if (seconds >= s.start && seconds < s.start + s.duration) {
            const loud = Math.max(-35, Math.min(0, s.loudness_max ?? -15));
            return 0.7 + ((loud + 35) / 35) * 0.6; // 0.7 (quiet) .. 1.3 (loud)
        }
    }
    return 1;
}
function resetBeatPointers() {
    const beats = getBeats();
    const bars = getBars();
    const nowSec = estimatedProgressMs() / 1000;
    beatIdx = lowerBound(beats, nowSec);
    barIdx = lowerBound(bars, nowSec);
}
function currentMedia() {
    return document.getElementById("catjam-media") as any;
}
function pulse(strength, isBar) {
    const mode = getBeatMode();
    if (!mode.scale) return;
    const wrap = document.getElementById("catjam-v2-pulse");
    if (!wrap) return;
    const beats = getBeats();
    const intervalMs = beats[1] ? Math.max(110, Math.min(500, (beats[1].duration || 0.45) * 1000 * 0.95)) : 280;
    const s = mode.scale * strength * (isBar ? 1.45 : 1);
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
    } catch (e) { /* Web Animations unavailable: tempo-rate sync still applies */ }
}
function beatTick() {
    if (!Spicetify.Player.isPlaying()) return;
    const now = performance.now();
    // Periodic drift correction against the real player progress
    if (now - lastDriftCheck > 500) {
        lastDriftCheck = now;
        const real = (() => { try { return Spicetify.Player.getProgress(); } catch (e) { return estimatedProgressMs(); } })();
        if (Math.abs(real - estimatedProgressMs()) > 600) {
            anchorProgress();
            resetBeatPointers();
        }
    }
    const progressSec = estimatedProgressMs() / 1000;
    const beats = getBeats();
    const bars = getBars();
    let firedBar = false;
    while (barIdx < bars.length && bars[barIdx].start <= progressSec) {
        barIdx++;
        firedBar = true;
    }
    let firedBeat = false;
    let beatStart = 0;
    while (beatIdx < beats.length && beats[beatIdx].start <= progressSec) {
        beatStart = beats[beatIdx].start;
        beatIdx++;
        firedBeat = true;
    }
    if (firedBar) {
        // Hard re-sync the WebM loop on the bar so drift can never accumulate
        const media = currentMedia();
        if (media && media.tagName === "VIDEO") {
            try { media.currentTime = 0; } catch (e) {}
        }
        pulse(loudnessFactorAt(beatStart || progressSec), true);
    } else if (firedBeat) {
        pulse(loudnessFactorAt(beatStart), false);
    }
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
// The character element (video for WebM, img for GIF) inside a pulse wrapper
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
        media.setAttribute("loop", "true");
        media.setAttribute("muted", "true");
        media.muted = true;
        media.setAttribute("autoplay", "true");
        media.setAttribute("playsinline", "true");
        media.src = url;
        media.playbackRate = getPlaybackRate();
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
        container.title = "Cat Jam V2 Reborn — left-click: next character · right-click: pick a character";
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
        console.error("[CAT-JAM V2] Could not create jam element: ", error);
    }
}

function syncPlayState() {
    const media = currentMedia();
    if (!media) return;
    if (media.tagName === "VIDEO") {
        if (Spicetify.Player.isPlaying()) { media.play?.().catch(() => {}); }
        else media.pause?.();
    }
    if (Spicetify.Player.isPlaying()) startBeatEngine();
    else stopBeatEngine();
}

async function applyCharacter(id, keepProgress = true) {
    store.set("character", id);
    const container = document.getElementById("catjam-v2");
    const pulseWrap = document.getElementById("catjam-v2-pulse");
    if (!container || !pulseWrap) { await createJamElement(); return; }
    const fresh = buildMediaElement(getCharacter());
    pulseWrap.replaceChildren(fresh);
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
// Right-click quick-pick menu (our own popup: works on every Spotify version,
// unlike Spotify's internal context-menu components which change often)
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
function menuEsc(e) {
    if (e.key === "Escape") closeMenu();
}
function menuRow({ label, thumbCharacter, checked, bold, onClick }) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.padding = "6px 10px";
    row.style.borderRadius = "6px";
    row.style.cursor = "pointer";
    row.style.fontSize = "13px";
    row.style.color = "#fff";
    if (bold) row.style.fontWeight = "700";
    row.addEventListener("mouseenter", () => { row.style.background = "rgba(255,255,255,0.12)"; });
    row.addEventListener("mouseleave", () => { row.style.background = "transparent"; });
    row.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });

    if (thumbCharacter) {
        const url = characterURL(thumbCharacter);
        const type = characterType(thumbCharacter, url);
        let thumb;
        if (type === "gif") {
            thumb = document.createElement("img");
            thumb.src = url;
        } else {
            thumb = document.createElement("video");
            thumb.src = url; thumb.muted = true; thumb.loop = true; thumb.autoplay = true; thumb.setAttribute("playsinline", "true");
        }
        thumb.style.width = "36px";
        thumb.style.height = "36px";
        thumb.style.objectFit = "cover";
        thumb.style.borderRadius = "6px";
        thumb.style.flex = "none";
        thumb.style.background = "#000";
        row.appendChild(thumb);
    }
    const text = document.createElement("span");
    text.textContent = label;
    text.style.flex = "1";
    row.appendChild(text);
    const check = document.createElement("span");
    check.textContent = checked ? "✓" : "";
    check.style.width = "16px";
    check.style.flex = "none";
    row.appendChild(check);
    return row;
}
function menuDivider() {
    const d = document.createElement("div");
    d.style.height = "1px";
    d.style.background = "rgba(255,255,255,0.15)";
    d.style.margin = "6px 4px";
    return d;
}
function openMenu(x, y) {
    closeMenu();
    menuOpen = true;
    const menu = document.createElement("div");
    menu.id = "catjam-v2-menu";
    menu.style.position = "fixed";
    menu.style.zIndex = "999999";
    menu.style.width = "272px";
    menu.style.maxHeight = "70vh";
    menu.style.overflowY = "auto";
    menu.style.background = "#282828";
    menu.style.border = "1px solid rgba(255,255,255,0.12)";
    menu.style.borderRadius = "10px";
    menu.style.boxShadow = "0 12px 32px rgba(0,0,0,0.55)";
    menu.style.padding = "8px";
    menu.style.fontFamily = "inherit";
    menu.style.userSelect = "none";
    menu.addEventListener("contextmenu", (e) => e.preventDefault());

    const heading = document.createElement("div");
    heading.textContent = "Pick your jammer";
    heading.style.fontSize = "11px";
    heading.style.letterSpacing = "0.08em";
    heading.style.textTransform = "uppercase";
    heading.style.color = "rgba(255,255,255,0.6)";
    heading.style.padding = "4px 10px 6px";
    menu.appendChild(heading);

    const currentId = getCharacter().id;
    for (const character of CHARACTERS) {
        menu.appendChild(menuRow({
            label: character.name,
            thumbCharacter: character.id === "custom" ? null : character,
            checked: character.id === currentId,
            onClick: () => { closeMenu(); applyCharacter(character.id); },
        }));
    }

    menu.appendChild(menuDivider());
    const modeId = getBeatMode().id;
    for (const mode of BEAT_MODES) {
        menu.appendChild(menuRow({
            label: mode.name,
            checked: mode.id === modeId,
            onClick: () => { store.set("beat-mode", mode.id); closeMenu(); },
        }));
    }

    menu.appendChild(menuDivider());
    const randomOn = store.get("random-per-song", "0") === "1";
    menu.appendChild(menuRow({
        label: "Random character every song",
        checked: randomOn,
        onClick: () => { store.set("random-per-song", randomOn ? "0" : "1"); closeMenu(); },
    }));
    menu.appendChild(menuRow({
        label: "Next character (or left-click the cat)",
        onClick: () => { closeMenu(); cycleCharacter(1); },
    }));

    menu.appendChild(menuDivider());
    const credit = document.createElement("div");
    credit.textContent = "🙏 Thanks to BlafKing, the original creator — click to open his repo";
    credit.style.fontSize = "11px";
    credit.style.lineHeight = "1.45";
    credit.style.color = "rgba(255,255,255,0.65)";
    credit.style.padding = "4px 10px 2px";
    credit.style.cursor = "pointer";
    credit.addEventListener("click", () => {
        closeMenu();
        try { window.open("https://github.com/BlafKing/spicetify-cat-jam-synced", "_blank"); } catch (e) {}
    });
    menu.appendChild(credit);

    document.body.appendChild(menu);
    // Clamp inside the viewport
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
    console.log("[CAT-JAM V2] Extension loaded.");

    settings.addInput("catjam-webm-link", "Custom character URL (GIF / WebP / WebM) — used by the 'Custom URL' character", "");
    settings.addInput("catjam-webm-bpm", "Custom character's native BPM (Example: 135.48)", "");
    settings.addDropDown("catjam-webm-position", "Position where the character should be rendered", ["Bottom (Player)", "Left (Library)"], 0);
    settings.addInput("catjam-webm-position-left-size", "Size on the left library in % (Default: 100)", "");
    settings.addButton("catjam-reload", "Right-click the cat in the player to pick a character and beat mode", "Save and reload", () => { createJamElement(); });
    settings.pushSettings();

    audioData = await fetchAudioData();
    await createJamElement();
    if (Spicetify.Player.isPlaying()) startBeatEngine();

    Spicetify.Player.addEventListener("onplaypause", () => {
        anchorProgress();
        syncPlayState();
    });

    Spicetify.Player.addEventListener("songchange", async () => {
        if (store.get("random-per-song", "0") === "1") {
            const pool = CHARACTERS.filter(c => c.id !== "custom" && c.id !== getCharacter().id);
            const pick = pool[Math.floor(Math.random() * pool.length)];
            store.set("character", pick.id);
            const pulseWrap = document.getElementById("catjam-v2-pulse");
            if (pulseWrap) pulseWrap.replaceChildren(buildMediaElement(pick));
        }
        audioData = await fetchAudioData();
        const media = currentMedia();
        if (media && media.tagName === "VIDEO") {
            media.playbackRate = getPlaybackRate();
            try { media.currentTime = 0; } catch (e) {}
        }
        anchorProgress();
        resetBeatPointers();
        syncPlayState();
    });
}

export default main;
