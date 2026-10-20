// The city in 3D, the GTA 1 way: the flat map on the ground, every building
// raised from its outline, and a perspective camera looking straight down, so
// walls lean outwards towards the screen edges.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { renderMapImage, renderRoofImage, roofHash, roofOf } from './map-image.js'
import { roofHeight, roofShape, roofTriangles } from './roofs.js'
import { createInk, gameUpscale, PALETTE_SNAP, PIXEL_GRID } from './ink.js'
import { createTrees } from './trees.js'
import { createClouds, DECK } from './clouds.js'
import { MODELS } from './models.js'

// Altbau plaster: cream, ochre, sandstone, grey, salmon, off-white.
const FACADES = ['#d8c6a2', '#c9a266', '#bfa98a', '#a8a39b', '#c98f72', '#e2dacb']

// Facade details, drawn in the wall shader. Cornice is two depths below the
// roof in tiles: the pale band, then its shadow. Sills are in storeys.
const WALL = {
	glass: '#1c2229',
	glint: '#5b6b78',
	lit: '#e6b45a',
	stucco: '#ece4d2',
	sill: 0.07,
	cornice: [0.13, 0.21],
	awnings: 0.45, // share of shopfronts with an awning
}
const AWNINGS = ['#b8352c', '#2f6b3c', '#d9a326', '#2f4f7a']

// Tile courses on pitched roofs: height between them in tiles of the map,
// the share of each that is dark line, and how dark.
const ROOF_TILES = { row: 0.18, line: 0.3, ink: 0.45 }
// Chimney stacks on the roofs: size along and across the ridge and height,
// in tiles, and their brick and sooty plaster colours.
const CHIMNEY = { length: 0.75, width: 0.42, height: 0.42, colors: ['#8a4c38', '#7a6d64', '#9a5a42'] }

// Narrow, so the camera sits high and walls lean gently, like GTA 1.
const FOV = 40

// Look knobs, all of them here.
// Sky light against sun light, which together give one full tone.
const AMBIENT = { color: '#c6ccd6', intensity: 1.0 }
const SUN = { color: '#fff4e2', intensity: 2.55, direction: [-0.5, -0.6, 0.8] }
// Flat bands instead of a falloff, from grazing sun to full sun. Faces turned
// away from the sun get none at all, so they can't flicker in and out of shadow.
const TOON_BANDS = [0.3, 0.55, 0.8, 1.0]
// What the map's own colours are multiplied by in sun and in shadow: warm
// light, deep cool shade.
const GROUND_SUN = '#fffaf0'
const GROUND_SHADE = '#98a4c0'
// What the ground is made of, drawn on top of the map's flat colours by
// world position, so it stays sharp at every zoom and costs nothing per
// building. Each is how much darker or lighter a pattern makes the ground.
const GROUND_DETAIL = {
	lawnClumps: 0.1, // darker clumps in the grass
	lawnTufts: 0.16, // single dark tufts
	yardWear: 0.08, // worn patches on courtyards and bare ground
	yardJoints: 0.08, // the gaps between their cobbles
	pavingJoints: 0.09, // and between the pavement slabs
	asphaltPatches: 0.1, // repaired patches in the tarmac
	waves: 0.65, // pale wave dashes on water
	waveDrift: 0.15, // and how fast they drift, tiles a second
	glints: 0.06, // share of sunlit water cells sparkling at any moment
	glintSize: 0.09, // tiles
}
const GLINT = '#ffffff'
// Tiles over which the ground fades into the sky at the map edge.
const EDGE_FADE = 3
// One 2048 map over the visible area, so the edges stay hard.
// normalBias is in shadow texels, so it holds at every zoom.
const SHADOW = { size: 2048, bias: -0.0003, normalBias: 1.5, pad: 60 }
// Wall foot: two heights in tiles and how dark the wall is below each.
const FOOT = [0.12, 0.3, 0.72, 0.86]
// Cars are too small for the shadow map: a flat quad away from the sun keeps
// their shadow crisp and stops them speckling.
const CAR_SHADOW = { opacity: 0.42, offset: 0.34, stretch: 1.15 }

