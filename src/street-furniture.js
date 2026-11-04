// Berlin's lamps and bollards in 3D, along the kerbs of a chunk, where
// kerbs.js puts them: on the main roads the tall mast with one arm curving
// out over the road, on side streets the swan-neck mast with a gas lantern
// hanging from it, and the black cast-iron Poller along the big roads.
// Instanced, toon-shaded and inked like everything else; the glass glows
// at night.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { furnitureIn } from './kerbs.js'

const IRON = '#34433b' // Berlin's lamp green, nearly black
const POLLER = '#232625'
const GLASS = '#f3ead0'
const GLOW = 1.2 // how bright the glass at night, of its own colour
// Device pixels per tile under which they'd be thinner than a pixel, so they
// go rather than flicker.
const SHOW = { lamps: 5, bollards: 14, scooters: 14 }
// Rental e-scooters dumped on the pavement: one by so many lamp posts, some
// knocked over, in the rental firms' colours.
const SCOOTER = { share: 0.2, fallen: 0.35, colors: ['#3fbf5f', '#ff5a1f', '#1fb5b5', '#e83a8c'] }
const MAIN_ROAD = 4 // tiles wide by class: tertiary and up get the big masts

// Sizes in tiles (3 m), the mast at the origin, its arm reaching out along +x.
const MAIN = { height: 2.9, radius: 0.035, reach: 0.65 }
const SIDE = { height: 1.9, radius: 0.03, reach: 0.36 }

const upright = (geo, z) => geo.rotateX(Math.PI / 2).translate(0, 0, z)
const tube = (points, radius) =>
	new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z))), 8, radius, 5)
const plain = (geo) => (geo.index ? geo.toNonIndexed() : geo)
const merge = (parts) => mergeGeometries(parts.map(plain))

function mainLamp() {
	const { height: h, radius: r, reach } = MAIN
	const body = merge([
		upright(new THREE.CylinderGeometry(r * 1.6, r * 2, 0.3, 6), 0.15),
		upright(new THREE.CylinderGeometry(r * 0.8, r, h, 6), h / 2),
		tube(
			[
				[0, h - 0.05],
				[0.08, h + 0.17],
				[reach * 0.6, h + 0.24],
				[reach, h + 0.2],
			],
			r * 0.7,
		),
	])
	const glass = new THREE.BoxGeometry(0.32, 0.12, 0.05).translate(reach + 0.08, 0, h + 0.17)
	return { body, glass }
}

function sideLamp() {
	const { height: h, radius: r, reach } = SIDE
	const lantern = h - 0.06
	const body = merge([
		upright(new THREE.CylinderGeometry(r * 1.8, r * 2.3, 0.35, 8), 0.17),
		upright(new THREE.CylinderGeometry(r * 0.8, r, h, 6), h / 2),
		tube(
			[
				[0, h - 0.05],
				[0.04, h + 0.2],
				[reach * 0.6, h + 0.3],
				[reach, h + 0.16],
				[reach, h + 0.08],
			],
			r * 0.7,
		),
		upright(new THREE.ConeGeometry(0.1, 0.08, 4), lantern + 0.12).translate(reach, 0, 0),
	])
	const glass = upright(new THREE.CylinderGeometry(0.075, 0.05, 0.18, 4), lantern).translate(reach, 0, 0)
	return { body, glass }
}

function bollard() {
	return merge([
		upright(new THREE.CylinderGeometry(0.038, 0.045, 0.28, 6), 0.14),
		upright(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 6), 0.23),
		new THREE.SphereGeometry(0.038, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0, 0.28),
	])
}

function scooter() {
	const deck = new THREE.BoxGeometry(0.3, 0.06, 0.025).translate(0, 0, 0.04)
	const wheels = [0.14, -0.14].map((x) => new THREE.BoxGeometry(0.06, 0.03, 0.06).translate(x, 0, 0.03))
	const stem = upright(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 4), 0.22).translate(0.14, 0, 0)
	const bar = new THREE.BoxGeometry(0.02, 0.16, 0.02).translate(0.14, 0, 0.4)
	return merge([deck, ...wheels, stem, bar])
}

// A number in [0, 1) from a spot on the map, the same every time it's built.
const hash = (x, y, k) => {
	const n = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453
	return n - Math.floor(n)
}

