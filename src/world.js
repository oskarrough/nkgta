// A loaded map plus the questions the game asks of it.
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

	// Somewhere sensible to start: near `preferred` if it's on this map, else the middle.
	function startPoint(preferred) {
		const at = contains(preferred) ? fromLatLon(preferred) : { x: W / 2, y: H / 2 }
		return nearestOf(T.SIDEWALK, at)
	}

	// Ground height in tiles, and its rise per tile along x and y.
	const { heightAt, slopeAt, flat } = createTerrain(map.terrain, map)

	return { ...map, W, H, tileAt, streetAt, startPoint, heightAt, slopeAt, flat }
}
