// Prerender the whole map once, straight into pixels, plus half-size copies
// for zoomed-out views. Shrinking the full map by more than 2× in one go
// makes buildings shimmer as you move.
import { T, COLORS } from './tiles.js'

export const PX = 4 // prerendered pixels per tile

export function renderMapImage(world) {
	const { W, H, tiles, tileAt } = world
	const canvas = document.createElement('canvas')
	canvas.width = W * PX
	canvas.height = H * PX
	const g = canvas.getContext('2d')
	const img = g.createImageData(canvas.width, canvas.height)
	const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
	const palette = Object.fromEntries(Object.entries(COLORS).map(([t, c]) => [t, rgb(c)]))
	const buildingEdge = rgb('#8f4a38')
	const kerb = rgb('#d8d2c6')
	const px = img.data
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const t = tiles[y * W + x]
			// Dark edge where a building meets anything else, so blocks read as blocks.
			const edgeB = t === T.BUILDING && tileAt(x, y + 1) !== T.BUILDING
			const edgeR = t === T.BUILDING && tileAt(x + 1, y) !== T.BUILDING
			const kerbB = t === T.SIDEWALK && tileAt(x, y + 1) === T.ROAD
			for (let dy = 0; dy < PX; dy++) {
				for (let dx = 0; dx < PX; dx++) {
					let c = palette[t]
					if ((edgeB && dy === PX - 1) || (edgeR && dx === PX - 1)) c = buildingEdge
					else if (kerbB && dy === PX - 1) c = kerb
					const i = ((y * PX + dy) * canvas.width + x * PX + dx) * 4
					px[i] = c[0]
					px[i + 1] = c[1]
					px[i + 2] = c[2]
					px[i + 3] = 255
				}
			}
		}
	}
	g.putImageData(img, 0, 0)

	const mips = [canvas]
	while (mips.at(-1).width > 256) {
		const prev = mips.at(-1)
		const c = document.createElement('canvas')
		c.width = Math.ceil(prev.width / 2)
		c.height = Math.ceil(prev.height / 2)
		const mg = c.getContext('2d')
		mg.imageSmoothingQuality = 'high'
		mg.drawImage(prev, 0, 0, c.width, c.height)
		mips.push(c)
	}
	return mips
}
