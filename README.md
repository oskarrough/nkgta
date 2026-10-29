# NK GTA

A little game set in the real streets of Neukölln, in the spirit of GTA 1.

Run around, or walk around, get on the bike or steal a car. Visit shops and places, parks. Walk to Tempelhof, bike around.

https://nkgta.0sk.ar

## How is it made?

Streets, buildings, street trees, parks, shops, U-Bahn and bus stops come from OpenStreetMap. Buildings stand up in 3D at their mapped number of storeys; underneath, everything is also rasterised onto a 3m tile grid that decides where you can walk.The ground rises and falls with the real land, from Berlin's elevation model: up the Rollberg, round the Hasenheide hill. Uphill is slower, on the bike especially.

## How to develop

```sh
bun install
bun run fetch-osm   # data/osm.json from Overpass, for the default area in src/default-area.js
bun run build-map   # public/map.json, the static default map
bun run build-terrain # public/terrain.json, the ground's heights
bun run dev
```

The screen stays clean while you play, in pictures rather than words: the only prompt is an E key with a picture of what it does here (bike, car, out, shop); on a phone the E button shows that picture. Esc, or the menu button on a phone, opens the menu: a grid of pictures for street names, stops, walls, look, camera, music debug, sound and area, lit yellow when on, each with its key in the corner. The keys below still work.

In overhead view, W/S (or up/down) move forward/backward along your facing and A/D (or left/right) turn, on foot and on the bike. E gets on and off the bike and in and out of cars, space is turbo (for testing), +/− or the mouse wheel zooms, N toggles street names, T toggles U-Bahn and bus stops, P switches the look between default, pixel art and raw: the shapes and walls the game built from the map in plain grey, with the walk grid on (K toggles that grid in any look), M picks another area. Footpaths and Tordurchfahrten through buildings (`tunnel=building_passage`) cut through the block, so you can walk the Kino-Passage from Karl-Marx-Straße into the Hof and out onto Richardstraße. Private paths and passages are walkable too, hatched on the map. Every shop wears an awning with its name painted on it. Stand at its door and E tears the air open on the facade, showing the shop inside, live; walk into the tear and you're in. Collect Pfand bottles and cash them in at the counter inside a Späti. The day runs by itself, an hour a minute, starting in late morning: full daylight, then golden hour, dusk and night, when the shadows go, flats light up in their windows (the same ones first every evening), open shops and their awnings glow and cars throw their headlights on the road. The debug menu (`) has a slider for the time.

