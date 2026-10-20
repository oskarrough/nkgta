// The map ends in clouds, not a hard edge: puffy cumulus over a band round
// the map, over a closed deck of sky colour beyond it. Like the trees, every
// cloud is a cluster of lumpy blobs in one instanced mesh, so they get the
// same flat light bands and ink outlines. The front wanders in and out with
// slow noise, so it runs parallel to nothing, and its clouds are the small ones.
import * as THREE from 'three'

export const DECK = '#8d9cb1' // the sky colour past the clouds
// Cloud tones by light: full sun, the faintest sun, and shade.
const TONES = ['#ffffff', '#dce3ea', '#b4c1d0']
const SPACING = 5.5 // tiles between cloud centres
const INSET = 16 // how far into the map the front reaches, tiles, before the noise
const BAND = 44 // how far out the puffs go before only the deck is left
const PATCH = 48 // tiles of sky per draw call, culled off screen
const FRONT_NOISE = 10 // how far the front wanders, tiles; less than INSET, so the edge stays hidden
const FRONT_SCALE = 1 / 45 // and how slowly along the edge
const HEIGHT = 18 // above the tallest roofs, in tiles, while the camera allows
const LUMPS = 1.5 // how far blobs rise and fall around that, tiles
const RADIUS = [2, 6.5] // cloud radius at the front and far out
const BLOBS = [3, 5]
const SQUASH = 0.55

const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007
const hash2 = (x, y) => hash((x * 73856093) ^ (y * 19349663))
const mix = (a, b, t) => a + (b - a) * t
const smooth = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
	return t * t * (3 - 2 * t)
}

function noise(x, y) {
	const ix = Math.floor(x)
	const iy = Math.floor(y)
	const fx = smooth(0, 1, x - ix)
	const fy = smooth(0, 1, y - iy)
	const a = mix(hash2(ix, iy), hash2(ix + 1, iy), fx)
	const b = mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx)
	return mix(a, b, fy)
}

// Lit like everything else, then each light band swapped for a cloud tone,
// so the shade side goes cool blue instead of grey.
function cloudMaterial(gradient) {
	const material = new THREE.MeshToonMaterial({ color: '#fff', gradientMap: gradient })
	const tone = (hex) => {
		const c = new THREE.Color(hex)
		return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`
	}
	material.onBeforeCompile = (shader) => {
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <opaque_fragment>',
			`float light = dot(outgoingLight, vec3(0.3333));
			outgoingLight = light > 0.75 ? ${tone(TONES[0])} : light > 0.3 ? ${tone(TONES[1])} : ${tone(TONES[2])};
			#include <opaque_fragment>`,
		)
	}
	return material
}

export function createClouds(world, gradient) {
	const { W, H } = world
	const clouds = []
	for (let gy = -BAND; gy < H + BAND; gy += SPACING) {
		for (let gx = -BAND; gx < W + BAND; gx += SPACING) {
			const k = clouds.length + gx * 7 + gy * 13
			const x = gx + (hash2(gx, gy) - 0.5) * SPACING
			const y = gy + (hash2(gy, gx) - 0.5) * SPACING
			// Signed distance out of the map, pushed in and out by the noise.
			const out = Math.max(-x, x - W, -y, y - H)
			const front = out + INSET + (noise(x * FRONT_SCALE, y * FRONT_SCALE) - 0.5) * 2 * FRONT_NOISE
			if (front < 0 || hash(k) > smooth(0, 5, front)) continue
			const grown = smooth(0, BAND * 0.7, front)
			clouds.push({ x, y, r: mix(RADIUS[0], RADIUS[1], grown) * mix(0.8, 1.15, hash(k + 1)), seed: k })
		}
	}

	// One instanced mesh per patch of sky, so only the patches on screen are
	// drawn, and in the middle of the map none at all.
	const patches = new Map()
	for (const cloud of clouds) {
		const key = `${Math.floor(cloud.x / PATCH)},${Math.floor(cloud.y / PATCH)}`
		if (!patches.has(key)) patches.set(key, [])
		patches.get(key).push(cloud)
	}
	const count = (c) => BLOBS[0] + Math.floor(hash(c.seed + 2) * (BLOBS[1] - BLOBS[0] + 1))
	const geometry = new THREE.IcosahedronGeometry(1, 1)
	const material = cloudMaterial(gradient)
	const layer = new THREE.Group()
	const m = new THREE.Matrix4()
	const pos = new THREE.Vector3()
	const scale = new THREE.Vector3()
	const q = new THREE.Quaternion()
	for (const list of patches.values()) {
		const mesh = new THREE.InstancedMesh(
			geometry,
			material,
			list.reduce((sum, c) => sum + count(c), 0),
		)
		let n = 0
		for (const cloud of list) {
			const z = (hash(cloud.seed + 3) - 0.5) * 2 * LUMPS
			const blobs = count(cloud)
			const phase = hash(cloud.seed + 4) * Math.PI * 2
			for (let b = 0; b < blobs; b++) {
				const s = cloud.seed * 31 + b * 17
				// One big blob in the middle, smaller ones round and above it.
				const br = cloud.r * (b === 0 ? 0.75 : mix(0.4, 0.6, hash(s + 1)))
				const spread = b === 0 ? 0 : cloud.r * mix(0.45, 0.7, hash(s + 2))
				const a = phase + (b / blobs) * Math.PI * 2
				pos.set(cloud.x + Math.cos(a) * spread, -cloud.y + Math.sin(a) * spread, z + br * SQUASH * hash(s + 3) * 0.6)
				scale.set(br, br, br * SQUASH)
				m.compose(pos, q, scale)
				mesh.setMatrixAt(n++, m)
			}
		}
		mesh.instanceMatrix.needsUpdate = true
		mesh.computeBoundingSphere()
		layer.add(mesh)
	}

	// The camera looks down in perspective, so anything high drifts outwards
	// from the middle of the screen, and clouds this high would float far
	// off the map. Shrinking the layer towards the camera undoes that: each
	// cloud covers the ground it was placed over, at every zoom, and still
	// sits above the roofs.
	return {
		layer,
		follow(camera) {
			const z = Math.min(HEIGHT, camera.position.z * 0.6)
			const k = (camera.position.z - z) / camera.position.z
			layer.position.set(camera.position.x * (1 - k), camera.position.y * (1 - k), z)
			layer.scale.set(k, k, 1)
		},
	}
}
