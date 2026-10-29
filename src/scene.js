// The city in 3D, the GTA 1 way: the flat map on the ground, every building
// raised from its outline, and a perspective camera looking straight down, so
// walls lean outwards towards the screen edges.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { roofHash, roofHatches, roofOf, roofSpots } from './map-image.js'
import { roofHeight, roofShape, roofTriangles } from './roofs.js'
import { createInk } from './ink.js'
import { DEFAULT_LOOK, LOOKS, nextLook, upscaleOf } from './looks.js'
import { createBridges } from './bridges.js'
import { createTrees, createTrunks } from './trees.js'
import { createClouds, DECK } from './clouds.js'
import { MODELS } from './models.js'
import { timePasses } from './perf.js'
import { BLANK, createChunks } from './chunks.js'
import { createSigns } from './signs.js'
import { createFascia } from './fascia.js'
import { HILLS } from './terrain.js'
import { daylight, START_HOUR } from './daylight.js'
import { STOREY } from './build-map.js'
import { T } from './tiles.js'

// Altbau plaster, mostly pale: white, pale grey, cream, pale yellow, warm
// grey, with the odd salmon or red-brick house. Each house is lighter or
// darker on top, so neighbours differ in value, not just in hue.
const FACADES = ['#e4e1d9', '#d2d0ca', '#e2d8c0', '#e4d4a2', '#c4bcae', '#dcdad2', '#cfc6b2', '#c99682', '#9c5a46']
const FACADE_VALUE = 0.16

