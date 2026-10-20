// Street trees as one instanced crown mesh. Each crown is a cluster of lumpy
// blobs, so the silhouette bumps like a painted tree. Decoration only: nothing
// here touches the tile grid, so you walk and drive straight through them.
import * as THREE from 'three'

const CROWNS = ['#4c6f32', '#5e8636', '#365b25']
const BOTTOM = 3 // metres from the ground to the underside of the crown
const SQUASH = 0.9 // a little flatter than a sphere
const BLOBS_MIN = 3
const BLOBS_MAX = 5
const BLOB_RADIUS = [0.52, 0.7] // blob radius, as a share of the crown radius
const BLOB_SPREAD = [0.2, 0.4] // blob centre offset, as a share of the crown radius
const BLOB_HEIGHT = [0.62, 0.8] // blob half-height, as a share of the crown half-height
const BLOB_LIFT = 0.8 // how much of the crown's vertical slack blobs may use
const TREE_TONE_MIN = 0.85 // per-tree brightness variation
const TREE_TONE_MAX = 1.1
const BLOB_TONE = [0.94, 1.06] // a little variation between a tree's own blobs

const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007
const blobCount = (i) => BLOBS_MIN + Math.floor(hash(i * 7 + 2) * (BLOBS_MAX - BLOBS_MIN + 1))
const mix = (range, t) => range[0] + t * (range[1] - range[0])

export function createTrees(world, gradient) {
	const trees = world.trees ?? []
	let total = 0
	for (let i = 0; i < trees.length; i++) total += blobCount(i)

	const mesh = new THREE.InstancedMesh(
		new THREE.IcosahedronGeometry(1, 1),
		new THREE.MeshToonMaterial({ color: '#fff', gradientMap: gradient }),
		total,
	)
	mesh.castShadow = true
	mesh.receiveShadow = false
	mesh.frustumCulled = false // one draw for the whole city

	const tileM = world.tileM
	const m = new THREE.Matrix4()
	const pos = new THREE.Vector3()
	const scale = new THREE.Vector3()
	const q = new THREE.Quaternion()
	const c = new THREE.Color()
	let n = 0
	trees.forEach((t, i) => {
		const r = t.crown / 2 / tileM
		const bottom = BOTTOM / tileM
		const top = Math.max(bottom + 1.5, t.top / tileM)
		const half = ((top - bottom) / 2) * SQUASH
		const cz = (top + bottom) / 2
		const base = Math.floor(hash(i * 5 + 1) * CROWNS.length)
		const tone = TREE_TONE_MIN + hash(i * 3 + 7) * (TREE_TONE_MAX - TREE_TONE_MIN)
		const phase = hash(i * 11 + 3) * Math.PI * 2
		const count = blobCount(i)
		for (let b = 0; b < count; b++) {
			const s = i * 97 + b * 23
			const br = r * mix(BLOB_RADIUS, hash(s + 1))
			const spread = r * mix(BLOB_SPREAD, hash(s + 2))
			const a = phase + (b / count) * Math.PI * 2 + (hash(s + 3) - 0.5) * 0.9
			const bh = half * mix(BLOB_HEIGHT, hash(s + 4))
			const dz = (hash(s + 5) - 0.5) * 2 * (half - bh) * BLOB_LIFT
			pos.set(t.x + Math.cos(a) * spread, -t.y + Math.sin(a) * spread, cz + dz)
			scale.set(br, br, bh)
			m.compose(pos, q, scale)
			mesh.setMatrixAt(n, m)
			c.set(CROWNS[base]).multiplyScalar(tone * mix(BLOB_TONE, hash(s + 6)))
			mesh.setColorAt(n, c)
			n++
		}
	})
	mesh.instanceMatrix.needsUpdate = true
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
	return mesh
}
