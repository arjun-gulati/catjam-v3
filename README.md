# Cat Jam V3

![preview](marketplace/preview.gif)

> ## 🙏 Huge thanks to the original creators
>
> **This is a fork. All credit for the original Cat-Jam Synced goes to [BlafKing](https://github.com/BlafKing).**
>
> Original project: **[github.com/BlafKing/spicetify-cat-jam-synced](https://github.com/BlafKing/spicetify-cat-jam-synced)**
>
> **V3's extra features were inspired by [FixeQD](https://github.com/FixeQD)'s [Cat-Jam Synced (Reborn)](https://github.com/FixeQD/spicetify-cat-jam-synced-reborn)** — head-drop sync, party mode, the debug overlay, local file import and the drops editor were popularised there. They are re-implemented here from scratch (no code copied; Reborn is GPL-3.0, this fork stays MIT like the original).
>
> If you like this, go star [BlafKing's original repo](https://github.com/BlafKing/spicetify-cat-jam-synced) and [FixeQD's Reborn](https://github.com/FixeQD/spicetify-cat-jam-synced-reborn) first. Thank you both!

A meme character appears next to your progress bar and jams along with your music, bouncing on every real beat of the song, with its head drops steered onto the beat.

## What's in V3

**Character library (from V2)**
Right-click the cat in the player and pick your jammer: Classic Cat Jam, RGB Cat Jam (the same cat in cycling RGB colours, WebM + transparent sticker), Maxwell, Bongo Cat, Pop Cat, Chipi Chipi Chapa Chapa Cat, Happy Happy Happy Cat, Huh Cat, Nyan Cat, a local file from your computer, or your own custom URL. Left-click the cat to cycle. Random character every song is in the menu too.

**Head-drop sync (new in V3)**
For WebM characters the playback rate is continuously steered, smoothly, so the character's next head drop lands exactly on the next music beat (rate follows time-until-drop ÷ time-until-beat, clamped and blended with the tempo rate so it never jerks). The classic cat's drop grid was measured from the source animation; any video can be retuned in the drops editor.

**Party mode (new in V3)**
On fast and loud sections (130+ BPM and −10 dB or louder) the cat goes rainbow with a glow, flashing on the beat. It switches itself off when the song calms down. Toggle in the right-click menu.

**Debug overlay (new in V3)**
Shift+click the cat: live track tempo and instant BPM, beat accuracy over the last 50 beats, drift in ms, next-beat countdown, segment loudness, current → target playback rate, party state, FPS.

**Drops editor (new in V3)**
In the right-click menu. Set the first head drop and the gap between drops for the current video; duration is read from the video itself. Saving retunes the sync for that character.

**Local file import (new in V3)**
Pick a .webm / .gif / .webp from your computer in the right-click menu, no hosting needed. Files up to about 3.5 MB are kept across restarts; bigger files work until Spotify restarts.

**Also from V2**
Per-beat squash-and-stretch bounce from Spotify's own audio analysis (beats, bars, segments, loudness), bounce intensity slider, tempo-grid fallback when a track has no analysis, seamless track changes (no forced video restart), smooth loop point, and seek-only re-anchoring.

## Install

Spicetify Marketplace: search "Cat Jam V3", or install manually:

1. Copy `marketplace/cat-jam.js` to your Spicetify `Extensions` folder
2. Run `spicetify config extensions cat-jam.js` and `spicetify apply`

## Controls

- **Right-click the cat**: character picker, beat modes, bounce intensity, party mode, drops editor, local file, debug toggle
- **Left-click the cat**: next character
- **Shift+click the cat**: debug overlay on/off
- Spotify Settings (bottom): position (player / left library), left-library size, custom URL and its native BPM

# Changelog

<h3>v3.0.0 (Cat Jam V3)</h3>

- Head-drop sync: continuous rate steering so head drops land on beats
- Party mode: rainbow + glow auto-activates on fast, loud sections
- Debug overlay (Shift+click): tempo, instant BPM, accuracy, drift, rates, FPS
- Drops editor with automatic video duration
- Local file import (WebM / GIF / WebP)
- Bounce intensity slider; seamless track changes; smooth loop point
- Renamed from Cat Jam V2 Reborn to Cat Jam V3 (FixeQD already had a "Reborn", so ours levels up instead)

<h3>v2.0.0 (V2 Reborn)</h3>

- Character library with RGB Cat Jam, right-click picker, true per-beat bounce sync

<h3>v1.2.5 and earlier</h3>

See the original project: https://github.com/BlafKing/spicetify-cat-jam-synced

---

## Made with Spicetify Creator

- https://github.com/spicetify/spicetify-creator
