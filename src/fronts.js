// Shopfronts: every named shop, bank, pharmacy, café and bar on the street
// gets a stretch of wall above its windows for its sign, not only the ones
// you can walk into. Found when the map is built; src/fascia.js letters them.
import { alongFacade, facades } from './shops.js'

// Amenities with a sign over the door. Doctors, schools and churches have
// a brass plate or a building of their own instead.
const AMENITIES = new Set([
	'restaurant',
	'cafe',
	'fast_food',
	'bar',
	'pub',
	'ice_cream',
	'nightclub',
	'food_court',
	'biergarten',
	'bank',
	'pharmacy',
	'post_office',
	'bureau_de_change',
	'money_transfer',
	'internet_cafe',
	'cinema',
	'theatre',
	'driving_school',
	'car_rental',
])
const MIN = 1.3 // narrowest sign, tiles
const WANT = 1.7 // half a shopfront, tiles: how far a sign reaches each side of the door
const GAP = 0.12 // between neighbours' signs, tiles
const END = 0.1 // clear of the corner, tiles

// The storefronts among the map's OSM nodes, in tiles. Upstairs and
// basement shops have no fascia on the street.
export function storefronts(osm, toTile, W, H) {
	const list = []
	for (const e of osm.elements) {
		const t = e.tags
		if (e.type !== 'node' || !t) continue
		const kind = t.shop ? t.shop : AMENITIES.has(t.amenity) ? t.amenity : null
		if (!kind || ['vacant', 'no', 'mall'].includes(kind)) continue
		const level = parseFloat(t.level)
		if (level >= 1 || level < 0) continue
		const spaeti = kind === 'kiosk' || kind === 'convenience'
		const name = (t.name || t.brand || (spaeti ? 'Späti' : '')).replace(/\s*\(.*?\)\s*/g, ' ').trim()
		if (!name) continue
		const { x, y } = toTile(e)
		if (x < 0 || y < 0 || x >= W || y >= H) continue
		list.push({ name, brand: t.brand ?? '', kind, x, y })
	}
	return list
}

// Each storefront on its facade with a stretch of wall to itself: chains
// first, then by how close the node sits to its wall. Each wants a narrow
// sign round its door, slid clear of the corners; where that would overlap
// one already placed, it goes without. Then each reaches out half a
// shopfront either way, or halfway to the next sign, and not round the
// corner. Packed flat: name, brand, kind, then building, centre, out,
// along and half-width.
export function findFronts(world, list) {
	const facadeOf = facades(world)
	const placed = []
	const found = list.flatMap((p) => {
		const f = facadeOf(p.x, p.y)
		return f ? [{ ...p, ...f }] : []
	})
	found.sort((a, b) => !!b.brand - !!a.brand || a.d - b.d)
	for (const f of found) {
		const first = END - f.s
		const last = f.len - f.s - END
		if (last - first < MIN) continue
		f.lo = Math.min(Math.max(-MIN / 2, first), last - MIN)
		f.hi = f.lo + MIN
		const clash = (o) => {
			const s = near(f, o) && span(f, o)
			return s && s[0] < f.hi + GAP && s[1] > f.lo - GAP
		}
		if (!placed.some(clash)) placed.push(f)
	}
	const round = (v) => Math.round(v * 1e3) / 1e3
	return placed.flatMap((f) => {
		let lo = Math.max(END - f.s, Math.min(f.lo, -WANT))
		let hi = Math.min(f.len - f.s - END, Math.max(f.hi, WANT))
		for (const o of placed) {
			const s = o !== f && near(f, o) && span(f, o)
			if (!s) continue
			if (s[0] >= f.hi) hi = Math.min(hi, (f.hi + s[0]) / 2 - GAP / 2)
			else lo = Math.max(lo, (f.lo + s[1]) / 2 + GAP / 2)
		}
		const mid = (lo + hi) / 2
		const at = [f.x + f.ex * mid, f.y + f.ey * mid, f.nx, f.ny, f.ex, f.ey, (hi - lo) / 2].map(round)
		return [f.name, f.brand, f.kind, f.n, ...at]
	})
}

// Where o's sign sits along f's wall, if they share a facade.
function span(f, o) {
	const t = alongFacade(f, o)
	if (t === null) return null
	return f.ex * o.ex + f.ey * o.ey > 0 ? [t + o.lo, t + o.hi] : [t - o.hi, t - o.lo]
}

const near = (a, b) => Math.abs(a.x - b.x) < WANT * 4 && Math.abs(a.y - b.y) < WANT * 4

// Unpacked again, for the scene.
export function frontsOf(world) {
	const packed = world.fronts ?? []
	const fronts = []
	for (let i = 0; i < packed.length; i += 11) {
		const [name, brand, kind, n, x, y, nx, ny, ex, ey, half] = packed.slice(i, i + 11)
		fronts.push({ name, brand, kind, n, x, y, nx, ny, ex, ey, half })
	}
	return fronts
}
