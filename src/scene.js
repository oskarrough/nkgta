// The city in 3D, the GTA 1 way: the flat map on the ground, every building
// raised from its outline, and a perspective camera looking straight down, so
// walls lean outwards towards the screen edges.
import * as THREE from 'three'
import { groundGeometry, groundMaterial } from './scene-ground.js'
import { SHOP_GLOW, wallGeometry, wallMaterial } from './scene-walls.js'
import { house, chimneys, hatches, roofGeometry, roofMaterial } from './scene-roofs.js'
import { createSkyLighting } from './scene-sky.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { roofHatches, roofSpots } from './map-image.js'
import { createInk } from './ink.js'
import { DEFAULT_LOOK, LOOKS, nextLook, upscaleOf } from './looks.js'
import { createBridges } from './bridges.js'
import { createTrees, createTrunks } from './trees.js'
import { createFurniture } from './street-furniture.js'
import { createNightPools } from './night-pools.js'
import { createClouds, DECK } from './clouds.js'
import { createWeather } from './weather.js'
import { MODELS } from './models.js'
import { timePasses } from './perf.js'
import { BLANK, createChunks } from './chunks.js'
import { createSigns } from './signs.js'
import { createFascia } from './fascia.js'
import { createFrontPanels } from './front-panels.js'
import { createOpening } from './opening.js'
import { createLandmarks } from './landmarks.js'
import { START_HOUR } from './daylight.js'
import { createFirewalls } from './firewalls.js'
import { createMurals } from './murals.js'

// Flat bands instead of a falloff, from grazing sun to full sun. Faces turned
// away from the sun get none at all, so they can't flicker in and out of shadow.
const TOON_BANDS = [0.3, 0.55, 0.8, 1.0]

// Trees go in cells this many tiles a side, so the view only draws those
// near it. Below DETAIL_PX screen pixels a tile they turn into simple
// blobs and chimneys, a pixel wide by then, go.
const TREE_CELL = 32
const DETAIL_PX = 3
const SIGNS_PER_ATLAS = 24
const inChunk = (c, { x, y }) => x >= c.x && y >= c.y && x < c.x + c.w && y < c.y + c.h

// Narrow, so the camera sits high and walls lean gently, like GTA 1.
const FOV = 40

// Cars are too small for the shadow map: a flat quad away from the sun keeps
// their shadow crisp and stops them speckling.
const CAR_SHADOW = { opacity: 0.42, offset: 0.34, stretch: 1.15 }

