// What you find your way by: the Rathaus Neukölln tower at the end of
// Karl-Marx-Straße, a few church towers and the Şehitlik mosque, each built
// by hand from its mapped building parts (OSM `building:part`, `height`,
// `roof:shape`), the Fernsehturm on the horizon at its true bearing, and the
// blue U cubes over the U-Bahn entrances.
//
// Landmarks are seen from beyond the chase camera's draw distance: past 90%
// of the far plane their depth is squeezed into the last sliver of the depth
// buffer, so they stand behind everything near but never get clipped. They
// skip the street fog above the roofline and take a lighter haze instead, so
// the tower rises out of the mist where the street ends.
import * as THREE from 'three'

const REACH = 4000 // tiles, the farthest a landmark is squeezed in from
const HAZE = 2500 // tiles over which the air takes about two thirds of the colour
const ROOFLINE = [18, 30] // metres where the street fog gives way to the haze
const FAR_FROM = 15000 // metres from the area beyond which the Fernsehturm is left out

const STONE = '#d9ccb6'
const PLASTER = '#d0bfaf'
const TILES = '#c2603f'
const COPPER = '#79ad98'
const BRICK = '#c47658'
const SLATE = '#7f758c'
const WHITE = '#eeeae2'
const LEAD = '#8b98a0'
const CONCRETE = '#c9cccf'
const U_BLUE = '#1b5fb0'

// The atlas: vertical strips, each a face design painted from z0 to z1
// metres up. Faces map the strip's width across, so a design is drawn in
// fractions of the face's width.
const ATLAS = 1024
const STRIP = 128
const STRIPS = {
	plain: { i: 0, z0: 0, z1: 1 },
	rathaus: { i: 1, z0: 0, z1: 61 },
	magdalenen: { i: 2, z0: 0, z1: 28 },
	genezareth: { i: 3, z0: 12, z1: 28 },
	u: { i: 4, z0: 0, z1: 1 },
}

// Each landmark at the centre of its tower, parts in metres east and north
// of it. `claim` lowers the plain block the map raised from the whole
// outline to the height of its walls, where OSM gives the tower's height
// to all of it.
const LANDMARKS = [
	{
		name: 'Rathaus Neukölln',
		at: [52.4813498, 13.4350912],
		build: rathaus,
	},
	{
		name: 'Magdalenenkirche',
		at: [52.4721491, 13.4414742],
		claim: 10,
		build: magdalenen,
	},
	{
		name: 'Genezarethkirche',
		at: [52.4770907, 13.4220943],
		build: genezareth,
	},
	{
		name: 'Şehitlik-Moschee',
		at: [52.4814354, 13.4097063],
		claim: 12,
		build: sehitlik,
	},
	{
		name: 'Fernsehturm',
		at: [52.520815, 13.409419],
		far: true,
		build: fernsehturm,
	},
]

// Clock tower, 68 m to Fortuna's head (de.wikipedia; OSM has 56 m of shaft
// and the top storey with its copper cap to 68 m), and the steep red roofs
// round it, 19 m high over the 20 m walls the map raises.
function rathaus(k) {
	const a = 41.3
	const c = [-1.75, 1.8]
	k.prism(square(c, 9, a), 0, 51, STONE, 'rathaus')
	k.prism(square(c, 9.8, a), 50.6, 51.2, STONE)
	k.prism(square(c, 9, a), 51.2, 55, STONE, 'rathaus')
	k.prism(square(c, 10, a), 55, 55.9, STONE)
	k.prism(square(c, 6.8, a), 55.9, 60.4, STONE, 'rathaus')
	k.prism(square(c, 8, a), 60.4, 61, STONE)
	k.pyramid(square(c, 8, a), 61, 64.6, COPPER)
	k.prism(square(c, 1, a), 64.6, 65.4, COPPER)
	k.prism(square(c, 0.6, a), 65.4, 67, COPPER)
	k.pyramid(square(c, 0.9, a), 66.4, 68, COPPER)
	const roofs = [
		[[28.4, 21.8, 24.7, 18.6, 18.8, 13.7, 16, 11.3, 9.1, 5.4, -3.5, 19.6, 6.2, 28, 11.8, 32.9, 15.7, 36.4, 22.2, 28.9], 'hipped', 19],
		[[-16.1, 11, -8.1, 2.1, -2.2, -4.5, 4.4, 1.3, 16, 11.3, 18.8, 13.7, 6.2, 28, -3.6, 22, -14.5, 12.3], 'gabled', 19],
		[[-8.1, 2.1, -16.2, 2.8, -7, -7.6, -2.2, -4.5], 'gabled', 14, true],
		[[97.4, 46.6, 84.8, 33.5, 69.4, 19.8, 59.3, 10.9, 70.2, -1.5, 93.6, 19.3, 106.8, 34.2, 109.9, 37.9, 98.4, 47.7], 'hipped', 11],
		[[48.6, -10.1, 23.9, 18, 16.5, 26.2, 8.8, 19.5, 52.3, -29.9, 60.2, -23.1], 'hipped', 6],
		[[54.3, -10.2, 45.4, -17.9, 54.4, -28.1, 81.1, -4.5, 72.2, 5.7], 'hipped', 6],
	]
	for (const [ring, kind, rise, across] of roofs) k.roof(pairs(ring), 20, rise, kind, TILES, PLASTER, across)
}

