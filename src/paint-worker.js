// Paints ground and roof textures off the main thread. It gets the map's
// shapes and buildings once, then one area at a time, and sends back a
// bitmap the right way up for a texture.
import { renderMapImage, renderRoofImage } from './map-image.js'

let world

onmessage = async ({ data }) => {
	if (data.world) {
		world = JSON.parse(data.world)
		return
	}
	const { id, kind, area, roofs } = data
	const t = performance.now()
	const pitched = new Map(roofs)
	const canvas = kind === 'ground' ? renderMapImage(world, area) : renderRoofImage(world, (n) => pitched.get(n) ?? null, area).canvas
	const bitmap = await createImageBitmap(canvas, { imageOrientation: 'flipY', premultiplyAlpha: 'none' })
	postMessage({ id, bitmap, ms: performance.now() - t }, [bitmap])
}