export function createScene(canvas, world) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
	renderer.setPixelRatio(devicePixelRatio)
	const scene = new THREE.Scene()
	scene.background = new THREE.Color(DECK)
	const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 5000)

	// Hard shadows, one crisp step: no soft edges to smudge the flat fills.
	renderer.shadowMap.enabled = true
	renderer.shadowMap.type = THREE.PCFShadowMap

	// Tile (x, y) sits at (x, -y), so north stays up and z is height in tiles.
	const ground = new THREE.CanvasTexture(renderMapImage(world))
	ground.colorSpace = THREE.SRGBColorSpace
	const houses = world.buildings.map((b, n) => house(b, n, world.tileM))
	const roofImage = renderRoofImage(world, (n) => houses[n].roof)
	const roofTex = new THREE.CanvasTexture(roofImage.canvas)
	roofTex.colorSpace = THREE.SRGBColorSpace
	// Crisp texels only on the pixel grid; the smooth looks keep their
	// filtered, anisotropic textures.
	const maps = [ground, roofTex]
	function crispMaps(crisp) {
		const anisotropy = crisp ? 1 : renderer.capabilities.getMaxAnisotropy()
		for (const tex of maps) {
			tex.magFilter = crisp ? THREE.NearestFilter : THREE.LinearFilter
			tex.anisotropy = anisotropy
			tex.needsUpdate = true
		}
	}
	crispMaps(false)
	const plane = new THREE.Mesh(new THREE.PlaneGeometry(world.W, world.H), groundMaterial(ground, world))
	plane.position.set(world.W / 2, -world.H / 2, 0)
	plane.receiveShadow = true
	scene.add(plane)

	const gradient = toonGradient()
	scene.add(walls(houses, world.tileM, gradient), roofs(houses, world, gradient, roofTex))
	scene.add(chimneys(roofImage.chimneys, houses, gradient))
	const clouds = createClouds(world, gradient)
	scene.add(createTrees(world, gradient), clouds.layer)
	const cars = carMeshes(gradient)
	const skids = skidMarks()
	scene.add(...cars.meshes, skids.mesh)
	// Sky light, then sun from the south-west, so south and west walls are bright.
	scene.add(new THREE.AmbientLight(AMBIENT.color, AMBIENT.intensity))
	const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity)
	sun.castShadow = true
	sun.shadow.mapSize.set(SHADOW.size, SHADOW.size)
	sun.shadow.bias = SHADOW.bias
	const sunTarget = new THREE.Object3D()
	sun.target = sunTarget
	scene.add(sun, sunTarget)

	// The shadow camera follows the view and stays just big enough for it, so
	// the map is spent on what's on screen. It snaps to whole shadow texels,
	// otherwise the edges crawl as you walk.
	const sunDir = new THREE.Vector3(...SUN.direction).normalize()
	const sunRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize()
	const sunUp = new THREE.Vector3().crossVectors(sunDir, sunRight).normalize()
	const focus = new THREE.Vector3()
	function focusSun(x, y, radius) {
		const texel = (radius * 2) / SHADOW.size
		sun.shadow.normalBias = texel * SHADOW.normalBias
		const right = Math.round((x * sunRight.x + y * sunRight.y) / texel) * texel - (x * sunRight.x + y * sunRight.y)
		const up = Math.round((x * sunUp.x + y * sunUp.y) / texel) * texel - (x * sunUp.x + y * sunUp.y)
		focus.set(x + sunRight.x * right + sunUp.x * up, y + sunRight.y * right + sunUp.y * up, sunRight.z * right + sunUp.z * up)
		sunTarget.position.copy(focus)
		sun.position.copy(focus).addScaledVector(sunDir, radius * 2 + SHADOW.pad)
		const shadow = sun.shadow.camera
		shadow.left = -radius
		shadow.right = radius
		shadow.top = radius
		shadow.bottom = -radius
		shadow.near = 1
		shadow.far = radius * 3 + SHADOW.pad * 2
		shadow.updateProjectionMatrix()
	}

	const ink = createInk(renderer, [skids.mesh])

	// Three looks, cycled with P: flat comic, palette only, and the full pixel
	// grid. The render path owns the knobs; this only picks the frame size.
	const LOOKS = ['comic', 'palette', 'pixel']
	let look = !PALETTE_SNAP ? 'comic' : PIXEL_GRID ? 'pixel' : 'palette'

	// The game frame is the canvas at one texel per game pixel, blown up by a
	// whole number of device pixels. Resize only when that number changes.
	let upscale = 0
	function fit(scale) {
		const want = look === 'pixel' ? gameUpscale(scale) : 1
		if (want === upscale) return
		upscale = want
		const buffer = renderer.getDrawingBufferSize(new THREE.Vector2())
		ink.setSize(buffer.x, buffer.y, want)
		camera.aspect = ink.frame.width / ink.frame.height
		camera.updateProjectionMatrix()
	}

	function resize() {
		renderer.setSize(innerWidth, innerHeight, false)
		upscale = 0
	}
	addEventListener('resize', resize)
	renderer.setSize(innerWidth, innerHeight, false)

	function setLook(name) {
		look = name
		ink.setLook(name !== 'comic', name === 'pixel')
		crispMaps(name === 'pixel')
		upscale = 0
	}

	// Same view as the 2D overlay: `scale` device pixels per tile at street
	// level, top-left corner at (cam.x, cam.y) in those pixels.
	function render(cam, carList) {
		cars.update(carList)
		for (const c of carList) {
			for (const m of c.marks) skids.add(...m)
			c.marks.length = 0
		}
		fit(cam.scale)
		const { width, height } = ink.frame
		const cx = (cam.x + width / 2) / cam.scale
		const cy = -(cam.y + height / 2) / cam.scale
		camera.position.set(cx, cy, height / 2 / cam.scale / Math.tan((FOV / 2) * (Math.PI / 180)))
		focusSun(cx, cy, Math.hypot(width, height) / cam.scale / 2)
		clouds.follow(camera)
		plane.material.uniforms.time.value = performance.now() / 1000
		ink.render(scene, camera)
	}

	return {
		render,
		// Only the pixel grid needs the camera on whole game pixels.
		pixelGrid: () => look === 'pixel',
		// P: comic, palette, pixel, and round again.
		cycleLook() {
			setLook(LOOKS[(LOOKS.indexOf(look) + 1) % LOOKS.length])
			return look
		},
	}
}

