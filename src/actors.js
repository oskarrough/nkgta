// The people, the bike and, in the chase camera, the street's small things.
// Everyone on foot is one figure, seen from above and from the street alike,
// built from boxes: each body part is an instanced mesh, so a crowd is a
// dozen draw calls. Units are 3 m tiles.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { inkOutside } from './ink.js'

// What a person wears, from their seed. From above what shows is hair,
// shoulders and the odd hat or backpack, so those vary the most. Nobody wears
// the player's yellow.
const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#a2694a', '#7a4b32', '#5a3624']
const HAIR = ['#1d1a18', '#1d1a18', '#2e221b', '#4a3426', '#6e4a2e', '#b8925a', '#d9c08a', '#8c3b22', '#9a9894']
const DYED = ['#d65aa0', '#4a7bd0', '#3fae8a']
const TOPS = [
	'#5b8fd6',
	'#2d3a5c',
	'#d23c3c',
	'#7d2a35',
	'#3e7a4a',
	'#6b7a3a',
	'#24272b',
	'#24272b',
	'#e8e6df',
	'#8a8f96',
	'#c9668e',
	'#3b9aa0',
	'#6a4c8c',
	'#a0522d',
]
const TROUSERS = ['#3d5a80', '#3d5a80', '#2b3d5a', '#24272b', '#24272b', '#55585c', '#b9a98a', '#4f5a3a', '#6b4a3a']
const SHOES = ['#1d1d1d', '#1d1d1d', '#efefea', '#6b4a2e', '#3a3a3a']
const HATS = ['#24272b', '#d23c3c', '#2d3a5c', '#e8e6df', '#3e7a4a']
const PACKS = ['#24272b', '#2d3a5c', '#7d2a35', '#3e7a4a', '#55585c', '#d23c3c']
const SPAETI_BAG = '#eeeeea'

// Fair hair, so from above the player is yellow from head to shoulders.
export const PLAYER_LOOK = {
	skin: '#d5a17b',
	hair: '#e3bd5c',
	hairStyle: 'short',
	top: '#f2d24b',
	sleeves: '#f2d24b',
	trousers: '#3d5a80',
	shoes: '#1d1d1d',
	hat: null,
	pack: null,
	bag: false,
	build: 1.1,
	height: 1,
}

export function lookOf(seed) {
	// mulberry32
	let a = Math.floor(seed * 2 ** 32) >>> 0
	const rand = () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), a | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const pick = (list) => list[Math.floor(rand() * list.length)]
	const skin = pick(SKIN)
	const top = pick(TOPS)
	const style = rand()
	return {
		skin,
		hair: rand() < 0.05 ? pick(DYED) : pick(HAIR),
		hairStyle: style < 0.55 ? 'short' : style < 0.85 ? 'long' : 'bald',
		top,
		sleeves: rand() < 0.3 ? skin : top,
		trousers: pick(TROUSERS),
		shoes: pick(SHOES),
		hat: rand() < 0.15 ? pick(HATS) : null,
		pack: rand() < 0.18 ? pick(PACKS) : null,
		bag: rand() < 0.12,
		build: 0.85 + rand() * 0.35,
		height: 0.88 + rand() * 0.18,
	}
}

