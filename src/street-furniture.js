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
const SHOW = { lamps: 5, bollards: 14 }
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
	kit = { main: mainLamp(), side: sideLamp(), bollard: bollard(), iron: toon(IRON), poller: toon(POLLER), glass }
	return kit
}

// The furniture of one chunk: its meshes, and `zoom(scale)` to hide what's
// too small on screen. `night` is the uniform that lights the lamps.
export function createFurniture(world, gradient, chunk, night) {
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
	return {
		lamps,
		meshes: [...lampMeshes, poller].filter(Boolean),
		zoom(scale) {
			for (const mesh of lampMeshes) mesh.visible = scale >= SHOW.lamps
			if (poller) poller.visible = scale >= SHOW.bollards
		},
	}
}

// As a chunk feature: lamps and bollards, and the rain told where the lamps are so it can shine under them.
export function build({ world, chunk, gradient, sky, weather, ground }) {
	const furniture = createFurniture(world, gradient, chunk, sky.night)
	weather.ground(ground, chunk, furniture.lamps)
	return { meshes: furniture.meshes, zoom: furniture.zoom }
}