// Brick, 1877–79: a square tower to 28 m with a pinnacle at each corner and
// an eight-sided slate spire to 50 m, beside a gabled nave.
function magdalenen(k) {
	k.prism(square([0, 0], 6.8, 3), 0, 28, BRICK, 'magdalenen')
	for (const [e, n] of [
		[-2.9, -2.9],
		[2.9, -2.4],
		[2.6, 2.9],
		[-2.9, 2.4],
	]) {
		k.prism(square([e, n], 1.1, 3), 28, 30, BRICK)
		k.pyramid(square([e, n], 1.1, 3), 30, 34, SLATE)
	}
	k.prism(ngon([0, 0], 2.9, 8, 22.5), 28, 29, BRICK)
	k.pyramid(ngon([0, 0], 2.9, 8, 22.5), 29, 50, SLATE)
	k.roof(pairs([1.4, 8.4, 26.5, 11, 28.2, -5.5, 3.1, -8, 1.5, 7.7]), 10, 8, 'gabled', SLATE, BRICK)
}

// Neo-Gothic brick on Herrfurthplatz: two crossing gabled naves and a low
// square tower over the crossing, 29 m.
function genezareth(k) {
	k.roof(pairs([13.9, -3.6, 11.6, 8.5, -12.3, 3.9, -10, -8.2]), 12.6, 8.5, 'gabled', '#948975', '#be8a72')
	k.roof(pairs([-8.3, 11.8, -3.4, -14.1, 8.3, -11.9, 3.5, 14.1]), 12.6, 8.5, 'gabled', '#948975', '#be8a72')
	const tower = square([0, 0], 9.6, 12)
	k.prism(tower, 12, 28, '#be8a72', 'genezareth')
	k.pyramid(tower, 28, 29, '#a8adab')
}

// A lead dome on a drum over the prayer hall, and two pencil minarets,
// 37 m, each with two balconies.
function sehitlik(k) {
	k.prism(ngon([0, 0], 6.5, 16), 12, 14.8, WHITE)
	k.dome([0, 0], 6.5, 14.8, LEAD)
	for (const at of [
		[4.4, 12.1],
		[-12.2, -4],
	]) {
		k.prism(ngon(at, 1.15, 8), 0, 31, WHITE)
		for (const z of [20, 26.5]) k.prism(ngon(at, 1.7, 8), z, z + 0.7, WHITE)
		k.pyramid(ngon(at, 1.2, 8), 31, 37.1, LEAD)
	}
}

// 368 m: a tapering shaft, the sphere and the antenna. Its widths are drawn
// half again as wide, so the needle doesn't thin to nothing at 5 km.
function fernsehturm(k) {
	const w = 1.5
	k.frustum(ngon([0, 0], 16 * w, 8), ngon([0, 0], 5 * w, 8), 0, 197, CONCRETE)
	k.sphere([0, 0], 16 * w, 213, CONCRETE, 197 + 16 * (1 - w))
	k.prism(ngon([0, 0], 3.5 * w, 8), 229, 250, CONCRETE)
	k.frustum(ngon([0, 0], 2 * w, 6), ngon([0, 0], 0.8 * w, 6), 250, 368, '#d8d0cc')
}

