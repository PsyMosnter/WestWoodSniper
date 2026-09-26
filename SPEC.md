# WESTWOOD SNIPER — Game Specification

**Version:** 1.0 (pre-production)
**Owner:** Maty
**Audience:** the coding agent building the game, and anyone reviewing it
**Status:** Approved for build, subject to the open decisions in §21

> How to use this document: build milestone by milestone (§20). Every number lives in one tuning file (§18) — treat the values here as starting defaults, not sacred truths. Where this spec is silent, choose the simplest thing that preserves the design pillars (§1) and note the choice in `DECISIONS.md`.

---

## Contents

1. Vision & design pillars
2. IP & originality guardrails
3. Platform & technical stack
4. World, camera & visual style
5. Controls & input
6. The Operative: stances, movement, weapons, equipment
7. Terrain, elevation & line of sight
8. Stealth & detection
9. Enemy AI
10. The scope minigame
11. Combat, damage & explosions
12. Units & structures roster
13. C4 demolition
14. Strategic strike (laser designator)
15. Friendly units: escort, rescue, extraction
16. Missions & maps (7 maps)
17. UI, HUD, menus, audio
18. Tuning file (balance defaults)
19. Architecture, data formats & tooling
20. Build milestones & acceptance criteria
21. Open decisions

---

## 1. Vision & design pillars

**Westwood Sniper** is a pixel-art, single-unit tactical stealth game in the style of mid-90s real-time strategy. The player controls one elite sniper of the **Global Operative Defences (GOD)** — callsign **WREN** — behind the lines of the **NOT** (Non-human Occupation Troops), who are, as the name says, *not human*. Maps are big and the Operative is tiny. Every mission is an infiltration puzzle: read patrols, use high ground and cover, strike surgically, get out.

### Pillars

1. **One tiny unit, one big map.** The map should feel like a full RTS battlefield — outposts, bases, patrol routes, roads, rivers, forests, cliffs — with a single 12-pixel soldier in it. Scale is the fantasy.
2. **Classic RTS readability.** Top-down 3/4 pixel art, shroud + fog of war, high ground rules, clear unit silhouettes, a sidebar-style minimap, terse radio announcements. Look-and-feel of the 1995 era, entirely original assets.
3. **Stance is strategy.** Run, walk, crouch, cover, hunker. Each trades speed for stealth and precision. The right stance at the right moment is the core skill.
4. **The shot is a moment.** Every rifle kill goes through the scope minigame. Where you hit matters: head, body, grenade belt, fuel tank, driver, view slit.
5. **Hard targets.** Strategic objectives are never easy to reach. Every objective has at least two approaches, and the obvious one is the best-guarded.
6. **Playful, not grim.** The NOT bleed green, blue, yellow or purple — never red. Explosions are big and satisfying. Tone: pulpy 90s military sci-fi.

### Mission types
Reconnaissance, sabotage, assassination, escort, rescue/exfiltration, and a combined final assault. (Details in §16.)

---

## 2. IP & originality guardrails

The game is **inspired by** 1990s RTS games (notably the commando missions of Command & Conquer, 1995). Genre conventions are free to use: top-down view, fog of war, high ground, sidebar minimap, a mission-select world map, a radio voice. **Specific expression is not.** The agent must follow these rules:

- **No ripped or traced assets.** Every sprite, tile, icon, font, sound effect and music track is created originally for this project (procedurally or hand-authored in code — see §4.5).
- **No borrowed names or terms.** Do not use: Command & Conquer, GDI, Nod, Tiberium, EVA, Kane, Temple of Nod, Obelisk, Mammoth tank, Orca, Hand of Nod, "Commando" as a unit name, or StarCraft terms such as "Ghost" as a unit name or the line "Nuclear launch detected". Use this spec's names (GOD, NOT, WREN, OVERWATCH, Spore crystals, Hive Spire…).
- **No imitation of recognizable voice lines or music.** Announcements are original text (see §17.4). Music is original chiptune (§17.6).
- **No real-world brands or logos.**
- **Faction colours are our own:** GOD = khaki/olive with steel-blue accents; NOT = charcoal with toxic lime and violet. Do not use gold-eagle or red-scorpion styling.
- **In-game credits** say "Inspired by the real-time strategy games of the 1990s." Do not name specific games or studios in-game.
- **Title meaning:** "Westwood" means **the West Wood** — a forest west of the front line, where the campaign begins (Mission 1 is set in it, §16) — not the studio. The game's world, briefing and title screen should support that reading (e.g. the title-screen background is the West Wood tree line). For a private build this is fine. Because the game is openly inspired by that studio's work, the name will still read as a reference to it, so revisit before any public or commercial release (§21).

### Blood rule (hard requirement)
NOT units bleed one of four colours, picked **at random per unit at spawn** and used consistently for that unit (hit spurts, death splat, body decal):

| Name | Main | Shade | Highlight |
|---|---|---|---|
| Slime green | `#5BD13A` | `#2E7A1C` | `#B8F27A` |
| Coolant blue | `#3AA7E0` | `#1D5C8A` | `#9EE3FF` |
| Bile yellow | `#E8D43A` | `#8E7F12` | `#FFF6A0` |
| Ichor purple | `#9B4AD9` | `#56227E` | `#D7A6FF` |

**No red or red-adjacent hue (hue 330°–20°) may appear in any gore effect.** Add a unit test that checks every colour in the gore palette. Fire and explosions may use orange/yellow. The Operative, when hit, shows a white hit-flash and a health-bar change — no blood.

---

## 3. Platform & technical stack

| Item | Decision |
|---|---|
| Target | Web browser. Primary: **mobile landscape** (touch). Secondary: desktop (mouse + keyboard). |
| Language | Vanilla **JavaScript (ES2022 modules)** with JSDoc types. No build step required. |
| Rendering | **HTML5 Canvas 2D**, pixel-perfect, integer scaling, `imageSmoothingEnabled = false`. |
| Dependencies | **None at runtime.** Dev-only: none required; tests run with Node's built-in `node --test`. |
| Run locally | Any static server (`npx serve`, `python3 -m http.server`). `index.html` at the project root. |
| Persistence | `localStorage` for progress and settings, wrapped in try/catch; game must work without it. |
| Performance | 60 fps on a mid-range 2022 phone with a 128×128-tile map, 60 enemies and fog active. |
| Offline | Optional PWA manifest + service worker (Milestone 10). |

**Logical resolution:** 480×270 pixels (16:9). The canvas is scaled by the largest integer that fits the screen; letterbox the remainder with the UI frame colour. On very wide phones allow the logical width to grow up to 560 so the view isn't letterboxed on the sides.

**Simulation:** fixed timestep at 30 Hz, render at display rate with interpolation. A global `timeScale` (1.0 normally, 0.2 in the scope, 0 when paused).

**Determinism:** all randomness goes through a seeded RNG (`rng.js`) so bugs can be reproduced with `?seed=123`.

---

## 4. World, camera & visual style

### 4.1 Grid and scale
- **Tile:** 16×16 px. Maps range from 96×72 to 128×128 tiles (§16).
- **Viewport:** 480×270 logical = 30×17 tiles. The largest map is about 18× the screen area — that is the intended "big map, tiny unit" feel.
- **Infantry sprites:** about 8×12 px. Vehicles 14–24 px. Buildings 2×2 to 4×4 tiles.

### 4.2 Perspective and elevation
- Top-down with a 3/4 oblique look (tall things show their south face), like mid-90s RTS.
- **Elevation is logical, not a vertical offset.** Levels 0–3. Ground at level *n* is drawn at the same screen position as level 0, which keeps tap-to-tile mapping trivial. Height is shown by:
  - cliff edge tiles with a rock face along the south and east edges of plateaus (auto-tiled from the elevation layer),
  - a small brightness step per level (+6% per level),
  - a 2-px drop shadow cast south-east from cliff edges.
- **Ramps** are dedicated tiles that connect adjacent levels (§7.2).

### 4.3 Draw order
Terrain → decals (craters, blood, tracks) → cliff faces → objects and units sorted by **(tile y, then elevation, then sub-tile y)** → projectiles and effects → fog/shroud → world-space UI (selection ring, vision cones in debug, alert icons) → HUD.

### 4.4 Fog of war
- **Shroud** (never seen): solid near-black `#07090A`, with a dithered 1-tile edge.
- **Fog** (seen before, not visible now): terrain and buildings shown darkened (50% black overlay, dithered edge). Buildings show their **last known state**. Units in fog are not drawn.
- **Visible:** full brightness.
- Vision sources: the Operative, friendly units, and temporary reveals (flares, mission scripts, the nuke flash).
- Recalculate at 10 Hz, or whenever a vision source moves to a new tile.

### 4.5 Art pipeline (original pixel art in code)
Because the agent won't have an artist, sprites are **authored as palette-indexed string grids in JS modules** and compiled to offscreen canvases at load time:

```js
// src/render/spriteData/husk.js
export const husk_walk_S_0 = {
  palette: 'NOT', // key into palette.js
  w: 8, h: 12,
  px: [
    '..kkkk..',
    '.kLLLLk.',
    '.kLeeLk.',   // e = eye glow
    // …
  ],
};
```

- A sprite compiler (`sprites.js`) builds canvases, **mirror variants** (for west-facing directions), and **palette swaps** (the four blood colours; alert tints).
- Directions: 8 (N, NE, E, SE, S; W/NW/SW are mirrored).
- Infantry animations: idle 1 frame, walk 4, run 4, crouch 1, prone 1, fire 2, hit 1, death 4 (ends on a corpse frame with blood splat).
- Every targetable unit also has **scope sprites** — large, detailed close-ups used only in the scope minigame (§10.3), roughly 40×64 px for infantry and 96×64 px for vehicles, in 4 views (front, back, left, right), with hit zones defined as rectangles or polygons in the same file.
- The asset manifest supports swapping any sprite for a PNG sprite sheet later without code changes.

### 4.6 Palette
Around 48 colours total, stored in `palette.js`. Earthy and slightly desaturated. Suggested anchors:

| Use | Colours |
|---|---|
| Temperate grass | `#4E6B2F` `#5E7E36` `#6F9140` `#3C5424` |
| Dirt / road | `#7A6440` `#8F7750` `#5F4D30` |
| Sand / arid | `#C2A56A` `#A88B52` `#D8BF86` |
| Rock / cliff | `#6B6560` `#4F4A46` `#8A847D` `#34302D` |
| Water | `#1F4E6B` `#2B6A8C` `#5FA3C4` (shallow highlight) |
| Snow | `#E6EEF2` `#BFD0D9` `#8FA4B0` |
| Jungle | `#2F5A2A` `#23461F` `#3E7A36` |
| Volcanic | `#2A2426` `#4A3A36` `#FF7A1A` (lava) `#FFC24A` |
| GOD | khaki `#A89968`, olive `#5C6B3A`, steel blue `#4A7FA8`, visor `#9FD8FF` |
| NOT | charcoal `#2A2D30`, toxic lime `#A6F03C`, violet `#7A3FC0`, eye glow `#E4FF6A` |
| UI | panel `#1B1F1C`, bevel light `#4B5A4E`, bevel dark `#0D0F0E`, text green `#7CFF7A`, amber `#FFB23A`, alert `#FF5A3A` (UI only, never gore) |

