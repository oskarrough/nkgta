// The city in 3D, the GTA 1 way: the flat map on the ground, every building
// raised from its outline, and a perspective camera looking straight down, so
// walls lean outwards towards the screen edges.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { renderMapImage, renderRoofImage, roofHash } from './map-image.js'
import { createInk, gameUpscale, PALETTE_SNAP, PIXEL_GRID } from './ink.js'
import { createTrees } from './trees.js'
import { MODELS } from './models.js'

// Altbau plaster: cream, ochre, sandstone, grey, salmon, off-white.
const FACADES = ['#d8c6a2', '#c9a266', '#bfa98a', '#a8a39b', '#c98f72', '#e2dacb']

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
// One 2048 map over the visible area, so the edges stay hard.
// normalBias is in shadow texels, so it holds at every zoom.
const SHADOW = { size: 2048, bias: -0.0003, normalBias: 1.5, pad: 60 }
// Cars are too small for the shadow map: a flat quad away from the sun keeps
// their shadow crisp and stops them speckling.
const CAR_SHADOW = { opacity: 0.42, offset: 0.34, stretch: 1.15 }

export function createScene(canvas, world) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
	renderer.setPixelRatio(devicePixelRatio)
	const scene = new THREE.Scene()
	scene.background = new THREE.Color('#222')
	const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 5000)

	// Hard shadows, one crisp step: no soft edges to smudge the flat fills.
	renderer.shadowMap.enabled = true
	renderer.shadowMap.type = THREE.PCFShadowMap

	// Tile (x, y) sits at (x, -y), so north stays up and z is height in tiles.
	const ground = new THREE.CanvasTexture(renderMapImage(world))
	ground.colorSpace = THREE.SRGBColorSpace
	const roofTex = new THREE.CanvasTexture(renderRoofImage(world))
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
	const plane = new THREE.Mesh(new THREE.PlaneGeometry(world.W, world.H), groundMaterial(ground))
	plane.position.set(world.W / 2, -world.H / 2, 0)
	plane.receiveShadow = true
	scene.add(plane)

	const gradient = toonGradient()
	const houses = world.buildings.map((b) => ({ h: b.h / world.tileM, parts: footprint(b.rings) }))
	scene.add(walls(houses, world.tileM, gradient), roofs(houses, world, gradient, roofTex))
	scene.add(createTrees(world, gradient))
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

// Paint and glass take the same flat bands as the walls; lamps stay lit.
function carMaterial(kind, gradient) {
	if (kind === 'lights') return new THREE.MeshBasicMaterial()
	return new THREE.MeshToonMaterial({ color: FIXED[kind] ?? '#fff', gradientMap: gradient })
}

// Vehicles from above, GTA 1 style: each model built from its own boxes
// (see models.js), one instanced mesh per box, plus brake lights.
const MAX_CARS = 256
const FIXED = { glass: '#1b232b', roofbox: '#9a9a96' }
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
		const parts = m.look.map(([kind, l, w, h, x, z]) => ({ kind, geo: box(l * m.length, w * m.width, h, x * m.length, z) }))
		const [, , , h, , z] = m.look[0]
		const lamp = (s) => box(0.04, 0.12, 0.06, -m.length / 2, z + h * 0.55).translate(0, (s * m.width) / 3, 0)
		parts.push({ kind: 'lights', geo: mergeGeometries([lamp(-1), lamp(1)]) })
		for (const part of parts) {
			part.mesh = new THREE.InstancedMesh(part.geo, carMaterial(part.kind, gradient), MAX_CARS)
			part.mesh.count = 0
			part.mesh.frustumCulled = false
		}
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
function groundMaterial(map) {
	const uniforms = THREE.UniformsUtils.merge([
		THREE.UniformsLib.lights,
		{
			sun: { value: new THREE.Color(GROUND_SUN) },
			shade: { value: new THREE.Color(GROUND_SHADE) },
		},
	])
	uniforms.map = { value: map }
	return new THREE.ShaderMaterial({
		lights: true,
		uniforms,
		vertexShader: `
			varying vec2 vUv;
			#include <common>
			#include <shadowmap_pars_vertex>

			void main() {
				vUv = uv;
				#include <beginnormal_vertex>
				#include <defaultnormal_vertex>
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				#include <shadowmap_vertex>
				gl_Position = projectionMatrix * viewMatrix * worldPosition;
			}
		`,
		fragmentShader: `
			uniform sampler2D map;
			uniform vec3 sun;
			uniform vec3 shade;
			uniform bool receiveShadow;
			varying vec2 vUv;
			#include <common>
			#include <shadowmap_pars_fragment>
			#include <shadowmask_pars_fragment>

			void main() {
				vec3 color = texture2D(map, vUv).rgb;
				gl_FragColor = vec4(color * mix(shade, sun, getShadowMask()), 1.0);
				#include <colorspace_fragment>
			}
		`,
	})
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
	houses.forEach(({ h, parts }, n) => {
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
					const quad = [
						[a, 0, 0],
						[e, 0, len],
						[e, h, len],
						[a, 0, 0],
						[e, h, len],
						[a, h, 0],
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

// Every outline filled in at its building's height, all in one mesh.
function roofs(houses, world, gradient, tex) {
	const tops = []
	for (const { h, parts } of houses) {
		for (const { outer, holes } of parts) {
			const shape = new THREE.Shape(outer)
			shape.holes = holes.map((hole) => new THREE.Path(hole))
			tops.push(new THREE.ShapeGeometry(shape).translate(0, 0, h))
		}
	}
	if (!tops.length) return new THREE.Group() // an area without buildings
	const mesh = new THREE.Mesh(mergeGeometries(tops), roofMaterial(world, gradient, tex))
	mesh.castShadow = true
	mesh.receiveShadow = true
	return mesh
}

// The roof image is one texture for the whole map, so each roof looks up its
// patch by world position.
function roofMaterial(world, gradient, tex) {
	const material = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient })
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader.replace(
			'#include <uv_vertex>',
			`#include <uv_vertex>
			vMapUv = vec2(position.x / ${world.W.toFixed(1)}, 1.0 + position.y / ${world.H.toFixed(1)});`,
		)
	}
	return material
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
				if (vWall.z > 2.0 && along > 0.0 && along < vWall.y && vZ < vWall.z - 0.3) {
					float f = floor(vZ / ${storey});
					float fz = fract(vZ / ${storey});
					float u = fract(along);
					float shop = f < 0.5 ? 1.0 : 0.0;
					float halfW = mix(0.22, 0.4, shop);
					float lo = mix(0.35, 0.1, shop);
					vec2 aa = fwidth(vec2(along, vZ / ${storey}));
					float wx = smoothstep(0.5 - halfW - aa.x, 0.5 - halfW + aa.x, u) * (1.0 - smoothstep(0.5 + halfW - aa.x, 0.5 + halfW + aa.x, u));
					float wz = smoothstep(lo - aa.y, lo + aa.y, fz) * (1.0 - smoothstep(0.8 - aa.y, 0.8 + aa.y, fz));
					float lit = fract(sin(dot(vec3(floor(along), f, vWall.y + vWall.z), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
					vec3 glass = lit > 0.94 ? vec3(0.9, 0.7, 0.3) : vec3(0.05, 0.07, 0.1);
					diffuseColor.rgb = mix(diffuseColor.rgb, glass, wx * wz);
					float ledge = 1.0 - smoothstep(0.0, 0.05 + aa.y, fz);
					diffuseColor.rgb *= 1.0 - 0.3 * ledge * (1.0 - shop);
				}`,
			)
	}
	return material
}