// Paint, glass and tyres take the same flat bands as the walls; lamps stay
// lit, and the rim is plain ink.
function carMaterial(kind, gradient) {
	if (kind === 'lights') return new THREE.MeshBasicMaterial()
	if (kind === 'heads') return new THREE.MeshBasicMaterial({ color: CAR_HEADLIGHT })
	if (kind === 'rim') return new THREE.MeshBasicMaterial({ color: CAR_RIM.color })
	return new THREE.MeshToonMaterial({ color: FIXED[kind] ?? '#fff', gradientMap: gradient })
}

// Vehicles from above, GTA 1 style: each model built from its own boxes
// (see models.js), plus brake lights, headlights and an ink rim on the road
// round it. Boxes of one kind are merged, so it's one instanced mesh each.
const MAX_CARS = 256
const FIXED = { glass: '#2a3540', roofbox: '#9a9a96', tyre: '#303231' }
const CAR_HEADLIGHT = '#fff3c8'
// Cars are too low for the ink pass to find their edges, so they sit on a
// dark rim this much wider than the body, in tiles. Tyres poke out past it.
const CAR_RIM = { color: '#1a1e1b', width: 0.045 }
function carMeshes(gradient) {
	const box = (l, w, h, x, z) => new THREE.BoxGeometry(l, w, h).translate(x, 0, z + h / 2)
	// Away from the sun, in scene units, and a flat quad to cast it.
	const away = new THREE.Vector2(-SUN.direction[0], -SUN.direction[1]).normalize().multiplyScalar(CAR_SHADOW.offset)
	const shadowMaterial = new THREE.MeshBasicMaterial({
		color: '#000',
		transparent: true,
		opacity: CAR_SHADOW.opacity,
		depthWrite: false,
	})
	const kinds = Object.values(MODELS).map((m) => {
		const boxes = new Map()
		const add = (kind, geo) => boxes.set(kind, [...(boxes.get(kind) ?? []), geo])
		for (const [kind, l, w, h, x, z] of m.look) add(kind, box(l * m.length, w * m.width, h, x * m.length, z))
		const [, , , h, , z] = m.look[0]
		const lamp = (x, s) => box(0.04, 0.12, 0.06, x, z + h * 0.55).translate(0, (s * m.width) / 3, 0)
		for (const s of [-1, 1]) {
			add('lights', lamp(-m.length / 2, s))
			add('heads', lamp(m.length / 2, s))
		}
		const [, bl, bw] = m.look[0]
		add('rim', box(bl * m.length + CAR_RIM.width * 2, bw * m.width + CAR_RIM.width * 2, 0.01, 0, 0.005))
		const parts = [...boxes].map(([kind, geos]) => {
			const mesh = new THREE.InstancedMesh(mergeGeometries(geos), carMaterial(kind, gradient), MAX_CARS)
			mesh.count = 0
			mesh.frustumCulled = false
			return { kind, mesh }
		})
		const shadow = new THREE.InstancedMesh(
			new THREE.PlaneGeometry(m.length * CAR_SHADOW.stretch, m.width * CAR_SHADOW.stretch),
			shadowMaterial,
			MAX_CARS,
		)
		shadow.count = 0
		shadow.frustumCulled = false
		return { model: m, parts, shadow }
	})
	const m = new THREE.Matrix4()
	const ms = new THREE.Matrix4()
	const at = new THREE.Vector3()
	const q = new THREE.Quaternion()
	const z = new THREE.Vector3(0, 0, 1)
	const one = new THREE.Vector3(1, 1, 1)
	const c = new THREE.Color()
	const lit = new THREE.Color('#ff2a1a')
	const dim = new THREE.Color('#5a0d0a')
	return {
		meshes: kinds.flatMap((k) => [...k.parts.map((p) => p.mesh), k.shadow]),
		update(cars) {
			for (const { model, parts, shadow } of kinds) {
				let n = 0
				for (const car of cars) {
					if (car.model !== model || n >= MAX_CARS) continue
					m.compose(at.set(car.x, -car.y, 0), q.setFromAxisAngle(z, -car.angle), one)
					ms.compose(at.set(car.x + away.x, -car.y + away.y, 0.03), q, one)
					shadow.setMatrixAt(n, ms)
					c.set(car.color)
					for (const { kind, mesh } of parts) {
						mesh.setMatrixAt(n, m)
						if (kind === 'paint') mesh.setColorAt(n, c)
						if (kind === 'lights') mesh.setColorAt(n, car.braking ? lit : dim)
					}
					n++
				}
				shadow.count = n
				shadow.instanceMatrix.needsUpdate = true
				for (const { mesh } of parts) {
					mesh.count = n
					mesh.instanceMatrix.needsUpdate = true
					if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
				}
			}
		},
	}
}