export function createLandmarks(world, gradient, sky) {
	const { bbox, tileM } = world
	const lonM = 111320 * Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180)
	const toTile = ([lat, lon]) => ({ x: ((lon - bbox.west) * lonM) / tileM, y: ((bbox.north - lat) * 111320) / tileM })
	const inArea = ([lat, lon]) => lat > bbox.south && lat < bbox.north && lon > bbox.west && lon < bbox.east
	const centre = [(bbox.north + bbox.south) / 2, (bbox.west + bbox.east) / 2]
	const metresFrom = ([lat, lon], [lat0, lon0]) => Math.hypot((lat - lat0) * 111320, (lon - lon0) * lonM)

	const { color: atlas, glow } = paintAtlas()
	const uniforms = {
		lmFar: { value: 60 },
		lmFogNear: { value: 0 },
		lmFogFar: { value: 1 },
		lmHaze: { value: new THREE.Color() },
		lmThird: { value: 0 },
	}
	const group = new THREE.Group()

	const kit = createKit(tileM)
	for (const lm of LANDMARKS) {
		if (lm.far ? metresFrom(lm.at, centre) > FAR_FROM : !inArea(lm.at)) continue
		const { x, y } = toTile(lm.at)
		if (lm.claim) claim(world, x, y, lm.claim)
		kit.place(x, -y, lm.far ? 0 : world.heightAt(x, y))
		lm.build(kit)
	}
	if (kit.size()) {
		const mesh = new THREE.Mesh(kit.geometry(), landmarkMaterial(gradient, atlas, glow, uniforms, sky))
		mesh.castShadow = true
		mesh.receiveShadow = true
		// Seen from beyond the far plane, so never culled by it; it's a few
		// thousand triangles.
		mesh.frustumCulled = false
		mesh.onBeforeRender = (renderer, scene, camera) => {
			uniforms.lmFar.value = camera.far
			uniforms.lmThird.value = scene.fog ? 1 : 0
			if (scene.fog) {
				uniforms.lmFogNear.value = scene.fog.near
				uniforms.lmFogFar.value = scene.fog.far
				uniforms.lmHaze.value.copy(scene.fog.color)
			}
		}
		group.add(mesh)
	}
	const signs = uSigns(world, gradient, atlas, glow, sky)
	if (signs) group.add(...signs)
	return group
}

// The blue U-Bahn cube on its pole at every entrance: U on all four sides
// and on top, lit from inside at night.
const U_SIGN = { pole: 3.2, width: 0.22, cube: 1, color: '#6d7377' }
function uSigns(world, gradient, atlas, glow, sky) {
	const spots = world.transit.filter((t) => t.kind === 'ubahn')
	if (!spots.length) return null
	const m = 1 / world.tileM
	const pole = new THREE.BoxGeometry(U_SIGN.width * m, U_SIGN.width * m, U_SIGN.pole * m).translate(0, 0, (U_SIGN.pole * m) / 2)
	// Every face of the cube shows the whole U square; turned from three's
	// y-up to the city's z-up, the U stands upright on all four sides.
	const cube = new THREE.BoxGeometry(U_SIGN.cube * m, U_SIGN.cube * m, U_SIGN.cube * m)
	const s = STRIPS.u
	const uv = cube.attributes.uv
	for (let i = 0; i < uv.count; i++)
		uv.setXY(i, (s.i * STRIP + 4 + uv.getX(i) * (STRIP - 8)) / ATLAS, (4 + uv.getY(i) * (STRIP - 8)) / ATLAS)
	cube.rotateX(Math.PI / 2).translate(0, 0, (U_SIGN.pole + U_SIGN.cube / 2) * m)
	const poleMaterial = new THREE.MeshToonMaterial({ color: U_SIGN.color, gradientMap: gradient })
	const cubeMaterial = new THREE.MeshToonMaterial({ map: atlas, gradientMap: gradient, emissiveMap: glow, emissive: '#ffffff' })
	const poles = new THREE.InstancedMesh(pole, poleMaterial, spots.length)
	const cubes = new THREE.InstancedMesh(cube, cubeMaterial, spots.length)
	cubes.onBeforeRender = () => (cubeMaterial.emissiveIntensity = sky.night.value * 0.9)
	const at = new THREE.Matrix4()
	spots.forEach((t, i) => {
		at.makeTranslation(t.x, -t.y, world.heightAt(t.x, t.y))
		poles.setMatrixAt(i, at)
		cubes.setMatrixAt(i, at)
	})
	for (const mesh of [poles, cubes]) {
		mesh.castShadow = true
		mesh.receiveShadow = true
		mesh.computeBoundingSphere()
	}
	return [poles, cubes]
}

