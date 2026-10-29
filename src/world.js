import { T } from './tiles.js'
import { createTerrain } from './terrain.js'

export function createWorld(map) {
	const { w: W, h: H, tiles, streetOf, bbox, tileM } = map
	const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? T.BUILDING : tiles[(y | 0) * W + (x | 0)])
	const streetAt = (x, y) => map.streets[streetOf[(y | 0) * W + (x | 0)]] || ''

	const lonM = 111320 * Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180)
	const fromLatLon = ({ lat, lon }) => ({
		x: ((lon - bbox.west) * lonM) / tileM,
		y: ((bbox.north - lat) * 111320) / tileM,
	})
	const contains = ({ lat, lon }) => lat > bbox.south && lat < bbox.north && lon > bbox.west && lon < bbox.east

	function nearestOf(type, { x, y }) {
		for (let r = 0; r < 100; r++) {
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					if (tileAt(x + dx, y + dy) === type) return { x: (x | 0) + dx + 0.5, y: (y | 0) + dy + 0.5 }
				}
			}
		}
		return { x, y }
	}

	function startPoint(preferred) {
		const at = contains(preferred) ? fromLatLon(preferred) : { x: W / 2, y: H / 2 }
		return nearestOf(T.SIDEWALK, at)
	}

	// Ground height in tiles, and its rise per tile along x and y.
	const { heightAt, slopeAt, flat } = createTerrain(map.terrain, map)

	const cobbles = cobbledTiles(map.shapes ?? [], W, H)
	const cobbled = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cobbles[(y | 0) * W + (x | 0)] === 1

	return { ...map, W, H, tileAt, streetAt, startPoint, heightAt, slopeAt, flat, cobbled }
}

// The tiles under every cobbled shape, stroked the way build-map.js strokes
// the tiles themselves, so what you ride over is what you see.
function cobbledTiles(shapes, W, H) {
	const tiles = new Uint8Array(W * H)
	for (const s of shapes) {
		if (!s.line || !(s.sett || s.t === 'sett')) continue
		const r = Math.max(0.5, (s.w ?? 1) / 2)
		for (let i = 0; i + 3 < s.line.length; i += 2) {
			const ax = s.line[i]
			const ay = s.line[i + 1]
			const dx = s.line[i + 2] - ax
			const dy = s.line[i + 3] - ay
			const len2 = dx * dx + dy * dy || 1
			const x0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - r))
			const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, ax + dx) + r))
			const y0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - r))
			const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, ay + dy) + r))
			for (let y = y0; y <= y1; y++) {
				for (let x = x0; x <= x1; x++) {
					const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / len2))
					const qx = ax + t * dx - (x + 0.5)
					const qy = ay + t * dy - (y + 0.5)
					if (qx * qx + qy * qy <= r * r) tiles[y * W + x] = 1
				}
			}
		}
	}
	return tiles
}