export function createScene(canvas, world, shops = [], opening) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
	renderer.setPixelRatio(devicePixelRatio)
	const scene = new THREE.Scene()
	scene.background = new THREE.Color(DECK)
	const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 5000)
	const streetFog = new THREE.Fog(DECK, 35, 60)

	// Hard shadows, one crisp step: no soft edges to smudge the flat fills.
	renderer.shadowMap.enabled = true
	renderer.shadowMap.type = THREE.PCFShadowMap

	// Tile (x, y) sits at (x, -y), so north stays up and z is height in tiles.
	// The city comes in chunks (see chunks.js), each with its own ground,
	// walls, roofs, chimneys and trees, which take their textures as they're
	// painted. Crisp texels only on the pixel grid; the other looks keep
	// their filtered, anisotropic textures.
	const gradient = toonGradient()
	const time = { value: 0 }
	// What the clock sets, shared by every material that needs it: the
	// ground's sun and shade, the sky at the map edge, where the light comes
	// from, how night it is and the share of flats with the lamp on.
	const sky = {
		sun: { value: new THREE.Color() },
		shade: { value: new THREE.Color() },
		deck: { value: new THREE.Color(DECK) },
		toSun: { value: new THREE.Vector3(0, 0, 1) },
		night: { value: 0 },
		home: { value: 0 },
	}
	const weather = createWeather(world, shops, sky.night)
	scene.add(weather.streaks)
	const wallLook = wallMaterial(world.tileM, gradient, sky)
	// Before the chunks and firewalls: a landmark lowers the plain block under it.
	const landmarks = createLandmarks(world, gradient, sky)
	const city = createCity(world, renderer, { shops, gradient, sky, time, wallLook, weather, opening })
	scene.add(city.group, landmarks)
	const clouds = createClouds(world, gradient)
	scene.add(clouds.layer)
	const cars = carMeshes(gradient, world)
	const skids = skidMarks(world)
	scene.add(...cars.meshes, skids.mesh)
	const { sun, focusSun, setHour } = createSkyLighting(scene, world, sky, streetFog, clouds, cars)
	setHour(START_HOUR)

	const ink = createInk(
		renderer,
		[skids.mesh, weather.streaks, ...cars.beams],
		[skids.mesh, clouds.layer, weather.streaks, ...cars.shadows, ...cars.beams],
	)
	timePasses(renderer, ['color', 'ink', 'blit'])

	// The look, cycled with P; see looks.js for what each one does.
	let quizClues = true
	let look = DEFAULT_LOOK

	// The game frame is the canvas at one texel per game pixel, blown up by a
	// whole number of device pixels. Resize only when that number changes.
	let upscale = 0
	function fit(scale) {
		const want = upscaleOf(LOOKS[look], scale)
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
		ink.setLook(LOOKS[name])
		city.setCrisp(LOOKS[name].grid)
		upscale = 0
	}
	setLook(look)

	// Same view as the 2D overlay: `scale` device pixels per tile at street
	// level, top-left corner at (cam.x, cam.y) in those pixels.
	function aim(cam) {
		fit(cam.scale)
		camera.layers.set(0)
		if (quizClues) camera.layers.enable(1)
		const { width, height } = ink.frame
		camera.fov = cam.third ? 65 : FOV
		camera.near = cam.third ? 0.03 : 0.1
		camera.far = cam.third ? 60 : 5000
		camera.updateProjectionMatrix()
		scene.fog = cam.third ? streetFog : null
		if (cam.third) {
			const { x, y, z, target } = cam.third
			camera.up.set(0, 0, 1)
			camera.position.set(x, -y, z)
			camera.lookAt(target.x, -target.y, target.z)
			return camera
		}
		camera.up.set(0, 1, 0)
		camera.rotation.set(0, 0, 0)
		const cx = (cam.x + width / 2) / cam.scale
		const cy = -(cam.y + height / 2) / cam.scale
		// As high over the ground in the middle of the view as over flat land,
		// so the flat layer on top still lines up there.
		camera.position.set(cx, cy, (cam.ground ?? world.heightAt(cx, -cy)) + height / 2 / cam.scale / Math.tan((FOV / 2) * (Math.PI / 180)))
		return camera
	}

	// `view` and `target` draw the city from another camera into a texture,
	// for the street seen through a shop's portal.
	function render(cam, carList, { view = aim(cam), target = null } = {}) {
		cars.update(carList)
		wallLook.userData.rooms.value = cam.third ? 1 : 0
		for (const c of carList) {
			for (const m of c.marks) skids.add(...m)
			c.marks.length = 0
		}
		const { width, height } = ink.frame
		focusSun(view.position.x, view.position.y, cam.third ? 32 : Math.hypot(width, height) / cam.scale / 2)
		sun.shadow.needsUpdate = sun.shadow.intensity > 0
		clouds.layer.visible = !cam.third
		if (!cam.third) clouds.follow(view)
		time.value = performance.now() / 1000
		city.update(viewOf(cam), cam.scale)
		sun.updateMatrixWorld()
		sun.target.updateMatrixWorld()
		sun.shadow.updateMatrices(sun)
		city.cull(view, sun.shadow.needsUpdate && renderer.shadowMap.enabled ? sun.shadow.getFrustum() : null)
		ink.render(scene, view, target)
	}

	// The ground on screen, in tiles.
	function viewOf(cam) {
		if (cam.bounds) return cam.bounds
		fit(cam.scale)
		const { width, height } = ink.frame
		return { x0: cam.x / cam.scale, y0: cam.y / cam.scale, x1: (cam.x + width) / cam.scale, y1: (cam.y + height) / cam.scale }
	}

	return {
		render,
		showQuizClues: (show) => (quizClues = show),
		weather,
		setHour,
		renderer,
		scene,
		aim,
		gradient,
		add: (...objects) => scene.add(...objects),
		// Another scene, such as a shop inside, in the same look.
		draw: (other, view, target = null) => ink.render(other, view, target),
		// Resolves once what's on screen at \`cam\` is painted, the shaders
		// compiled meanwhile, and a first frame drawn.
		async ready(cam) {
			await Promise.all([city.ready(viewOf(cam), cam.scale), renderer.compileAsync(scene, aim(cam))])
			render(cam, [])
		},
		chunks: city,
		// Only the pixel grid needs the camera on whole game pixels.
		pixelGrid: () => LOOKS[look].grid,
		// The plain look comes with the walk grid on.
		showsWalls: () => LOOKS[look].plain,
		look: () => look,
		// P: the next look, by name.
		cycleLook() {
			setLook(nextLook(look))
			return look
		},
	}
}

