// Warm light painted onto the terrain beneath lamps and outside shop doors.
import * as THREE from 'three'
import { furnitureIn } from './kerbs.js'

export function createNightPools(world, chunk, shops, night) {
	const positions = []
	const uvs = []
	const kinds = []
	function patch(x, y, ex, ey, nx, ny, width, depth, kind) {
		const steps = 4
		const vertex = (u, v) => {
			const px = x + ex * (u - 0.5) * width + nx * v * depth
			const py = y + ey * (u - 0.5) * width + ny * v * depth
			positions.push(px, -py, world.heightAt(px, py) + 0.025)
			uvs.push(u, v)
			kinds.push(kind)
		}
		for (let a = 0; a < steps; a++)
			for (let b = 0; b < steps; b++) {
				const u = a / steps,
					v = b / steps,
					du = 1 / steps
				vertex(u, v)
				vertex(u + du, v)
				vertex(u + du, v + du)
				vertex(u, v)
				vertex(u + du, v + du)
				vertex(u, v + du)
			}
	}
	for (const lamp of furnitureIn(world, chunk, 4).lamps) {
		const reach = lamp.main ? 0.73 : 0.36
		const x = lamp.x + Math.cos(lamp.angle ?? 0) * reach
		const y = lamp.y + Math.sin(lamp.angle ?? 0) * reach
		patch(x, y - 1.7, 1, 0, 0, 1, 3.4, 3.4, 0)
	}
	for (const shop of shops) {
		if (shop.x < chunk.x || shop.x >= chunk.x + chunk.w || shop.y < chunk.y || shop.y >= chunk.y + chunk.h) continue
		patch(shop.x, shop.y, shop.ex, shop.ey, shop.nx, shop.ny, 2.4, 2.2, 1)
	}
	if (!positions.length) return null
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
	geometry.setAttribute('kind', new THREE.Float32BufferAttribute(kinds, 1))
	const material = new THREE.ShaderMaterial({
		uniforms: { night },
		transparent: true,
		side: THREE.DoubleSide,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		vertexShader: `attribute float kind; varying vec2 vUv; varying float vKind;
			void main() { vUv = uv; vKind = kind; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
		fragmentShader: `uniform float night; varying vec2 vUv; varying float vKind;
			void main() {
				float circle = 1.0 - smoothstep(0.32, 0.5, length(vUv - 0.5));
				float band = (1.0 - smoothstep(0.75, 1.0, vUv.y)) * (1.0 - smoothstep(0.4, 0.5, abs(vUv.x - 0.5)));
				float glow = mix(circle, band, vKind) * night;
				gl_FragColor = vec4(1.0, 0.67, 0.30, glow * 0.28);
				#include <colorspace_fragment>
			}`,
	})
	return new THREE.Mesh(geometry, material)
}
