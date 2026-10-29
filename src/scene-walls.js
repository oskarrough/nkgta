import * as THREE from 'three'
import { roofHash } from './map-image.js'
import { STOREY } from './build-map.js'
import { T } from './tiles.js'
import { firewallShader } from './murals.js'
import { d, glsl, mean, pulse } from './scene-shader.js'

// Altbau plaster, mostly pale: white, pale grey, cream, pale yellow, warm
// grey, with the odd salmon or red-brick house. Each house is lighter or
// darker on top, so neighbours differ in value, not just in hue.
const FACADES = ['#e4e1d9', '#d2d0ca', '#e2d8c0', '#e4d4a2', '#c4bcae', '#dcdad2', '#cfc6b2', '#c99682', '#9c5a46']
const FACADE_VALUE = 0.16

// Facade details, drawn in the wall shader. Cornice is two depths below the
// roof in tiles: the pale band, then its shadow. Window sizes are in metres:
// one window every `bay` along the wall, tall and white-framed, split by a
// mullion and a transom; shop windows are wider. Sills are in storeys.
export const WALL = {
	glass: '#151a20',
	glint: '#5b6b78',
	lit: '#e6b45a',
	stucco: '#ece4d2',
	frame: '#f2efe8',
	sill: 0.05,
	cornice: [0.13, 0.21],
	awnings: 0.45, // share of shopfronts with an awning
	bay: 2.5,
	window: [1.2, 2.3], // wide, tall
	shop: 2.0, // wide
	bar: 0.07, // frame, mullion and transom
	upperGlow: 0.75, // flats glow less than shops, there are so many more of them
}
// Balconies under some upper windows, the same columns all the way up:
// share of walls with any on the big roads and on side streets and
// courtyards, how many road tiles across make a big road, share of the
// columns, how far the slab reaches past the window each side and the
// railing's height (metres), iron bars per bay.
const BALCONY = {
	main: 0.1,
	side: 0.4,
	wide: 4,
	columns: 0.3,
	reach: 0.3,
	rail: 0.95,
	bars: 18,
	iron: '#2c2e30',
	slab: '#ddd8cc',
}
// Shopfronts: plate glass in a pale frame with a transom at door height,
// pale pillars between, and the shop lit inside by its own lamps, its back
// wall and shelves of goods. Heights are metres up the ground floor, `door` the
// share of bays that are a glass door down to the pavement. By day this
// share of shops is open, by night SHOP_GLOW.open of them.
const SHOPFRONT = {
	frame: 0.09,
	riser: 0.45,
	transom: 2.55,
	top: 3.15,
	door: 0.3,
	open: 0.85,
	wall: '#d6cfc0',
	floor: '#8a7e70',
	goods: ['#a87a66', '#c4b285', '#8a977f', '#7f8a99', '#e2dccd', '#9b8a8c'], // muted, so the shelves read as a shop, not a poster
	shelves: 5, // rows up the window
	items: 12, // per bay
	tint: 0.2, // the glass's dark tint over the shop
	reflect: '#8d9aa8', // the sky in the glass, strongest at the top
	glow: 0.24, // how bright the shop's lamps are by day; at night SHOP_GLOW.window
}
// Pale plaster stays pale in shade: light thrown back from the sunlit
// street and the houses opposite lifts the walls out of the sun, warm.
const SHADE = { lift: 1.1, warm: '#fff0d6' }
const AWNINGS = ['#b8352c', '#2f6b3c', '#d9a326', '#2f4f7a']
// The flats behind the upper windows, only in the chase camera: depth in
// tiles, the share of rooms with the lamp on, how dark the others are by
// day, and what they're papered, floored and hung with.
// The share of rooms with the lamp on comes from the clock (daylight.js).
const ROOMS = {
	depth: 1.4,
	lamp: '#ffd59a',
	glow: 0.5, // how much of a lit room shines by itself by day; at night all of it
	dim: 0.2,
	glass: 0.3, // the pane's own dark tint over the room
	glint: 0.35, // the reflection across the pane, fainter so the room shows
	papers: ['#d8cdb5', '#c4cfc0', '#e0c6b4', '#bcc4cf'],
	floor: '#6b4b34',
	picture: '#3d4a5c',
	curtains: 0.45, // share of windows with curtains
	cloths: ['#9c4a42', '#d9cfae', '#45607f', '#76804f'],
}