// Facade details, drawn in the wall shader. Cornice is two depths below the
// roof in tiles: the pale band, then its shadow. Window sizes are in metres:
// one window every `bay` along the wall, tall and white-framed, split by a
// mullion and a transom; shop windows are wider. Sills are in storeys.
const WALL = {
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
	goods: ['#c8553d', '#e2c25a', '#5f8a5a', '#4e6a92', '#efe9dc', '#9a6a8a'],
	shelves: 4, // rows up the window
	items: 7, // per bay
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

// Tile courses on pitched roofs: height between them in tiles of the map,
// the share of each that is dark line, and how dark.
const ROOF_TILES = { row: 0.18, line: 0.3, ink: 0.45 }
// Roof hatches, in tiles: side, height, and the lid's share of the side.
const HATCH = { size: 0.42, height: 0.14, lid: 0.78, frame: '#b9bdc0', lidColor: '#7e868d' }
// Chimney stacks on the roofs: size along and across the ridge and height,
// in tiles, and their brick and sooty plaster colours.
const CHIMNEY = { length: 0.75, width: 0.42, height: 0.42, colors: ['#8a4c38', '#7a6d64', '#9a5a42'] }

// Trees go in cells this many tiles a side, so the view only draws those
// near it. Below DETAIL_PX screen pixels a tile they turn into simple
// blobs and chimneys, a pixel wide by then, go.
const TREE_CELL = 32
const DETAIL_PX = 3
const SIGNS_PER_ATLAS = 24
const inChunk = (c, { x, y }) => x >= c.x && y >= c.y && x < c.x + c.w && y < c.y + c.h

// Narrow, so the camera sits high and walls lean gently, like GTA 1.
const FOV = 40

// Look knobs, all of them here. The light, the sky and the ground's sun and
// shade follow the clock, see daylight.js.
// Flat bands instead of a falloff, from grazing sun to full sun. Faces turned
// away from the sun get none at all, so they can't flicker in and out of shadow.
const TOON_BANDS = [0.3, 0.55, 0.8, 1.0]
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
	glints: 0.035, // share of sunlit water cells sparkling at any moment
	glintCell: 1.3, // tiles, one glint at most in each
	glintSize: 0.13, // tiles
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
// At night shopfronts and awnings glow this much by themselves, lit from
// inside, and this share of shops is still open.
const SHOP_GLOW = { awning: 0.45, window: 0.9, open: 0.65 }

export function createScene(canvas, world, shops = []) {
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
	const wallLook = wallMaterial(world.tileM, gradient, sky)
	// A generator, so chunks can be built a building at a time between frames.
	const city = createChunks(world, renderer, function* (chunk) {
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
			wallParts.push(wallGeometry([h], world))
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
			const signs = createSigns(shops, gradient, mine.slice(k, k + SIGNS_PER_ATLAS), world.heightAt)
			glowAtNight(signs.material, SHOP_GLOW.awning, sky.night)
			group.add(signs)
			yield
		}
		// Their names on the wall above the windows, and every other shop's.
		group.add(createFascia(world, chunk, gradient, sky.night, { bay: WALL.bay, open: SHOP_GLOW.open }))
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
		const uv = plane.geometry.attributes.uv
		return {
			group,
			roofs: houses.filter((h) => h.roof).map((h) => [h.n, h.roof]),
			zoom(scale) {
				for (const mesh of near) mesh.visible = scale >= DETAIL_PX
				for (const mesh of far) mesh.visible = scale < DETAIL_PX
				if (stacks) stacks.visible = scale >= DETAIL_PX
				if (hatchMesh) hatchMesh.visible = scale >= DETAIL_PX
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
	scene.add(city.group)
	const clouds = createClouds(world, gradient)
	scene.add(clouds.layer)
	const cars = carMeshes(gradient, world)
	const skids = skidMarks(world)
	scene.add(...cars.meshes, skids.mesh)
	// Sky light, then the sun, or the moon at night.
	const ambient = new THREE.AmbientLight()
	scene.add(ambient)
	const sun = new THREE.DirectionalLight()
	sun.castShadow = true
	sun.shadow.mapSize.set(SHADOW.size, SHADOW.size)
	sun.shadow.bias = SHADOW.bias
	// Drawn only while there are shadows to see, so not at night.
	sun.shadow.autoUpdate = false
	const sunTarget = new THREE.Object3D()
	sun.target = sunTarget
	scene.add(sun, sunTarget)

	// The shadow camera follows the view and stays just big enough for it, so
	// the map is spent on what's on screen. It snaps to whole shadow texels,
	// otherwise the edges crawl as you walk.
	const sunDir = new THREE.Vector3(0, 0, 1)
	const sunRight = new THREE.Vector3()
	const sunUp = new THREE.Vector3()
	const focus = new THREE.Vector3()
	function focusSun(x, y, radius) {
		const texel = (radius * 2) / SHADOW.size
		sun.shadow.normalBias = texel * SHADOW.normalBias
		focus.set(x, y, world.heightAt(x, -y))
		const right = Math.round(focus.dot(sunRight) / texel) * texel - focus.dot(sunRight)
		const up = Math.round(focus.dot(sunUp) / texel) * texel - focus.dot(sunUp)
		focus.addScaledVector(sunRight, right).addScaledVector(sunUp, up)
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

	// The time of day, see daylight.js. Clouds keep their bands however dim
	// the light: it's measured against the light at noon.
	const brightness = ([color, intensity]) => (color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722) * intensity
	const noon = daylight(12)
	const fullLight = brightness(noon.ambient) + brightness(noon.sun)
	function setHour(hour) {
		const now = daylight(hour)
		ambient.color.copy(now.ambient[0])
		ambient.intensity = now.ambient[1]
		sun.color.copy(now.sun[0])
		sun.intensity = now.sun[1]
		sun.shadow.intensity = now.shadow
		sunDir.copy(now.direction)
		sunRight.crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize()
		sunUp.crossVectors(sunDir, sunRight).normalize()
		sky.toSun.value.copy(sunDir)
		sky.sun.value.copy(now.ground[0])
		sky.shade.value.copy(now.ground[1])
		sky.deck.value.copy(now.sky)
		scene.background.copy(now.sky)
		streetFog.color.copy(now.sky)
		sky.night.value = now.night
		sky.home.value = now.home
		clouds.light(now.clouds, fullLight / (brightness(now.ambient) + brightness(now.sun)))
		cars.light(sunDir, now.shadow, now.night)
	}
	setHour(START_HOUR)

	const ink = createInk(renderer, [skids.mesh, ...cars.beams], [skids.mesh, clouds.layer, ...cars.shadows, ...cars.beams])
	timePasses(renderer, ['color', 'ink', 'blit'])

	// The look, cycled with P; see looks.js for what each one does.
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
		setHour,
		renderer,
		scene,
		aim,
		renderer,
		gradient,
		scene,
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

// At night a material glows this much of its own colour, lit from inside.
function glowAtNight(material, strength, night) {
	material.onBeforeCompile = (shader) => {
		shader.uniforms.night = night
		shader.fragmentShader =
			'uniform float night;\n' +
			shader.fragmentShader.replace(
				'#include <emissivemap_fragment>',
				`#include <emissivemap_fragment>
			totalEmissiveRadiance += diffuseColor.rgb * night * ${strength.toFixed(2)};`,
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
const FIXED = { glass: '#2a3540', roofbox: '#9a9a96', tyre: '#303231' }
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

// A chunk's ground, in world coordinates: one quad where the land is flat,
// else a mesh following its rises and dips, a vertex every GROUND_STEP
// tiles, its normals from the slope so neighbouring chunks shade alike.
const GROUND_STEP = 2
const WALL_FOOT = 0.15 // tiles the walls reach below the ground they stand on
const HILLSHADE = HILLS.shade
function groundGeometry(chunk, world) {
	const flat = world.flat
	const cols = flat ? 1 : Math.ceil(chunk.w / GROUND_STEP)
	const rows = flat ? 1 : Math.ceil(chunk.h / GROUND_STEP)
	const geo = new THREE.PlaneGeometry(chunk.w, chunk.h, cols, rows).translate(chunk.x + chunk.w / 2, -(chunk.y + chunk.h / 2), 0)
	const pos = geo.attributes.position
	const nor = geo.attributes.normal
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i)
		const y = -pos.getY(i)
		pos.setZ(i, world.heightAt(x, y))
		const [sx, sy] = world.slopeAt(x, y)
		const len = Math.hypot(sx, sy, 1)
		nor.setXYZ(i, -sx / len, sy / len, 1 / len)
	}
	geo.computeBoundingSphere()
	return geo
}

// The map image keeps its own colours: the ground samples the shadow map and
// multiplies by the hour's sun or shade, so nothing is lit twice.
function groundMaterial(map, world) {
	const uniforms = THREE.UniformsUtils.merge([
		THREE.UniformsLib.lights,
		{
			sun: { value: new THREE.Color() },
			deck: { value: new THREE.Color(DECK) },
			time: { value: 0 },
			size: { value: new THREE.Vector2(world.W, world.H) },
			shade: { value: new THREE.Color() },
			toSun: { value: new THREE.Vector3(0, 0, 1) },
		},
	])
	uniforms.map = { value: map }
	return new THREE.ShaderMaterial({
		lights: true,
		uniforms,
		vertexShader: `
			uniform vec3 toSun;
			varying vec2 vUv;
			varying vec2 vTile;
			varying float vHill;
			varying vec3 vNormal;
			#include <common>
			#include <shadowmap_pars_vertex>

			void main() {
				vUv = uv;
				// Slopes towards the sun a touch brighter, away from it darker,
				// and no more so when the sun is low.
				vHill = 1.0 + (dot(normal, toSun) - toSun.z) / max(toSun.z, 0.6) * ${d(HILLSHADE)};
				#include <beginnormal_vertex>
				#include <defaultnormal_vertex>
				vNormal = transformedNormal;
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
			varying float vHill;
			varying vec3 vNormal;
			// For the ink, see ink.js.
			#define INK_NORMAL vNormal
			#include <common>
			#include <shadowmap_pars_fragment>
			#include <shadowmask_pars_fragment>
			${groundDetail}

			void main() {
				vec3 color = groundDetail(texture2D(map, vUv).rgb, vTile, time);
				float lit = getShadowMask();
				color *= mix(shade, sun, lit) * vHill;
				// Sun glints on water: a few cells at a time flash a white point,
				// gone once they'd be smaller than a pixel.
				vec2 gc = floor(vTile / ${d(GROUND_DETAIL.glintCell)});
				vec2 gp = (fract(vTile / ${d(GROUND_DETAIL.glintCell)}) - 0.25 - 0.5 * vec2(gHash(gc + 3.1), gHash(gc + 7.7))) * ${d(GROUND_DETAIL.glintCell)};
				float flash = step(fract(gHash(gc) * 13.0 + time * 0.4), ${d(GROUND_DETAIL.glints)});
				float spot = step(abs(gp.x) + abs(gp.y), ${d(GROUND_DETAIL.glintSize)});
				float seen = 1.0 - smoothstep(${d(GROUND_DETAIL.glintSize * 0.5)}, ${d(GROUND_DETAIL.glintSize)}, length(fwidth(vTile)) * 1.2);
				color = mix(color, ${glsl(GLINT)}, gWater * step(0.5, lit) * flash * spot * seen);
				// The last few tiles fade into the sky under the clouds.
				vec2 edge = min(vTile * vec2(1.0, -1.0), size - vTile * vec2(1.0, -1.0));
				color = mix(deck, color, smoothstep(0.0, ${EDGE_FADE.toFixed(1)}, min(edge.x, edge.y)));
				gl_FragColor = vec4(color, 1.0);
				#include <colorspace_fragment>
			}
		`,
	})
}

// Patterns fade to their average before they're smaller than a pixel, never
// into noise (after Slop New York). `pulse` is how much of a pixel `w` wide
// around `x` falls where fract(x) is in [a, b]: a box filter of a repeating
// band, exact. `box` is the same for a single band, [a, b] once.
const pulse = `
float pulse(float x, float a, float b, float w) {
	float hw = max(w, 0.0001) * 0.5;
	float hi = floor(x + hw) * (b - a) + clamp(fract(x + hw), a, b) - a;
	float lo = floor(x - hw) * (b - a) + clamp(fract(x - hw), a, b) - a;
	return (hi - lo) / (2.0 * hw);
}

float box(float x, float a, float b, float w) {
	float hw = max(w, 0.0001) * 0.5;
	return clamp((min(x + hw, b) - max(x - hw, a)) / (2.0 * hw), 0.0, 1.0);
}
`

// The ground's materials, told apart by the colour the map painted: green
// is lawn, dark grey is tarmac, pale grey is pavement, the khaki between is
// courtyards and bare ground. Every pattern comes in hard steps, like paint,
// and fades out before its stones get smaller than a pixel.
const d = (v) => v.toFixed(3)
const groundDetail = `
${pulse}
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

// How much of a pavement slab pattern is joint, as gStones draws it, filtered
// over a pixel w tiles wide so the joints thin into a tone, not a flicker.
float gJoints(vec2 p, float edge, vec2 w) {
	float half_ = (1.0 - edge) * 0.5;
	float jx = pulse(p.x + floor(p.y) * 0.5 + half_, 0.0, 2.0 * half_, w.x);
	float jy = pulse(p.y + half_, 0.0, 2.0 * half_, w.y);
	return 1.0 - (1.0 - jx) * (1.0 - jy);
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
	float water = step(0.045, lum) * step(color.r * 1.5, color.g) * step(color.r * 1.5, color.b) * (1.0 - step(0.035, abs(color.g - color.b)));
	// Glints only off water in the sun, not in a quay wall's shadow.
	gWater = water * step(0.075, lum);
	float tarmac = grey * (1.0 - water) * (1.0 - smoothstep(0.1, 0.14, lum));
	float pavement = grey * (1.0 - water) * smoothstep(0.3, 0.36, lum);
	float yard = grey * (1.0 - water) * (1.0 - tarmac) * (1.0 - pavement) * smoothstep(0.15, 0.19, lum);

	// Tiles per screen pixel: fine patterns fade before they shimmer.
	float px = length(fwidth(p));
	float fine = 1.0 - smoothstep(0.05, 0.1, px);
	float mid = 1.0 - smoothstep(0.15, 0.3, px);
	// Cobble joints are thinner, so they go sooner.
	float joint = 1.0 - smoothstep(0.025, 0.06, px);
	// Blotches turn into camouflage across a whole park, so far out the
	// ground goes back to flat fills.
	float near = 1.0 - smoothstep(0.05, 0.12, px);
	float f = 1.0;

	float clumps = gBlots(p * 0.8);
	vec2 tuft = gStones(p * 2.2);
	// Short pale dashes on open water, past the shallows, rows drifting
	// either way.
	vec2 q = p * vec2(0.9, 2.6);
	q.x += time * ${d(GROUND_DETAIL.waveDrift)} * 0.9 * (mod(floor(q.y), 2.0) * 2.0 - 1.0);
	vec2 wf = fract(q);
	f += water * (1.0 - step(0.2, lum)) * mix(0.044, step(0.72, gHash(floor(q))) * step(abs(wf.y - 0.5), 0.13) * step(abs(wf.x - 0.5), 0.3), fine) * ${d(GROUND_DETAIL.waves)};

	f -= lawn * (1.0 - pitch) * (step(0.66, clumps) * ${d(GROUND_DETAIL.lawnClumps)} * near + step(0.93, tuft.x) * step(tuft.y, 0.45) * ${d(GROUND_DETAIL.lawnTufts)} * mid);

	float wear = gBlots(p * 0.45 + 3.7);
	float setts = gSetts(p * 4.0);
	f -= yard * (step(0.64, wear) * ${d(GROUND_DETAIL.yardWear)} * near + mix(0.18, step(setts, 0.1), joint) * ${d(GROUND_DETAIL.yardJoints)});

	f -= pavement * gJoints(p * 2.0, 0.86, fwidth(p) * 2.0) * ${d(GROUND_DETAIL.pavingJoints)};

	float repair = gBlots(p * 0.3 + 11.3);
	f -= tarmac * step(0.73, repair) * ${d(GROUND_DETAIL.asphaltPatches)};

	return color * f;
}
`

// The average of some colours.
function mean(hexes) {
	const c = new THREE.Color(0, 0, 0)
	for (const hex of hexes) c.add(new THREE.Color(hex))
	return c.multiplyScalar(1 / hexes.length)
}

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
// a pitched roof if its roof is tiled and its outline allows one. `top` is
// the height of the roof at a point, over sea level, so to speak: a house
// stands on the lowest ground round it, and uphill its walls go into the
// slope, as on a real street.
function house(b, n, world) {
	const tileM = world.tileM
	const h = b.h / tileM
	let base = Infinity
	for (const r of b.rings) for (let i = 0; i < r.length; i += 2) base = Math.min(base, world.heightAt(r[i], r[i + 1]))
	if (!Number.isFinite(base)) base = 0
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
	return { n, h, base, parts, roof, axis, top: roof ? (x, y) => base + h + roofHeight(roof, x, y) : () => base + h }
}

// Every edge of every outline becomes one wall quad, outer rings
// anticlockwise and courtyards clockwise, so walls face away from the
// building. Each building gets a plaster colour from a stable hash.
function wallGeometry(houses, world) {
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
					// Centre the windows on the wall; too short a wall gets none.
					const fit = Math.floor(len / bay)
					const lead = (len - fit * bay) / 2
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

// Roof hatches: a frame with a lid, all of them one instance each of one
// box pair, so they're a single draw and cast real shadows on the tar.
function hatches(list, houses, gradient) {
	const { size, height, lid } = HATCH
	const frame = new THREE.BoxGeometry(size, size, height).translate(0, 0, height / 2)
	const top = new THREE.BoxGeometry(size * lid, size * lid, 0.03).translate(0, 0, height + 0.015)
	const paint = (geo, hex) => {
		const c = new THREE.Color(hex)
		geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geo.attributes.position.count).fill([c.r, c.g, c.b]).flat(), 3))
		return geo
	}
	const geo = mergeGeometries([paint(frame, HATCH.frame), paint(top, HATCH.lidColor)])
	const mesh = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient }), list.length)
	mesh.castShadow = true
	mesh.receiveShadow = true
	mesh.frustumCulled = false
	const m = new THREE.Matrix4()
	const q = new THREE.Quaternion()
	const z = new THREE.Vector3(0, 0, 1)
	const at = new THREE.Vector3()
	const one = new THREE.Vector3(1, 1, 1)
	list.forEach((h, i) => {
		m.compose(at.set(h.x, -h.y, houses[h.n].top(h.x, -h.y) - 0.01), q.setFromAxisAngle(z, -h.angle), one)
		mesh.setMatrixAt(i, m)
	})
	return mesh
}

// Every outline filled in at its building's height, or raised into its
// pitched roof, all in one geometry, or null for no roofs. Pitched faces are flat-shaded, so each slope
// takes one light band and the ink finds the ridges and hips.
function roofGeometry(houses) {
	const tops = []
	const flat = (shape, z, axis) => {
		const geo = new THREE.ShapeGeometry(shape).translate(0, 0, z).toNonIndexed()
		geo.deleteAttribute('uv')
		return withAxis(geo, axis)
	}
	for (const { h: eaves, base, parts, roof, axis } of houses) {
		const h = base + eaves
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
	return tops.length ? mergeGeometries(tops) : null
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

// Each chunk's roof image covers its buildings, `rect` (x, y, width, height
// in tiles), so each roof looks up its patch by world position. Slopes draw their own tile courses: lines of
// equal height, so they run along the eaves of every face.
function roofMaterial(rect, gradient, tex) {
	const material = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient })
	material.onBeforeCompile = (shader) => {
		shader.uniforms.roofRect = { value: rect }
		const decl = 'varying vec3 vRoofPos;\nvarying vec3 vRoofNormal;\nvarying float vRoofAxis;\n'
		shader.vertexShader =
			'attribute float axis;\nuniform vec4 roofRect;\n' +
			decl +
			shader.vertexShader.replace(
				'#include <uv_vertex>',
				`#include <uv_vertex>
				vMapUv = vec2((position.x - roofRect.x) / roofRect.z, 1.0 + (position.y + roofRect.y) / roofRect.w);
				vRoofPos = position;
				vRoofNormal = normal;
				vRoofAxis = axis;`,
			)
		shader.fragmentShader =
			decl +
			pulse +
			'float tarHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
			shader.fragmentShader.replace(
				'#include <map_fragment>',
				`#include <map_fragment>
				if (vRoofNormal.z < 0.97) {
					float row = vRoofPos.z / ${ROOF_TILES.row.toFixed(3)};
					float course = pulse(row, 0.0, ${ROOF_TILES.line.toFixed(2)}, fwidth(row));
					diffuseColor.rgb *= 1.0 - course * ${ROOF_TILES.ink.toFixed(2)};
				} else if (max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)) < 0.05) {
					${tarPaper}
				}`,
			)
	}
	return material
}

// Grey flat roofs are tar paper, lined up with the building: pale seams
// between the rolls, newer and older patches, and now and then a vent.
// Sizes in tiles. The hatches stand up in 3D.
const TAR = {
	seam: 0.34, // roll width
	seamLight: 0.35, // the sealed overlaps catch the light
	patch: [2.2, 1.3], // patch size
	patchTone: 0.14,
	ventCell: 1.7,
	ventShare: 0.86,
	vent: 0.08,
}

const tarPaper = `
	vec2 ax = vec2(cos(vRoofAxis), sin(vRoofAxis));
	vec2 side = vec2(-ax.y, ax.x);
	vec2 uv = vec2(dot(vRoofPos.xy, ax), dot(vRoofPos.xy, side));
	float fine = 1.0 - smoothstep(0.05, 0.1, length(fwidth(uv)));
	float f = 1.0 + pulse(uv.y / ${TAR.seam.toFixed(3)}, 0.0, 0.1, fwidth(uv.y / ${TAR.seam.toFixed(3)})) * ${TAR.seamLight.toFixed(2)};
	float patch_ = tarHash(floor(uv / vec2(${TAR.patch[0].toFixed(2)}, ${TAR.patch[1].toFixed(2)})));
	f += (step(0.86, patch_) - step(patch_, 0.12)) * ${TAR.patchTone.toFixed(2)};
	diffuseColor.rgb *= f;
	// Vents: small dark dots.
	vec2 vcell = floor(uv / ${TAR.ventCell.toFixed(1)});
	vec2 vd = uv - (vcell + 0.25 + 0.5 * vec2(tarHash(vcell + 3.3), tarHash(vcell + 4.4))) * ${TAR.ventCell.toFixed(1)};
	diffuseColor.rgb *= 1.0 - step(${TAR.ventShare.toFixed(2)}, tarHash(vcell + 8.8)) * step(length(vd), ${TAR.vent.toFixed(2)}) * 0.6 * fine;
`

// Walls draw their own windows: one per bay along the wall and per storey up
// it, tall and white-framed, wider shop windows on the ground floor, a ledge
// between storeys, balconies on some houses and the flats with the lamp on
// lit, more of them as night falls, always the same ones first. At night those glow, and so do open shops. Sheds and garages
// stay blank. In the chase camera (`material.userData.rooms`) each upper
// window looks into a room.
function wallMaterial(tileM, gradient, sky) {
	const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient })
	const storey = (STOREY.upper / tileM).toFixed(3)
	const ground = (STOREY.ground / tileM).toFixed(3)
	const bayT = (WALL.bay / tileM).toFixed(3)
	const rooms = { value: 0 }
	material.userData.rooms = rooms
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
						goods *= 1.0 - 0.5 * box(fract(cell.y), 0.0, 0.16, ca.y);
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
				if (vWall.z > 2.0) {
					float down = vWall.z - vZ;
					diffuseColor.rgb = mix(diffuseColor.rgb, ${glsl(WALL.stucco)}, 0.45 * box(down, 0.0, ${WALL.cornice[0].toFixed(3)}, az));
					diffuseColor.rgb *= 1.0 - 0.38 * box(down, ${WALL.cornice[0].toFixed(3)}, ${WALL.cornice[1].toFixed(3)}, az);
				}
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