// Rubber on the road: a ring of thin quads, the oldest painted over first.
const MAX_SKIDS = 4000
function skidMarks() {
	const pos = new Float32Array(MAX_SKIDS * 6 * 3)
	const geo = new THREE.BufferGeometry()
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
	const material = new THREE.MeshBasicMaterial({
		color: '#111',
		transparent: true,
		opacity: 0.45,
		depthWrite: false,
		side: THREE.DoubleSide,
	})
	const mesh = new THREE.Mesh(geo, material)
	mesh.frustumCulled = false
	let next = 0
	return {
		mesh,
		add(x0, y0, x1, y1) {
			const len = Math.hypot(x1 - x0, y1 - y0)
			if (len < 0.01 || len > 2) return
			const nx = (-(y1 - y0) / len) * 0.07
			const ny = ((x1 - x0) / len) * 0.07
			const corners = [
				[x0 + nx, y0 + ny],
				[x1 + nx, y1 + ny],
				[x1 - nx, y1 - ny],
				[x0 + nx, y0 + ny],
				[x1 - nx, y1 - ny],
				[x0 - nx, y0 - ny],
			]
			corners.forEach(([x, y], k) => pos.set([x, -y, 0.03], (next * 6 + k) * 3))
			next = (next + 1) % MAX_SKIDS
			geo.attributes.position.needsUpdate = true
		},
	}
}

// The map image keeps its own colours: the ground samples the shadow map and
// multiplies by one fixed shade, so nothing is lit twice.
function groundMaterial(map, world) {
	const uniforms = THREE.UniformsUtils.merge([
		THREE.UniformsLib.lights,
		{
			sun: { value: new THREE.Color(GROUND_SUN) },
			deck: { value: new THREE.Color(DECK) },
			time: { value: 0 },
			size: { value: new THREE.Vector2(world.W, world.H) },
			shade: { value: new THREE.Color(GROUND_SHADE) },
		},
	])
	uniforms.map = { value: map }
	return new THREE.ShaderMaterial({
		lights: true,
		uniforms,
		vertexShader: `
			varying vec2 vUv;
			varying vec2 vTile;
			#include <common>
			#include <shadowmap_pars_vertex>

			void main() {
				vUv = uv;
				#include <beginnormal_vertex>
				#include <defaultnormal_vertex>
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vTile = worldPosition.xy;
				#include <shadowmap_vertex>
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform sampler2D map;
			uniform vec3 sun;
			uniform vec3 deck;
			uniform vec2 size;
			uniform float time;
			uniform vec3 shade;
			uniform bool receiveShadow;
			varying vec2 vUv;
			varying vec2 vTile;
			#include <common>
			#include <shadowmap_pars_fragment>
			#include <shadowmask_pars_fragment>
			${groundDetail}

			void main() {
				vec3 color = groundDetail(texture2D(map, vUv).rgb, vTile, time);
				float lit = getShadowMask();
				color *= mix(shade, sun, lit);
				// Sun glints on water: a few cells at a time flash a white point.
				vec2 gc = floor(vTile * 1.5);
				vec2 gp = fract(vTile * 1.5) - 0.25 - 0.5 * vec2(gHash(gc + 3.1), gHash(gc + 7.7));
				float flash = step(fract(gHash(gc) * 13.0 + time * 0.4), ${d(GROUND_DETAIL.glints)});
				float spot = step(abs(gp.x) + abs(gp.y), ${d(GROUND_DETAIL.glintSize * 1.5)});
				color = mix(color, ${glsl(GLINT)}, gWater * step(0.5, lit) * flash * spot);
				// The last few tiles fade into the sky under the clouds.
				vec2 edge = min(vTile * vec2(1.0, -1.0), size - vTile * vec2(1.0, -1.0));
				color = mix(deck, color, smoothstep(0.0, ${EDGE_FADE.toFixed(1)}, min(edge.x, edge.y)));
				gl_FragColor = vec4(color, 1.0);
				#include <colorspace_fragment>
			}
		`,
	})
}