// Wall foot: two heights in tiles and how dark the wall is below each.
const FOOT = [0.12, 0.3, 0.72, 0.86]
// At night shopfronts and awnings glow this much by themselves, lit from
// inside, and this share of shops is still open.
export const SHOP_GLOW = { awning: 0.45, window: 0.9, open: 0.65 }
const WALL_FOOT = 0.15 // tiles the walls reach below the ground they stand on
// Every edge of every outline becomes one wall quad, outer rings
// anticlockwise and courtyards clockwise, so walls face away from the
// building. Each building gets a plaster colour from a stable hash.
export function wallGeometry(houses, world, firewalls) {
	const bay = WALL.bay / world.tileM
	const pos = []
	const nor = []
	const col = []
	const wall = [] // per vertex: windows along the wall, windows that fit, building height, the building's own number
	const foot = [] // per vertex: the ground the building stands on
	const plaster = FACADES.map((f) => new THREE.Color(f))
	const c = new THREE.Color()
	houses.forEach(({ n, h, base, parts, top }) => {
		// Downhill a hair below the ground, so no light shows under the wall.
		const z0 = base - WALL_FOOT
		const j = roofHash(n + 500)
		c.copy(plaster[Math.floor(j * plaster.length)]).offsetHSL(0, 0, (roofHash(n + 900) - 0.5) * FACADE_VALUE)
		const seed = roofHash(n + 1300)
		const roll = roofHash(n + 1700)
		for (const { outer, holes } of parts) {
			for (const ring of [outer, ...holes]) {
				for (let i = 0; i < ring.length; i++) {
					const a = ring[i]
					const e = ring[(i + 1) % ring.length]
					const len = a.distanceTo(e)
					if (len < 0.01) continue
					const nx = (e.y - a.y) / len
					const ny = -(e.x - a.x) / len
					// Centre the windows on the wall; too short a wall gets none,
					// and a firewall (fit -1) none at all.
					const fire = firewalls?.at(n, (a.x + e.x) / 2, -(a.y + e.y) / 2)
					const fit = fire ? -1 : Math.floor(len / bay)
					const lead = fire ? 0 : (len - fit * bay) / 2
					// Fewer balconies over the big roads; one past 1 means none.
					const wide = roadAcross(world, (a.x + e.x) / 2, (a.y + e.y) / 2, nx, ny) >= BALCONY.wide
					const balconies = roll < (wide ? BALCONY.main : BALCONY.side) ? seed : seed + 1
					// Up to the roof, which under a pitched one is above the eaves.
					const ta = top(a.x, a.y)
					const te = top(e.x, e.y)
					const quad = [
						[a, z0, 0],
						[e, z0, len],
						[e, te, len],
						[a, z0, 0],
						[e, te, len],
						[a, ta, 0],
					]
					for (const [p, z, d] of quad) {
						pos.push(p.x, p.y, z)
						nor.push(nx, ny, 0)
						col.push(c.r, c.g, c.b)
						wall.push((d - lead) / bay, fit, h, balconies)
						foot.push(base)
					}
				}
			}
		}
	})
	const geo = new THREE.BufferGeometry()
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
	geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
	geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
	geo.setAttribute('wall', new THREE.Float32BufferAttribute(wall, 4))
	geo.setAttribute('foot', new THREE.Float32BufferAttribute(foot, 1))
	return geo
}

// How many road tiles lie straight out from a wall, up to 40 m out, to
// tell the big roads from side streets. Scene y is the map's upside down.
function roadAcross(world, x, y, nx, ny) {
	let road = 0
	for (let t = 0.5; t < 40 / world.tileM; t += 0.5) {
		const tile = world.tileAt(x + nx * t, -(y + ny * t))
		if (tile === T.BUILDING) break
		if (tile === T.ROAD) road += 0.5
	}
	return road
}

