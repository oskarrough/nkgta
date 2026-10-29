// Companions borrow their owner's route, stops and evasions. No second crowd AI.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pointsGrid } from './kerbs.js'
import { T, SOLID } from './tiles.js'
import { pushFromTrunks } from './trees.js'

export function petOf(seed) {
	return seed < 0.28 ? 'dog' : seed < 0.31 ? 'cat' : seed < 0.335 ? 'ferret' : seed < 0.36 ? 'parrot' : null
}

export function createPets(world) {
	const posts = [...(world.trees ?? [])]
	for (let i = 0; i < (world.lamps?.length ?? 0); i += 2) posts.push({ x: world.lamps[i], y: world.lamps[i + 1] })
	const sniffSpots = pointsGrid(posts)
	return (people, dt, cars, scare) => {
		for (const p of people) {
			const kind = petOf(p.seed)
			if (!kind) continue
			const pet = (p.pet ??= { kind, x: p.x, y: p.y, dir: p.dir, stride: 0, sniff: null, timer: 0, bark: 0 })
			pet.timer -= dt
			pet.bark = Math.max(0, pet.bark - dt)
			const fleeing = !!(p.dodge || p.flee || p.lie)
			if (fleeing || p.track.edge) pet.sniff = null
			if (kind === 'dog' && !fleeing && !p.track.edge && pet.timer <= 0) {
				pet.timer = 6 + p.seed * 20
				pet.sniff = sniffSpots.near(p.x, p.y, 0.85)
				if (pet.sniff) p.pause = Math.max(p.pause, 2.5)
				if (cars.some((c) => Math.hypot(c.x - pet.x, c.y - pet.y) < 3 && Math.hypot(c.vx, c.vy) > 0.5)) {
					pet.bark = 0.65
					scare?.shout(p)
				}
			}
			if (p.pause <= 0) pet.sniff = null
			const side = 0.48
			let x = p.x + Math.cos(p.dir) * 0.12 - Math.sin(p.dir) * side
			let y = p.y + Math.sin(p.dir) * 0.12 + Math.cos(p.dir) * side
			if (pet.sniff) {
				const a = Math.atan2(pet.sniff.y - p.y, pet.sniff.x - p.x)
				x = pet.sniff.x - Math.cos(a) * 0.22
				y = pet.sniff.y - Math.sin(a) * 0.22
			}
			// Never drag an animal through a wall or put it on the road beside a crossing.
			const clear = (a, b) => {
				const tile = world.tileAt(a, b)
				return !SOLID.has(tile) && (fleeing || p.track.edge || tile !== T.ROAD) && (!scare || scare.ok(a, b))
			}
			if (p.track.edge || !clear(x, y) || !clear((x + p.x) / 2, (y + p.y) / 2)) {
				x = p.x - Math.cos(p.dir) * 0.25
				y = p.y - Math.sin(p.dir) * 0.25
			}
			if (!clear(x, y)) {
				x = p.x
				y = p.y
			}
			const dx = x - pet.x,
				dy = y - pet.y
			const d = Math.hypot(dx, dy)
			const k = fleeing || d > 1 ? 1 : Math.min(1, dt * 7)
			pet.x += dx * k
			pet.y += dy * k
			if (!clear(pet.x, pet.y)) {
				pet.x = p.x
				pet.y = p.y
			}
			pushFromTrunks(pet, world, 0.09)
			pet.dir = pet.sniff ? Math.atan2(pet.sniff.y - pet.y, pet.sniff.x - pet.x) : d > 0.02 ? Math.atan2(dy, dx) : p.dir
			pet.stride += d * k * 20
		}
	}
}

