import * as THREE from 'three'

export function createWeserExtras({ world, field, groups, box, base, material }) {
	const wheels = new THREE.InstancedMesh(
		new THREE.TorusGeometry(0.18, 0.025, 4, 10),
		material,
		groups.reduce((n, g) => n + g.bikes.length * 2, 0),
	)
	wheels.frustumCulled = false
	const matrix = new THREE.Matrix4(),
		turn = new THREE.Quaternion(),
		euler = new THREE.Euler(),
		pos = new THREE.Vector3(),
		scale = new THREE.Vector3(1, 1, 1)
	const tyre = new THREE.Color('#25282b')
	return {
		meshes: [wheels],
		draw(view) {
			let n = 0
			for (const g of groups) {
				if (
					g.open === false ||
					g.seed >= field.density ||
					(view && (g.x < view.x0 - 5 || g.x > view.x1 + 5 || g.y < view.y0 - 5 || g.y > view.y1 + 5))
				)
					continue
				for (const p of g.people) {
					const at = p.render
					if (p.seat) {
						base(p.home.x, p.home.y, world.heightAt(p.home.x, p.home.y), p.home.dir)
						box(0, 0, 0.09, 0.3, 0.32, 0.18, '#597146')
						for (const y of [-0.12, 0.12]) box(0, y, 0.18, 0.32, 0.025, 0.035, '#9aab6c')
					}
					if (p.dodge) continue
					const sitting = p.kind === 'sit' && !p.alert
					base(at.x, at.y, world.heightAt(at.x, at.y) + (sitting ? (p.seat ?? 0) : 0), at.dir, field.grow)
					const hand = sitting ? 0.06 : 0.18
					if (p.bottle && !p.dropped) {
						box(0.045, 0.17, hand - 0.025, 0.055, 0.055, 0.14, '#4c7638')
						box(0.045, 0.17, hand + 0.065, 0.025, 0.025, 0.055, '#70934a')
					} else if (p.smoker) {
						box(p.smoking ? 0.17 : 0.06, 0.17, p.smoking ? 0.49 : hand, 0.09, 0.019, 0.019, '#d5cab3')
						box(p.smoking ? 0.22 : 0.11, 0.17, p.smoking ? 0.49 : hand, 0.018, 0.022, 0.022, '#f29a42')
					}
				}
				for (const bike of g.bikes) {
					const z = world.heightAt(bike.x, bike.y),
						dir = bike.dir
					base(bike.x, bike.y, z, dir)
					box(0, 0, 0.26, 0.6, 0.04, 0.045, '#8b9d9a', -0.4)
					box(0, 0, 0.23, 0.55, 0.04, 0.045, '#8b9d9a', 0.4)
					box(0.26, 0.04, 0.32, 0.045, 0.04, 0.3, '#a4aaa5', -0.2)
					box(0.28, 0.08, 0.46, 0.045, 0.28, 0.035, '#3a3b35')
					box(-0.12, 0.07, 0.4, 0.17, 0.1, 0.04, '#3a3b35')
					for (const x of [-0.3, 0.3]) {
						matrix.compose(
							pos.set(bike.x + Math.cos(dir) * x, -bike.y - Math.sin(dir) * x, z + 0.18),
							turn.setFromEuler(euler.set(Math.PI / 2 - 0.2, 0, -dir, 'ZYX')),
							scale,
						)
						wheels.setMatrixAt(n, matrix)
						wheels.setColorAt(n++, tyre)
					}
				}
			}
			wheels.count = n
			wheels.instanceMatrix.needsUpdate = true
			if (wheels.instanceColor) wheels.instanceColor.needsUpdate = true
		},
	}
}