// Walls draw their own windows: one per bay along the wall and per storey up
// it, tall and white-framed, wider shop windows on the ground floor, a ledge
// between storeys, balconies on some houses and the flats with the lamp on
// lit, more of them as night falls, always the same ones first. At night those glow, and so do open shops. Sheds and garages
// stay blank. In the chase camera (`material.userData.rooms`) each upper
// window looks into a room.
export function wallMaterial(tileM, gradient, sky) {
	const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient })
	const storey = (STOREY.upper / tileM).toFixed(3)
	const ground = (STOREY.ground / tileM).toFixed(3)
	const bayT = (WALL.bay / tileM).toFixed(3)
	const rooms = { value: 0 }
	material.userData.rooms = rooms
	const fire = firewallShader(WALL.bay / tileM, glsl)
	// What a room averages out to once its window is under a pixel, lamp off and on.
	const paper = mean(ROOMS.papers)
	const darkRoom = paper.clone().multiplyScalar(ROOMS.dim)
	const litRoom = paper.clone().multiply(new THREE.Color(ROOMS.lamp))
	// And a shop's goods, then the whole shop, through its tinted glass.
	const shelfMean = mean([SHOPFRONT.wall, SHOPFRONT.wall, SHOPFRONT.wall, ...SHOPFRONT.goods]).multiplyScalar(0.92)
	const shopMean = shelfMean
		.clone()
		.multiplyScalar(0.63)
		.add(new THREE.Color(SHOPFRONT.wall).multiplyScalar(0.15))
		.add(new THREE.Color(SHOPFRONT.floor).multiplyScalar(0.22))
		.lerp(new THREE.Color(WALL.glass), SHOPFRONT.tint)
	material.onBeforeCompile = (shader) => {
		shader.uniforms.rooms = rooms
		shader.uniforms.night = sky.night
		shader.uniforms.home = sky.home
		const decl = 'varying vec4 vWall;\nvarying float vZ;\nvarying vec3 vRoomP;\nvarying vec2 vTan;\n'
		shader.vertexShader =
			'attribute vec4 wall;\nattribute float foot;\n' +
			decl +
			shader.vertexShader.replace(
				'#include <project_vertex>',
				`#include <project_vertex>
				vWall = wall;
				vZ = position.z - foot;
				vRoomP = (modelMatrix * vec4(transformed, 1.0)).xyz;
				vTan = normalize(vec2(-normal.y, normal.x));`,
			)
		shader.fragmentShader =
			'uniform float rooms;\nuniform float night;\nuniform float home;\n' +
			decl +
			pulse +
			fire.head +
			shader.fragmentShader
				.replace(
					'#include <color_fragment>',
					`#include <color_fragment>
				float along = vWall.x;
				// Storeys up the wall, the ground floor taller than the rest.
				float zf = vZ < ${ground} ? vZ / ${ground} : 1.0 + (vZ - ${ground}) / ${storey};
				vec2 aa = fwidth(vec2(along, zf));
				float az = fwidth(vZ);
				float glassy = 0.0;
				if (vWall.z > 2.0 && along > 0.0 && along < vWall.y && vZ < vWall.z - 0.3) {
					float f = floor(zf);
					float fz = fract(zf);
					float u = fract(along);
					float shop = f < 0.5 ? 1.0 : 0.0;
					// Rounded, because interpolated varyings wobble in their last bits
					// and the hash would blow that up into speckle.
					float house = floor(fract(vWall.w) * 1000.0 + 0.5);
					float wallId = floor(vWall.y + 0.5) + floor(vWall.z * 8.0 + 0.5);
					float bay = fract(sin(dot(vec3(floor(along), f, wallId), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
					// Balconies stand under the same columns all the way up, from the
					// first floor to the one below the top, and their windows are doors.
					float zt = vWall.z - 0.3;
					float top = floor(zt < ${ground} ? zt / ${ground} : 1.0 + (zt - ${ground}) / ${storey});
					float column = (1.0 - step(1.0, vWall.w)) * step(fract(sin(dot(vec2(floor(along), house), vec2(12.9898, 78.233))) * 43758.5453), ${BALCONY.columns.toFixed(2)});
					float balcony = column * step(1.0, f) * step(f, top - 1.0);
					float halfW = mix(${d(WALL.window[0] / 2 / WALL.bay)}, ${d(WALL.shop / 2 / WALL.bay)}, shop);
					float door = shop * step(fract(bay * 13.3), ${SHOPFRONT.door.toFixed(2)});
					float lo = mix(mix(0.2, 0.03, balcony), mix(${d(SHOPFRONT.riser / STOREY.ground)}, 0.005, door), shop);
					float hi = mix(${d(0.2 + WALL.window[1] / STOREY.upper)}, ${d(SHOPFRONT.top / STOREY.ground)}, shop);
					float wx = pulse(u, 0.5 - halfW, 0.5 + halfW, aa.x);
					float wz = pulse(fz, lo, hi, aa.y);
					// The white frame round each window, the mullion and the transom
					// under the fanlight that split an upper one, and the transom at
					// door height across a shop's. Pale pillars stand between the
					// shop windows, on a pale riser.
					vec2 bar = mix(vec2(${d(WALL.bar / WALL.bay)}, ${d(WALL.bar / STOREY.upper)}), vec2(${d(SHOPFRONT.frame / WALL.bay)}, ${d(SHOPFRONT.frame / STOREY.ground)}), shop);
					float frame = pulse(u, 0.5 - halfW - bar.x, 0.5 + halfW + bar.x, aa.x) * pulse(fz, lo - bar.y, hi + bar.y, aa.y);
					float pillar = shop * (1.0 - frame) * box(fz, 0.0, hi + bar.y, aa.y);
					float transom = mix(hi - ${d(0.55 / STOREY.upper)}, ${d(SHOPFRONT.transom / STOREY.ground)}, shop);
					float bars = max(box(u, 0.5 - bar.x * 0.5, 0.5 + bar.x * 0.5, aa.x) * (1.0 - shop), box(fz, transom - bar.y * 0.5, transom + bar.y * 0.5, aa.y));
					// The balcony: a slab at the floor and an iron railing on it, bars
					// and a handrail.
					float reach = halfW + ${d(BALCONY.reach / WALL.bay)};
					float slabW = pulse(u, 0.5 - reach, 0.5 + reach, aa.x);
					float slab = balcony * slabW * box(fz, 0.0, ${d(0.16 / STOREY.upper)}, aa.y);
					float railTop = ${d((0.16 + BALCONY.rail) / STOREY.upper)};
					float rail = balcony * slabW * box(fz, ${d(0.16 / STOREY.upper)}, railTop, aa.y) * max(box(fz, railTop - ${d(0.05 / STOREY.upper)}, railTop, aa.y), pulse(along * ${BALCONY.bars.toFixed(1)}, 0.0, 0.3, aa.x * ${BALCONY.bars.toFixed(1)}));
					// Under the slab above, its shadow.
					float under = column * step(f + 1.0, top - 1.0) * slabW * box(fz, 0.95, 1.0, aa.y);
					float pane = wx * wz * (1.0 - bars) * (1.0 - rail);
					glassy = pane;
					// Below about a pixel a window, the details that pick one window
					// out (lit, glint, sill, stripes) give way to their average.
					float near = 1.0 - smoothstep(0.25, 0.6, max(aa.x, aa.y));
					// Dark glass with a pale glint across its top corner. Each storey
					// is rooms two or three windows wide, and a room has the lamp on
					// once the share of flats at home passes its own number, so the
					// same flats light up first every evening. Most shops are open by
					// day, fewer at night, and the ones open late always the same.
					float wu = (u - 0.5 + halfW) / (2.0 * halfW);
					float wv = (fz - lo) / (hi - lo);
					float glint = step(abs(wu - wv - 0.15), 0.12) * (1.0 - shop);
					float fh = fract(sin(f * 41.3 + wallId * 7.13) * 43758.5453);
					float span = fh < 0.5 ? 2.0 : 3.0;
					float phase = floor(fract(fh * 13.7) * span);
					float x0 = floor((along + phase) / span) * span - phase;
					float room = fract(sin(dot(vec3(x0, f, wallId), vec3(12.9898, 78.233, 37.719)) + 1.7) * 43758.5453);
					float openShare = mix(${SHOPFRONT.open.toFixed(2)}, ${SHOP_GLOW.open.toFixed(2)}, step(0.05, night));
					float open = step(1.0 - openShare, fract(bay * 5.1));
					float on = shop > 0.5 ? open : step(1.0 - home, fract(room * 5.37));
					float share = shop > 0.5 ? openShare : home;
					vec3 glass = on > 0.5 ? ${glsl(WALL.lit)} : ${glsl(WALL.glass)};
					vec3 far = mix(${glsl(WALL.glass)}, ${glsl(WALL.lit)}, share);
					float glow = on * night * ${SHOP_GLOW.window.toFixed(2)};
					float farGlow = share * night * ${SHOP_GLOW.window.toFixed(2)};
					vec3 mirror = vec3(0.0);
					if (shop > 0.5) {
						// The shop inside, flat behind the glass: a floor, shelves of
						// goods against the back wall and the bright wall above them,
						// lamp-warm at night. Under a pixel a shelf, the goods average out.
						float sh = (wv - 0.22) / 0.63;
						vec2 cell = vec2(along * ${SHOPFRONT.items.toFixed(1)}, sh * ${SHOPFRONT.shelves.toFixed(1)});
						float item = fract(sin(dot(floor(cell) + vec2(wallId, bay * 91.0), vec2(12.9898, 78.233))) * 43758.5453);
						vec3 goods = item < 0.3 ? ${glsl(SHOPFRONT.wall)} : item < 0.42 ? ${glsl(SHOPFRONT.goods[0])} : item < 0.54 ? ${glsl(SHOPFRONT.goods[1])} : item < 0.66 ? ${glsl(SHOPFRONT.goods[2])} : item < 0.78 ? ${glsl(SHOPFRONT.goods[3])} : item < 0.9 ? ${glsl(SHOPFRONT.goods[4])} : ${glsl(SHOPFRONT.goods[5])};
						vec2 ca = fwidth(cell);
						goods *= (1.0 - 0.5 * box(fract(cell.y), 0.0, 0.16, ca.y)) * (1.0 - 0.2 * box(fract(cell.x), 0.0, 0.12, ca.x));
						goods = mix(${glsl(shelfMean)}, goods, 1.0 - smoothstep(0.25, 0.6, max(ca.x, ca.y)));
						float floorBand = box(wv, -1.0, 0.22, aa.y / (hi - lo));
						float wallBand = box(wv, 0.85, 2.0, aa.y / (hi - lo));
						vec3 inside = mix(mix(goods, ${glsl(SHOPFRONT.wall)}, wallBand), ${glsl(SHOPFRONT.floor)}, floorBand);
						inside *= mix(vec3(1.0), ${glsl(ROOMS.lamp)}, night);
						// The sun doesn't light the shop, its own lamps do; the glass
						// itself is dark, with the sky in it.
						glass = mix(inside, ${glsl(WALL.glass)}, ${SHOPFRONT.tint.toFixed(2)});
						mirror = mix(${glsl(WALL.glass)}, ${glsl(SHOPFRONT.reflect)}, 0.3 * clamp(wv, 0.0, 1.0) * (1.0 - night));
						float lamp = mix(${SHOPFRONT.glow.toFixed(2)}, ${SHOP_GLOW.window.toFixed(2)}, night);
						glow = open * lamp;
						far = mix(${glsl(WALL.glass)}, ${glsl(shopMean)}, share);
						farGlow = share * lamp;
					}
					if (rooms > 0.5 && shop < 0.5 && pane > 0.0) {
						// Follow the view ray into a box behind the wall: a room two or
						// three windows wide, so its walls stand behind the piers. Only
						// where there's glass to see it through.
						vec3 ray = normalize(vRoomP - cameraPosition);
						vec3 d = vec3(dot(ray.xy, vTan), ray.z, max(abs(dot(ray.xy, vec2(vTan.y, -vTan.x))), 0.05));
						vec2 o = vec2(along * ${bayT}, fz * ${storey});
						float tx = (d.x > 0.0 ? (x0 + span) * ${bayT} - o.x : o.x - x0 * ${bayT}) / max(abs(d.x), 0.0001);
						float ty = (d.y > 0.0 ? ${storey} - o.y : o.y) / max(abs(d.y), 0.0001);
						float tz = ${ROOMS.depth.toFixed(2)} / d.z;
						float t = min(tz, min(tx, ty));
						float pick = fract(room * 7.31);
						vec3 paper = pick < 0.25 ? ${glsl(ROOMS.papers[0])} : pick < 0.5 ? ${glsl(ROOMS.papers[1])} : pick < 0.75 ? ${glsl(ROOMS.papers[2])} : ${glsl(ROOMS.papers[3])};
						vec3 hit = vec3(o + d.xy * t, d.z * t);
						// Where on the room's wall or ceiling the ray lands, 0 to 1.
						vec2 back = vec2((hit.x / ${bayT} - x0) / span, hit.y / ${storey});
						vec2 up = vec2(back.x, hit.z / ${ROOMS.depth.toFixed(2)});
						vec3 c = t == tz ? paper : t == tx ? paper * 0.62 : d.y > 0.0 ? paper * 1.08 : ${glsl(ROOMS.floor)};
						if (t == tz) {
							// A door to the hall on one side, a picture on the other.
							float side = fract(room * 3.1) < 0.5 ? 0.22 : 0.78;
							c = abs(back.x - side) < 0.1 / span && back.y < 0.72 ? c * 0.45 : c;
							vec2 pic = vec2(back.x - (1.0 - side), back.y - 0.55);
							c = abs(pic.x) < 0.12 / span && abs(pic.y) < 0.09 ? ${glsl(ROOMS.picture)} : c;
						}
						// Darker away from the window, with a lamp in the middle of the
						// ceiling in the lit ones.
						c *= 1.0 - 0.55 * hit.z / ${ROOMS.depth.toFixed(2)};
						if (t == ty && d.y > 0.0) c = mix(c, vec3(1.0), on * step(length((up - 0.5) * vec2(span * ${bayT}, 1.4)), 0.16));
						c *= on > 0.5 ? ${glsl(ROOMS.lamp)} : vec3(${ROOMS.dim.toFixed(2)});
						// Curtains hang at the pane, drawn on the glass, some to the sides.
						float cw = 0.14 + 0.2 * fract(bay * 17.9);
						float curtain = step(fract(bay * 11.3), ${ROOMS.curtains.toFixed(2)}) * (step(wu, cw) + step(1.0 - cw, wu));
						float cp = fract(bay * 23.1);
						vec3 cloth = cp < 0.25 ? ${glsl(ROOMS.cloths[0])} : cp < 0.5 ? ${glsl(ROOMS.cloths[1])} : cp < 0.75 ? ${glsl(ROOMS.cloths[2])} : ${glsl(ROOMS.cloths[3])};
						c = mix(c, cloth * (on > 0.5 ? 0.9 : 0.5), min(curtain, 1.0));
						glass = mix(c, ${glsl(WALL.glass)}, ${ROOMS.glass.toFixed(2)});
						float lamp = mix(${ROOMS.glow.toFixed(2)}, 1.0, night);
						glow = on * lamp;
						glint *= ${ROOMS.glint.toFixed(2)};
						far = mix(mix(${glsl(darkRoom)}, ${glsl(litRoom)}, home), ${glsl(WALL.glass)}, ${ROOMS.glass.toFixed(2)});
						farGlow = home * lamp;
					}
					glass = mix(glass, ${glsl(WALL.glint)}, glint * near * (1.0 - on * night));
					totalEmissiveRadiance += mix(far * farGlow, glass * glow, near) * pane * mix(${WALL.upperGlow.toFixed(2)}, 1.0, shop);
					glass = mix(mix(far, glass, near), mirror, shop);
					diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(WALL.stucco)}, pillar * 0.6);
					diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(WALL.frame)}, frame);
					diffuseColor.rgb = mix(diffuseColor.rgb, glass, pane);
					// A pale sill under each upper window.
					float sill = box(fz, lo - bar.y - ${WALL.sill.toFixed(3)}, lo - bar.y, aa.y) * pulse(u, 0.47 - halfW, 0.53 + halfW, aa.x) * (1.0 - shop) * (1.0 - balcony);
					diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(WALL.stucco)}, sill * 0.8);
					// Shopfronts: an awning over some, plain or striped.
					float awning = shop * step(bay, ${WALL.awnings.toFixed(2)}) * box(fz, hi + 0.03, 0.97, aa.y) * pulse(u, 0.44 - halfW, 0.56 + halfW, aa.x);
					float pick = fract(bay * 7.31);
					vec3 cloth = pick < 0.25 ? ${glsl(AWNINGS[0])} : pick < 0.5 ? ${glsl(AWNINGS[1])} : pick < 0.75 ? ${glsl(AWNINGS[2])} : ${glsl(AWNINGS[3])};
					if (fract(bay * 3.7) < 0.5) cloth = mix(cloth, ${glsl(WALL.stucco)}, pulse(along * 5.0, 0.0, 0.5, aa.x * 5.0));
					diffuseColor.rgb = mix(diffuseColor.rgb, cloth, awning);
					totalEmissiveRadiance += cloth * awning * open * night * ${SHOP_GLOW.awning.toFixed(2)};
					float ledge = mix(0.025, 1.0 - smoothstep(0.0, 0.05, fz), near);
					diffuseColor.rgb *= 1.0 - 0.3 * ledge * (1.0 - shop);
					diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(BALCONY.slab)}, slab);
					diffuseColor.rgb *= 1.0 - 0.45 * under;
					diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(BALCONY.iron)}, rail);
				}
				// Cornice: a pale stucco band under the roof with a dark line of
				// its own shadow beneath.
				if (vWall.z > 2.0 && vWall.y > -0.5) {
					float down = vWall.z - vZ;
					diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(WALL.stucco)}, 0.45 * box(down, 0.0, ${WALL.cornice[0].toFixed(3)}, az));
					diffuseColor.rgb *= 1.0 - 0.38 * box(down, ${WALL.cornice[0].toFixed(3)}, ${WALL.cornice[1].toFixed(3)}, az);
				}
				${fire.body}
				// Darker towards the foot, in two steps, where the street's
				// grime and the ground's shade reach up the wall.
				diffuseColor.rgb *= 1.0 + (${FOOT[2].toFixed(2)} - 1.0) * box(vZ, -100.0, ${FOOT[0].toFixed(3)}, az) + (${FOOT[3].toFixed(2)} - 1.0) * box(vZ, ${FOOT[0].toFixed(3)}, ${FOOT[1].toFixed(3)}, az);`,
				)
				.replace(
					'#include <aomap_fragment>',
					`// Out of the sun, the plaster takes the warm light thrown back
				// from the street; the more sun a face gets, the less it needs.
				float sunLight = dot(reflectedLight.directDiffuse, vec3(1.0));
				float skyLight = dot(reflectedLight.indirectDiffuse, vec3(1.0));
				float shaded = 1.0 - clamp(sunLight / max(skyLight, 0.0001), 0.0, 1.0);
				reflectedLight.indirectDiffuse *= 1.0 + ${SHADE.lift.toFixed(2)} * ${glsl(SHADE.warm)} * shaded * (1.0 - night) * (1.0 - glassy);
				#include <aomap_fragment>`,
				)
	}
	return material
}
