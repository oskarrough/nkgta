// Street trees as one instanced crown mesh. Each crown is a cluster of lumpy
// blobs, so the silhouette bumps like a painted tree. Decoration only: nothing
// here touches the tile grid, so you walk and drive straight through them.
import * as THREE from 'three'
import { pointsGrid } from './kerbs.js'
import { DETAIL_PX } from './chunks.js'

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
const SIMPLE_RADIUS = 0.95 // a simple tree's one blob, as a share of the crown radius
const TRUNK = '#5e4a38'
const TRUNK_RADIUS = [0.15, 0.3] // metres, from small crowns to big ones
const TRUNK_SIDES = 5

const hash = (n) => ((Math.imul(n + 1, 2654435761) >>> 0) % 10007) / 10007
const blobCount = (i) => BLOBS_MIN + Math.floor(hash(i * 7 + 2) * (BLOBS_MAX - BLOBS_MIN + 1))
const mix = (range, t) => range[0] + t * (range[1] - range[0])

const TRUNK_BODY = 0.22 // tiles, a person standing beside the stem

function trunkGrid(world) {
	if (!world.trunkGrid) world.trunkGrid = pointsGrid(world.trees ?? [])
	return world.trunkGrid
}

function trunkRadius(t, tileM) {
	return mix(TRUNK_RADIUS, Math.min(1, Math.max(0, (t.crown - 4) / 10))) / tileM
}

// Decoration trunks aren't on the tile grid; nudge feet off the stem visually.
export function pushFromTrunks(p, world, body = TRUNK_BODY) {
	const trees = world.trees
	if (!trees?.length) return
	const tileM = world.tileM
	const reach = 0.6
	trunkGrid(world).each(p.x, p.y, reach, (t) => {
		let dx = p.x - t.x
		let dy = p.y - t.y
		let d = Math.hypot(dx, dy)
		const need = trunkRadius(t, tileM) + body
		if (d < 1e-6) {
			dx = 1
			dy = 0
			d = 1
		}
		if (d >= need) return
		const k = (need - d) / d
		p.x += dx * k
		p.y += dy * k
	})
}

// `pick` is which trees, by index, so each keeps its own looks wherever
// it's drawn. `simple` gives each tree one plain blob in its own colour,
// for when trees are too small on screen to show their lumps.
function createTrees(world, gradient, pick = (world.trees ?? []).keys(), simple = false) {
	const trees = world.trees ?? []
	const list = [...pick]
	let total = 0
	for (const i of list) total += simple ? 1 : blobCount(i)

	const mesh = new THREE.InstancedMesh(
		new THREE.IcosahedronGeometry(1, simple ? 0 : 1),
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
	for (const i of list) {
		const t = trees[i]
		const r = t.crown / 2 / tileM
		const { half, cz } = crownOf(t, tileM, world)
		const base = Math.floor(hash(i * 5 + 1) * CROWNS.length)
		const tone = TREE_TONE_MIN + hash(i * 3 + 7) * (TREE_TONE_MAX - TREE_TONE_MIN)
		if (simple) {
			pos.set(t.x, -t.y, cz)
			scale.set(r * SIMPLE_RADIUS, r * SIMPLE_RADIUS, half)
			mesh.setMatrixAt(n, m.compose(pos, q, scale))
			mesh.setColorAt(n++, c.set(CROWNS[base]).multiplyScalar(tone))
			continue
		}
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
	}
	mesh.instanceMatrix.needsUpdate = true
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
	return mesh
}

function crownOf(t, tileM, world) {
	const bottom = BOTTOM / tileM
	const top = Math.max(bottom + 1.5, t.top / tileM)
	const half = ((top - bottom) / 2) * SQUASH
	return { half, cz: (top + bottom) / 2 + world.heightAt(t.x, t.y) }
}

function createTrunks(world, gradient, pick = (world.trees ?? []).keys()) {
	const trees = world.trees ?? []
	const list = [...pick]
	const geometry = new THREE.CylinderGeometry(0.7, 1, 1, TRUNK_SIDES).rotateX(Math.PI / 2).translate(0, 0, 0.5)
	const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshToonMaterial({ color: TRUNK, gradientMap: gradient }), list.length)
	mesh.castShadow = true
	mesh.receiveShadow = true
	mesh.frustumCulled = false

	const tileM = world.tileM
	const m = new THREE.Matrix4()
	const pos = new THREE.Vector3()
	const scale = new THREE.Vector3()
	const q = new THREE.Quaternion()
	list.forEach((i, n) => {
		const t = trees[i]
		const { cz } = crownOf(t, tileM, world)
		const ground = world.heightAt(t.x, t.y) - 0.3 / tileM
		const r = mix(TRUNK_RADIUS, Math.min(1, Math.max(0, (t.crown - 4) / 10))) / tileM
		pos.set(t.x, -t.y, ground)
		scale.set(r, r, cz - ground)
		mesh.setMatrixAt(n, m.compose(pos, q, scale))
	})
	mesh.instanceMatrix.needsUpdate = true
	return mesh
}

// Trees go in cells this many tiles a side, so the view only draws those near it.
const CELL = 32

// As a chunk feature: the trees in cells, or one plain blob each across the
// chunk once they're too small on screen for lumps.
export function build({ world, chunk, gradient }) {
	const cells = new Map()
	for (const i of chunk.trees) {
		const t = world.trees[i]
		const key = Math.floor(t.x / CELL) * 4096 + Math.floor(t.y / CELL)
		cells.set(key, [...(cells.get(key) ?? []), i])
	}
	const near = [...cells.values()].flatMap((pick) => [createTrees(world, gradient, pick), createTrunks(world, gradient, pick)])
	const far = chunk.trees.length ? [createTrees(world, gradient, chunk.trees, true)] : []
	const meshes = [...near, ...far]
	for (const mesh of meshes) {
		mesh.frustumCulled = true
		mesh.computeBoundingSphere()
	}
	return {
		meshes,
		zoom(scale) {
			for (const mesh of near) mesh.visible = scale >= DETAIL_PX
			for (const mesh of far) mesh.visible = scale < DETAIL_PX
		},
	}
}
