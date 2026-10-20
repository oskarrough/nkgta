// Street-level counterparts of the overhead drawings. Units are 3 m tiles.
import * as THREE from 'three'

export function createActors(scene, gradientMap, heightAt = () => 0) {
	const root = new THREE.Group()
	scene.add(root)
	const box = new THREE.BoxGeometry(1, 1, 1)
	const skin = new THREE.MeshToonMaterial({ color: '#d5a17b', gradientMap })
	const shirt = new THREE.MeshToonMaterial({ color: '#f2d24b', gradientMap })
	const blue = new THREE.MeshToonMaterial({ color: '#5b8fd6', gradientMap })
	const dark = new THREE.MeshToonMaterial({ color: '#24272b', gradientMap })
	const red = new THREE.MeshToonMaterial({ color: '#d23c3c', gradientMap })

	function part(parent, material, x, y, z, w, d, h) {
		const mesh = new THREE.Mesh(box, material)
		mesh.position.set(x, y, z)
		mesh.scale.set(w, d, h)
		mesh.castShadow = true
		parent.add(mesh)
		return mesh
	}

	function person(material) {
		const group = new THREE.Group()
		part(group, material, 0, 0, 0.35, 0.14, 0.23, 0.25)
		part(group, skin, 0, 0, 0.55, 0.14, 0.15, 0.16)
		// Nose makes the direction readable while orbiting.
		part(group, skin, 0.085, 0, 0.55, 0.05, 0.06, 0.05)
		const legs = [-1, 1].map((side) => part(group, dark, 0, side * 0.065, 0.12, 0.1, 0.09, 0.24))
		const arms = [-1, 1].map((side) => part(group, skin, 0, side * 0.16, 0.34, 0.08, 0.08, 0.24))
		root.add(group)
		return { group, legs, arms }
	}
	const playerModel = person(shirt)
	const pedestrians = []
	const bike = new THREE.Group()
	root.add(bike)
	part(bike, red, 0, 0, 0.22, 0.5, 0.06, 0.07)
	part(bike, dark, -0.08, 0, 0.35, 0.17, 0.14, 0.05)
	part(bike, dark, 0.25, 0, 0.39, 0.05, 0.32, 0.04)
	const wheel = new THREE.TorusGeometry(0.16, 0.025, 6, 12)
	for (const x of [-0.27, 0.27]) {
		const mesh = new THREE.Mesh(wheel, dark)
		mesh.rotation.x = Math.PI / 2
		mesh.position.set(x, 0, 0.18)
		bike.add(mesh)
	}

	const bottleGeometry = new THREE.CylinderGeometry(0.035, 0.055, 0.22, 6)
	bottleGeometry.rotateX(Math.PI / 2)
	const bottleMaterial = new THREE.MeshToonMaterial({ gradientMap })
	let bottles = new THREE.InstancedMesh(bottleGeometry, bottleMaterial, 256)
	bottles.frustumCulled = false
	root.add(bottles)
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

	function pose(model, p, phase, riding = false) {
		model.group.position.set(p.x, -p.y, heightAt(p.x, p.y) + (riding ? 0.15 : 0))
		model.group.rotation.set(0, p.down ? Math.PI / 2 : 0, -p.dir)
		for (let i = 0; i < 2; i++) {
			const swing = Math.sin(phase + i * Math.PI) * 0.55
			model.legs[i].rotation.y = swing
			model.arms[i].rotation.y = -swing
		}
	}

	return {
		update(player, peds, bottleList, lights, cam, dt) {
			root.visible = !!cam.third
			if (!cam.third) return
			stride += player.speed * dt * 7
			// At a wall the camera can come inside the character's head.
			const eyeDistance = Math.hypot(cam.third.x - player.x, cam.third.y - player.y, cam.third.z - heightAt(player.x, player.y) - 0.55)
			playerModel.group.visible = (!player.car || !!player.down) && eyeDistance > 0.65
			pose(playerModel, player, player.speed > 0.01 && !player.down ? stride : 0, player.onBike)
			bike.visible = !player.down || !player.onBike
			const at = player.onBike ? player : player.bike
			bike.position.set(at.x, -at.y, heightAt(at.x, at.y))
			bike.rotation.z = player.onBike ? -player.dir : 0
			for (let i = 0; i < Math.max(peds.length, pedestrians.length); i++) {
				if (!pedestrians[i]) pedestrians.push(person(blue))
				pedestrians[i].group.visible = i < peds.length
				if (peds[i]) pose(pedestrians[i], peds[i], peds[i].t * 12)
			}
			const nearby = bottleList.filter((b) => Math.hypot(b.x - player.x, b.y - player.y) < 60)
			if (nearby.length > bottles.instanceMatrix.count) {
				root.remove(bottles)
				bottles.dispose()
				bottles = new THREE.InstancedMesh(bottleGeometry, bottleMaterial, nearby.length * 2)
				bottles.frustumCulled = false
				root.add(bottles)
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
					root.add(group)
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