// Lower the map's plain block under a landmark to its wall height.
function claim(world, x, y, metres) {
	for (const b of world.buildings) {
		let hit = false
		for (const r of b.rings) {
			for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
				if (r[i + 1] > y !== r[j + 1] > y && x < r[i] + ((y - r[i + 1]) / (r[j + 1] - r[i + 1])) * (r[j] - r[i])) hit = !hit
			}
		}
		if (hit) b.h = Math.min(b.h, metres)
	}
}

// Shapes in metres east and north of a landmark's centre: [[e, n], …],
// anticlockwise.
const pairs = (flat) => {
	const pts = []
	for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]])
	return area(pts) < 0 ? pts.reverse() : pts
}
const area = (pts) => pts.reduce((s, [x, y], i) => s + x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y, 0) / 2
function ngon([e, n], r, sides, degrees = 0) {
	const out = []
	for (let i = 0; i < sides; i++) {
		const a = ((degrees + (i * 360) / sides) * Math.PI) / 180
		out.push([e + Math.cos(a) * r, n + Math.sin(a) * r])
	}
	return out
}
const square = (c, side, degrees) => ngon(c, side / Math.SQRT2, 4, degrees + 45)

// Flat-shaded triangles into one geometry: position and normal in the
// city's tiles, colour, the atlas, and `lift`, height over the landmark's
// ground in tiles, for the fog.
function createKit(tileM) {
	const pos = []
	const nor = []
	const col = []
	const uvs = []
	const lift = []
	const c = new THREE.Color()
	const ab = new THREE.Vector3()
	const ac = new THREE.Vector3()
	let ox = 0
	let oy = 0
	let oz = 0
	const plainUv = [(STRIP * 0.5) / ATLAS, 0.5]

	// Points as [e, n, z] in metres.
	function tri(a, b, d, color, uv = [plainUv, plainUv, plainUv]) {
		const p = [a, b, d].map(([e, n, z]) => [ox + e / tileM, oy + n / tileM, oz + z / tileM])
		ab.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2])
		ac.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2])
		ab.cross(ac).normalize()
		c.set(color)
		p.forEach((q, i) => {
			pos.push(...q)
			nor.push(ab.x, ab.y, ab.z)
			col.push(c.r, c.g, c.b)
			uvs.push(...uv[i])
			lift.push(q[2] - oz)
		})
	}
	const quad = (a, b, d, e, color, uv) => {
		tri(a, b, d, color, uv && [uv[0], uv[1], uv[2]])
		tri(a, d, e, color, uv && [uv[0], uv[2], uv[3]])
	}
	// The face design `strip` from z0 to z1 metres, across the full width.
	const faceUv = (strip, z0, z1) => {
		const s = STRIPS[strip]
		const u0 = (s.i * STRIP + 1) / ATLAS
		const u1 = ((s.i + 1) * STRIP - 1) / ATLAS
		const v = (z) => (z - s.z0) / (s.z1 - s.z0)
		return [
			[u0, v(z0)],
			[u1, v(z0)],
			[u1, v(z1)],
			[u0, v(z1)],
		]
	}
	function cap(ring, z, color, down = false) {
		const tris = THREE.ShapeUtils.triangulateShape(
			ring.map(([e, n]) => new THREE.Vector2(e, n)),
			[],
		)
		for (const [i, j, l] of tris) {
			const [a, b, d] = [ring[i], ring[j], ring[l]].map(([e, n]) => [e, n, z])
			const ccw = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]) > 0
			if (ccw !== down) tri(a, b, d, color)
			else tri(a, d, b, color)
		}
	}
	// Walls straight up from `ring`, with a lid.
	function prism(ring, z0, z1, color, strip) {
		frustum(ring, ring, z0, z1, color, strip)
	}
	// Walls from `bottom` at z0 to `top` at z1, rings of the same length.
	function frustum(bottom, top, z0, z1, color, strip) {
		const uv = strip ? faceUv(strip, z0, z1) : undefined
		const shade = strip ? '#ffffff' : color
		for (let i = 0; i < bottom.length; i++) {
			const j = (i + 1) % bottom.length
			quad([...bottom[i], z0], [...bottom[j], z0], [...top[j], z1], [...top[i], z1], shade, uv)
		}
		cap(top, z1, color)
	}
	function pyramid(ring, z0, z1, color) {
		const apex = ring.reduce(([e, n], p) => [e + p[0] / ring.length, n + p[1] / ring.length], [0, 0])
		for (let i = 0; i < ring.length; i++) {
			const j = (i + 1) % ring.length
			tri([...ring[i], z0], [...ring[j], z0], [...apex, z1], color)
		}
	}
	// A ball of radius r round [c, z], from `from` up (a dome from its middle).
	function sphere(c, r, z, color, from = z - r, bands = 6) {
		const rings = []
		for (let k = 0; k <= bands; k++) {
			const a = -Math.PI / 2 + (Math.PI * k) / bands
			const h = z + Math.sin(a) * r
			if (h < from - 1e-6 && k < bands) continue
			rings.push([ngon(c, Math.max(0.01, Math.cos(a) * r), 12, 15), Math.max(h, from)])
		}
		for (let k = 0; k + 1 < rings.length; k++) frustum(rings[k][0], rings[k + 1][0], rings[k][1], rings[k + 1][1], color)
	}
	const dome = (c, r, z0, color) => sphere(c, r, z0, color, z0, 6)
	// A hip or gable roof over the outline's tightest rectangle, eaves at
	// z0, ridge `rise` higher, along the long side, or across it.
	function roof(ring, z0, rise, kind, color, gable, across = false) {
		const r = tightRect(ring, across)
		const [ue, un] = [Math.cos(r.angle), Math.sin(r.angle)]
		const at = (u, v, z) => [r.c[0] + ue * u - un * v, r.c[1] + un * u + ue * v, z]
		const { L, W } = r
		const hip = kind === 'hipped' ? Math.min(W, L) : 0
		const corners = [at(-L, -W, z0), at(L, -W, z0), at(L, W, z0), at(-L, W, z0)]
		const ridge = [at(-L + hip, 0, z0 + rise), at(L - hip, 0, z0 + rise)]
		quad(corners[0], corners[1], ridge[1], ridge[0], color)
		quad(corners[2], corners[3], ridge[0], ridge[1], color)
		tri(corners[1], corners[2], ridge[1], hip ? color : gable)
		tri(corners[3], corners[0], ridge[0], hip ? color : gable)
	}
	return {
		place(x, y, z) {
			ox = x
			oy = y
			oz = z
		},
		prism,
		frustum,
		pyramid,
		sphere,
		dome,
		roof,
		size: () => pos.length,
		geometry() {
			const geo = new THREE.BufferGeometry()
			geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
			geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
			geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
			geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
			geo.setAttribute('lift', new THREE.Float32BufferAttribute(lift, 1))
			return geo
		},
	}
}