// Shared by the live scene and the CPU performance tripwires.
export function createCity(world, renderer, { shops = [], gradient, sky, time, wallLook, weather, opening = createOpening() }) {
	const firewalls = createFirewalls(world)
	const murals = createMurals(world, firewalls, gradient)
	// A generator, so chunks can be built a building at a time between frames.
	return createChunks(world, renderer, function* (chunk) {
		const group = new THREE.Group()
		const plane = new THREE.Mesh(groundGeometry(chunk, world), groundMaterial(BLANK.ground, world))
		plane.receiveShadow = true
		Object.assign(plane.material.uniforms, { time, sun: sky.sun, shade: sky.shade, deck: sky.deck, toSun: sky.toSun })
		group.add(plane)
		const houses = []
		const wallParts = []
		const roofParts = []
		const spots = []
		const lids = []
		for (const n of chunk.buildings) {
			const h = house(world.buildings[n], n, world)
			houses.push(h)
			wallParts.push(wallGeometry([h], world, firewalls))
			const roof = roofGeometry([h])
			if (roof) roofParts.push(roof)
			spots.push(...roofSpots(world.buildings[n], n).filter((s) => s.chimney))
			lids.push(...roofHatches(world.buildings[n], n, h.roof))
			yield
		}
		const roofRect = new THREE.Vector4()
		const top = roofParts.length ? new THREE.Mesh(mergeGeometries(roofParts), roofMaterial(roofRect, gradient, BLANK.roofs)) : null
		const sides = houses.length ? new THREE.Mesh(mergeGeometries(wallParts), wallLook) : null
		for (const mesh of [sides, top]) {
			if (!mesh) continue
			mesh.castShadow = true
			mesh.receiveShadow = true
			group.add(mesh)
		}
		const paintings = murals.decals(houses)
		if (paintings) group.add(paintings)
		yield
		const bridges = createBridges(world, chunk, gradient)
		if (bridges) group.add(bridges)
		yield
		const byIndex = []
		for (const h of houses) byIndex[h.n] = h
		const stacks = spots.length && chimneys(spots, byIndex, gradient)
		const hatchMesh = lids.length && hatches(lids, byIndex, gradient)
		yield
		// Awnings over the chunk's shop doors, a few atlases' worth at a time.
		const mine = [...shops.keys()].filter((i) => inChunk(chunk, shops[i]))
		for (let k = 0; k < mine.length; k += SIGNS_PER_ATLAS) {
			const signs = createSigns(shops, gradient, mine.slice(k, k + SIGNS_PER_ATLAS), world.heightAt, opening)
			glowAtNight(signs.material, SHOP_GLOW.awning, sky.night)
			signs.layers.set(1)
			group.add(signs)
			yield
		}
		// Their names on the wall above the windows, and every other shop's.
		const fascia = createFascia(world, chunk, gradient, sky.night, opening)
		fascia.traverse((mesh) => mesh.layers.set(1))
		group.add(fascia)
		const panels = createFrontPanels(world, chunk, opening, sky.night)
		if (panels) {
			panels.layers.set(1)
			group.add(panels)
		}
		yield
		// Trees in cells, so the view skips most of them, or one plain blob
		// each across the chunk once they're too small on screen for lumps.
		const cells = new Map()
		for (const i of chunk.trees) {
			const t = world.trees[i]
			const key = Math.floor(t.x / TREE_CELL) * 4096 + Math.floor(t.y / TREE_CELL)
			cells.set(key, [...(cells.get(key) ?? []), i])
		}
		const near = [...cells.values()].flatMap((pick) => [createTrees(world, gradient, pick), createTrunks(world, gradient, pick)])
		const far = chunk.trees.length ? [createTrees(world, gradient, chunk.trees, true)] : []
		for (const mesh of [stacks, hatchMesh, ...near, ...far]) {
			if (!mesh) continue
			mesh.frustumCulled = true
			mesh.computeBoundingSphere()
			group.add(mesh)
		}
		yield
		const pools = createNightPools(world, chunk, shops, sky.night, opening)
		if (pools) group.add(pools)
		const furniture = createFurniture(world, gradient, chunk, sky.night)
		weather.ground(plane.material, chunk, furniture.lamps)
		for (const mesh of furniture.meshes) group.add(mesh)
		const uv = plane.geometry.attributes.uv
		return {
			group,
			roofs: houses.filter((h) => h.roof).map((h) => [h.n, h.roof]),
			zoom(scale) {
				for (const mesh of near) mesh.visible = scale >= DETAIL_PX
				for (const mesh of far) mesh.visible = scale < DETAIL_PX
				if (stacks) stacks.visible = scale >= DETAIL_PX
				if (hatchMesh) hatchMesh.visible = scale >= DETAIL_PX
				furniture.zoom(scale)
			},
			// Point the ground's corners, or the roofs' world positions, at
			// where the chunk sits in the texture.
			show(kind, texture, area) {
				if (kind === 'roofs') {
					if (!top) return
					top.material.map = texture
					roofRect.set(area.x, area.y, area.w, area.h)
					return
				}
				plane.material.uniforms.map.value = texture
				const at = plane.geometry.attributes.position
				for (let i = 0; i < uv.count; i++) uv.setXY(i, (at.getX(i) - area.x) / area.w, 1 - (-at.getY(i) - area.y) / area.h)
				uv.needsUpdate = true
			},
		}
	})
}