Traffic drives on the right along the real road network, one-way streets included, and cars stand parked along the kerbs. Mostly Kleinwagen, now and then a black SUV or a lambo, and BVG buses on the big roads that stop at the real bus stops. Each handles differently. It stops at the traffic lights OSM knows about; at other junctions the bigger road goes first and, between equals, rechts vor links. Music comes from places: a radio in some Spätis, döner shops and cafés, a bar door, an open window, a car going by, and on Tempelhofer Feld the open field itself. Now and then a Turkish wedding convoy rolls through, five cars nose to tail taking every turn together, playing one song loud enough to hear from blocks away. You hear it coming, it gets clearer as you get close and fades as you move on; sit in any car and its radio is on: R turns the dial from Radio A100, the rock station, to Kiezfunk, everything the Kiez plays, to off, and the place line says what's on. On foot the music sits back under the street; when one song is near, the others hush behind it; a crash, a horn or a shop door dips it for a moment; inside a shop it comes muffled through the wall. Get hit by a car and you're wasted: your bag of Pfand spills across the road and you start over. Step in front of a car to stop it, then E throws the driver out and it's yours: up is gas, down brakes and reverses, left and right steer, space is the handbrake. The handling is [Pat Kerr's 1996 tyre model](https://patkerr.co.uk/2d-vehicles/) from GTA 1: every tyre resists rolling a little and sliding sideways a lot. Press V to switch between the overhead view and an experimental third-person camera. In third person, hold the right mouse button and drag to look around; WASD walks relative to the camera and the wheel changes its distance. On bikes and in vehicles, the camera gently follows behind while moving, pulls back with speed and looks ahead. Holding right mouse takes over; after release it waits briefly before following again. It holds its angle when stopped and does not flip when reversing. Cars keep their steering controls. The camera pulls in at building walls. Shop entrances temporarily return to the overhead view. This first version stays on the ground: no jumping or rooftop movement yet. On a phone, a thumbstick appears under your left thumb: push it the way you want to go, and it walks, cycles or drives there. The right thumb has the action button and the turbo or handbrake; pinch with two fingers to zoom. A standard gamepad plugs in and works alongside the keys and the thumb: the left stick walks, cycles and drives the way the thumbstick does, its triggers are gas and brake in a car, A is E, B is turbo or handbrake, X the camera, Y the car radio, Start the menu, and up and down on the d-pad zoom.

Picked areas (`/pick.html`, then `/?area=south,west,north,east`) are fetched from Overpass in the browser, built there, and cached with TinyJoin in OPFS. Their ground stays flat. OPFS needs https or localhost; over plain http the cache is skipped.

`/?perf` times each load step and each render pass; read them from `perf` in the console.

## Code

- `src/overpass.js`, `src/build-map.js`: OSM data in; tile grid, ground shapes, building outlines, road network, places and stops out. Shared by the scripts and the browser.
- `src/load-map.js`, `src/map-codec.js`, `src/area-cache.js`: getting a map into the game.
- `src/world.js`: tile lookups and start points. `src/terrain.js`: the ground's height anywhere.
- `src/player.js`, `src/pfand.js`, `src/input.js`, `src/touch.js`, `src/camera.js`: the game.
- `src/shops.js`: which places you can walk into, and where their doors are. `src/signs.js`: their awnings, in the poster type from `src/poster.js`. `src/visit.js`: going in and out through `src/portal.js`, a tear in the air ported from dodgethis. `src/interior.js`: the room inside, one for every shop.
- `src/car.js`: a car as a rigid body on four tyres, hitting walls and other cars. `src/models.js`: Kleinwagen, SUV, lambo and bus, their sizes, handling and looks. `src/roads.js`: the road network as lanes. `src/traffic.js`: how traffic drives them, wedding convoys included, and cars coming and going out of sight around the player. `src/junctions.js`: traffic lights and right of way. `src/wasted.js`: getting run over.
- `src/sound.js`: engines, traffic and the street. `src/music.js`: music from places, the nearest two at a time. The songs are plain text in `public/music/*.song`, in a format and a synth that started as [Simon Willison's jukebox](https://tools.simonwillison.net/scrimshaw-jukebox) (see credits.txt). Both are ours to change, in `src/jukebox/` (Apache 2.0); ours add quarter tones for the maqamat, an oud, qanun, ney, 808 and darbuka. A song can name its street (`street Sonnenallee`) or kinds of place (`at doener cafe`, `at feld` for a big open field), and sources there mostly play its songs. `/jukebox.html` is the jukebox: every song, played as a Späti radio, bar door, open window, passing car, wedding convoy or your own car at any distance, with a slider to scrub through it, in an editor that replays as you type and shows what doesn't parse, with a guide to the format. `/jukebox.html?song=konvoi&kind=convoy` links straight to a song; the address bar always links to what's playing. Neuer Song starts one from a template. Edits stay on the page; Herunterladen saves the `.song` file to drop into `public/music`.
- `src/daylight.js`: the clock, and the light, sky and glow at each hour, blended from a few bundles of numbers.
- `src/scene.js`: the 3D city in three.js. Buildings are raised from their outlines, with windows drawn in the wall shader, under a perspective camera looking straight down.
- `src/map-image.js`: the ground and roof textures, painted from the map's shapes, any part of the map at any sharpness.
- `src/chunks.js`, `src/paint-worker.js`: the city in square chunks. Each has its own meshes, so only what's near the view gets drawn, and its own ground and roof textures, painted in workers as it comes near, as sharp as the zoom needs, and let go when it's far.
- `src/actors.js`: people and the bike, the same figures from above and in the chase camera. Everyone on foot is dressed from their own seed; the player wears yellow. From above they show over tree crowns and roofs, a bit bigger than life, inked round the outside (see `src/ink.js`).
- `src/sprites.js`, `src/draw.js`, `src/hud.js`: the flat layer on top (places, stops, street names) and the text.

## Icons

Every icon is its own PNG in `public/icons/`, 32×32 with a transparent background, shown at 32 CSS pixels with `image-rendering: pixelated`. Paint over a file (same name, same size) and the game picks it up; no code to touch.

- `speaker.png`, `speaker-low.png`, `speaker-off.png`: sound on, quiet, muted (speaker button, volume pill, menu)
- `menu.png`: the menu button on touch screens
- `menu-streets.png`, `menu-stops.png`, `menu-walls.png`, `menu-look.png`, `menu-camera.png`, `menu-music.png`, `menu-area.png`: the menu's buttons (N, T, K, P, V, J, M), shown at 64 px
- `key-e.png` and `act-bike.png`, `act-car.png`, `act-exit.png`, `act-shop.png`: the E prompt, E plus what it does, shown at 64 px; the touch E button shows the same `act-*` picture
- `speaker-source.png`: a music source in Musik-Debug (J): rings show how far each carries
- `play.png`: the jukebox's Abspielen button

Map data © OpenStreetMap contributors, ODbL. Elevation: ATKIS® DGM1, Geoportal Berlin, dl-de/zero-2-0.