// The smallest rectangle round `ring` with a side along one of its edges:
// centre, half length along `angle`, half width. `across` turns it a
// quarter, for a ridge across the short side.
function tightRect(ring, across) {
	let best = null
	for (let i = 0; i < ring.length; i++) {
		const [ax, ay] = ring[i]
		const [bx, by] = ring[(i + 1) % ring.length]
		const angle = Math.atan2(by - ay, bx - ax)
		const [c, s] = [Math.cos(angle), Math.sin(angle)]
		let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity]
		for (const [x, y] of ring) {
			const u = x * c + y * s
			const v = -x * s + y * c
			;[u0, u1, v0, v1] = [Math.min(u0, u), Math.max(u1, u), Math.min(v0, v), Math.max(v1, v)]
		}
		const size = (u1 - u0) * (v1 - v0)
		if (best && size >= best.size) continue
		const [cu, cv] = [(u0 + u1) / 2, (v0 + v1) / 2]
		best = { size, c: [cu * c - cv * s, cu * s + cv * c], angle, L: (u1 - u0) / 2, W: (v1 - v0) / 2 }
	}
	const long = best.L >= best.W !== across
	return long ? best : { ...best, angle: best.angle + Math.PI / 2, L: best.W, W: best.L }
}

// Toon-lit like the city, but its own fog: the street fog only below the
// roofline, a light haze with distance above it; and its depth squeezed
// behind everything near once it's past the far plane's last tenth.
function landmarkMaterial(gradient, map, glow, uniforms, sky) {
	const material = new THREE.MeshToonMaterial({
		vertexColors: true,
		map,
		gradientMap: gradient,
		emissiveMap: glow,
		emissive: '#ffffff',
		fog: false,
	})
	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms, { lmNight: sky.night })
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				`#include <common>
uniform float lmFar;
attribute float lift;
varying float vLmLift;
varying float vLmDist;`,
			)
			.replace(
				'#include <project_vertex>',
				`#include <project_vertex>
vLmLift = lift;
vLmDist = length(mvPosition.xyz);
float lmDepth = -mvPosition.z;
float lmFrom = lmFar * 0.9;
if (lmDepth > lmFrom) {
	float ndcFrom = (projectionMatrix[3][2] - projectionMatrix[2][2] * lmFrom) / lmFrom;
	float t = clamp(log(lmDepth / lmFrom) / log(${REACH.toFixed(1)} / lmFrom), 0.0, 1.0);
	gl_Position.z = mix(ndcFrom, 1.0, 0.9998 * t) * gl_Position.w;
}`,
			)
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>
uniform float lmFogNear;
uniform float lmFogFar;
uniform vec3 lmHaze;
uniform float lmThird;
uniform float lmNight;
varying float vLmLift;
varying float vLmDist;`,
			)
			.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= lmNight;')
			.replace(
				'#include <fog_fragment>',
				`float lmStreet = smoothstep(lmFogNear, lmFogFar, vLmDist) * (1.0 - smoothstep(${(ROOFLINE[0] / 3).toFixed(2)}, ${(ROOFLINE[1] / 3).toFixed(2)}, vLmLift));