// Body parts, each a box (or a few) around its joint: where the joint sits
// on the body, which way it swings with the stride, and its colour.
const block = (l, w, h, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(l, w, h).translate(x, y, z)
const LEG = { l: 0.1, w: 0.09, h: 0.24 }
const ARM = { l: 0.08, w: 0.07, h: 0.24 }
const HIP = 0.065
const SHOULDER = 0.165
// From above the head covers the middle of the shoulders, so the torso is
// deeper than the head: the top shows in front of it and behind it.
const PARTS = [
	{ name: 'torso', geo: block(0.17, 0.26, 0.25), at: [0, 0, 0.35], color: (k) => k.top },
	// The nose makes the direction readable while orbiting.
	{
		name: 'head',
		geo: mergeGeometries([block(0.12, 0.125, 0.14), block(0.035, 0.045, 0.035, 0.075)]),
		at: [0, 0, 0.55],
		color: (k) => k.skin,
	},
	// Over the top and down the back of the head; from above the face shows as
	// a strip of skin at the front.
	{
		name: 'short',
		geo: mergeGeometries([block(0.1, 0.135, 0.035, -0.015, 0, 0.075), block(0.035, 0.135, 0.1, -0.055, 0, 0.025)]),
		at: [0, 0, 0.55],
		color: (k) => k.hair,
		has: (k) => k.hairStyle === 'short' && !k.hat,
	},
	{
		name: 'long',
		geo: mergeGeometries([block(0.1, 0.14, 0.04, -0.015, 0, 0.075), block(0.045, 0.15, 0.24, -0.06, 0, -0.03)]),
		at: [0, 0, 0.55],
		color: (k) => k.hair,
		has: (k) => k.hairStyle === 'long',
	},
	// A cap, its peak to the front.
	{
		name: 'hat',
		geo: mergeGeometries([block(0.135, 0.14, 0.05, -0.005, 0, 0.085), block(0.06, 0.11, 0.015, 0.085, 0, 0.065)]),
		at: [0, 0, 0.55],
		color: (k) => k.hat,
		has: (k) => !!k.hat,
	},
	{ name: 'pack', geo: block(0.07, 0.18, 0.18, -0.12, 0, 0.02), at: [0, 0, 0.35], color: (k) => k.pack, has: (k) => !!k.pack },
	...[-1, 1].flatMap((side, i) => [
		{
			name: 'leg',
			geo: block(LEG.l, LEG.w, LEG.h, 0, 0, -LEG.h / 2),
			at: [0, side * HIP, 0.24],
			swing: i ? -1 : 1,
			color: (k) => k.trousers,
		},
		{ name: 'shoe', geo: block(0.13, 0.09, 0.05, 0.02, 0, -0.215), at: [0, side * HIP, 0.24], swing: i ? -1 : 1, color: (k) => k.shoes },
		{
			name: 'arm',
			geo: block(ARM.l, ARM.w, ARM.h, 0, 0, -ARM.h / 2),
			at: [0, side * SHOULDER, 0.47],
			swing: i ? 0.8 : -0.8,
			color: (k) => k.sleeves,
		},
		{
			name: 'hand',
			geo: block(0.06, 0.06, 0.05, 0, 0, -0.265),
			at: [0, side * SHOULDER, 0.47],
			swing: i ? 0.8 : -0.8,
			color: (k) => k.skin,
		},
	]),
	// A Späti bag in the right hand, swinging with it.
	{
		name: 'bag',
		geo: block(0.1, 0.04, 0.12, 0, 0, -0.34),
		at: [0, -SHOULDER, 0.47],
		swing: -0.8,
		color: () => SPAETI_BAG,
		has: (k) => k.bag,
	},
]
const STRIDE = 0.55 // radians either way at the hip
// From above, people are drawn bigger than life: true to scale, the pixel
// look has them under two pixels deep.
const OVERHEAD = 1.4

// From straight above, people and the bike show through tree crowns and
// roofs, as the flat layer they replace did: like the clouds (see clouds.js)
// they're drawn shrunk towards the camera, the same on screen but this much
// nearer it. Their shadows fall from where they really are.
const LIFT = 16 // tiles over the ground, under the clouds
const lift = { ground: 0 }
const eye = new THREE.Vector3()
const shrink = new THREE.Matrix4()
function standOut(mesh) {
	mesh.onBeforeRender = (renderer, scene, camera) => {
		if (camera.matrixWorld.elements[10] < 0.99) return
		eye.setFromMatrixPosition(camera.matrixWorld)
		const h = eye.z - lift.ground
		const k = 1 - Math.min(LIFT, h * 0.6) / h
		shrink.makeScale(k, k, k).setPosition(eye.x * (1 - k), eye.y * (1 - k), eye.z * (1 - k))
		mesh.matrixWorld.premultiply(shrink)
	}
}

// A group of people, one instance of every part each, with room for `size`.
function crowd(material, size) {
	const group = new THREE.Group()
	const meshes = PARTS.map((part) => {
		const mesh = new THREE.InstancedMesh(part.geo, material, size)
		mesh.castShadow = true
		mesh.frustumCulled = false
		mesh.count = 0
		standOut(mesh)
		group.add(mesh)
		return mesh
	})
	return { group, meshes, size }
}

const NONE = new THREE.Matrix4().makeScale(0, 0, 0)
const body = new THREE.Matrix4()
const joint = new THREE.Matrix4()
const swing = new THREE.Matrix4()
const at = new THREE.Vector3()
const turn = new THREE.Quaternion()
const euler = new THREE.Euler(0, 0, 0, 'ZYX')
const size = new THREE.Vector3()
const paint = new THREE.Color()

// Person `i` of crowd `c` standing at (x, y, z) facing `dir`, mid-stride at
// `phase`, `grow` times life size. Lying down, they're face down with their
// head the way they faced.
function pose(c, i, look, x, y, z, dir, phase, grow, down = false) {
	euler.set(0, down ? Math.PI / 2 : 0, -dir)
	turn.setFromEuler(euler)
	const back = down ? 0.3 * grow : 0
	at.set(x - Math.cos(dir) * back, -(y - Math.sin(dir) * back), z + (down ? 0.07 * grow : 0))
	body.compose(at, turn, size.set(grow, grow * look.build, grow * look.height))
	const stride = Math.sin(phase) * STRIDE
	PARTS.forEach((part, k) => {
		const mesh = c.meshes[k]
		if (part.has && !part.has(look)) mesh.setMatrixAt(i, NONE)
		else {
			joint.makeTranslation(...part.at)
			if (part.swing) joint.multiply(swing.makeRotationY(stride * part.swing))
			mesh.setMatrixAt(i, joint.premultiply(body))
			mesh.setColorAt(i, paint.set(part.color(look)))
		}
	})
}

function done(c, n) {
	for (const mesh of c.meshes) {
		mesh.count = n
		mesh.instanceMatrix.needsUpdate = true
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
	}
}

export function createActors(scene, gradientMap, heightAt = () => 0) {
	const root = new THREE.Group()
	scene.add(root)
	// Pfand and traffic lights, only in the chase camera; from above they're
	// on the flat layer.
	const street = new THREE.Group()
	root.add(street)
	const box = new THREE.BoxGeometry(1, 1, 1)
	const dark = new THREE.MeshToonMaterial({ color: '#24272b', gradientMap })

	function part(parent, material, x, y, z, w, d, h) {
		const mesh = new THREE.Mesh(box, material)
		mesh.position.set(x, y, z)
		mesh.scale.set(w, d, h)
		mesh.castShadow = true
		parent.add(mesh)
		return mesh
	}

	const people = inkOutside(new THREE.MeshToonMaterial({ gradientMap }))
	// The player gets a crowd of one, to take inside a shop.
	const you = crowd(people, 1)
	let crowds = crowd(people, 128)
	root.add(crowds.group)
	const looks = new WeakMap()
	const lookFor = (p) => looks.get(p) ?? looks.set(p, lookOf(p.seed ?? Math.random())).get(p)
	// Where you went down.
	const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: '#5e1a17' }))
	standOut(puddle)
	root.add(puddle)

	// Red mudguards over the wheels and a red crate on the rack, so from
	// above it's still a red bar to find.
	const bike = new THREE.Group()
	root.add(bike)
	const frame = inkOutside(new THREE.MeshToonMaterial({ color: '#d23c3c', gradientMap }))
	const metal = inkOutside(new THREE.MeshToonMaterial({ color: '#24272b', gradientMap }))
	part(bike, frame, 0, 0, 0.22, 0.5, 0.08, 0.07)
	part(bike, frame, -0.27, 0, 0.36, 0.3, 0.1, 0.03)
	part(bike, frame, 0.27, 0, 0.36, 0.3, 0.1, 0.03)
	part(bike, frame, -0.32, 0, 0.45, 0.24, 0.24, 0.12)
	part(bike, metal, -0.08, 0, 0.35, 0.17, 0.14, 0.05)
	part(bike, metal, 0.25, 0, 0.39, 0.05, 0.32, 0.04)
	const wheel = new THREE.TorusGeometry(0.16, 0.025, 6, 12)
	for (const x of [-0.27, 0.27]) {
		const mesh = new THREE.Mesh(wheel, metal)
		mesh.rotation.x = Math.PI / 2
		mesh.position.set(x, 0, 0.18)
		bike.add(mesh)
	}
	for (const mesh of bike.children) standOut(mesh)

	const bottleGeometry = new THREE.CylinderGeometry(0.035, 0.055, 0.22, 6)
	bottleGeometry.rotateX(Math.PI / 2)
	const bottleMaterial = new THREE.MeshToonMaterial({ gradientMap })
	let bottles = new THREE.InstancedMesh(bottleGeometry, bottleMaterial, 256)
	bottles.frustumCulled = false
	street.add(bottles)
	const lamps = []
	const lampMaterials = Object.fromEntries(
		Object.entries({ red: '#ec4335', yellow: '#f6c743', green: '#5ce079' }).map(([name, color]) => [
			name,
			new THREE.MeshBasicMaterial({ color }),
		]),
	)
	const matrix = new THREE.Matrix4()
	const color = new THREE.Color()
	let stride = 0

	return {
		// `room` is the scene of the shop you're in, if you are.
		update(player, peds, bottleList, lights, cam, dt, room = null) {
			stride += player.speed * dt * 7
			// At a wall the camera can come inside the character's head.
			const ground = room ? 0 : heightAt(player.x, player.y)
			lift.ground = ground
			const eyeDistance = cam.third ? Math.hypot(cam.third.x - player.x, cam.third.y - player.y, cam.third.z - ground - 0.55) : Infinity
			const shown = (!player.car || !!player.down) && eyeDistance > 0.65
			const parent = room ?? root
			if (you.group.parent !== parent) parent.add(you.group)
			const z = ground + (player.onBike && !player.down ? 0.15 : 0)
			const grow = cam.third ? 1 : OVERHEAD
			pose(you, 0, PLAYER_LOOK, player.x, player.y, z, player.dir, player.speed > 0.01 && !player.down ? stride : 0, grow, !!player.down)
			done(you, shown ? 1 : 0)
			puddle.visible = !!player.down && !room
			puddle.position.set(player.x, -player.y, ground + 0.004)
			puddle.rotation.z = -player.dir
			puddle.scale.set(0.75 * grow, 0.6 * grow, 1)

			bike.visible = !room && (!player.down || !player.onBike)
			const on = player.onBike ? player : player.bike
			bike.position.set(on.x, -on.y, heightAt(on.x, on.y))
			bike.rotation.z = player.onBike ? -player.dir : 0

			if (peds.length > crowds.size) {
				root.remove(crowds.group)
				for (const mesh of crowds.meshes) mesh.dispose()
				crowds = crowd(people, peds.length * 2)
				root.add(crowds.group)
			}
			peds.forEach((p, i) => pose(crowds, i, lookFor(p), p.x, p.y, heightAt(p.x, p.y), p.dir, p.stride ?? p.t * 12, grow))
			done(crowds, peds.length)

			street.visible = !!cam.third
			if (!cam.third) return
			const nearby = bottleList.filter((b) => Math.hypot(b.x - player.x, b.y - player.y) < 60)
			if (nearby.length > bottles.instanceMatrix.count) {
				street.remove(bottles)
				bottles.dispose()
				bottles = new THREE.InstancedMesh(bottleGeometry, bottleMaterial, nearby.length * 2)
				bottles.frustumCulled = false
				street.add(bottles)
			}
			bottles.count = nearby.length
			nearby.forEach((b, i) => {
				matrix.makeTranslation(b.x, -b.y, heightAt(b.x, b.y) + 0.11)
				bottles.setMatrixAt(i, matrix)
				bottles.setColorAt(i, color.set(b.can ? '#c0c4c8' : '#3d7a3a'))
			})
			bottles.instanceMatrix.needsUpdate = true
			if (bottles.instanceColor) bottles.instanceColor.needsUpdate = true
			for (let i = 0; i < Math.max(lights.length, lamps.length); i++) {
				if (!lamps[i]) {
					const group = new THREE.Group()
					part(group, dark, 0, 0, 0.4, 0.04, 0.04, 0.8)
					const lamp = part(group, lampMaterials.red, 0, 0, 0.85, 0.1, 0.1, 0.2)
					street.add(group)
					lamps.push({ group, lamp })
				}
				const light = lights[i]
				lamps[i].group.visible = !!light
				if (!light) continue
				lamps[i].group.position.set(light.x, -light.y, heightAt(light.x, light.y))
				lamps[i].lamp.material = lampMaterials[light.state] ?? lampMaterials.red
			}
		},
	}
}