// All coats, leads and moving legs share a single instanced box draw call.
export function createPetActors(root, material, standOut, heightAt) {
	const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 4096)
	mesh.frustumCulled = false
	mesh.castShadow = true
	standOut(mesh)
	root.add(mesh)
	const matrix = new THREE.Matrix4(),
		rotation = new THREE.Quaternion(),
		position = new THREE.Vector3(),
		scale = new THREE.Vector3()
	const delta = new THREE.Vector3()
	const axis = new THREE.Vector3(0, 0, 1),
		color = new THREE.Color()
	// A bark is a short burst of three pale strokes above the muzzle.
	const barkGeo = mergeGeometries(
		[-1, 0, 1].map((i) => new THREE.BoxGeometry(0.07, 0.014, 0.014).rotateZ(i * 0.6).translate(0.39, i * 0.1, 0.37)),
	)
	const barks = new THREE.InstancedMesh(barkGeo, material, 128)
	barks.frustumCulled = false
	standOut(barks)
	root.add(barks)
	return (people, grow, lookFor) => {
		let n = 0,
			barking = 0
		for (const p of people) {
			const pet = p.pet
			if (!pet) continue
			const bird = pet.kind === 'parrot',
				cat = pet.kind === 'cat',
				ferret = pet.kind === 'ferret'
			const look = lookFor(p)
			const x = bird ? p.x - Math.sin(p.dir) * 0.19 * grow : pet.x
			const y = bird ? p.y + Math.cos(p.dir) * 0.19 * grow : pet.y
			const z = heightAt(x, y) + (bird ? 0.47 * look.height * grow * (1 - (p.lie ?? 0)) : 0)
			const dir = bird ? p.dir : pet.dir
			const c = Math.cos(dir),
				s = Math.sin(dir)
			const coat = bird
				? '#459747'
				: cat
					? '#8c8e92'
					: ferret
						? '#b7a07d'
						: ['#a87947', '#e3d2ac', '#443a33', '#b0a69a'][Math.floor(p.seed * 1000) % 4]
			const small = cat ? 0.8 : ferret ? 0.65 : 0.9 + ((p.seed * 91) % 1) * 0.4
			function box(a, b, h, l, w, tall, paint) {
				position.set(x + (c * a - s * b) * grow * small, -y - (s * a + c * b) * grow * small, z + h * grow * small)
				rotation.setFromAxisAngle(axis, -dir)
				matrix.compose(position, rotation, scale.set(l * grow * small, w * grow * small, tall * grow * small))
				mesh.setMatrixAt(n, matrix)
				mesh.setColorAt(n++, color.set(paint))
			}
			if (bird) {
				box(0, 0, 0.09, 0.1, 0.11, 0.18, coat)
				box(0.025, 0, 0.2, 0.1, 0.1, 0.1, '#de4440')
				box(0.09, 0, 0.19, 0.045, 0.05, 0.055, '#e3bd5c')
				box(-0.07, 0, 0.015, 0.15, 0.06, 0.045, '#315b97')
			} else {
				box(0, 0, 0.17, ferret ? 0.37 : 0.31, 0.14, 0.15, coat)
				box(0.18, 0, pet.sniff ? 0.14 : 0.25, 0.14, 0.14, 0.14, coat)
				box(0.27, 0, pet.sniff ? 0.11 : 0.22, 0.08, 0.09, 0.065, '#302b29')
				for (const side of [-1, 1]) {
					box(0.15, side * 0.065, cat ? 0.36 : 0.29, 0.07, 0.045, cat ? 0.1 : 0.13, coat)
					for (const end of [-1, 1])
						box(end * 0.11 + Math.sin(pet.stride + (side === end ? 0 : Math.PI)) * 0.035, side * 0.055, 0.055, 0.045, 0.04, 0.11, coat)
				}
				box(-0.22, Math.sin(pet.stride * 0.5) * 0.045, cat ? 0.31 : 0.23, 0.19, 0.035, cat ? 0.12 : 0.045, coat)
				box(0.12, 0, 0.21, 0.035, 0.16, 0.12, '#ba4340')
				// Lead from the owner's hand to the collar, in world coordinates.
				position.set(
					p.x + Math.sin(p.dir) * 0.16 * grow,
					-p.y + Math.cos(p.dir) * 0.16 * grow,
					heightAt(p.x, p.y) + (0.23 - 0.16 * (p.lie ?? 0)) * grow,
				)
				delta.set(x, -y, z + 0.24 * grow * small).sub(position)
				const length = delta.length()
				rotation.setFromUnitVectors(axis, delta.normalize())
				position.addScaledVector(delta, length / 2)
				matrix.compose(position, rotation, scale.set(0.012 * grow, 0.012 * grow, length))
				mesh.setMatrixAt(n, matrix)
				mesh.setColorAt(n++, color.set('#514039'))
				if (pet.bark > 0) {
					matrix.makeRotationZ(-dir).setPosition(x, -y, z)
					barks.setMatrixAt(barking, matrix)
					barks.setColorAt(barking++, color.set('#f4e7be'))
				}
			}
		}
		mesh.count = n
		barks.count = barking
		for (const m of [mesh, barks]) {
			m.instanceMatrix.needsUpdate = true
			if (m.instanceColor) m.instanceColor.needsUpdate = true
		}
	}
}