// The ground's materials, told apart by the colour the map painted: green
// is lawn, dark grey is tarmac, pale grey is pavement, the khaki between is
// courtyards and bare ground. Every pattern comes in hard steps, like paint,
// and fades out before its stones get smaller than a pixel.
const d = (v) => v.toFixed(3)
const groundDetail = `
float gHash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float gNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float gBlots(vec2 p) {
	return gNoise(p) * 0.6 + gNoise(p * 2.3 + 7.1) * 0.4;
}

// Stones or slabs in staggered rows: x is the stone's own random, y how close to its
// edge this point is (0 in the middle, 1 on the joint).
vec2 gStones(vec2 p) {
	p.x += floor(p.y) * 0.5;
	vec2 cell = floor(p);
	vec2 f = abs(fract(p) - 0.5) * 2.0;
	return vec2(gHash(cell), max(f.x, f.y));
}

// Irregular stones: how close this point is to the joint between the
// nearest two, 0 on the joint.
float gSetts(vec2 p) {
	vec2 cell = floor(p);
	float f1 = 8.0;
	float f2 = 8.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 c = cell + vec2(x, y);
			vec2 o = c + 0.2 + 0.6 * vec2(gHash(c), gHash(c + 17.0)) - p;
			float dist = dot(o, o);
			if (dist < f1) {
				f2 = f1;
				f1 = dist;
			} else if (dist < f2) f2 = dist;
		}
	}
	return sqrt(f2) - sqrt(f1);
}

// Set by groundDetail: how much of this point is water.
float gWater = 0.0;

vec3 groundDetail(vec3 color, vec2 p, float time) {
	float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
	float green = color.g - max(color.r, color.b);
	float grey = 1.0 - smoothstep(0.03, 0.08, max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b)) - lum * 0.25);
	float lawn = smoothstep(0.05, 0.09, green);
	// Pitches are a bluer green than lawns and keep their mown look, water
	// a teal: green and blue well over red and close to each other.
	float pitch = lawn * smoothstep(0.5, 0.58, color.b / max(color.r, 0.001));
	float water = step(0.075, lum) * step(color.r * 1.5, color.g) * step(color.r * 1.5, color.b) * (1.0 - step(0.035, abs(color.g - color.b)));
	gWater = water;
	float tarmac = grey * (1.0 - water) * (1.0 - smoothstep(0.1, 0.14, lum));
	float pavement = grey * (1.0 - water) * smoothstep(0.3, 0.36, lum);
	float yard = grey * (1.0 - water) * (1.0 - tarmac) * (1.0 - pavement) * smoothstep(0.15, 0.19, lum);

	// Tiles per screen pixel: fine patterns fade before they shimmer.
	float px = length(fwidth(p));
	float fine = 1.0 - smoothstep(0.05, 0.1, px);
	float mid = 1.0 - smoothstep(0.15, 0.3, px);
	float f = 1.0;

	float clumps = gBlots(p * 0.8);
	vec2 tuft = gStones(p * 2.2);
	// Short pale dashes on open water, past the shallows, rows drifting
	// either way.
	vec2 q = p * vec2(0.9, 2.6);
	q.x += time * ${d(GROUND_DETAIL.waveDrift)} * 0.9 * (mod(floor(q.y), 2.0) * 2.0 - 1.0);
	vec2 wf = fract(q);
	f += water * (1.0 - step(0.2, lum)) * mid * step(0.72, gHash(floor(q))) * step(abs(wf.y - 0.5), 0.13) * step(abs(wf.x - 0.5), 0.3) * ${d(GROUND_DETAIL.waves)};

	f -= lawn * (1.0 - pitch) * (step(0.66, clumps) * ${d(GROUND_DETAIL.lawnClumps)} + step(0.93, tuft.x) * step(tuft.y, 0.45) * ${d(GROUND_DETAIL.lawnTufts)} * mid);

	float wear = gBlots(p * 0.45 + 3.7);
	float setts = gSetts(p * 4.0);
	f -= yard * (step(0.64, wear) * ${d(GROUND_DETAIL.yardWear)} + step(setts, 0.1) * ${d(GROUND_DETAIL.yardJoints)} * fine);

	vec2 slab = gStones(p * 2.0);
	f -= pavement * step(0.86, slab.y) * ${d(GROUND_DETAIL.pavingJoints)} * mid;

	float repair = gBlots(p * 0.3 + 11.3);
	f -= tarmac * step(0.73, repair) * ${d(GROUND_DETAIL.asphaltPatches)};

	return color * f;
}
`

// A colour as a linear GLSL vec3, for baking into shader source.
function glsl(hex) {
	const c = new THREE.Color(hex)
	return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
}

// One row of tones shared by every toon material: hard steps, no falloff.
function toonGradient() {
	const data = new Uint8Array([...TOON_BANDS.map(() => 0), ...TOON_BANDS].map((v) => Math.round(v * 255)))
	const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat)
	tex.minFilter = tex.magFilter = THREE.NearestFilter
	tex.generateMipmaps = false
	tex.needsUpdate = true
	return tex
}

// Outlines come as flat [x, y, x, y, …] rings in tiles. In the scene y points
// north, so flip it, and sort the rings into outer walls and courtyards.
function footprint(rings) {
	const polys = rings
		.map((r) => {
			const pts = []
			for (let i = 0; i < r.length; i += 2) pts.push(new THREE.Vector2(r[i], -r[i + 1]))
			if (pts.length > 1 && pts[0].equals(pts.at(-1))) pts.pop()
			return pts
		})
		.filter((pts) => pts.length >= 3)
		.sort((a, b) => Math.abs(THREE.ShapeUtils.area(b)) - Math.abs(THREE.ShapeUtils.area(a)))
	const shapes = []
	for (const pts of polys) {
		const owner = shapes.find((s) => inside(pts[0], s.outer))
		if (owner) owner.holes.push(THREE.ShapeUtils.isClockWise(pts) ? pts : pts.reverse())
		else shapes.push({ outer: THREE.ShapeUtils.isClockWise(pts) ? pts.reverse() : pts, holes: [] })
	}
	return shapes
}

function inside(p, poly) {
	let hit = false
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]
		const b = poly[j]
		if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) hit = !hit
	}
	return hit
}

// A building as the scene needs it: eaves height and outline in tiles, and
// a pitched roof if its roof is tiled and its outline allows one. `top` is the height of the roof at a point.
function house(b, n, tileM) {
	const h = b.h / tileM
	const parts = footprint(b.rings)
	const pitched = parts.length === 1 && roofOf(b, n).ridge
	const rings = [parts[0]?.outer, ...(parts[0]?.holes ?? [])].map((r) => r?.map((p) => [p.x, p.y]))
	const roof = pitched ? roofShape(rings, b.h, tileM) : null
	// The building's axis, along its longest wall, for lining up tar paper.
	let axis = 0
	let longest = 0
	const outer = parts[0]?.outer ?? []
	outer.forEach((a, i) => {
		const e = outer[(i + 1) % outer.length]
		if (a.distanceTo(e) > longest) [longest, axis] = [a.distanceTo(e), Math.atan2(e.y - a.y, e.x - a.x)]
	})
	return { h, parts, roof, axis, top: roof ? (x, y) => h + roofHeight(roof, x, y) : () => h }
}

