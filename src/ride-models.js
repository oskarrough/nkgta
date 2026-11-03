import * as THREE from 'three'

export function drawWheels(box, kind, color, phase = 0) {
	if (kind !== 'roller') box(0, 0, 0.045, 0.55, 0.17, 0.035, color)
	for (const x of [-0.18, 0.18])
		for (const side of [-1, 1]) {
			const stride = kind === 'roller' ? Math.sin(phase) * side : 0
			box(kind === 'roller' ? x * 0.35 + stride * 0.07 : x, side * (0.09 + Math.abs(stride) * 0.035), 0.035, 0.065, 0.045, 0.065, '#e1d4ac')
		}
}

export function drawSkater(box, kind, look, phase = 0) {
	const stride = Math.sin(phase)
	box(0, 0, 0.405, 0.17, 0.26 * look.build, 0.25, look.top)
	box(0.02, 0, 0.605, 0.13, 0.135, 0.14, look.skin)
	box(-0.01, 0, 0.68, 0.14, 0.15, 0.045, look.hat ?? look.hair)
	for (const side of [-1, 1]) {
		const kick = kind === 'roller' ? stride * side * 0.35 : kind === 'skate' && side === -1 ? Math.max(0, stride) * 0.65 : 0
		const spread = side * (0.065 + (kind === 'roller' ? Math.abs(stride) * 0.035 : 0))
		box(0, spread, 0.175, 0.1, 0.09, 0.24, look.trousers, kick)
		box(0.03 - Math.sin(kick) * 0.12, spread, 0.09, 0.14, 0.1, 0.055, look.shoes)
		box(kind === 'kite' ? 0.09 : 0, side * 0.17, 0.365, 0.075, 0.075, 0.24, look.sleeves, kind === 'kite' ? -0.8 : side * 0.35)
		box(kind === 'kite' ? 0.17 : 0.015, side * 0.17, 0.235, 0.065, 0.065, 0.06, look.skin)
	}
	drawWheels(box, kind, look.top, phase)
}

export function createKites(count, gradientMap, heightAt) {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute([0, -1.3, 0, 0.8, 0, 0.1, 0, 1, 0, 0, -1.3, 0, 0, 1, 0, -0.8, 0, 0.1], 3),
	)
	geometry.setAttribute(
		'color',
		new THREE.Float32BufferAttribute([1, 0.75, 0.2, 1, 0.35, 0.15, 1, 0.8, 0.25, 0.2, 0.6, 0.9, 0.25, 0.8, 0.7, 0.25, 0.6, 1], 3),
	)
	geometry.computeVertexNormals()
	const kites = new THREE.InstancedMesh(
		geometry,
		new THREE.MeshToonMaterial({ vertexColors: true, side: THREE.DoubleSide, gradientMap: gradientMap }),
		count,
	)
	kites.frustumCulled = false
	kites.count = 0
	const vertices = new Float32Array(count * 6 * 6)
	const linesGeometry = new THREE.BufferGeometry()
	linesGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage))
	const lines = new THREE.LineSegments(linesGeometry, new THREE.LineBasicMaterial({ color: '#e8dcc1' }))
	lines.frustumCulled = false
	const matrix = new THREE.Matrix4(),
		rotation = new THREE.Quaternion(),
		pos = new THREE.Vector3(),
		scale = new THREE.Vector3(),
		euler = new THREE.Euler()
	let knots = 0,
		segments = 0,
		time = 0
	function line(a, b) {
		vertices.set([a.x, -a.y, a.z, b.x, -b.y, b.z], segments++ * 6)
	}
	function kite(p, seed, power = false, wind = null) {
		const t = time,
			ground = heightAt(p.x, p.y)
		const sky = {
			x: p.x + (wind ? wind.x * 5 : 3) + Math.sin(t * 0.3 + seed * 8) * 1.4,
			y: p.y + (wind ? wind.y * 5 : -3) + Math.cos(t * 0.25 + seed * 6),
			z: ground + 8 + seed * 4,
		}
		const size = power ? 1.5 : 1
		matrix.compose(
			pos.set(sky.x, -sky.y, sky.z),
			rotation.setFromEuler(euler.set(0.4 + Math.sin(t * 0.4 + seed) * 0.15, 0.1, t * 0.04 + seed * 6)),
			scale.set(size, size, 1),
		)
		kites.setMatrixAt(knots++, matrix)
		line({ x: p.x, y: p.y, z: ground + 0.45 }, sky)
		if (power) line({ x: p.x + 0.2, y: p.y + 0.2, z: ground + 0.45 }, { ...sky, x: sky.x + 0.5 })
		let previous = sky
		for (let i = 1; i < 5; i++) {
			const next = { x: sky.x - i * 0.45, y: sky.y + Math.sin(t * 2 - i + seed * 10) * 0.25, z: sky.z - i * 0.25 }
			line(previous, next)
			previous = next
		}
	}
	return {
		meshes: [kites, lines],
		reset(t) {
			knots = segments = 0
			time = t
		},
		kite,
		finish() {
			kites.count = knots
			kites.instanceMatrix.needsUpdate = true
			linesGeometry.setDrawRange(0, segments * 2)
			linesGeometry.attributes.position.needsUpdate = true
		},
	}
}

export function createRideActor(root, gradientMap, heightAt, standOut) {
	const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial({ gradientMap }), 32)
	mesh.count = 0
	mesh.castShadow = true
	mesh.frustumCulled = false
	standOut(mesh)
	const kites = createKites(1, gradientMap, heightAt)
	root.add(mesh, ...kites.meshes)
	const matrix = new THREE.Matrix4(),
		body = new THREE.Matrix4(),
		local = new THREE.Matrix4(),
		turn = new THREE.Quaternion(),
		euler = new THREE.Euler(0, 0, 0, 'ZYX'),
		pos = new THREE.Vector3(),
		scale = new THREE.Vector3(),
		color = new THREE.Color()
	let n = 0,
		time = 0
	function box(x, y, z, l, w, h, paint, tilt = 0) {
		local.compose(pos.set(x, y, z), turn.setFromEuler(euler.set(0, tilt, 0)), scale.set(l, w, h))
		mesh.setMatrixAt(n, matrix.multiplyMatrices(body, local))
		mesh.setColorAt(n++, color.set(paint))
	}
	return (player, kind, look, grow, visible, dt) => {
		time += dt
		n = 0
		kites.reset(time)
		if (visible && kind !== 'bike') {
			const on = player.onBike && !player.down
			const p = on ? player : player.bike
			const bob = on ? player.rough * 0.025 * Math.sin(time * 45) : 0
			const sway = on && player.pushing && kind === 'roller' ? Math.sin(player.pushPhase) * 0.08 : 0
			body.compose(
				pos.set(p.x, -p.y, heightAt(p.x, p.y) + bob),
				turn.setFromEuler(euler.set(sway, 0, on ? -p.dir : 0)),
				scale.setScalar(grow),
			)
			if (on) drawSkater(box, kind, look, player.pushing && player.speed > 0.05 ? player.pushPhase : 0)
			else drawWheels(box, kind, look.top)
			if (on && kind === 'kite' && player.kitePower > 0) kites.kite(player, 0.4, true, player.wind)
		}
		mesh.count = n
		mesh.instanceMatrix.needsUpdate = true
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
		kites.finish()
	}
}
