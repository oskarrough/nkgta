import * as THREE from 'three'
import { createPetActors } from './pets.js'
import { gameAt } from './feld-activity.js'
import { createKites } from './ride-models.js'

export function createFeldExtras({ world, chunk, field, groups, material, box, base }) {
	const dogs = field.dogs.filter(
		(d) => d.home.x >= chunk.x && d.home.x < chunk.x + chunk.w && d.home.y >= chunk.y && d.home.y < chunk.y + chunk.h,
	)
	const dogGroup = new THREE.Group()
	const drawDogs = dogs.length ? createPetActors(dogGroup, material, world.heightAt) : null
	const kites = createKites(groups.length + field.riders.length, material.gradientMap, world.heightAt)
	// Airborne kites extend beyond the ground chunk even when first loaded in rain.
	kites.meshes[0].boundingBox = new THREE.Box3(
		new THREE.Vector3(chunk.x - 20, -chunk.y - chunk.h - 20, 0),
		new THREE.Vector3(chunk.x + chunk.w + 20, -chunk.y + 20, world.heightAt(chunk.x, chunk.y) + 25),
	)
	const smokeGeometry = new THREE.IcosahedronGeometry(1, 0)
	const smokeAlpha = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, groups.length * 3)), 1).setUsage(
		THREE.DynamicDrawUsage,
	)
	smokeGeometry.setAttribute('smokeAlpha', smokeAlpha)
	const smokeMaterial = new THREE.MeshBasicMaterial({ color: '#ded9ca', transparent: true, depthWrite: false })
	// Smoke must leave the ink normals behind it intact, or its facets become solid outlines.
	smokeMaterial.defines = { INK_SKIP: '' }
	smokeMaterial.allowOverride = false
	smokeMaterial.onBeforeCompile = (shader) => {
		shader.vertexShader =
			'attribute float smokeAlpha;\nvarying float vSmokeAlpha;\n' +
			shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSmokeAlpha = smokeAlpha;')
		shader.fragmentShader =
			'varying float vSmokeAlpha;\n' +
			shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= vSmokeAlpha;\n#include <opaque_fragment>')
	}
	const smoke = new THREE.InstancedMesh(smokeGeometry, smokeMaterial, smokeAlpha.count)
	smoke.frustumCulled = false
	smoke.count = 0
	const round = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), material, Math.max(1, groups.length * 3))
	round.frustumCulled = false
	round.count = 0
	round.castShadow = true
	const matrix = new THREE.Matrix4(),
		paint = new THREE.Color()
	let smokes = 0,
		balls = 0
	function sphere(x, y, z, r, color) {
		matrix.makeScale(r, r, r).setPosition(x, -y, z)
		round.setMatrixAt(balls, matrix)
		round.setColorAt(balls++, paint.set(color))
	}
	const meshes = [smoke, round, ...kites.meshes, ...(dogs.length ? [dogGroup] : [])]
	return {
		meshes,
		draw(view, riders) {
			smokes = balls = 0
			kites.reset(field.time)
			const visible = (p, pad = 8) => !view || (p.x > view.x0 - pad && p.x < view.x1 + pad && p.y > view.y0 - pad && p.y < view.y1 + pad)
			for (const g of groups) {
				if (g.seed >= field.density || !visible(g, 25)) continue
				if (g.grill && visible(g.grill)) {
					const p = g.grill,
						z = world.heightAt(p.x, p.y)
					base(p.x, p.y, z, g.angle)
					sphere(p.x, p.y, z + 0.37, 0.22, '#303638')
					for (const x of [-0.13, 0.13]) for (const y of [-0.13, 0.13]) box(x, y, 0.15, 0.035, 0.035, 0.3, '#c5c1b2')
					box(0, 0, 0.48, 0.35, 0.35, 0.025, '#8d7960')
					for (const x of [-0.12, -0.04, 0.04, 0.12]) box(x, 0, 0.5, 0.015, 0.35, 0.015, '#d7d1bb')
					for (const x of [-0.09, 0.06]) box(x, 0, 0.52, 0.07, 0.21, 0.04, '#aa5030')
					box(0.55, 0, 0.15, 0.36, 0.27, 0.3, '#417044')
					for (const x of [0.44, 0.56, 0.68]) box(x, 0, 0.35, 0.055, 0.07, 0.17, '#426d32')
					if (field.wetness < 0.35)
						for (let i = 0; i < 3; i++) {
							const f = (field.time * 0.32 + i / 3 + g.seed) % 1,
								r = 0.045 + f * 0.075
							const drift = Math.sin(field.time * 1.2 + g.seed * 8 + i) * f * 0.035
							matrix.makeScale(r, r * 0.7, r * 0.8).setPosition(p.x + f * 0.28 + drift, -p.y + f * 0.1, z + 0.55 + f * 0.4)
							smokeAlpha.setX(smokes, 0.22 * Math.min(1, f * 8) * (1 - f))
							smoke.setMatrixAt(smokes++, matrix)
						}
				}
				if (g.kite && field.wetness < 0.5) kites.kite(g.people.find((p) => p.kind === 'stand') ?? g.people[0], g.seed)
				if (g.game && visible(g)) {
					const ball = gameAt(g, field.time),
						z = world.heightAt(ball.x, ball.y) + ball.z
					if (g.game === 'football') sphere(ball.x, ball.y, z, 0.12, '#eee5d2')
					else {
						base(ball.x, ball.y, z, field.time)
						box(0, 0, 0, 0.25, 0.25, 0.025, '#f06c36')
					}
				}
			}
			for (const p of riders) if (p.kind === 'kite' && field.wetness < 0.5) kites.kite(p, p.seed, true)
			if (drawDogs)
				drawDogs(
					dogs.filter((d) => d.seed < field.density && visible(d.pet)),
					field.grow,
					(d) => d.appearance,
				)
			for (const mesh of [smoke, round]) {
				mesh.count = mesh === smoke ? smokes : balls
				mesh.instanceMatrix.needsUpdate = true
				if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
			}
			smokeAlpha.needsUpdate = true
			kites.finish()
		},
	}
}