// Every edge of every outline becomes one wall quad, outer rings
// anticlockwise and courtyards clockwise, so walls face away from the
// building. Each building gets a plaster colour from a stable hash.
function walls(houses, tileM, gradient) {
	const pos = []
	const nor = []
	const col = []
	const wall = [] // per vertex: distance along the wall, windows that fit, building height
	const plaster = FACADES.map((f) => new THREE.Color(f))
	const c = new THREE.Color()
	houses.forEach(({ h, parts, top }, n) => {
		const j = roofHash(n + 500)
		c.copy(plaster[Math.floor(j * plaster.length)]).offsetHSL(0, 0, (roofHash(n + 900) - 0.5) * 0.08)
		for (const { outer, holes } of parts) {
			for (const ring of [outer, ...holes]) {
				for (let i = 0; i < ring.length; i++) {
					const a = ring[i]
					const e = ring[(i + 1) % ring.length]
					const len = a.distanceTo(e)
					if (len < 0.01) continue
					const nx = (e.y - a.y) / len
					const ny = -(e.x - a.x) / len
					// Centre the windows on the wall; too short a wall gets none.
					const fit = len < 0.7 ? 0 : Math.floor(len)
					const lead = (len - fit) / 2
					// Up to the roof, which under a pitched one is above the eaves.
					const ta = top(a.x, a.y)
					const te = top(e.x, e.y)
					const quad = [
						[a, 0, 0],
						[e, 0, len],
						[e, te, len],
						[a, 0, 0],
						[e, te, len],
						[a, ta, 0],
					]
					for (const [p, z, d] of quad) {
						pos.push(p.x, p.y, z)
						nor.push(nx, ny, 0)
						col.push(c.r, c.g, c.b)
						wall.push(d - lead, fit, h)
					}
				}
			}
		}
	})
	const geo = new THREE.BufferGeometry()
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
	geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
	geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
	geo.setAttribute('wall', new THREE.Float32BufferAttribute(wall, 3))
	const mesh = new THREE.Mesh(geo, wallMaterial(tileM, gradient))
	mesh.castShadow = true
	mesh.receiveShadow = true
	return mesh
}

// Every chimney is one instance of one box, so the whole city's stacks are a
// single draw, and they cast real shadows down the roof.
function chimneys(list, houses, gradient) {
	const geo = new THREE.BoxGeometry(CHIMNEY.length, CHIMNEY.width, CHIMNEY.height).translate(0, 0, CHIMNEY.height / 2)
	const mesh = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: '#fff', gradientMap: gradient }), list.length)
	mesh.castShadow = true
	mesh.receiveShadow = true
	mesh.frustumCulled = false
	const m = new THREE.Matrix4()
	const q = new THREE.Quaternion()
	const z = new THREE.Vector3(0, 0, 1)
	const at = new THREE.Vector3()
	const one = new THREE.Vector3(1, 1, 1)
	const c = new THREE.Color()
	list.forEach((ch, i) => {
		m.compose(at.set(ch.x, -ch.y, houses[ch.n].top(ch.x, -ch.y) - 0.05), q.setFromAxisAngle(z, -ch.angle), one)
		mesh.setMatrixAt(i, m)
		mesh.setColorAt(i, c.set(CHIMNEY.colors[Math.floor(ch.tone * CHIMNEY.colors.length)]))
	})
	return mesh
}

// Every outline filled in at its building's height, or raised into its
// pitched roof, all in one mesh. Pitched faces are flat-shaded, so each slope
// takes one light band and the ink finds the ridges and hips.
function roofs(houses, world, gradient, tex) {
	const tops = []
	const flat = (shape, z, axis) => {
		const geo = new THREE.ShapeGeometry(shape).translate(0, 0, z).toNonIndexed()
		geo.deleteAttribute('uv')
		return withAxis(geo, axis)
	}
	for (const { h, parts, roof, axis } of houses) {
		if (!roof) {
			for (const { outer, holes } of parts) {
				const shape = new THREE.Shape(outer)
				shape.holes = holes.map((hole) => new THREE.Path(hole))
				tops.push(flat(shape, h, axis))
			}
			continue
		}
		// Under a mansard, which follows a simplified outline, the flat roof
		// stays just below to fill the slivers it leaves.
		if (roof.kind === 'mansard') {
			const shape = new THREE.Shape(parts[0].outer)
			shape.holes = parts[0].holes.map((hole) => new THREE.Path(hole))
			tops.push(flat(shape, h - 0.02, axis))
		}
		const tris = roofTriangles(roof, triangulate)
		const pos = []
		for (let i = 0; i < tris.length; i += 3) pos.push(tris[i], tris[i + 1], h + tris[i + 2])
		const geo = new THREE.BufferGeometry()
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
		geo.computeVertexNormals()
		tops.push(withAxis(geo, axis))
	}
	if (!tops.length) return new THREE.Group() // an area without buildings
	const mesh = new THREE.Mesh(mergeGeometries(tops), roofMaterial(world, gradient, tex))
	mesh.castShadow = true
	mesh.receiveShadow = true
	return mesh
}

