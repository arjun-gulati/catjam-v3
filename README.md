# Cat Jam V2 Reborn

![preview](marketplace/preview.gif)

> ## 🙏 Huge thanks to the original creator
>
> **This is a fork. All credit for the original Cat-Jam Synced goes to [BlafKing](https://github.com/BlafKing).**
>
> Original project: **[github.com/BlafKing/spicetify-cat-jam-synced](https://github.com/BlafKing/spicetify-cat-jam-synced)**
>
> V2 Reborn only adds a character library and stronger beat sync on top of his work. If you like this, go star [his original repo](https://github.com/BlafKing/spicetify-cat-jam-synced) first. Thank you, BlafKing!


A meme character appears next to your progress bar and jams along with your music, bouncing on every real beat of the song.

Fork of [BlafKing/spicetify-cat-jam-synced](https://github.com/BlafKing/spicetify-cat-jam-synced), rebuilt as V2.

## What's new in V2 Reborn

**Character library (not just one cat)**
Right-click the cat in the player and pick your jammer:

- Classic Cat Jam (the original WebM)
- RGB Cat Jam, the same cat with cycling RGB colours (bundled WebM, plus a small transparent sticker version)
- Maxwell (spinning cat)
- Bongo Cat
- Pop Cat
- Chipi Chipi Chapa Chapa Cat
- Happy Happy Happy Cat
- Huh Cat
- Nyan Cat
- Your own custom URL (GIF, WebP or WebM, set in Spotify Settings)

Left-click the cat to cycle to the next character. There is also a "Random character every song" option in the right-click menu.

**Real beat sync**
V1 only sped the video up or down to match the track BPM, which was easy to miss. V2 uses Spotify's audio analysis for the exact song:

- The character bounces (squash and stretch) on every analysed beat, timed against the live player progress, with drift correction
- A bigger bounce on every bar, and WebM characters re-sync their loop on the bar, so sync cannot drift away
- Bounces hit harder on loud sections and softer on quiet ones (segment loudness)
- If a track has no analysis yet, a beat grid is synthesised from its tempo so the bounce still happens
- Beat modes in the right-click menu: Subtle, Full Jam (default), Chaos, Off

## Install

Spicetify Marketplace: search "Cat Jam V2 Reborn", or install manually:

1. Copy `marketplace/cat-jam.js` to your Spicetify `Extensions` folder
2. Run `spicetify config extensions cat-jam.js` and `spicetify apply`

## Settings

Position (player / left library), left-library size and the custom character URL live at the bottom of the regular Spotify settings. Character and beat mode are picked by right-clicking the cat itself, no settings trip needed.

# Changelog

<h3>v2.0.0 (V2 Reborn)</h3>

- Character library with right-click quick-pick menu and left-click cycling
- RGB Cat Jam: the same cat in RGB colours
- True beat sync: per-beat bounce from Spotify audio analysis, bar re-sync, loudness-scaled bounce, tempo-grid fallback
- GIF and WebP characters supported alongside WebM
- Renamed from Cat-Jam Synced to Cat Jam V2 Reborn

<h3>v1.2.5 and earlier</h3>

See the original project: https://github.com/BlafKing/spicetify-cat-jam-synced

---

## Made with Spicetify Creator

- https://github.com/spicetify/spicetify-creator
