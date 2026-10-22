import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { createActors, lookOf, PLAYER_LOOK } from '../src/actors.js'

const player = () => ({ x: 5, y: 5, dir: 0, speed: 0, bike: { x: 6, y: 5 }, onBike: false, car: null, down: false })
const overhead = {}
// Everyone drawn in `scene`, as the meshes that show and how many each has.
const shown = (scene) => {
	const meshes = []
	scene.traverseVisible((o) => o.isInstancedMesh && o.count && meshes.push(o))
	return meshes
}

describe('people', () => {
	test('stand in the overhead view too, the player and everyone on foot', () => {
		const scene = new THREE.Scene()
		const actors = createActors(scene, null)
		const peds = [
			{ x: 1, y: 1, dir: 0, stride: 0, seed: 0.1 },
			{ x: 2, y: 1, dir: 1, stride: 1, seed: 0.2 },
		]
		actors.update(player(), peds, [], [], overhead, 1 / 60)
		const counts = shown(scene).map((m) => m.count)
		expect(counts).toContain(2)
		expect(counts).toContain(1)
	})

	test("aren't all the same, and none wears the player's yellow", () => {
		const looks = Array.from({ length: 90 }, (_, i) => lookOf((i + 0.5) / 90))
		const kinds = (key) => new Set(looks.map((l) => l[key])).size
		expect(kinds('top')).toBeGreaterThan(8)
		expect(kinds('hair')).toBeGreaterThan(6)
		expect(kinds('skin')).toBeGreaterThan(4)
		expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBe(90)
		expect(looks.some((l) => l.hat)).toBe(true)
		expect(looks.some((l) => l.pack)).toBe(true)
		expect(looks.some((l) => l.top === PLAYER_LOOK.top || l.sleeves === PLAYER_LOOK.top)).toBe(false)
		// The same seed, the same person.
		expect(lookOf(0.3)).toEqual(lookOf(0.3))
	})

	test('the player goes into the shop with you', () => {
		const scene = new THREE.Scene()
		const room = new THREE.Scene()
		const actors = createActors(scene, null)
		actors.update(player(), [], [], [], overhead, 1 / 60, room)
		expect(shown(room).length).toBeGreaterThan(0)
		actors.update(player(), [], [], [], overhead, 1 / 60)
		expect(shown(room).length).toBe(0)
	})

	test('from straight above, show over tree crowns and roofs, where they stand on screen', () => {
		const scene = new THREE.Scene()
		const actors = createActors(scene, null)
		actors.update(player(), [], [], [], overhead, 1 / 60)
		const you = shown(scene).find((m) => m.count === 1)
		const at = new THREE.Matrix4()
		const feet = () => {
			you.getMatrixAt(0, at)
			return new THREE.Vector3().applyMatrix4(at.premultiply(you.matrixWorld))
		}
		const onScreen = (v, camera) => {
			const p = v.clone().project(camera)
			return new THREE.Vector2(p.x, p.y)
		}
		const looking = (camera, x, y, z) => {
			camera.lookAt(x, y, z)
			camera.updateMatrixWorld()
			scene.updateMatrixWorld()
			const truth = feet()
			you.onBeforeRender(null, scene, camera)
			return { truth, drawn: feet() }
		}

		const above = new THREE.PerspectiveCamera(40, 1, 0.1, 5000)
		above.position.set(8, -3, 40)
		above.up.set(0, 1, 0)
		const { truth, drawn } = looking(above, 8, -3, 0)
		// Higher than a tree or a roof over the pavement, and right where they
		// stand, seen from the camera.
		expect(drawn.z).toBeGreaterThan(12)
		expect(onScreen(drawn, above).distanceTo(onScreen(truth, above))).toBeLessThan(1e-6)

		// From the street, they stay where they are.
		const street = new THREE.PerspectiveCamera(65, 1, 0.03, 60)
		street.position.set(2, -5, 1)
		street.up.set(0, 0, 1)
		const chase = looking(street, 5, -5, 0.5)
		expect(chase.drawn.distanceTo(chase.truth)).toBeLessThan(1e-9)
	})
})