function withAxis(geo, axis) {
	geo.setAttribute('axis', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(axis), 1))
	return geo
}

// Earcut over [x, y] points, as roofs.js wants it: indices into the
// contour followed by the holes.
function triangulate(contour, holes) {
	const v = (r) => r.map(([x, y]) => new THREE.Vector2(x, y))
	return THREE.ShapeUtils.triangulateShape(v(contour), holes.map(v))
}

// The roof image is one texture for the whole map, so each roof looks up its
// patch by world position. Slopes draw their own tile courses: lines of
// equal height, so they run along the eaves of every face.
function roofMaterial(world, gradient, tex) {
	const material = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient })
	material.onBeforeCompile = (shader) => {
		const decl = 'varying vec3 vRoofPos;\nvarying vec3 vRoofNormal;\nvarying float vRoofAxis;\n'
		shader.vertexShader =
			'attribute float axis;\n' +
			decl +
			shader.vertexShader.replace(
				'#include <uv_vertex>',
				`#include <uv_vertex>
				vMapUv = vec2(position.x / ${world.W.toFixed(1)}, 1.0 + position.y / ${world.H.toFixed(1)});
				vRoofPos = position;
				vRoofNormal = normal;
				vRoofAxis = axis;`,
			)
		shader.fragmentShader =
			decl +
			'float tarHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
			shader.fragmentShader.replace(
				'#include <map_fragment>',
				`#include <map_fragment>
				if (vRoofNormal.z < 0.97) {
					float row = vRoofPos.z / ${ROOF_TILES.row.toFixed(3)};
					float aa = fwidth(row);
					float course = 1.0 - smoothstep(${ROOF_TILES.line.toFixed(2)} - aa, ${ROOF_TILES.line.toFixed(2)} + aa, fract(row));
					diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.25, 0.5, aa)) * course * ${ROOF_TILES.ink.toFixed(2)};
				} else if (max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)) < 0.05) {
					${tarPaper}
				}`,
			)
	}
	return material
}

// Grey flat roofs are tar paper, lined up with the building: pale seams
// between the rolls, newer and older patches, and now and then a roof hatch with its
// shadow, or a vent. Sizes in tiles; the hatch shadow falls away from the sun.
const TAR = {
	seam: 0.34, // roll width
	seamLight: 0.35, // the sealed overlaps catch the light
	patch: [2.2, 1.3], // patch size
	patchTone: 0.14,
	hatchCell: 3.5, // one hatch at most per cell this size
	hatchShare: 0.55, // cells without one
	hatch: 0.3, // half size
	frame: '#b9bdc0',
	lid: '#8c949b',
	ventCell: 1.7,
	ventShare: 0.86,
	vent: 0.08,
}
// Where a raised thing's shadow falls, in tiles: away from the sun.
const SUN_AWAY = [-SUN.direction[0] * 0.12, -SUN.direction[1] * 0.12]

const tarPaper = `
	vec2 ax = vec2(cos(vRoofAxis), sin(vRoofAxis));
	vec2 side = vec2(-ax.y, ax.x);
	vec2 uv = vec2(dot(vRoofPos.xy, ax), dot(vRoofPos.xy, side));
	float fine = 1.0 - smoothstep(0.05, 0.1, length(fwidth(uv)));
	float f = 1.0 + step(fract(uv.y / ${TAR.seam.toFixed(3)}), 0.1) * ${TAR.seamLight.toFixed(2)} * fine;
	float patch_ = tarHash(floor(uv / vec2(${TAR.patch[0].toFixed(2)}, ${TAR.patch[1].toFixed(2)})));
	f += (step(0.86, patch_) - step(patch_, 0.12)) * ${TAR.patchTone.toFixed(2)};
	diffuseColor.rgb *= f;
	// A hatch at a random spot in some cells: lid, frame, shadow.
	vec2 cell = floor(uv / ${TAR.hatchCell.toFixed(1)});
	vec2 at = (cell + 0.3 + 0.4 * vec2(tarHash(cell + 1.7), tarHash(cell + 9.1))) * ${TAR.hatchCell.toFixed(1)};
	float hatch = step(${TAR.hatchShare.toFixed(2)}, tarHash(cell + 5.3));
	vec2 d = uv - at;
	vec2 ds = vec2(dot(vRoofPos.xy - ${glslVec(SUN_AWAY)}, ax), dot(vRoofPos.xy - ${glslVec(SUN_AWAY)}, side)) - at;
	float lid = max(abs(d.x), abs(d.y));
	float shadow = step(max(abs(ds.x), abs(ds.y)), ${TAR.hatch.toFixed(2)}) * step(${TAR.hatch.toFixed(2)}, lid);
	diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, hatch * shadow);
	diffuseColor.rgb = mix(diffuseColor.rgb, lid > ${(TAR.hatch * 0.6).toFixed(2)} ? ${glsl(TAR.frame)} : ${glsl(TAR.lid)}, hatch * step(lid, ${TAR.hatch.toFixed(2)}));
	// Vents: small dark dots.
	vec2 vcell = floor(uv / ${TAR.ventCell.toFixed(1)});
	vec2 vd = uv - (vcell + 0.25 + 0.5 * vec2(tarHash(vcell + 3.3), tarHash(vcell + 4.4))) * ${TAR.ventCell.toFixed(1)};
	diffuseColor.rgb *= 1.0 - step(${TAR.ventShare.toFixed(2)}, tarHash(vcell + 8.8)) * step(length(vd), ${TAR.vent.toFixed(2)}) * 0.6 * fine;
`
function glslVec([x, y]) {
	return `vec2(${x.toFixed(3)}, ${y.toFixed(3)})`
}