---

## 5. Controls & input

### 5.1 Touch (primary)

| Gesture | Where | Result |
|---|---|---|
| **Tap** | ground | Walk to that tile (A* path). |
| **Double-tap** | ground | Run to that tile. |
| **Tap** | enemy unit or structure | **Engage** (see 5.3): sniper approach + scope; with Run & Gun on, close in with the pistol. |
| **Long-press** (≥450 ms) | enemy | Always force a **sniper engagement** (scope), even with Run & Gun on. |
| **Long-press** | ground | Show a ring on the tile with its info: elevation, concealment, cover (a planning aid). |
| **Tap** | friendly escort unit | Toggle that unit between Follow and Hold. |
| **Tap** | building (with C4 left) | Walk to the nearest wall tile and plant C4 (confirm button appears). |
| **One-finger drag** | world | Pan the camera (switches camera follow off). |
| **Pinch** | world | Zoom between 1× and 2× (optional, Milestone 10). |
| **Tap** | minimap | Jump the camera there. |
| **HUD buttons** | — | Cover, Hunker (toggle), **Run & Gun (toggle)**, C4, Designator, Centre camera, Pause. |

**Gesture rules**
- A tap is a press shorter than 250 ms that moves less than 8 logical px.
- A double-tap is a second tap within 300 ms and within 24 px of the first.
- A drag is any movement over 8 px.
- **Don't wait for double-tap before acting.** Dispatch the walk order on the first tap straight away; if a second tap arrives in the window, upgrade the order to Run. The game must feel instant.
- All HUD buttons are at least 44 CSS px in size.
- A handedness setting mirrors the HUD button cluster.

### 5.2 Desktop

| Input | Action |
|---|---|
| Left click / double click | Tap / double-tap |
| Left long-press or Shift+click on enemy | Force scope |
| Right-drag, WASD, or screen-edge scroll | Pan |
| Mouse wheel | Zoom |
| `C` Cover, `H` Hunker, `G` Run & Gun, `4` C4, `N` Designator, `Space` centre camera, `Esc` pause | Hotkeys |
| In scope: mouse moves the crosshair, left click fires, hold `Shift` to hold breath, right click or `Esc` exits | |
| `` ` `` (backtick) | Debug overlay (dev builds only) |

### 5.3 Engage logic (tapping an enemy)
1. **Run & Gun on** (§6.4): the Operative walks toward the tapped target until it is within 3 tiles, auto-firing the pistol on the way (the tapped target gets priority whenever it is in range). Long-press still opens the scope instead.
2. **Run & Gun off** → **sniper approach**: plan a path to the best firing tile, then open the scope.
   - **Candidate firing tiles:** tiles within current rifle range of the target (using the range the Operative *will* have when crouched there, including the elevation bonus) that have LOS to it.
   - **Scoring (lower is better):** path length + 3 × (the tile is visible to any *known* enemy) − 2 × (tile has concealment) − 2 × (tile is adjacent to cover) − 3 × (elevation advantage over the target).
   - The Operative walks there (or runs, if the enemy was double-tapped), auto-crouches, and the scope opens.
   - If the target moves out of range during the approach, re-plan once per second. Give up after 3 re-plans and show "TARGET LOST".
3. If already crouched, in cover or hunkered and the target is in range with LOS → open the scope immediately without moving. **This is what makes hunkering useful:** a hunkered sniper can keep firing from the same spot.

---

## 6. The Operative

### 6.1 Stats
- HP 100. No natural regeneration. Field medkits heal 40 (placed on maps, and 1 in the starting loadout from Mission 3).
- Vision 10 tiles (all stances), +1 per elevation level the Operative stands on above level 0. Vision is 360°; the Operative isn't limited by a cone.

### 6.2 Stances

| Stance | How to enter | Move speed (tiles/s) | Visibility ×(§8) | Can fire | Rifle range | Scope sway × | Notes |
|---|---|---|---|---|---|---|---|
| **Run** | double-tap ground | 3.0 | 1.6 | **No** | — | — | Footstep noise 2.5 tiles. Can't open the scope. |
| **Walk** | tap ground | 1.6 | 1.0 | Pistol, only with Run & Gun on | — | — | Silent except in shallow water, snow or gravel. |
| **Crouch** | automatic when stopped | 0 | 0.6 | Rifle (scope); pistol with Run & Gun on | 8 tiles | 1.0 | The default idle stance. |
| **Cover** | Cover button (when stopped near cover) | 0 | 0.45 when the cover is between the Operative and the observer, else 0.6 | Rifle (scope); pistol with Run & Gun on | 8 tiles | 0.8 (braced) | 50% chance for incoming shots to hit the cover instead. |
| **Hunker** | Hunker button | 0 (tapping ground exits first) | 0.25 — **vehicles and turrets can't detect a hunkered Operative at all** | Rifle only | **10 tiles** | **0.4** | Enter 1.0 s, exit 0.7 s. Incoming hit chance ×0.5. |

- **Cover button:** if a cover tile is within 3 tiles, walk to the best one (the tile that puts cover between the Operative and the nearest known threat) and enter Cover. If not, crouch and show "NO COVER NEARBY".
- **Elevation bonus to rifle range:** +1 tile per level the Operative is above the target, up to +2.
- **Stance changes are animated** (crouch 0.2 s, prone 1.0 s). While a stance change plays, the Operative counts as the higher-visibility stance.

### 6.3 Weapons

**Sniper rifle ("Longbow", bolt action)**
- Used only through the scope minigame (§10).
- Magazine 5, reload 2.5 s, bolt cycle 1.2 s between shots.
- Mission ammo is set per mission (typically 20–30). Ammo crates can be found on maps.
- Base damage outside special hit zones: see §11.
- Noise radius: **12 tiles**. After firing, the Operative is "flash-exposed" for 2 s (visibility ×2).

**Service pistol ("Sidearm")**
- Hip-fire, no scope. Used **only through the Run & Gun toggle** (§6.4) — it fires automatically.
- Range 4 tiles. 12-round magazine, auto-reload 1.5 s, one shot every 0.4 s, unlimited reserve ammo.
- Against infantry, every shot in range with LOS hits; each target needs **1 or 2 shots** (§6.4).
- Noise radius: 7 tiles per shot. After each shot the Operative is exposed ×1.5 for 2 s (§8.1).
- Useless against tanks, APCs, trucks, turrets and buildings. Against the open-top Skitter buggy, each shot has a **10% chance to hit the driver** (vehicle stops, §11.1).

### 6.4 Run & Gun (toggle)
A HUD toggle, like Hunker. It trades stealth for close-range firepower.

- **On:** the Operative has the pistol drawn and **automatically fires at the closest valid target** within 4 tiles with LOS, whenever it is walking, crouched or in cover. It does **not** fire while running (running never allows attacks), while hunkered, or while the scope is open.
- **Kill rule (infantry):** when a target is first fired upon, roll how many hits it takes — **1 or 2** (default 50/50; tunable). Every shot at infantry in range hits. So no infantry unit ever takes more than two pistol shots. This covers Husks, Lobbers, Scorchers, Launchers, Wardens, Sniffers and MG-nest gunners. *Exception:* the boss Overseer Vrask takes 4 hits (§12.1). Tower gunners are out of reach.
- **Target priority:** 1) the tapped target, if in range; 2) the closest infantry unit in Combat or Suspicious state; 3) the closest infantry unit; 4) the closest Skitter buggy (10% driver-kill chance per shot). Tanks, APCs, trucks, turrets and structures are **never** auto-targeted.
- **Movement:** walking speed is unchanged. The Operative keeps walking to its destination while firing; it never stops to shoot.
- **Tapping an enemy** with the toggle on: walk toward it until within 3 tiles, auto-firing on the way (§5.3). Long-press still opens the scope.
- **Mutually exclusive with Hunker:** turning on Hunker turns Run & Gun off, and vice versa. Double-tapping to run keeps the toggle on but suspends firing until the Operative stops running.
- **Consequences:** each pistol shot is a 7-tile noise event, and each kill is witnessed as usual (§9.5), so Run & Gun near a patrol almost always leads to a search or an Alarm.
- **HUD:** the button shows a pistol icon, lit amber when on; the Operative's sprite switches to the pistol-drawn walk cycle.

### 6.5 Equipment
- **C4 charges** (count per mission, §13).
- **Laser designator** (from Mission 5 onward, §14).
- **Binoculars** (passive): standing still, crouched or hunkered with LOS to an **OBSERVE** objective fills its observation bar (§16.1).
- **Medkit** (tap the health bar to use one, 1.5 s, the Operative must be stationary).

### 6.6 Damage feedback
When hit: white hit-flash, a small screen shake, a directional hit indicator at the screen edge, and a warning pulse below 30 HP. On death: mission failed.

---

## 7. Terrain, elevation & line of sight

### 7.1 Terrain types

| Terrain | Move cost (infantry) | Vehicles | Concealment | Notes |
|---|---|---|---|---|
| Grass / dirt / sand | 1.0 | yes | none | |
| Road | 0.8 | yes (×1.3 speed) | none (visibility ×1.1) | Vehicles prefer roads. |
| Tall grass / scrub | 1.1 | yes (flattens it for 30 s) | **0.5** | Units inside are invisible beyond 3 tiles. |
| Light trees | 1.3 | no | 0.7 | Soft LOS blocker (§7.3). |
| Dense forest | 1.6 | no | **0.4** | Hard LOS blocker at ground level. |
| Rocks / boulders | impassable | no | — | Hard LOS blocker. |
| Shallow water / ford | 2.0 | yes (×0.5 speed) | none | Walking noise 3 tiles. |
| Deep water | impassable | no | — | Doesn't block LOS. |
| Snow (deep) | 1.5 | yes | none (visibility ×1.1) | Leaves **tracks** (§8.6). |
| Swamp | 1.8 | no | 0.8 | Walking noise 2 tiles. |
| Concrete / base floor | 0.9 | yes | none | |
| Lava | impassable | no | — | Light source (at night the area counts as lit). |
| Cliff | impassable | no | — | Generated from the elevation layer. |
| Ramp | 1.2 uphill, 1.0 downhill | yes (if road-width 2+) | none | The only way between levels. |

### 7.2 Elevation
- Levels 0–3, stored per tile.
- **Movement:** adjacent tiles with different elevations are connected **only through ramp tiles**. A ramp tile connects its own level to the neighbouring tile one level higher in its ramp direction. Everything else is a cliff.
- **Combat:** attacker above target → +1 rifle range per level (max +2), +15% enemy hit chance. Attacker below target → enemy hit chance −25%.
- **Vision:** see §7.3.

### 7.3 Line of sight (LOS) rules
These are the classic RTS rules, with blocker heights so forests and buildings behave sensibly.

Each tile has:
- `elev` (0–3)
- `blockH` — blocker height: none 0, light trees 1.0 (soft), dense forest 1.5, big rocks 1.0, walls 1.0, buildings 2.0 (per building definition), low cover (sandbags, fences, crates, wrecks, small rocks) **0 — low cover never blocks LOS**.

**A tile T is visible from observer tile O if and only if all of the following hold:**
1. **Range:** distance(O, T) ≤ observer vision radius (Euclidean, in tiles, centre to centre).
2. **High-ground rule:** `elev(T) ≤ elev(O)`. Ground higher than the observer is **never** visible. *Exception:* a higher tile directly adjacent (distance ≤ 1.5) is visible, so a unit standing at the foot of a ramp can peek at the top.
3. **Occlusion:** for every intermediate tile I on the supercover line from O to T (excluding O and T):
   - if `elev(I) > elev(O)` → blocked (a ridge in between),
   - else if `elev(I) + blockH(I) > max(elev(O), elev(T))` → blocked,
   - **soft blockers:** light-tree tiles only block once the line has passed through **2 or more** of them.
4. **Cone (enemies only):** T is within the observer's vision cone or within its peripheral radius (§9.2).

What this produces:
- From level 0, forests and buildings hide what's behind them.
- From level 1, you still can't see past a dense forest (1.5 > 1) but you can see over light trees.
- From level 2 and above, you see over forests. Buildings (2.0) still block unless you are on level 3.
- Units on low ground can't see units on high ground. **A sniper on a cliff edge is invisible to the valley below** until someone climbs up or hears the shots and comes to investigate.

**Implementation**
- `los.js` exposes `canSee(map, ox, oy, tx, ty, opts)` (point-to-point) and `visibleTiles(map, ox, oy, radius)` (ray-cast to every perimeter tile of the radius, marking tiles until blocked).
- The Operative and friendlies use `visibleTiles` for fog (at 10 Hz).
- Enemy perception uses `canSee` against the Operative and friendlies only (cheap), staggered so each enemy checks at 10 Hz but not all on the same frame.
- **Unit-test the rules** with small hand-made maps (see §19.5).

---

## 8. Stealth & detection

### 8.1 Detection meter
Each enemy observer keeps a **detection value 0.0–1.0 for each GOD unit** it can see (the Operative, escorts).

Every tick while the target passes the LOS check (§7.3) and is inside the cone or peripheral radius:

```
fill/sec = baseRate(observer)
         × stanceFactor(target)          // §6.2 table
         × terrainFactor(target tile)    // concealment, §7.1 (1.0 if none)
         × lightFactor                   // day 1.0, night 0.6, lit area 1.0, searchlight beam → instant detect
         × proximity                     // 1.0 − 0.7 × (distance / visionRadius)
         × exposure                      // 2.0 for 2 s after firing the rifle, 1.5 after the pistol
         × difficultyMult                // §18
