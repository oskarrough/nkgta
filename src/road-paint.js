import * as THREE from 'three'
import { PHONE } from './device.js'
import { T } from './tiles.js'
import { FOOTPATH, inPark } from './map-image.js'
import { buildGeometry, shapesIn } from './ground-paint.js'

let queued = Promise.resolve()

export function* build(ctx) {
	if (!PHONE) return yield* buildLocal(ctx)
	let result, error, worker
	const done = queued.then(
		() =>
			new Promise((resolve) => {
				worker = new Worker(new URL('./ground-worker.js', import.meta.url), { type: 'module' })
				worker.onmessage = ({ data }) => {
					result = data
					resolve()
				}
				worker.onerror = (event) => {
					error = new Error(event.message)
					resolve()
				}
				const { W, H, terrain, bbox, tileM } = ctx.world
				const entries = shapesIn(ctx.world, ctx.chunk).map((entry) => ({
					...entry,
					gravel: !!(
						entry.shape.line &&
						entry.shape.t === T.SIDEWALK &&
						entry.shape.w <= FOOTPATH &&
						inPark(ctx.world.shapes, entry.shape)
					),
				}))
				const { x, y, w, h } = ctx.chunk
				worker.postMessage({ world: { W, H, terrain, bbox, tileM }, entries, chunk: { x, y, w, h } })
			}),
	)
	const settled = done
		.catch((e) => {
			error = e
		})
		.finally(() => worker?.terminate())
	queued = settled
	yield settled
	if (error) throw error
	if (!result) return
	const geometry = new THREE.BufferGeometry()
	for (const [name, { array, itemSize, normalized }] of Object.entries(result.attributes))
		geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, normalized))
	geometry.setIndex(new THREE.BufferAttribute(result.index, 1))
	geometry.computeBoundingBox()
	geometry.computeBoundingSphere()
	return paintMesh(geometry, ctx)
}

function* buildLocal(ctx) {
	const geometry = yield* buildGeometry(ctx)
	return geometry && paintMesh(geometry, ctx)
}

function paintMesh(geometry, { world, chunk, ground, canvas }) {
	// Furniture has already added rain to the ground. Share its uniforms,
	// including the wet mask, without owning or allocating another texture.
	const material = new THREE.ShaderMaterial({
		uniforms: { ...ground.uniforms },
		vertexShader: ground.vertexShader,
		fragmentShader: ground.fragmentShader,
		defines: { ROAD_PAINT: '' },
		vertexColors: true,
		lights: true,
		polygonOffset: true,
		polygonOffsetFactor: 0,
		polygonOffsetUnits: -1,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.receiveShadow = true
	return { meshes: [mesh], dispose: releaseBuffers(mesh, { world, chunk, ground, canvas }) }
}

function releaseBuffers(mesh, ctx) {
	for (const attribute of [...Object.values(mesh.geometry.attributes), mesh.geometry.index]) attribute.onUpload(dropArray)
	const restore = () => {
		if (mesh.geometry.attributes.position.array) return
		const generator = buildLocal({ ...ctx, canvas: undefined })
		let step
		do step = generator.next()
		while (!step.done)
		const rebuilt = step.value.meshes[0]
		mesh.geometry.dispose()
		mesh.geometry = rebuilt.geometry
		rebuilt.material.dispose()
	}
	ctx.canvas?.addEventListener('webglcontextrestored', restore)
	return () => ctx.canvas?.removeEventListener('webglcontextrestored', restore)
}

function dropArray() {
	this.array = null
}