// At night a material glows this much of its own colour, lit from inside.
function glowAtNight(material, strength, night) {
	material.onBeforeCompile = (shader) => {
		shader.uniforms.night = night
		shader.vertexShader =
			'attribute float isOpen; varying float vOpen;\n' +
			shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvOpen = isOpen;')
		shader.fragmentShader =
			'uniform float night; varying float vOpen;\n' +
			shader.fragmentShader.replace(
				'#include <emissivemap_fragment>',
				`#include <emissivemap_fragment>
			totalEmissiveRadiance += diffuseColor.rgb * vOpen * night * ${strength.toFixed(2)};`,
			)
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
const FIXED = { glass: '#2a3540', roofbox: '#9a9a96', sign: '#f2d13a', tyre: '#303231' }
const CAR_HEADLIGHT = '#fff3c8'
// Cars are too low for the ink pass to find their edges, so they sit on a
// dark rim this much wider than the body, in tiles. Tyres poke out past it.
const CAR_RIM = { color: '#1a1e1b', width: 0.045 }
// At night the headlights throw a beam on the road ahead: length and width
// at its far end in tiles, and how bright, near half and far half.
const BEAM = { length: 2.6, width: 1.9, near: 0.32, far: 0.15 }
function carMeshes(gradient, world) {
	const box = (l, w, h, x, z, y = 0) => new THREE.BoxGeometry(l, w, h).translate(x, y, z + h / 2)
	// Away from the sun, in scene units, and a flat quad to cast it.
	const away = new THREE.Vector2()
	const beamMaterial = new THREE.MeshBasicMaterial({
		color: CAR_HEADLIGHT,
		alphaMap: beamTexture(),
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
	})
	const shadowMaterial = new THREE.MeshBasicMaterial({
		color: '#000',
		transparent: true,
		opacity: CAR_SHADOW.opacity,
		depthWrite: false,
	})
	const kinds = Object.values(MODELS).map((m) => {
		const boxes = new Map()
		const add = (kind, geo) => boxes.set(kind, [...(boxes.get(kind) ?? []), geo])
		for (const [kind, l, w, h, x, z, y = 0] of m.look) add(kind, box(l * m.length, w * m.width, h, x * m.length, z, y * m.width))
		const [, , , h, , z] = m.look[0]
		// They come up through the top of the body, so from above pale lamps
		// at the front and red at the back say which way it points.
		const lamp = (x, s) => box(0.08, 0.15, 0.05, x, z + h - 0.04).translate(0, (s * m.width) / 3, 0)
		for (const s of [-1, 1]) {
			add('lights', lamp(-m.length / 2 + 0.03, s))
			add('heads', lamp(m.length / 2 - 0.03, s))
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
		const beam = new THREE.InstancedMesh(
			new THREE.PlaneGeometry(BEAM.length, BEAM.width).translate(m.length / 2 + BEAM.length / 2, 0, 0),
			beamMaterial,
			MAX_CARS,
		)
		beam.count = 0
		beam.frustumCulled = false
		return { model: m, parts, shadow, beam }
	})
	const m = new THREE.Matrix4()
	const ms = new THREE.Matrix4()
	const at = new THREE.Vector3()
	const q = new THREE.Quaternion()
	const one = new THREE.Vector3(1, 1, 1)
	const up = new THREE.Vector3()
	const ahead = new THREE.Vector3()
	const side = new THREE.Vector3()
	const basis = new THREE.Matrix4()
	const c = new THREE.Color()
	const lit = new THREE.Color('#ff2a1a')
	const dim = new THREE.Color('#5a0d0a')
	return {
		meshes: kinds.flatMap((k) => [...k.parts.map((p) => p.mesh), k.shadow, k.beam]),
		shadows: kinds.map((k) => k.shadow),
		beams: kinds.map((k) => k.beam),
		// Shadows fall away from the light and fade with it; beams come on at night.
		light(toSun, shadow, night) {
			away.set(-toSun.x, -toSun.y).normalize().multiplyScalar(CAR_SHADOW.offset)
			shadowMaterial.opacity = CAR_SHADOW.opacity * shadow
			beamMaterial.opacity = night
			for (const k of kinds) {
				k.shadow.visible = shadow > 0
				k.beam.visible = night > 0
			}
		},
		update(cars) {
			for (const { model, parts, shadow, beam } of kinds) {
				let n = 0
				for (const car of cars) {
					if (car.model !== model || n >= MAX_CARS) continue
					// Turned to its heading and tilted with the slope it stands on.
					const [sx, sy] = world.slopeAt(car.x, car.y)
					up.set(-sx, sy, 1).normalize()
					ahead.set(Math.cos(car.angle), -Math.sin(car.angle), 0)
					ahead.addScaledVector(up, -ahead.dot(up)).normalize()
					side.crossVectors(up, ahead)
					q.setFromRotationMatrix(basis.makeBasis(ahead, side, up))
					const ground = world.heightAt(car.x, car.y)
					m.compose(at.set(car.x, -car.y, ground), q, one)
					ms.compose(at.set(car.x + away.x, -car.y + away.y, world.heightAt(car.x + away.x, car.y - away.y) + 0.03), q, one)
					shadow.setMatrixAt(n, ms)
					beam.setMatrixAt(n, ms.compose(at.set(car.x, -car.y, ground + 0.04), q, one))
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
				beam.count = n
				beam.instanceMatrix.needsUpdate = true
				for (const { mesh } of parts) {
					mesh.count = n
					mesh.instanceMatrix.needsUpdate = true
					if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
				}
			}
		},
	}
}

// A headlight beam from above: a wedge widening from the car's front, in two
// flat steps of brightness rather than a falloff. Along x, away from the car.
function beamTexture() {
	const canvas = Object.assign(document.createElement('canvas'), { width: 32, height: 32 })
	const g = canvas.getContext('2d')
	const wedge = (x0, x1, alpha) => {
		const half = (x) => 4 + (12 * x) / 32
		const v = Math.round(alpha * 255)
		g.fillStyle = `rgb(${v}, ${v}, ${v})`
		g.beginPath()
		g.moveTo(x0, 16 - half(x0))
		g.lineTo(x1, 16 - half(x1))
		g.lineTo(x1, 16 + half(x1))
		g.lineTo(x0, 16 + half(x0))
		g.fill()
	}
	wedge(0, 14, BEAM.near)
	wedge(14, 32, BEAM.far)
	const tex = new THREE.CanvasTexture(canvas)
	tex.minFilter = tex.magFilter = THREE.NearestFilter
	tex.generateMipmaps = false
	return tex
}

// Rubber on the road: a ring of thin quads, the oldest painted over first.
const MAX_SKIDS = 4000
function skidMarks(world) {
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
			corners.forEach(([x, y], k) => pos.set([x, -y, world.heightAt(x, y) + 0.03], (next * 6 + k) * 3))
			next = (next + 1) % MAX_SKIDS
			geo.attributes.position.needsUpdate = true
		},
	}
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