```
- Outside LOS the value decays at **0.25/s**.
- **Thresholds:** ≥ 0.35 → **Suspicious** (a "?" icon; the observer turns toward the target and stops patrolling). ≥ 1.0 → **Detected** (a "!" icon; the observer goes into Combat, §9).
- **Instant detection:** target within 1.2 tiles of an infantry observer, unless the target is hunkered in concealment.
- **Tall grass rule:** a unit inside tall grass is invisible beyond 3 tiles, whatever else applies.
- **Vehicles & turrets vs hunker:** `stanceFactor = 0`. They can roll right past a hunkered Operative.
- **Sniffer beasts** ignore terrain concealment and hunker within 3 tiles (smell), and detect at 1.5× base rate.

### 8.2 Noise
Noise events have an origin and a radius. Enemies inside the radius who aren't already in Combat become **Suspicious** and go to **investigate** a point near the origin (true origin + a random offset of 2–4 tiles for rifle shots, 1 tile for everything else). When a shot kills someone, the kill-witness and search logic in §9.5 takes over for everyone in the victim's `alertGroup`; plain noise investigation applies only to units outside it.

| Source | Radius (tiles) |
|---|---|
| Running footsteps | 2.5 |
| Walking in shallow water / snow crust / swamp | 3 / 1 / 2 |
| Pistol shot | 7 |
| Sniper rifle shot | 12 |
| Grenade / barrel / fuel-tank explosion | 16 |
| C4 detonation | 20 (and triggers a base **Caution** at minimum) |
| Strategic strike | whole map (base **Alarm**) |

Noise **does not reveal** the Operative's exact location — it sends enemies to search. Combined with high ground, this creates the core loop: shoot, then relocate or hunker.

### 8.3 Bodies
Killed NOT units leave corpses (persisting decals with their blood colour). An unaware enemy whose LOS passes over a corpse tile becomes a **discoverer**: it starts the search sequence in §9.5 at the *Examine* step and raises the base alert to **Caution** after 3 s (by radio) unless killed first. Each body is only "discovered" once. Bodies can't be moved (keeps scope small).

### 8.4 Base alert levels
Each base or outpost group (`alertGroup` in the map data) has a shared level:

| Level | Triggers | Effects |
|---|---|---|
| **Calm** | default | Normal patrols. |
| **Caution** | body found, shot or explosion heard, a Suspicious unit reaching its investigation point and finding nothing | +20% vision radius, patrols move 25% faster and add a search waypoint at the last point of interest. Decays to Calm after 90 s without new events. Each Caution permanently adds +5% vision (max +15%) — the base gets "twitchy". |
| **Alarm** | an Officer finishes a 3 s radio call; someone reaches an Alarm post (siren pylon); the Operative stays Detected for 3 s continuously inside the base; C4 detonation inside the base; strategic strike | Siren sound, red UI edge pulse, **reinforcements** from the Barracks every 20 s (up to the cap in map data), vehicles move to hunt the last known position, all guards go to Alerted. Decays to Caution after 60 s without detection. |

- **Comms Array:** if the group's Comms Array is destroyed, the Alarm only affects units within 12 tiles of the unit that raised it (no base-wide alarm, no reinforcements from distant barracks).
- **Power:** when the group's Power Plant is destroyed or its power is cut, searchlights, turrets and jammers go offline.

### 8.5 Last known position (LKP)
When the Operative leaves the detection of every enemy that had detected it, a **grey ghost silhouette** appears at the LKP for the player. Enemies search around it with an expanding ring of waypoints (radius 2, 4, 6 tiles) for 30 s, then return to patrol at Caution.

### 8.6 Snow tracks (Mission 3)
Walking or running in deep snow leaves footprint decals that fade after 60 s. A patrol whose path crosses fresh tracks becomes Suspicious and follows them in the direction they lead for up to 10 tiles. Roads and rock don't take tracks.

### 8.7 Awareness indicator (HUD)
A single eye icon shows the highest detection state among all enemies: **Hidden** (closed eye), **Suspicious** (half-open, amber, with the fill of the highest meter), **Detected** (open, flashing). A colour-blind option adds shapes (–, ?, !).

---

## 9. Enemy AI

### 9.1 States (per unit)
`UNAWARE → SUSPICIOUS → INVESTIGATING → ALERTED (searching) → COMBAT → RETURNING → UNAWARE`

- **Unaware:** follow behaviour (patrol path, sentry, idle-in-camp animation).
- **Suspicious:** stop, face the stimulus, fill the meter faster (×1.3). Go to Investigating after 2 s or when a noise event arrives.
- **Investigating:** walk to the point of interest, look around 5 s, then return (Caution if the base isn't already).
- **Alerted:** move in pairs toward the LKP, sweep search waypoints, weapons raised (+15% vision).
- **Combat:** fire at the visible target; infantry look for a cover tile within 3 tiles; grenadiers lob at the LKP when no LOS; Officers start the 3 s radio call; vehicles close to their weapon range.
- **Returning:** walk back to the patrol path at the current base alert level.

Implement as a small data-driven finite state machine per unit type, with shared perception (`perception.js`) and an alert manager per `alertGroup` (`alert.js`).

### 9.2 Vision profiles (defaults)

| Observer | Radius | Cone | Peripheral (360°) | Base rate |
|---|---|---|---|---|
| Infantry (all) | 7 | 110° | 1.5 | 1.0 |
| Officer | 7 | 120° | 2.0 | 1.2 |
| Sniffer beast | 6 | 140° | 3.0 (smell) | 1.5 |
| Guard tower gunner | 9 | 90°, sweeps ±60° over 6 s | 2.0 | 1.4 |
| Searchlight (night) | 10 beam, 20° wide | sweeps | — | instant in beam |
| Buggy / truck | 6 | 90° | 1.0 | 0.8 |
| APC / tank | 5 | 70° | 1.0 | 0.8 |
| Gun turret | 8 | 100° | 1.0 | 1.0 |

Plus the terrain elevation of the observer's tile (+1 per level to radius). At night radii are ×0.65 except searchlights. Blizzard (M3) ×0.6 for everyone including the Operative.

### 9.3 Behaviours (map-assignable)
- `patrol(pathId, loop|pingpong)`: waypoints with optional `wait` seconds and `look` directions.
- `sentry(facings[], interval)`: stands, rotates through facings.
- `camp(areaId)`: idles around a campfire/bench area, with random short walks; small vision cone because they're relaxed (×0.8 radius while Unaware).
- `convoy(roadPathId)`: vehicles in a column, 3-tile spacing, with stops.
- `guardPost(buildingId)`: guards the building door, reacts to C4 planting within vision instantly.
- `squad`: 2–4 units share state; the leader patrols and followers keep formation offsets.

### 9.4 Enemy combat
- Infantry hit chance vs the Operative: 60% at ≤3 tiles, falling linearly to 25% at max range. ×0.5 in cover, ×0.5 hunkered, ×0.7 while running, ×1.15 from high ground, ×0.75 from low ground.
- Enemies never cheat: they only shoot at what they can see (LOS + detection), and grenades go to the LKP.

---

## 10. The scope minigame

The scope is the heart of the game. It must feel tactile and tense.

### 10.1 Opening
- Opens when an engagement reaches its firing tile (§5.3) and the Operative is in Crouch, Cover or Hunker.
- The world keeps running at **timeScale 0.2** (slow-motion, not paused). Enemies elsewhere keep moving slowly; if the Operative's awareness state changes, the scope rim flashes amber (Suspicious) or red (Detected).
- Transition: 250 ms iris-in with a lens "clunk" sound.

### 10.2 Layout
- A circular scope, diameter ≈ 90% of screen height, centred. Outside the circle: dark vignette with the HUD dimmed.
- Inside: a **zoomed view** of the area around the target at 4× the world scale, rendered from the world sprites for the background (terrain, props), with the **scope sprite** (the detailed close-up) of each targetable unit drawn in place of its small sprite.
- Crosshair: thin reticle with mil-dots; a range readout ("RNG 7.4") and a wind/sway indicator.
- Scope view can be panned up to ±2 tiles from the original target, so the player can switch to a nearby enemy (or a barrel next to them) without leaving the scope.
- Buttons: **FIRE** (large, bottom-right), **HOLD BREATH** (hold, bottom-left), **EXIT** (top-right X), ammo counter (e.g. "3/5 | 18").

### 10.3 Views and hit zones
The scope sprite shown depends on the angle between the target's facing and the direction to the Operative: **front** (within ±45° of facing the Operative), **back**, **left** or **right**. Hit zones differ per view — for example, a tank's view slit is **only on the front**, so flanking a tank means you can't stop it that way.

Hit zones are listed per unit type in §12, as rectangles/polygons in scope-sprite pixel space, with a **priority** used when zones overlap (higher wins).

### 10.4 Aiming
- **Drag** anywhere to move the crosshair (relative movement, 1:1 in scope pixels; on desktop the mouse moves it directly).
- **Sway:** the crosshair drifts on a smooth two-axis noise curve (for example, the sum of two sines with different periods plus low-frequency noise).
  - Base amplitude 6 scope px.
  - × stance factor (crouch 1.0, cover 0.8, hunker 0.4).
  - × distance factor (1.0 at ≤50% of max range, rising to 1.5 at max range).
  - × 1.3 if the Operative is below 30 HP; × 1.5 for 2 s after taking damage.
- **Hold breath:** while held, sway ×0.2 for up to 3 s; afterwards sway ×1.8 for 2 s (gasp) and holding is unavailable for 4 s. A breath meter arc shows remaining time.
- **Target motion:** targets keep moving (at 0.2 time scale), so leading a walking target is part of the skill.

### 10.5 Firing and resolution
- Tapping **FIRE** fires one round from the crosshair centre.
- **Dispersion:** the impact point is offset by a random amount within radius r, where r = 0 up to 70% of max range and rises linearly to 3 scope px at max range.
- **Resolution:** find the highest-priority hit zone of any unit or prop containing the impact point → apply its effect (§11). If none: miss (a dust puff on terrain, a spark on metal). Misses still make noise.
- **Feedback:**
  - Headshot: the scope freezes for 150 ms, a "HEADSHOT" stamp, a blood burst in the unit's colour, the body drops.
  - Body hit: a smaller burst, the unit staggers and shows a "WOUNDED" tag.
  - Explosive: a big flash that fills the scope, then the scope auto-closes to show the explosion at world scale.
  - Vehicle stop: a crack on the glass, the vehicle judders to a halt, "DISABLED" tag.
- **After firing:** bolt cycle 1.2 s (the reticle kicks up then settles). The scope stays open if valid targets remain in view. Auto-close if: no rounds left in the magazine (reload happens outside the scope), the target died and nothing else hittable is in view, the target leaves LOS, or the Operative takes damage above 15 HP in one hit.

### 10.6 Accessibility
Options: "Assisted aim" (sway ×0.5, hit zones +20% size) and "Reduced motion" (no screen shake, no scope wobble on hits). Both are independent of difficulty.

---

## 11. Combat, damage & explosions

### 11.1 Hit zone effects (sniper rifle)

| Zone | Effect |
|---|---|
| **Head** (any infantry, beast) | Instant kill. |
| **Body / torso** | Halve current HP (round down) and halve move speed until death. The unit is marked **Wounded**. A second body hit on a Wounded unit kills it. |
| **Limbs** (optional zone, small) | Speed ×0.5; no HP change. Counts as a hit for noise purposes. |
| **Grenade belt** (Grenadier) | Detonates: explosion radius 1.5 tiles, damage 80 at centre. |
| **Fuel tank** (Flamer backpack) | Detonates: explosion radius 2.5 tiles, damage 150 at centre, **damages vehicles and buildings**, leaves fire tiles for 6 s (damage 10/s, blocks path for AI). |
| **Rocket pod** (Rocketeer) | Detonates: radius 1.5, damage 100. |
| **Radio pack** (Officer, back view only) | Destroys the radio: this Officer can't call the Alarm. The Officer lives. |
| **Driver** (Buggy, Truck — front and side views) | Vehicle **stops permanently** (Disabled). Passengers dismount after 2 s, Alerted. |
| **View slit** (APC, Light tank, Heavy tank — front view only) | Vehicle **stops permanently** (Disabled). Turret keeps working but with vision radius 3. APC passengers dismount after 2 s, Alerted. |
| **Fuel drum / jerrycan** (Buggy rear, Fuel truck tank) | Explodes: buggy radius 2 (destroys buggy); **fuel truck radius 3, damage 250** (destroys the truck, heavily damages nearby vehicles and buildings). |
| **Gunner** (Guard tower, MG nest) | Kills the gunner; the position is dead until an Alerted infantry unit remans it (takes 10 s after reaching it). |
| **Searchlight lens** (night towers) | Destroys the light (the tower gunner stays). Makes noise. |
| **Explosive barrel / gas cylinder** (props) | Explodes: radius 2, damage 120. |
| **Armour / hull / wall** | Spark, no damage, noise. |

### 11.2 Health and armour (defaults)

| Class | HP | Armour notes |
|---|---|---|
| Infantry | 50 (Flamer 70, Officer 60, Overseer 120) | Pistol damage 20 |
| Sniffer beast | 40 | |
| Buggy | 150 | Pistol can't damage |
| Truck / fuel truck | 200 / 120 | |
| APC | 300 | |
| Light tank | 400 | |
| Heavy tank | 700 | |
| Guard tower | 300 | |
| Gun turret | 500 | |
| Small building | 600 | Barracks, Silo, Jammer tower |
| Large building | 1000 | HQ, Refinery, Power Plant, Vehicle Bay |
| Hive Spire | 3000, "hardened" (§16, Mission 7) | |

### 11.3 Explosions
- Damage falls off linearly from the centre value to 25% at the edge of the radius.
- Damage multipliers: infantry ×1.0, vehicles ×0.7, buildings ×0.5 (C4 uses its own value).
- Explosions chain: barrels, fuel trucks and fuel depots inside a blast detonate 0.2 s later.
- The Operative takes explosion damage like anyone else.
- Visuals: 6–10 frame pixel explosion, smoke column, scorch decal, debris particles, screen shake scaled by distance to the camera.

### 11.4 Enemy weapons (defaults)

| Unit | Weapon | Range | Damage | Rate |
|---|---|---|---|---|
| Husk trooper | rifle | 5 | 8 | 1 burst/1.2 s (3 rounds) |
| Grenadier | grenade | 6 (arc) | 40, radius 1.5 | 1 per 3 s |
| Flamer | flame | 2.5 | 15/tick (cone) | continuous |
| Rocketeer | rocket | 7 | 30 inf / 90 vehicles | 1 per 3 s |
| Officer | pistol | 4 | 12 | 1 per 0.8 s |
| Sniffer beast | bite | 1 | 18 | 1 per 1 s |
| Guard tower | MG | 8 | 6 | 5 rounds/s bursts |
| Gun turret | cannon | 8 | 50, radius 1 | 1 per 2.5 s |
| Buggy | MG | 6 | 6 | bursts |
| APC | MG | 6 | 6 | bursts |
| Light tank | cannon | 7 | 60, radius 1 | 1 per 3 s |
| Heavy tank | twin cannon | 8 | 80, radius 1.5 | 1 per 3.5 s |

---

## 12. Units & structures roster

All names are original. Each unit definition lives in `src/entities/defs.js` (stats) and `src/render/spriteData/` (sprites and hit zones).

### 12.1 NOT infantry
Tall, lanky humanoids with too many joints, glowing eyes and plated carapaces; charcoal armour with lime and violet trim.

| Unit | Role | Scope hit zones (priority high→low) |
|---|---|---|
| **Husk Trooper** | Rifle infantry, the bulk of patrols | Head, Torso, Limbs |
| **Lobber** (Grenadier) | Anti-cover, throws grenades at the LKP | Head, **Grenade belt** (waist, front & sides), Torso |
| **Scorcher** (Flamer) | Short-range area denial, guards base interiors | Head, **Fuel tank** (back view: large; side views: partial), Torso |
| **Launcher** (Rocketeer) | Anti-vehicle; the convoy's main threat in M4 | Head, **Rocket pod** (shoulder, all views but front), Torso |
| **Warden** (Officer) | Leads squads; calls the Alarm by radio | Head, **Radio pack** (back only), Torso |
| **Sniffer** (beast) | Fast quadruped, smells hunkered units within 3 tiles | Head, Body |
| **Overseer Vrask** (M3 boss) | Unique commander, 2 bodyguards | Head (helmet: first headshot only knocks the helmet off; a second headshot kills), Torso |

### 12.2 NOT vehicles

| Vehicle | Role | Scope hit zones |
|---|---|---|
| **Skitter** (buggy) | Fast road patrol, MG | Driver (front/side), Jerrycan (rear), Hull |
| **Hauler** (truck) | Transport, 6 infantry | Driver (front/side), Hull |
| **Fuel Hauler** | Supply; huge explosion | Driver (front/side), **Tank** (side/rear), Hull |
| **Crawler** (APC) | Armoured transport, 4 infantry | **View slit** (front only, 4×2 scope px), Hull |
| **Brute** (light tank) | Armoured patrol | **View slit** (front only, 3×2 px), Hull, Turret |
| **Juggernaut** (heavy tank) | Base defence, M7 | **View slit** (front only, 3×2 px), Hull, Turret |

### 12.3 NOT structures

| Structure | Size (tiles) | Function | C4-able | Snipeable parts |
|---|---|---|---|---|
| **Command Nexus** (HQ) | 4×3 | Mission objective in some maps | yes | — |
| **Power Plant** | 3×3 | Powers turrets, searchlights and jammers in its `alertGroup` | yes | Exposed coolant cell (1 per plant, **explodes, 30% building damage**) |
| **Barracks** | 3×2 | Spawns reinforcements during Alarm | yes | — |
| **Vehicle Bay** | 4×3 | Spawns a vehicle once per Alarm | yes | — |
| **Spore Refinery** | 4×4 | Target in M5 | yes | — |
| **Spore Silo** | 2×2 | Explodes violently when destroyed (radius 3) | yes | — |
| **Comms Array** | 2×2 | Enables base-wide Alarm | yes | Dish (disables for 60 s) |
| **Jammer Tower** | 2×2 | Blocks strategic strikes within 14 tiles (§14) | yes | — |
| **Guard Tower** | 1×1 (tall) | Gunner post | yes | Gunner, Searchlight |
| **Gun Turret** | 1×1 | Armoured, needs power | yes | — |
| **MG Nest** | 2×1 sandbag | Gunner post, gives cover | no | Gunner |
| **Alarm Pylon** | 1×1 | Enemy runs here to raise the Alarm | yes | Siren (disables it) |
| **Detention Block** | 3×3 | Holds prisoners in M6 | no | — |
| **Fuel Depot** | 2×2 cluster of barrels | Chain explosion, radius 3 | yes | Any barrel |
| **Shield Generator** | 2×2 | Makes the Hive Spire hardened (M7) | yes | — |
| **Hive Spire** | 4×4 (very tall, `blockH` 3) | Final target | only when not shielded (§16) | — |
| Walls, gates, fences | 1×1 segments | Walls block movement and LOS (1.0); fences block movement, not LOS | walls/gates | — |

### 12.4 Props
Sandbags, crates, wrecks, low rocks (all **cover**, `blockH` 0); explosive barrels; gas cylinders; campfires (light source at night); trees (several variants per biome); spore crystal clusters (glow at night, slight light source); ruins; bones; supply crates (ammo +10, medkit, C4 +1 — per map data).

---

## 13. C4 demolition

- Charges per mission: set in mission data (M1: 0, M2: 3, M3: 2, M4: 2, M5: 3, M6: 2, M7: 4).
- **Planting:** the Operative must stand on a tile adjacent to the structure's footprint (or adjacent to a Disabled vehicle, or on a bridge tile marked `demolishable`).
  - Tap the target (or the C4 button, then the target) → walk there → a **2.5 s plant** animation. During planting the Operative counts as Crouch for visibility, but any guard with a `guardPost` on that building detects instantly if it has LOS.
  - Interrupted if the Operative takes damage or the player taps elsewhere (the charge isn't used up).
- **Fuse:** 10 s by default, with a beeping indicator and a countdown above the charge. Option in settings: "Remote detonation" (a Detonate button replaces the fuse; fun for escorts). Default: timer.
- **Detonation:** destroys any small or large building outright (except hardened structures), destroys vehicles, and does explosion damage radius 2.5 (value 200). Noise 20 tiles; the base alert goes to at least **Caution**, and to **Alarm** if inside the base's footprint area.
- Destroyed buildings leave rubble (walkable, counts as cover) and burning debris for 20 s.

---

## 14. Strategic strike (laser designator)

Granted in the Mission 5 briefing and available in Missions 5–7.

- **Charges:** M5: 1, M6: 1, M7: 2 (+1 optional from a supply cache).
- **Activation:** tap the **Designator** button → targeting mode (world view dims slightly, a red dashed ring shows designator range = **12 tiles + 1 per elevation level of advantage**) → tap a target point with LOS.
- **Requirements:** the Operative must be in **Crouch, Cover or Hunker**. The target point must not be within **14 tiles of an operational Jammer Tower** (show the jammer coverage as a violet hatched overlay while targeting; a refusal shows "STRIKE BLOCKED — JAMMER").
- **Channelling (6 s):**
  - A thin laser line from the Operative to a pulsing dot at the target. This laser is visible to the enemy.
  - Any enemy with LOS to the target dot **or** to any tile of the beam within 4 tiles of it becomes **Suspicious** (they look along the beam toward the Operative).
  - The channel breaks if the Operative moves, changes stance, or takes damage above 10 in one hit. On break, the charge is **not** used up.
- **Inbound:** when the channel completes, the charge is spent and OVERWATCH announces "STRIKE CONFIRMED. IMPACT IN 8." A countdown appears on screen; a warning ring shows the blast radius on the ground. **Base Alarm** triggers map-wide immediately (they hear it coming).
- **Impact:**
  - Inner radius **5 tiles:** all units and non-hardened structures destroyed.
  - Outer radius **5–8 tiles:** 60% of max HP damage to everything (infantry die, vehicles and buildings survive damaged).
  - Flash radius **8–12 tiles:** infantry are blinded for 5 s (vision 0, can't detect); the Operative too if looking at it without Hunker.
  - Crater (impassable 3×3 centre, rubble ring), fallout tiles within 5 tiles for 60 s (4 damage/s to anyone inside).
  - The Operative dies if inside the outer radius. The warning ring makes this clear.
- **Visuals:** white-out 3 frames, a pixel mushroom cloud (16-frame animation, ~64×96 px), shockwave ring, heavy screen shake, all fog within 12 tiles revealed for 10 s.
- **Hardened structures** (the Hive Spire while shielded) take only 25% damage.

---

## 15. Friendly units: escort, rescue, extraction

### 15.1 Common
- Friendlies are vision sources for the fog (radius 6).
- The NOT detect and attack them with the same rules (§8, §9); civilians have stanceFactor 1.0 walking and 0.5 when hiding.
- If a mission-critical friendly dies → mission failed (unless the objective allows losses, e.g. "2 of 3 trucks").

### 15.2 Convoy trucks (M4)
- **GOD Medical Truck:** HP 250, speed 2.2 tiles/s on road, follows a road path from checkpoint to checkpoint.
- **Convoy order button** on the HUD: **ADVANCE** / **HOLD**. On Advance, the convoy drives to the next checkpoint and stops there automatically. Trucks also auto-stop if a *visible* (to GOD) enemy is within 6 tiles of the lead truck.
- Trucks can't be ordered off the road; scripted detours exist (M4).

### 15.3 Scientists / VIPs / prisoners (M3 optional, M6)
- HP 40, walk 1.4 tiles/s, can't run for more than 3 s at a time (they're exhausted).
- **Freed** by the Operative standing adjacent for 2 s (a "cutting restraints" bar).
- Behaviour: **Follow** (stay 1–3 tiles behind the Operative, copying Crouch/Hunker as "hide") or **Hold** (hide at the current spot, stanceFactor 0.5). Tap a friendly to toggle; a group toggle button appears when 2+ are following.
- When fired upon: move to the nearest cover tile within 3 tiles and hide for 3 s.

### 15.4 Extraction
- The **LZ** is a marked area. When exfil is active, standing in it for 3 s (with any escorts inside too) calls the **GOD dropship**: it arrives in 10 s (announced), lands for 5 s, the mission ends on boarding.
- Enemies within 10 tiles of the LZ delay landing (the dropship circles) until cleared or the Operative pops smoke (1 smoke grenade in exfil missions: it creates a 3×3 concealment cloud for 15 s).

---

## 16. Missions & maps

### 16.1 Objective types (engine)

| Type | Completion |
|---|---|
| `OBSERVE(areaId, seconds)` | The Operative has LOS to the area's centre within 8 tiles, is Crouch/Cover/Hunker, and isn't Detected, for the given seconds (cumulative). |
| `DESTROY(entityIds, minCount)` | Given entities destroyed. |
| `KILL(unitId)` | Unit dead. |
| `REACH(areaId)` | The Operative is in the area. |
| `ESCORT(unitIds, areaId, minCount)` | Enough friendlies alive inside the area. |
| `RESCUE(unitIds)` | Units freed. |
| `EXTRACT(areaId)` | The dropship sequence completes (§15.4). |
| `SURVIVE(seconds)` | Timer runs out. |
| `STEALTH` (optional) | No base Alarm during the mission. |
| `CUSTOM(fnName)` | Escape hatch for mission-specific logic. |

Objectives have `primary | secondary`, can be `hidden` until revealed by a trigger, and are listed in the HUD tracker.

### 16.2 Ratings
Each mission awards up to 3 stars: ★ complete; ★ no base Alarm raised; ★ under par time. Medals (saved per mission): **Surgeon** (all rifle kills were headshots), **Phantom** (never Detected), **Pacifist-ish** (killed only mission targets and units that detected you), **Demolitions** (all secondaries done).

### 16.3 Map schematics
Each map below has a zone schematic. **Schematics are indicative, not literal** — one character is about 4×4 tiles. The agent builds the full-resolution map in the map format (§19.3), keeping the zones, routes, elevations and chokepoints described.

Schematic legend:
```
.  open ground (biome base)      ,  tall grass / scrub       t  light trees     T  dense forest
o  boulders (impassable)         ~  deep water               -  shallow water / ford
=  road                           H  bridge                    /  ramp
1 2 3  plateau at that elevation (open ground at level 0 unless a digit)
B  base structures   w  wall     O  outpost   A  guard tower   *  objective
P  player start      X  extraction LZ        J  jammer tower  S  sniffer kennel
```

### 16.4 General map rules
1. **Scale:** each map has at least 3 distinct "zones" (outposts, bases, patrol sectors) and 40–90 NOT units at start.
2. **Two routes minimum** to every primary objective; the most direct one is the most guarded.
3. **Strategic targets sit on high ground or behind walls/water**, with at least one sniper overwatch spot (elevated, concealed) that can see into the objective area but can't reach it.
4. **Patrol rhythm:** every patrol loop is 30–120 s long so the player can learn it; no two neighbouring patrols share a period (create windows).
5. **Supply:** 1–3 supply crates per map, placed on risky side routes.
6. **Variety of flora:** at least 3 tree/plant variants per biome, plus ground decoration (flowers, stones, scrub, bones, tyre tracks).
7. **Verify with the map validator** (§19.4) — every objective reachable, no enemy spawned inside a wall, every ramp valid.

---

### Mission 1 — "First Light" (Reconnaissance, tutorial)
- **Biome:** temperate river valley, spring morning. **Size:** 96×72. **Time:** day.
- **Briefing:** "The NOT have crossed the Varna River. We don't know how many. WREN, find out and get out. No heroics."
- **Loadout:** rifle 20, C4 0, medkit 0.
- **Objectives:**
  1. OBSERVE the radio outpost on Cherry Hill (A), 4 s.
  2. OBSERVE the motor pool at the north bridge (B), 4 s.
  3. OBSERVE the spore field (C), 4 s.
  4. EXTRACT at the NW LZ.
  - Secondary: KILL Warden Kesh (patrols the motor pool). Secondary: STEALTH.
- **Layout:** the river runs north–south through the middle (deep, two bridges plus a ford in the centre). West bank: forests and tall grass (safe learning space). East bank: the NOT sector. Cherry Hill (level 1) with a guard tower and radio mast; a ramp on its west side, with a quieter goat trail from the north. The spore field lies in tall grass with Husk harvesters (unarmed workers, 30 HP, flee and raise Caution).
- **Enemies (~40):** 24 Husk troopers, 4 Lobbers, 2 Wardens, 1 guard tower, 2 Skitter road patrols, 3 unarmed harvesters.
- **Tutorial prompts** (dismissible, triggered by areas): move / run / crouch / hunker, reading vision cones, high ground ("From the hill you'll see them. They won't see you."), the first scope shot on a lone sentry at the ford, noise, bodies.

```
X.ttTTTT..~~.....,,,TTTT
..tTTTT...HH==O*..,,,.TT
.tTTT.....~~..=...,*,,.T
tTT..,,...~~..=....,,...
TT..,,,...~~..=....1111.
T..,,,....~~..=...11A*1.
..,,,..tt.--..=...1/111.
.,,,..tTT.~~..=....1111.
,,...tTTT.~~..=.........
,...tTTT..~~..==========
...tTT....HH==O.....tTTT
..tTT.oo..~~.......tTTTT
.tTT..oo..~~.,,,..tTTTTT
tTT.......~~.,,,,.TTTTTT
TT...,,...~~..,,..TTTTTT
T...,,,...~~.....TTTTTTT
P..,,,,...~~....TTTTTTTT
..,,,,....~~...TTTTTTTTT
```

---

### Mission 2 — "Blackout" (Sabotage)
- **Biome:** arid scrubland with red-rock mesas, late afternoon. **Size:** 112×80. **Time:** day (golden light).
- **Briefing:** "Their forward base on Anvil Mesa runs on one Power Plant. Take it down and every turret up there goes blind."
- **Loadout:** rifle 25, C4 3, medkit 0.
- **Objectives:**
  1. DESTROY the Power Plant on Anvil Mesa (level 2).
  2. REACH the exfil point in the SE and EXTRACT.
  - Secondary: DESTROY the Fuel Depot (can be sniped from the overwatch ridge — a big chain explosion). Secondary: DESTROY the Comms Array (before the plant, this stops the base-wide Alarm).
- **Layout:** the mesa (level 2) fills the NE quarter, surrounded by a level 1 shelf.
  - **Route 1 (obvious):** the switchback road from the south — a gate, 2 guard towers, 2 gun turrets (powered), an MG nest.
  - **Route 2:** a narrow goat path up the north cliff (level 1 → 2 ramp, one tile wide) through boulders, guarded by a Warden and a Sniffer pair on a 60 s loop.
  - **Overwatch:** the West Ridge (level 2, separate from the mesa) looks into the fuel depot and the base's west half, but can't see the plant (blocked by the Barracks).
  - The power cut takes the turrets and the Comms Array offline; the base goes to Alarm on detonation, so the exfil is a chase.
- **Enemies (~55):** 30 Husks, 6 Lobbers, 4 Scorchers, 3 Wardens, 2 Sniffers, 2 guard towers, 2 gun turrets, 1 MG nest, 2 Skitters, 1 Brute (arrives on Alarm).

```
oooo..,,...1111111111111ooo.
o...,,,..1112/222222222111o.
...,,,..11122BB22B222222211.
.o..,,..1122B*B222wwA22221..
2222.....1122B2222w=w222211.
2**2.....11222222ww=w22221..
2222..,,..1122222J=2222211..
.22...,,...11111111=1111....
..........,,,......=...,,,..
..o.......,,,,....==....,,..
...,,,.......=====....ooo...
..,,,,.....==........o,,o...
P.,,,....===.........,,.....
..,,....==......ooo....,,..X
```
(Left: West Ridge overwatch at level 2 with the fuel-depot sightline marked `**`; `J` here marks the Comms Array.)

---

### Mission 3 — "Needle" (Assassination)
- **Biome:** alpine pass, snow, pine forests, frozen lake. **Size:** 120×88. **Time:** day with periodic blizzards (every 3 min for 40 s: vision ×0.6 for everyone, snow tracks wiped).
- **Briefing:** "Overseer Vrask inspects the pass garrisons daily in an armoured Crawler. He never leaves it except at the outposts. One shot, WREN."
- **Loadout:** rifle 25, C4 2, medkit 1.
- **Objectives:**
  1. KILL Overseer Vrask.
  2. EXTRACT at the lake LZ.
  - Secondary: RESCUE a captured GOD pilot at Outpost Ridge (hidden objective, revealed when observed; the pilot becomes a Follow unit).
- **Layout:** a serpentine mountain road links three outposts (level 0 valley → level 1 → level 2 → level 3 summit radar). Vrask's convoy (Skitter lead, Crawler with Vrask + 2 bodyguards, Brute rear) loops through the outposts on a ~4 min cycle, stopping at each for 30 s where Vrask dismounts and walks a short inspection route.
  - **Ways to do it:** (a) headshot during an inspection stop — from overwatch on the frozen lake cliffs; (b) shoot the Crawler's view slit (front only) on a straight road section, then snipe Vrask when he dismounts; (c) C4 on the demolishable bridge before the convoy crosses.
  - Vrask's helmet takes the first headshot (§12.1). After the first shot, the convoy goes to Alarm and speeds to the summit bunker; if he reaches it, he's unreachable for 2 min.
- **Snow tracks** (§8.6) are active. Pines give dense-forest cover; the frozen lake is open ground (visibility ×1.2).
- **Enemies (~60):** 30 Husks, 4 Lobbers, 4 Launchers, 4 Wardens, 4 Sniffers, 3 guard towers, convoy (1 Skitter, 1 Crawler, 1 Brute), 2 Skitter patrols.

```
TTTTTT....3333333....TTTTTT
TTTT....33333A3333=...TTTT.
TT..,,..333B*B333=.....TT..
T..,,,...3333333/=.......T.
..TTT.....22222/2=..,,,....
.TTTT....2222222=..,,,,..TT
TTTT....22O22222=.......TTT
TTT.....2222222=....TTTTTTT
.T....11111111=.....TTTTTT.
....111O11111=.......TT....
...1111111=HH=........~~~..
..11111==......TTT...~~~~~.
P........TTTTTTTTT..~~~~~~.
..TTT...TTTTTTTTT...~~~X~~.
```
(`O` = outposts; the bridge `HH` is demolishable; `~` is the frozen lake — walkable ice at level 0 with a level 1 cliff shelf on its north shore for overwatch.)

---

### Mission 4 — "Lifeline" (Escort)
- **Biome:** desert canyon, dry riverbed, dusk into night at the end. **Size:** 128×72 (long, west→east). **Time:** day, fading to dusk over the mission.
- **Briefing:** "Three medical trucks. One canyon. The NOT own the rims. You walk the high ground and keep them alive."
- **Loadout:** rifle 30, C4 2, medkit 1.
- **Objectives:**
  1. ESCORT at least 2 of 3 GOD Medical Trucks to Fort Dawn (east edge).
  - Secondary: RESCUE a downed pilot in a side canyon. Secondary: DESTROY the roadblock Brute without the convoy taking damage.
- **Layout:** the canyon floor (level 0) holds the road. Both rims are level 2, with side ramps every ~25 tiles. The Operative mostly moves along the rims ahead of the convoy.
  - **Checkpoint 1:** Launcher ambush on the north rim (3 Launchers + Warden). They only fire at trucks within 7 tiles.
  - **Checkpoint 2:** the NOT roadblock — a Brute (facing west, so its view slit faces the approaching convoy), sandbags, a Fuel Hauler parked beside it (sniping its tank destroys both).
  - **Checkpoint 3:** a blown bridge; the convoy is scripted to detour through the dry riverbed (shallow, slow) past a Lobber nest on the south rim.
  - **Checkpoint 4:** final approach, a NOT Crawler squad counterattacks from the north; survive 60 s at the fort gate.
- **Enemies (~50):** 24 Husks, 6 Lobbers, 8 Launchers, 3 Wardens, 1 Brute, 1 Fuel Hauler, 2 Crawlers (scripted), 2 Skitters.

```
2222222222/222222222222222222/2222222222
22A2222222222222,,2222222222222222222222
..................................======
P=====1=======2=====..3...........=  X  
..................---~~~---..4.....=====
2222222222222/2222222222222222/222222222
2222222222222222222222222222222222222222
```
(Numbers on the canyon floor mark checkpoints 1–4. X = Fort Dawn. `---~~~---` is the dry riverbed detour around the blown bridge.)

---

### Mission 5 — "Sunhammer" (Sabotage — the laser designator arrives)
- **Biome:** tropical jungle river delta, humid haze. **Size:** 128×112. **Time:** day.
- **Briefing:** "High Command has cleared you for a strategic strike. The NOT Spore Refinery sits on Delta Island under two jammer towers. Kill the jammers. Paint the target. Get clear."
- **Loadout:** rifle 25, C4 3, medkit 1, **designator 1**.
- **Objectives:**
  1. DESTROY Jammer Tower West (on Monkey Hill, level 2, north-west).
  2. DESTROY Jammer Tower East (inside the refinery compound — can alternatively be taken offline by destroying the island Power Plant).
  3. DESTROY 80% of the Spore Refinery complex (Refinery, 2 Silos, Power Plant, Vehicle Bay). *Intended solution: the strike.*
  4. EXTRACT at the boat LZ (south).
- **Tutorial:** the first time the designator is selected, a guided prompt explains range, the jammer overlay, channelling and the blast ring.
- **Layout:** river channels (deep, crossable only at 3 rope bridges and 2 fords) split the map into five islands. Dense jungle gives lots of concealment but **Sniffer kennels** patrol the jungle paths. Delta Island is walled, with the refinery in the centre; the best designator spot is the Old Temple ruin (level 2, south-east, a 10-tile sightline into the compound, guarded by a Sniffer kennel). Jammer West's 14-tile coverage reaches the west half of the compound and Jammer East covers the rest, so **both** must be down before the refinery can be targeted.
- **Enemies (~70):** 34 Husks, 6 Lobbers, 6 Scorchers, 4 Launchers, 4 Wardens, 8 Sniffers (2 kennels), 3 guard towers, 2 gun turrets, 2 Brutes, 2 Skitters, refinery harvesters.

```
TTTTTT~~TTTTTTTTTTT~~TTTTTTTT
T222TT~~TTTT,,TTTTT~~TTTTSTTT
T2J2T-~~TTT,,,,TTTT~~TTTTTTTT
T/22TT~~T..........~~TTTTTTTT
TTTTT~~~~H~~~~~~~~~~~~~TTTTTT
TTTT~~.wwwwwwwwwwww.~~~TTTTTT
TTT~~..wBB.B*B.BBw..~~~TTTTTT
P.T~~..w.B*BJBB..w...~~TT222T
TTT~~..wBB.B*B.BBw...~~~T222T
TTTT~~.wwwwwwwwwwww.~~~~~/22T
TTTTS~~~~~~~-~~~~~~~~~~~TTTTT
TTTTTTTT,,,~~TTTTTTTTTTTTTTTT
TTTTTTTTTTT~~~~~~~~X~~~~~~TTT
```
(`J` = jammers; the level 2 block on the right is the Old Temple overwatch.)

---

### Mission 6 — "Ghost Walk" (Rescue & exfiltration, night)
- **Biome:** swamp and a ruined river town at night, rain. **Size:** 112×112. **Time:** night (vision ×0.65, searchlights, campfires and spore crystals are light sources).
- **Briefing:** "Three of our scientists are in the NOT detention block at Saint Ives. Bring them home. They're not soldiers — keep them in the dark."
- **Loadout:** rifle 25, C4 2, medkit 2, designator 1, smoke 1.
- **Objectives:**
  1. RESCUE Dr. Adler, Dr. Okafor and Dr. Lind (Detention Block, town centre).
  2. ESCORT all 3 to the north LZ and EXTRACT.
  - Secondary: DESTROY the Vehicle Bay (prevents the Brute pursuit). Secondary: STEALTH.
- **Special rules:**
  - **Shift change:** 60 s after the first cell is opened, the guard shift notices and the base goes to **Alarm** automatically (a countdown shows). Plan the route out before opening the cells.
  - Searchlight towers (4) sweep the town squares; shooting the lens kills the light (noise).
  - The designator can be used to blow the town gate and the pursuing column at once — or saved for the Brute column that arrives on Alarm.
- **Layout:** the ruined town sits on a level 1 rise in a swamp basin. Walls and ruins make lots of hard LOS blockers (a close-quarters map). North of town: the swamp (slow, noisy, excellent concealment) and a sunken causeway road to the LZ on a level 1 knoll. Alternative exit: the old sewer culvert (a tunnel entity: enter at one end, exit at the other in 4 s, one Sniffer inside).
- **Enemies (~65):** 32 Husks, 6 Lobbers, 6 Scorchers, 5 Wardens, 6 Sniffers, 4 searchlight towers, 2 MG nests, 2 Brutes + 2 Crawlers (on Alarm), 2 Skitters.

```
,,,,,,,,,,1111X11,,,,,,,,,,,
,,,,,-,,,,,11111,,,,,-,,,,,,
,,-,,,,,,,,,=,,,,,,,,,,,-,,,
,,,,,,T,,,,,=,,,,,T,,,,,,,,,
,,,,1111111wHw1111111,,,,,,,
,,,111A.B.....B..A.111,,,,,,
,,,11..B.B.*B..B....11,,-,,,
,,,11...B.[*].B..B..11,,,,,,
,,,11..B...*....B...11,,,,,,
,,,111A..B....B..A.111,,,,,,
,,,,1111111w=w111111,,,,,,,,
,-,,,,,,,,,,=,,,,,,,,,,T,,,,
P,,,,,,,,,,,=,,,,,,,,,,,,,,,
```
(`[*]` = Detention Block; `A` = searchlight towers; `H` north gate; the culvert runs under the west wall.)

---

### Mission 7 — "Hive Heart" (Final assault)
- **Biome:** volcanic badlands, ash, lava rivers. **Size:** 128×128. **Time:** dusk (vision ×0.85; lava lights the area).
- **Briefing:** "The Hive Spire coordinates every NOT army on the continent. It sits under a shield, behind three jammers, on top of a volcano. Two strikes are prepped. Make them count."
- **Loadout:** rifle 30, C4 4, medkit 2, designator 2, smoke 1.
- **Phases (objectives revealed in order):**
  1. **Recon:** OBSERVE three intel points (the outer camps) → reveals jammer and shield locations on the minimap.
  2. **Sabotage:** DESTROY Jammer Towers North, East and South (or cut their Power Plant — it powers two of the three).
  3. **Breach:** DESTROY the Shield Generator inside the inner compound with C4. *(Alternative: two strikes on the Spire while shielded do 25% + 25% plus follow-up — not enough on its own; the design intends that the player must breach.)*
  4. **Strike:** designate the Hive Spire (1 strike destroys it when unshielded).
  5. **Escape:** SURVIVE the counterattack and EXTRACT at the south-west LZ; lava vents erupt along the old road (scripted fire tiles), so take the ash-field route.
  - Secondary: find the supply cache (+1 designator charge). Secondary: STEALTH through phase 3.
- **Layout:** the Spire sits on the caldera plateau (level 3) inside walls with 2 gates; an inner compound ring (level 3) with Juggernauts and gun turrets. The level 2 terrace holds the barracks and vehicle bays. Level 1 foothills hold the outer camps. Lava rivers (impassable, lit) cut the approaches; 3 ramps to level 2, 2 to level 3. The best designator spot: the Ash Needle (a lone level 3 pillar to the east, reachable by a narrow ramp, 11 tiles from the Spire).
- **Enemies (~90):** 40 Husks, 8 Lobbers, 8 Scorchers, 8 Launchers, 6 Wardens, 6 Sniffers, 3 Juggernauts, 3 Brutes, 3 Crawlers, 4 gun turrets, 4 guard towers, 3 Skitters.

```
......1111111J1111111..........
....111122222222222221111......
...11122222wwwwwww222221111....
..1112222ww3333333ww22222111...
..112222w33B33333B33w22222J1..3
.1122222w333[SPIRE]3w2222211..3
.1122222w333333G3333w222221/..3
..112222ww33333333ww22222111...
...1112222wwww=wwww2222211.....
....J11112222222/2222111.......
~~~~~~~~1111111=111111~~~~~~~~~
.......,,,.....=.....,,,.......
X......,,,,...===....,,,,.....P
```
(`G` = Shield Generator; `J` = jammers; the `3` column on the far right is the Ash Needle overwatch; `~` = lava river with crossings at the road bridge and one ford of cooled lava rock in the west.)

---

## 17. UI, HUD, menus, audio

### 17.1 Visual language
A 90s military terminal: riveted dark-green metal panels, bevelled buttons, green phosphor text with amber warnings, a pixel font (original, 5×7 and 8×8 variants authored in code), scan-line overlay on menus (optional setting).

### 17.2 HUD layout (landscape)
```
┌──────────────────────────────────────────────────────────────┐
│ [OBJECTIVES ▾]  ☐ Observe radio outpost         ┌─────────┐ │
│                 ☐ Observe motor pool            │ MINIMAP │ │
│                                                  │         │ │
│                                                  └─────────┘ │
│                                                   [⌖ centre] │
│                                                              │
│  OVERWATCH: "Patrol inbound, north."                          │
│                                                              │
│ [♥▮▮▮▮▮▮▯▯] [👁 Hidden]  RIFLE 5/5|18          [COVER][HUNK] │
│  stance: CROUCH                                 [C4 ×3][⚡×1] │
└──────────────────────────────────────────────────────────────┘
```
- **Minimap** (96×72 logical px): explored terrain, the Operative (white blip), friendlies (blue), visible enemies (NOT lime), objectives (pulsing amber), jammer coverage (violet hatch, M5+). Tap to jump the camera.
- **Objectives panel** collapses to one line.
- **OVERWATCH ticker:** one line of radio text with a typewriter effect, a queue, max 3 s per line.
- **Contextual buttons:** C4 only if charges remain; Designator only from M5; Convoy ADVANCE/HOLD in M4; Follow/Hold group toggle when escorts are present.
- **World-space UI:** a subtle ring under the Operative; `?`/`!` icons above enemies; the LKP ghost; the C4 countdown; the strike warning ring.

### 17.3 Screens
1. **Title** — "WESTWOOD SNIPER" logo in pixel type, animated background (a slow pan over Mission 1's map with patrols running), Start / Continue / Settings / Credits.
2. **Campaign map** — an original stylised world map with 7 mission nodes connected by a dotted line; locked ones greyed; stars and medals per node.
3. **Briefing** — typewriter text from OVERWATCH, a small overhead preview of the mission area (fog-covered with objective markers), loadout list, "Deploy" button.
4. **In-game pause** — Resume, Restart, Objectives, Settings, Quit to map.
5. **Debrief** — mission result, stars, medals, stats (time, kills, headshots, times detected, alarms raised, shots fired, accuracy), Continue.
6. **Settings** — music volume, SFX volume, difficulty, assisted aim, reduced motion, colour-blind icons, handedness, scan-lines, "Remote C4 detonation".
7. **Credits.**

### 17.4 OVERWATCH lines (examples; all original)
"WREN, OVERWATCH. You're on the ground." · "Patrol inbound." · "They've found a body." · "You've been spotted." · "Alarm raised. Reinforcements incoming." · "Target down." · "Charge set." · "Structure destroyed." · "Strike confirmed. Impact in eight." · "Jammer offline." · "Dropship inbound. Hold the LZ." · "Objective complete." · "WREN is down. Mission failed." · "Mission accomplished. Come home."

### 17.5 Sound effects
All procedurally synthesised with WebAudio (write a tiny sfxr-style generator in `sfx.js` — oscillators, noise, envelopes, filters): rifle crack with echo tail, bolt cycle, pistol pop, suppressed-feeling footsteps per terrain, scope iris clunk, heartbeat in scope, breath hold/gasp, explosion (layered noise + low sine), C4 beep, siren, radio squelch before OVERWATCH lines, laser hum, strike incoming whistle, nuclear boom with long rumble, NOT vocal chitters (pitched noise bursts), vehicle engines (looping filtered saw).

### 17.6 Music
Original procedural chiptune: a menu theme (driving industrial military, ~110 BPM), a stealth ambient loop (low pulse, sparse percussion), and an alarm/combat loop that crossfades in on Alarm and out on Caution. Composed as pattern data (note arrays) played by a small tracker in `music.js`. **Must not quote or imitate recognisable existing game themes.**

### 17.7 Difficulty

| | Recruit | Operative (default) | Ghost |
|---|---|---|---|
| Detection rate × | 0.7 | 1.0 | 1.3 |
| Enemy damage × | 0.6 | 1.0 | 1.3 |
| Scope sway × | 0.8 | 1.0 | 1.2 |
| Hit zone size × | 1.2 | 1.0 | 0.9 |
| Alarm decay | faster (45 s) | 60 s | slower (90 s) |

### 17.8 Save data
`localStorage` key `westwood-sniper:v1` → `{ unlocked: n, missions: { m1: { stars, medals[], bestTime } }, settings: {…} }`. Missions 6 and 7 have one mid-mission **checkpoint** each (after rescue; after the shield is down) — saved in memory only for the current run (restart from checkpoint on death).

---

## 18. Tuning file (balance defaults)

All numbers in this spec go into **`src/config/balance.js`**, one exported object grouped by section (`operative`, `stances`, `weapons`, `detection`, `noise`, `ai`, `scope`, `explosions`, `units`, `structures`, `c4`, `strike`, `difficulty`). No gameplay number may be hard-coded elsewhere. A debug panel (dev builds) can edit the values live.

---

## 19. Architecture, data formats & tooling

### 19.1 Folder layout
```
/index.html
/SPEC.md                  ← this document
/DECISIONS.md             ← agent logs choices made where the spec was silent
/src
  main.js                 bootstrap, scene manager
  /config   balance.js, palette.js, keys.js
  /core     loop.js (fixed step), input.js (gestures), camera.js, rng.js, events.js (pub/sub), time.js
  /world    map.js (load/decode layers), tiles.js (terrain defs), autotile.js (cliffs, shores),
            los.js, fog.js, pathfinding.js (A*, elevation-aware), noise.js
  /entities entity.js, operative.js, infantry.js, vehicle.js, structure.js, friendly.js, props.js, defs.js
  /ai       perception.js, fsm.js, behaviours.js, alert.js (per alertGroup), squads.js
  /combat   weapons.js, damage.js, explosions.js, projectiles.js
  /scope    scope.js (scene overlay), sway.js, hitzones.js
  /strike   designator.js, strike.js
  /missions runner.js, triggers.js, objectives.js, m1.js … m7.js
  /render   renderer.js, sprites.js (compiler), particles.js, decals.js, /spriteData/*.js, font.js
  /ui       hud.js, minimap.js, menus.js, briefing.js, debrief.js, campaignMap.js, widgets.js
  /audio    sfx.js, music.js, voice.js (radio ticker + squelch)
  save.js
/tests      *.test.js  (node --test)
/tools      validate-maps.js, render-map-preview.js (writes a PPM/PNG overview for review)
```

### 19.2 Entities
A lightweight entity model (no ECS framework needed): plain objects with `id`, `type`, `team`, `x`, `y` (sub-tile float positions), `elev`, `facing`, `hp`, `state`, plus type-specific components. The world holds arrays by category and a spatial hash (8×8-tile buckets) for queries.

### 19.3 Map data format
Each mission is a JS module exporting data (easy for agents to author and diff):

```js
export default {
  id: 'm1',
  name: 'First Light',
  biome: 'temperate',          // selects tile variants, flora, palette
  size: { w: 96, h: 72 },
  time: 'day',                 // day | dusk | night
  weather: null,               // null | 'blizzard' | 'rain' | 'haze'
  // One string per row, exactly w characters. Legends map chars → tile defs.
  terrain:   [ /* 72 strings */ ],   // g grass, d dirt, s sand, r road, t tallgrass, w shallow, W deep, n snow, m swamp, c concrete, l lava
  elevation: [ /* 72 strings */ ],   // '0'-'3'
  overlay:   [ /* 72 strings */ ],   // '.' none, f light trees, F forest, o boulder, R ramp, b sandbags, x barrel, k crate, h bridge, v wall, e fence, *custom
  structures: [ { id: 'radio1', type: 'commsArray', x: 70, y: 22, alertGroup: 'hill' } ],
  units: [
    { id: 'g1', type: 'husk', x: 60, y: 30, facing: 'S', alertGroup: 'motorpool',
      behaviour: { kind: 'patrol', path: 'p1', mode: 'loop' } },
  ],
  friendlies: [],
  paths: { p1: [ { x: 60, y: 30, wait: 3, look: 'E' }, { x: 66, y: 30 } ] },
  areas: { lz: { x: 2, y: 2, w: 5, h: 5 }, obsA: { x: 68, y: 20, w: 6, h: 6 } },
  alertGroups: { hill: { barracks: null, reinforceCap: 0 }, motorpool: { barracks: 'bx1', reinforceCap: 6 } },
  pickups: [ { type: 'ammo', x: 20, y: 40, amount: 10 } ],
  player: { x: 3, y: 66, facing: 'N', loadout: { rifle: 20, c4: 0, medkit: 0, designator: 0, smoke: 0 } },
  objectives: [ { id: 'o1', type: 'OBSERVE', area: 'obsA', seconds: 4, primary: true, text: 'Observe the radio outpost' } ],
  triggers: [
    { when: { type: 'enterArea', area: 'tut_ford' }, once: true,
      do: [ { type: 'tutorial', key: 'scope_intro' } ] },
    { when: { type: 'objectivesDone', ids: ['o1','o2','o3'] },
      do: [ { type: 'revealObjective', id: 'o4' }, { type: 'say', text: 'Good work. Get to the LZ.' } ] },
  ],
  briefing: { text: '…', preview: { x: 48, y: 36, zoom: 0.25 } },
  par: 900, // seconds
};
```
- **Triggers:** conditions (`enterArea`, `unitDead`, `structureDestroyed`, `objectivesDone`, `alertLevel`, `timer`, `observed`, `pickup`, `custom`) → actions (`say`, `tutorial`, `setObjective`, `revealObjective`, `spawn`, `setBehaviour`, `startConvoy`, `reveal`, `grant`, `setAlert`, `cameraPan`, `win`, `lose`, `custom`).
- Mission-specific logic that doesn't fit goes in named functions in the mission module (`custom` hooks), not in the engine.
- **Authoring tip for the agent:** generate the three layer arrays with a small helper script per map (painting rectangles, ellipses, noisy blobs for forests, polylines for roads and rivers, from a seeded RNG) and commit the output, rather than hand-typing 96+ character rows. Keep the generator scripts in `/tools/mapgen/mN.js` so maps can be regenerated and tweaked.

### 19.4 Tooling
- **`tools/validate-maps.js`** (run with `node`): checks row counts and widths; unknown characters; ramps connect exactly one level difference; every unit/structure/pickup/path point is on a valid tile; the Operative start can path to every objective area and the LZ; every area and path referenced exists; two or more distinct routes exist to each primary objective (check by removing the shortest path's chokepoint tiles and re-pathing); prints a per-map report.
- **`tools/render-map-preview.js`**: writes an image of the full map (1 px per tile, colour by terrain/elevation, dots for units) for a quick visual review.
- **In-game debug overlay** (`` ` `` key or `?debug=1`): reveal map, show vision cones and detection meters, patrol paths, alert group state, LOS ray from the cursor to the Operative, FPS and entity counts, time scale control, "god mode", and jump to any mission via `?map=m5`.