float lmAir = 1.0 - exp(-vLmDist / ${HAZE.toFixed(1)});
gl_FragColor.rgb = mix(gl_FragColor.rgb, lmHaze, lmThird * max(lmStreet, lmAir));`,
			)
	}
	return material
}

// The face designs, and what of them glows at night: the clock and the U.
function paintAtlas() {
	const make = () => {
		const canvas = document.createElement('canvas')
		canvas.width = canvas.height = ATLAS
		return canvas
	}
	const color = make()
	const glow = make()
	const g = color.getContext('2d')
	const n = glow.getContext('2d')
	g.fillStyle = '#ffffff'
	g.fillRect(0, 0, ATLAS, ATLAS)
	n.fillStyle = '#000000'
	n.fillRect(0, 0, ATLAS, ATLAS)

	// Draw in a strip's own units: x across the face 0..1, z in metres up.
	const inStrip = (ctx, strip, draw) => {
		const s = STRIPS[strip]
		ctx.save()
		ctx.translate(s.i * STRIP, ATLAS)
		ctx.scale(STRIP, -ATLAS / (s.z1 - s.z0))
		ctx.translate(0, -s.z0)
		draw(ctx)
		ctx.restore()
	}
	const box = (ctx, x0, z0, x1, z1, fill) => {
		ctx.fillStyle = fill
		ctx.fillRect(x0, z0, x1 - x0, z1 - z0)
	}
	// An arched opening, `w` wide (face fractions), `h` tall (metres),
	// round-headed on a face `faceW` metres wide.
	const arch = (ctx, x, z, w, h, faceW, fill) => {
		const r = (w / 2) * faceW
		ctx.fillStyle = fill
		ctx.fillRect(x - w / 2, z, w, h - r)
		ctx.beginPath()
		ctx.ellipse(x, z + h - r, w / 2, r, 0, 0, Math.PI)
		ctx.fill()
	}
	const DARK = '#2c2b2c'
	const GOLD = '#c9a13b'

	inStrip(g, 'rathaus', (ctx) => {
		const W = 9
		box(ctx, 0, 0, 1, 61, STONE)
		// Rusticated base and the plinth line.
		box(ctx, 0, 0, 1, 1.2, '#c7b9a3')
		arch(ctx, 0.5, 0, 0.34, 5, W, DARK)
		for (let z = 9; z < 40; z += 4.4) box(ctx, 0.45, z, 0.55, z + 1.7, DARK)
		for (const z of [14.2, 27.4]) {
			box(ctx, 0.28, z, 0.36, z + 1.5, DARK)
			box(ctx, 0.64, z, 0.72, z + 1.5, DARK)
		}
		box(ctx, 0, 50.6, 1, 51.2, '#ebe2d3')
		// Belfry: four round-headed openings under the gallery.
		for (const x of [0.17, 0.39, 0.61, 0.83]) arch(ctx, x, 51.7, 0.13, 2.8, W, DARK)
		// The top storey above the gallery: three tall windows.
		for (const x of [0.25, 0.5, 0.75]) arch(ctx, x, 56.8, 0.12, 2.8, 6.8, DARK)
		box(ctx, 0, 60, 1, 61, '#ebe2d3')
		clock(ctx, 0.5, 44.5, 2.3, W)
	})
	inStrip(n, 'rathaus', (ctx) => clock(ctx, 0.5, 44.5, 2.3, 9, '#ffe9b0'))
	function clock(ctx, x, z, r, W, glowColor) {
		const rx = r / W
		ctx.fillStyle = glowColor ?? GOLD
		ctx.beginPath()
		ctx.ellipse(x, z, rx, r, 0, 0, Math.PI * 2)
		ctx.fill()
		if (glowColor) return
		ctx.fillStyle = '#e6dccb'
		ctx.beginPath()
		ctx.ellipse(x, z, rx * 0.84, r * 0.84, 0, 0, Math.PI * 2)
		ctx.fill()
		ctx.fillStyle = GOLD
		for (let h = 0; h < 12; h++) {
			const a = (h / 12) * Math.PI * 2
			ctx.beginPath()
			ctx.ellipse(x + Math.sin(a) * rx * 0.7, z + Math.cos(a) * r * 0.7, rx * 0.07, r * 0.07, 0, 0, Math.PI * 2)
			ctx.fill()
		}
		// Hands at ten to two.
		for (const [a, len] of [
			[-Math.PI / 3, 0.45],
			[Math.PI / 3, 0.62],
		]) {
			ctx.save()
			ctx.translate(x, z)
			ctx.scale(rx, r)
			ctx.rotate(a)
			ctx.fillRect(-0.05, 0, 0.1, len)
			ctx.restore()
		}
	}

	inStrip(g, 'magdalenen', (ctx) => {
		const W = 6.8
		box(ctx, 0, 0, 1, 28, BRICK)
		for (let z = 0.6; z < 28; z += 3.2) box(ctx, 0, z, 1, z + 0.25, '#b0644a')
		arch(ctx, 0.5, 0, 0.3, 4.4, W, DARK)
		arch(ctx, 0.5, 9, 0.14, 3.6, W, DARK)
		box(ctx, 0, 17.4, 1, 17.8, '#e2c9a8')
		for (const x of [0.36, 0.64]) arch(ctx, x, 20, 0.14, 4.6, W, DARK)
		box(ctx, 0, 27.4, 1, 28, '#e2c9a8')
	})

	inStrip(g, 'genezareth', (ctx) => {
		box(ctx, 0, 12, 1, 28, '#be8a72')
		for (const x of [0.38, 0.62]) arch(ctx, x, 21.5, 0.13, 4, 9.6, DARK)
		box(ctx, 0, 27.3, 1, 28, '#d9b9a0')
	})

	// BVG blue with a white U, the same lit at night.
	for (const ctx of [g, n]) {
		const x = STRIPS.u.i * STRIP
		const y = ATLAS - STRIP
		ctx.fillStyle = U_BLUE
		ctx.fillRect(x, y, STRIP, STRIP)
		ctx.fillStyle = '#ffffff'
		ctx.font = `bold ${STRIP * 0.82}px sans-serif`
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'
		ctx.fillText('U', x + STRIP / 2, y + STRIP * 0.54)
	}

	const texture = (canvas) => {
		const t = new THREE.CanvasTexture(canvas)
		t.colorSpace = THREE.SRGBColorSpace
		t.anisotropy = 8
		return t
	}
	return { color: texture(color), glow: texture(glow) }
}
