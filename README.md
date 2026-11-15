# CINDERLINE

A round-based tactical FPS for make.fun's `threejs-fps-02` competition, built on
three.js 0.187.0. Single-player vs bots, desktop browser, static files, no build
step, no network requests, no external assets — all art is three.js geometry and
procedural canvas textures, all sound is synthesized with WebAudio.

## The game

You are a **Vanguard** attacker with four bot teammates against five **Warden**
defenders in Cinderline Yard, an industrial rail yard at dusk. First team to 5
round wins takes the match.

- **Rounds (100 s):** win by eliminating the enemy team, or plant the charge at
  Foundry (A) or Depot (B) and defend it until it detonates 40 s later. Defenders
  win by defusing (5 s channel) or if time expires with no plant.
- **Economy:** start $800; kill +$300, round win +$3250, round loss +$1900 (+$500
  per consecutive loss, max +$2900), plant +$300. Buy phase (15 s, press B): P9
  Sidearm (free), SG-12 Shotgun $1200, VK-9 SMG $1500, AR-77 Rifle $2700, LR-90
  Marksman $4000; HE $300, smoke $250, flash $200; kevlar $650.
- **Gunplay:** hitscan with headshot multipliers, recoil, spread bloom that grows
  while moving/firing and shrinks when crouched/still/aiming (right mouse), reload
  (R), distinct weapons.
- **Bots:** waypoint navigation, site pushes, plant/defuse, rotation, gunfire
  investigation, line-of-sight checks, burst fire, strafing, reloading.

## Controls

WASD move · mouse look · click fire · R reload · right-click aim · Shift walk slow ·
Ctrl/C crouch · Space jump · B buy menu · E plant · 1/2 weapons · Q cycle grenade ·
4/5/6 select grenade · G throw · M mute.

## Play locally

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

`?shot=start|buy|play|end&seed=N` renders a deterministic capture frame and sets
`window.__shotReady`. `?autoplay=1` runs a scripted demo round without pointer lock.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library.