### 19.5 Tests (node --test)
Minimum set:
- `los.test.js` — high-ground rule, adjacency peek, forest vs elevation cases from §7.3, soft light-tree rule, low cover never blocks.
- `pathfinding.test.js` — ramps only, cliffs impassable, terrain cost preference, vehicle restrictions.
- `detection.test.js` — the fill formula, hunker vs vehicles = 0, tall grass 3-tile rule, instant adjacency detection.
- `hitzones.test.js` — view selection by angle; slit only on front; priority resolution.
- `explosions.test.js` — falloff, chain reactions, building/vehicle multipliers.
- `gorePalette.test.js` — **no red hues** in blood colours (§2).
- `maps.test.js` — runs the validator on all 7 maps.

---

## 20. Build milestones & acceptance criteria

Each milestone ends with a playable build, passing tests, and a short changelog entry in `DECISIONS.md`.

| # | Milestone | Acceptance criteria |
|---|---|---|
| **M0** | Scaffold | `index.html` loads; fixed-step loop; integer-scaled 480×270 canvas; scene manager; seeded RNG; `node --test` runs; `balance.js` exists. |
| **M1** | Map & camera | Load a map module; draw terrain, autotiled cliffs and shores, overlays; camera follow + drag pan + minimap tap; renders a 128×128 test map at 60 fps. |
| **M2** | The Operative | Tap to walk, double-tap to run (instant response), A* with ramps; Crouch auto on stop; Cover and Hunker buttons with animations; sprites in 8 directions. |
| **M3** | LOS & fog | `los.js` per §7.3 with tests passing; shroud and fog; elevation behaviour visible in the debug overlay. |
| **M4** | Enemies & stealth | Patrol/sentry/camp behaviours; vision cones; detection meter per §8.1; noise; bodies; alert groups with Calm/Caution/Alarm; LKP ghost; awareness eye. |
| **M5** | Combat & scope | Pistol run-and-gun; engage flow (§5.3); the full scope minigame (sway, breath, hit zones, 4 views, dispersion, feedback); gore colours; enemy fire. |
| **M6** | Explosives & vehicles | Explosions with chaining; barrels, grenade belts, fuel tanks; vehicles with driver/slit stops and passengers; structures; C4 planting and detonation; power and comms dependencies. |
| **M7** | Missions framework + Mission 1 | Objectives, triggers, OVERWATCH ticker, briefing/debrief, tutorial prompts, extraction dropship; Mission 1 fully playable start to finish. |
| **M8** | Missions 2–4 | Maps built with generators, validated; snow tracks and blizzard; convoy escort; boss Vrask. |
| **M9** | Strike + Missions 5–7 | Designator, jammers, channelling, strike effects; night, searchlights, rescue/follow AI, shift-change timer, tunnels; shield/hardened Spire; checkpoints. |
| **M10** | Polish | Title, campaign map, settings, audio (SFX + music), save data, difficulty, accessibility options, PWA manifest, performance pass on a phone. |

**Definition of done for the game:** all 7 missions completable on Operative difficulty; each has two viable routes to every primary objective; no red in gore; 60 fps on a mid-range phone; all tests green; validator clean.

---

## 21. Open decisions

| # | Question | Default if not answered |
|---|---|---|
| 1 | **Title:** keep "Westwood Sniper" for a private build only, or pick a release-safe title now? | Keep for now; revisit before any public release. |
| 2 | Platform priority: mobile-first (landscape) confirmed? Portrait support? | Landscape only; show a "rotate device" screen in portrait. |
| 3 | Art: procedural code-authored sprites (§4.5) vs commissioning an artist later? | Code-authored now; manifest allows swapping in PNGs. |
| 4 | Should the strike be one per mission at most, with a cooldown, or charges as in §14? | Charges as in §14. |
| 5 | C4 default: 10 s timer or remote detonation? | Timer, remote as a setting. |
| 6 | Do we want a skirmish/free-play mode or a map editor after the campaign? | Out of scope for v1. |
