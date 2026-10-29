import * as THREE from 'three'
import { frontsOf } from './fronts.js'

export function openAttribute(geometry, ranges, opening) {
	const attr = new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count), 1)
	geometry.setAttribute('isOpen', attr)
	for (const [place, start, end] of ranges)
		opening.watch(place, (open) => {
			for (let i = start; i < end; i++) attr.setX(i, open ? 1 : 0)
			attr.needsUpdate = true
		})
}

export function createFrontPanels(world, chunk, opening, night) {
	const positions = [],
		uvs = [],
		ranges = []
	for (const f of frontsOf(world)) {
		if (f.x < chunk.x || f.y < chunk.y || f.x >= chunk.x + chunk.w || f.y >= chunk.y + chunk.h) continue
		const start = positions.length / 3
		const z = world.heightAt(f.x, f.y)
		const point = (side, height) => [f.x + f.ex * side + f.nx * 0.035, -(f.y + f.ey * side + f.ny * 0.035), z + height]
		const corners = [point(-f.half, 0.04), point(f.half, 0.04), point(f.half, 1.15), point(-f.half, 1.15)]
		const uv = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
		]
		for (const i of [0, 1, 2, 0, 2, 3]) {
			positions.push(...corners[i])
			uvs.push(...uv[i])
		}
		ranges.push([f, start, positions.length / 3])
	}
	if (!ranges.length) return null
	const geo = new THREE.BufferGeometry()
	geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
	openAttribute(geo, ranges, opening)
	const material = new THREE.ShaderMaterial({
		uniforms: { night },
		side: THREE.DoubleSide,
		vertexShader: `attribute float isOpen; varying float vOpen; varying vec2 vUv;
		void main() { vOpen = isOpen; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
		fragmentShader: `uniform float night; varying float vOpen; varying vec2 vUv;
		void main() {
			if (vOpen > 0.5 && night < 0.05) discard;
			float slat = 0.86 + 0.14 * step(0.2, fract(vUv.y * 18.0));
			vec3 shut = vec3(0.31, 0.32, 0.31) * slat * mix(1.0, 0.45, night);
			float frame = step(fract(vUv.x * 3.0), 0.035) + step(fract(vUv.y * 3.0), 0.035);
			float shelves = step(0.8, fract(vUv.y * 7.0));
			vec3 lit = mix(vec3(0.54, 0.37, 0.19), vec3(0.24, 0.18, 0.12), min(1.0, frame + shelves * 0.45));
			gl_FragColor = vec4(mix(shut, lit, vOpen), 1.0);
			#include <colorspace_fragment>
		}`,
	})
	return new THREE.Mesh(geo, material)
}