let kit
function kitFor(gradient, night) {
	if (kit) return kit
	const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: gradient })
	const glass = toon(GLASS)
	glass.onBeforeCompile = (shader) => {
		shader.uniforms.night = night
		shader.fragmentShader =
			'uniform float night;\n' +
			shader.fragmentShader.replace(
				'#include <emissivemap_fragment>',
				`#include <emissivemap_fragment>
			totalEmissiveRadiance += diffuseColor.rgb * night * ${GLOW.toFixed(2)};`,
			)
	}
	kit = {
		main: mainLamp(),
		side: sideLamp(),
		bollard: bollard(),
		scooter: scooter(),
		iron: toon(IRON),
		poller: toon(POLLER),
		glass,
		paint: toon('#fff'),
	}
	return kit
}

// The furniture of one chunk: its meshes, and `zoom(scale)` to hide what's
// too small on screen. `night` is the uniform that lights the lamps.
function createFurniture(world, gradient, chunk, night) {
	const k = kitFor(gradient, night)
	const { lamps, bollards } = furnitureIn(world, chunk, MAIN_ROAD)
	const m = new THREE.Matrix4()
	const q = new THREE.Quaternion()
	const z = new THREE.Vector3(0, 0, 1)
	const one = new THREE.Vector3(1, 1, 1)
	const p = new THREE.Vector3()
	// Tile (x, y) sits at (x, -y), so angles turn the other way.
	const place = (geometry, material, list) => {
		if (!list.length) return null
		const mesh = new THREE.InstancedMesh(geometry, material, list.length)
		list.forEach((f, i) =>
			mesh.setMatrixAt(i, m.compose(p.set(f.x, -f.y, world.heightAt(f.x, f.y)), q.setFromAxisAngle(z, -(f.angle ?? 0)), one)),
		)
		mesh.instanceMatrix.needsUpdate = true
		mesh.castShadow = true
		mesh.computeBoundingSphere()
		return mesh
	}
	const main = lamps.filter((l) => l.main)
	const side = lamps.filter((l) => !l.main)
	const lampMeshes = [
		place(k.main.body, k.iron, main),
		place(k.main.glass, k.glass, main),
		place(k.side.body, k.iron, side),
		place(k.side.glass, k.glass, side),
	].filter(Boolean)
	const poller = place(k.bollard, k.poller, bollards)
	const scooters = scootersBy(lamps)
	let scooterMesh = null
	if (scooters.length) {
		scooterMesh = new THREE.InstancedMesh(k.scooter, k.paint, scooters.length)
		const tilt = new THREE.Quaternion()
		const x = new THREE.Vector3(1, 0, 0)
		const c = new THREE.Color()
		scooters.forEach((f, i) => {
			q.setFromAxisAngle(z, -f.angle).multiply(tilt.setFromAxisAngle(x, f.fallen ? Math.PI / 2 - 0.1 : 0))
			const lift = f.fallen ? 0.03 : 0
			scooterMesh.setMatrixAt(i, m.compose(p.set(f.x, -f.y, world.heightAt(f.x, f.y) + lift), q, one))
			scooterMesh.setColorAt(i, c.set(f.color))
		})
		scooterMesh.instanceMatrix.needsUpdate = true
		scooterMesh.castShadow = true
		scooterMesh.computeBoundingSphere()
	}
	return {
		lamps,
		meshes: [...lampMeshes, poller, scooterMesh].filter(Boolean),
		zoom(scale) {
			for (const mesh of lampMeshes) mesh.visible = scale >= SHOW.lamps
			if (poller) poller.visible = scale >= SHOW.bollards
			if (scooterMesh) scooterMesh.visible = scale >= SHOW.scooters
		},
	}
}

// Beside the post, along the kerb, at any angle the last rider left it.
function scootersBy(lamps) {
	const out = []
	for (const l of lamps) {
		if (hash(l.x, l.y, 1) >= SCOOTER.share) continue
		const along = l.angle + Math.PI / 2
		const off = (hash(l.x, l.y, 2) - 0.5) * 0.8
		out.push({
			x: l.x + Math.cos(along) * off,
			y: l.y + Math.sin(along) * off,
			angle: along + (hash(l.x, l.y, 3) - 0.5) * 1.6,
			fallen: hash(l.x, l.y, 4) < SCOOTER.fallen,
			color: SCOOTER.colors[Math.floor(hash(l.x, l.y, 5) * SCOOTER.colors.length)],
		})
	}
	return out
}

export function build({ world, chunk, gradient, sky, weather, ground }) {
	const furniture = createFurniture(world, gradient, chunk, sky.night)
	weather.ground(ground, chunk, furniture.lamps)
	return { meshes: furniture.meshes, zoom: furniture.zoom }
}
