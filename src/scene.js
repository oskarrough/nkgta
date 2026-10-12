// The city in 3D, the GTA 1 way: the flat map on the ground, every building
// raised from its outline, and a perspective camera looking straight down, so
// walls lean outwards towards the screen edges.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { renderMapImage, renderRoofImage, roofHash } from './map-image.js'
import { MODELS } from './models.js'

// Altbau plaster: cream, ochre, sandstone, grey, salmon, off-white.
const FACADES = ['#d8c6a2', '#c9a266', '#bfa98a', '#a8a39b', '#c98f72', '#e2dacb']

// Narrow, so the camera sits high and walls lean gently, like GTA 1.
const FOV = 40

export function createScene(canvas, world) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
	renderer.setPixelRatio(devicePixelRatio)
	const scene = new THREE.Scene()
	scene.background = new THREE.Color('#222')
	const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 5000)

	// Tile (x, y) sits at (x, -y), so north stays up and z is height in tiles.
	const ground = new THREE.CanvasTexture(renderMapImage(world))
	ground.colorSpace = THREE.SRGBColorSpace
	ground.anisotropy = renderer.capabilities.getMaxAnisotropy()
	const plane = new THREE.Mesh(new THREE.PlaneGeometry(world.W, world.H), new THREE.MeshBasicMaterial({ map: ground }))
	plane.position.set(world.W / 2, -world.H / 2, 0)
	scene.add(plane)

	const houses = world.buildings.map((b) => ({ h: b.h / world.tileM, parts: footprint(b.rings) }))
	scene.add(walls(houses, world.tileM), roofs(houses, world, renderer))
	const cars = carMeshes()
	const skids = skidMarks()
	scene.add(...cars.meshes, skids.mesh)
	scene.add(new THREE.AmbientLight('#fff', 1.6))
	// Sun from the south-west, so south and west walls catch the light.
	const sun = new THREE.DirectionalLight('#fff', 1.6)
	sun.position.set(-0.5, -0.6, 0.8)
	scene.add(sun)

	function resize() {
		renderer.setSize(innerWidth, innerHeight, false)
		camera.aspect = innerWidth / innerHeight
		camera.updateProjectionMatrix()
	}
	addEventListener('resize', resize)
	resize()

	// Same view as the 2D overlay: `scale` device pixels per tile at street
	// level, top-left corner at (cam.x, cam.y) in those pixels.
	return function render(cam, carList) {
		cars.update(carList)
		for (const c of carList) {
			for (const m of c.marks) skids.add(...m)
			c.marks.length = 0
		}
		const h = innerHeight * devicePixelRatio
		const w = innerWidth * devicePixelRatio
		camera.position.set(
			(cam.x + w / 2) / cam.scale,
			-(cam.y + h / 2) / cam.scale,
			h / 2 / cam.scale / Math.tan((FOV / 2) * (Math.PI / 180)),
		)
		renderer.render(scene, camera)
	}
}

// Vehicles from above, GTA 1 style: each model built from its own boxes
// (see models.js), one instanced mesh per box, plus brake lights.
const MAX_CARS = 256
const FIXED = { glass: '#1b232b', roofbox: '#9a9a96' }
function carMeshes() {
	const box = (l, w, h, x, z) => new THREE.BoxGeometry(l, w, h).translate(x, 0, z + h / 2)
	const kinds = Object.values(MODELS).map((m) => {
		const parts = m.look.map(([kind, l, w, h, x, z]) => ({ kind, geo: box(l * m.length, w * m.width, h, x * m.length, z) }))
		const [, , , h, , z] = m.look[0]
		const lamp = (s) => box(0.04, 0.12, 0.06, -m.length / 2, z + h * 0.55).translate(0, (s * m.width) / 3, 0)
		parts.push({ kind: 'lights', geo: mergeGeometries([lamp(-1), lamp(1)]) })
		for (const part of parts) {
			const color = FIXED[part.kind]
			part.mesh = new THREE.InstancedMesh(part.geo, new THREE.MeshLambertMaterial(color ? { color } : {}), MAX_CARS)
			part.mesh.count = 0
			part.mesh.frustumCulled = false
		}
		return { model: m, parts }
	})
	const m = new THREE.Matrix4()
	const q = new THREE.Quaternion()
	const z = new THREE.Vector3(0, 0, 1)
	const one = new THREE.Vector3(1, 1, 1)
	const c = new THREE.Color()
	const lit = new THREE.Color('#ff2a1a')
	const dim = new THREE.Color('#5a0d0a')
	return {
		meshes: kinds.flatMap((k) => k.parts.map((p) => p.mesh)),
		update(cars) {
			for (const { model, parts } of kinds) {
				let n = 0
				for (const car of cars) {
					if (car.model !== model || n >= MAX_CARS) continue
					m.compose(new THREE.Vector3(car.x, -car.y, 0), q.setFromAxisAngle(z, -car.angle), one)
					c.set(car.color)
					for (const { kind, mesh } of parts) {
						mesh.setMatrixAt(n, m)
						if (kind === 'paint') mesh.setColorAt(n, c)
						if (kind === 'lights') mesh.setColorAt(n, car.braking ? lit : dim)
					}
					n++
				}
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
function walls(houses, tileM) {
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
	return new THREE.Mesh(geo, wallMaterial(tileM))
}

// Every outline filled in at its building's height, all in one mesh.
function roofs(houses, world, renderer) {
	const tops = []
	for (const { h, parts } of houses) {
		for (const { outer, holes } of parts) {
			const shape = new THREE.Shape(outer)
			shape.holes = holes.map((hole) => new THREE.Path(hole))
			tops.push(new THREE.ShapeGeometry(shape).translate(0, 0, h))
		}
	}
	if (!tops.length) return new THREE.Group() // an area without buildings
	return new THREE.Mesh(mergeGeometries(tops), roofMaterial(world, renderer))
}

// The roof image is one texture for the whole map, so each roof looks up its
// patch by world position.
function roofMaterial(world, renderer) {
	const tex = new THREE.CanvasTexture(renderRoofImage(world))
	tex.colorSpace = THREE.SRGBColorSpace
	tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
	const material = new THREE.MeshLambertMaterial({ map: tex })
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
function wallMaterial(tileM) {
	const material = new THREE.MeshLambertMaterial({ vertexColors: true })
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