// Walls draw their own windows: one per 3 m along the wall and per storey up
// it, wider shop windows on the ground floor, a ledge between storeys and now
// and then a lit window. Sheds and garages stay blank.
function wallMaterial(tileM, gradient) {
	const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient })
	const storey = (3.2 / tileM).toFixed(3)
	material.onBeforeCompile = (shader) => {
		const decl = 'varying vec3 vWall;\nvarying float vZ;\n'
		shader.vertexShader =
			'attribute vec3 wall;\n' +
			decl +
			shader.vertexShader.replace(
				'#include <project_vertex>',
				`#include <project_vertex>
				vWall = wall;
				vZ = position.z;`,
			)
		shader.fragmentShader =
			decl +
			shader.fragmentShader.replace(
				'#include <color_fragment>',
				`#include <color_fragment>
				float along = vWall.x;
				vec2 aa = fwidth(vec2(along, vZ / ${storey}));
				if (vWall.z > 2.0 && along > 0.0 && along < vWall.y && vZ < vWall.z - 0.3) {
					float f = floor(vZ / ${storey});
					float fz = fract(vZ / ${storey});
					float u = fract(along);
					float shop = f < 0.5 ? 1.0 : 0.0;
					float halfW = mix(0.22, 0.4, shop);
					float lo = mix(0.35, 0.1, shop);
					float hi = mix(0.8, 0.74, shop);
					float wx = smoothstep(0.5 - halfW - aa.x, 0.5 - halfW + aa.x, u) * (1.0 - smoothstep(0.5 + halfW - aa.x, 0.5 + halfW + aa.x, u));
					float wz = smoothstep(lo - aa.y, lo + aa.y, fz) * (1.0 - smoothstep(hi - aa.y, hi + aa.y, fz));
					// Rounded, because interpolated varyings wobble in their last bits
					// and the hash would blow that up into speckle.
					float wallId = floor(vWall.y + 0.5) + floor(vWall.z * 8.0 + 0.5);
					float bay = fract(sin(dot(vec3(floor(along), f, wallId), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
					// Dark glass with a pale glint across its top corner, now and
					// then a lit window.
					float wu = (u - 0.5 + halfW) / (2.0 * halfW);
					float wv = (fz - lo) / (hi - lo);
					float glint = step(abs(wu - wv - 0.15), 0.12) * (1.0 - shop);
					vec3 glass = bay > 0.94 ? ${glsl(WALL.lit)} : mix(${glsl(WALL.glass)}, ${glsl(WALL.glint)}, glint);
					diffuseColor.rgb = mix(diffuseColor.rgb, glass, wx * wz);
					// A pale sill under each upper window.
					float sill = step(lo - ${WALL.sill.toFixed(3)}, fz) * step(fz, lo) * step(abs(u - 0.5), halfW + 0.04) * (1.0 - shop);
					diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(WALL.stucco)}, sill * 0.8);
					// Shopfronts: an awning over some, plain or striped.
					float awning = shop * step(bay, ${WALL.awnings.toFixed(2)}) * step(hi + 0.03, fz) * step(fz, 0.97) * step(abs(u - 0.5), halfW + 0.06);
					float pick = fract(bay * 7.31);
					vec3 cloth = pick < 0.25 ? ${glsl(AWNINGS[0])} : pick < 0.5 ? ${glsl(AWNINGS[1])} : pick < 0.75 ? ${glsl(AWNINGS[2])} : ${glsl(AWNINGS[3])};
					if (fract(bay * 3.7) < 0.5 && fract(along * 5.0) < 0.5) cloth = ${glsl(WALL.stucco)};
					diffuseColor.rgb = mix(diffuseColor.rgb, cloth, awning);
					float ledge = 1.0 - smoothstep(0.0, 0.05 + aa.y, fz);
					diffuseColor.rgb *= 1.0 - 0.3 * ledge * (1.0 - shop);
				}
				// Cornice: a pale stucco band under the roof with a dark line of
				// its own shadow beneath.
				if (vWall.z > 2.0) {
					float down = vWall.z - vZ;
					diffuseColor.rgb = down < 0.0 ? diffuseColor.rgb : down < ${WALL.cornice[0].toFixed(3)} ? mix(diffuseColor.rgb, ${glsl(WALL.stucco)}, 0.45) : down < ${WALL.cornice[1].toFixed(3)} ? diffuseColor.rgb * 0.62 : diffuseColor.rgb;
				}
				// Darker towards the foot, in two steps, where the street's
				// grime and the ground's shade reach up the wall.
				diffuseColor.rgb *= vZ < ${FOOT[0].toFixed(3)} ? ${FOOT[2].toFixed(2)} : vZ < ${FOOT[1].toFixed(3)} ? ${FOOT[3].toFixed(2)} : 1.0;`,
			)
	}
	return material
}
