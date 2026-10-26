// The lie of the land: ground height anywhere on the map, in tiles above
// its lowest point. Made by scripts/build-terrain.js for the default area;
// anywhere without it the ground stays flat.
import { fromBase64 } from './map-codec.js'

export const CELL = 4 // tiles between heights
const RELIEF = 1 // 1 is true to life; more steepens every slope

// How much the hills are felt, without making them any higher. A grade is
// metres up per metre along (0.043 is Werbellinstraße's steepest stretch).
export const HILLS = {
	walk: 3.5, // walking pace lost per unit of grade, uphill; gained downhill
	bikeUp: 9, // the same on the bike, uphill: pedalling hurts
	bikeDown: 6, // and downhill, freewheeling faster
	slowest: 0.4, // never slower than this share of your pace, so you never get stuck
	fastest: 1.5, // nor faster than this share of it, downhill
	coast: 80, // tiles/s² a bike gains per unit of grade rolling downhill without pedalling
	car: 1.6, // gravity along the slope on cars, against true to life (1)
	shade: 2.6, // how much slopes lighten or darken from above; 1 is the sun's own
}

const FLAT = { heightAt: () => 0, slopeAt: () => [0, 0], flat: true }

// `json` is public/terrain.json, or nothing. It only fits the map it was made for.
export function createTerrain(json, map) {
	if (!json || json.tileM !== map.tileM || Object.keys(map.bbox).some((k) => Math.abs(json.bbox[k] - map.bbox[k]) > 1e-9)) {
		return FLAT
	}
	const { w, h, cell } = json
	const cm = new Uint16Array(fromBase64(json.cm).buffer)
	const scale = RELIEF / 100 / json.tileM
	const at = (x, y) => cm[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))] * scale

	// Bilinear between the four heights round (x, y), so the ground is
	// exactly the triangles' plane wherever a grid vertex sits.
	function heightAt(x, y) {
		const gx = Math.max(0, Math.min(w - 1.0001, x / cell))
		const gy = Math.max(0, Math.min(h - 1.0001, y / cell))
		const ix = Math.floor(gx)
		const iy = Math.floor(gy)
		const fx = gx - ix
		const fy = gy - iy
		const top = at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx
		const bottom = at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx
		return top * (1 - fy) + bottom * fy
	}
	// Rise per tile towards +x and +y.
	const slopeAt = (x, y) => [heightAt(x + 0.5, y) - heightAt(x - 0.5, y), heightAt(x, y + 0.5) - heightAt(x, y - 0.5)]

	return { heightAt, slopeAt, flat: false }
}
