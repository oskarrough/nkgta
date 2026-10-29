import polygonClipping from 'polygon-clipping'
import { toUtm33 } from '../src/utm.js'
import { planeOf } from '../src/measured-roofs.js'

// Newton inversion of the same projection used for terrain. The initial
// guess is inside Berlin; three iterations give sub-centimetre agreement.
export function fromUtm33(e, n, bbox) {
	let lat = (bbox.north + bbox.south) / 2
	let lon = (bbox.east + bbox.west) / 2
	for (let i = 0; i < 3; i++) {
		const p = toUtm33(lat, lon)
		const a = toUtm33(lat + 0.0001, lon)
		const b = toUtm33(lat, lon + 0.0001)
		const ae = (a.e - p.e) / 0.0001,
			an = (a.n - p.n) / 0.0001
		const be = (b.e - p.e) / 0.0001,
			bn = (b.n - p.n) / 0.0001
		const det = ae * bn - an * be
		lat += ((e - p.e) * bn - (n - p.n) * be) / det
		lon += (ae * (n - p.n) - an * (e - p.e)) / det
	}
	return { lat, lon }
}

// The published AdV CityGML uses explicit Polygon/LinearRing/posList
// geometry in boundedBy; lod2Solid only references those same polygons.
export function parseLod2(xml, map) {
	const { bbox, tileM } = map
	const lonM = 111320 * Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180)
	const point = ([e, n, z]) => {
		const { lat, lon } = fromUtm33(e, n, bbox)
		return [((lon - bbox.west) * lonM) / tileM, ((bbox.north - lat) * 111320) / tileM, z]
	}
	const polygons = (text) =>
		[...text.matchAll(/<gml:Polygon\b[^>]*>([\s\S]*?)<\/gml:Polygon>/g)].map(([, poly]) =>
			[...poly.matchAll(/<gml:posList\b[^>]*>([\s\S]*?)<\/gml:posList>/g)].map(([, list]) => {
				const nums = list.trim().split(/\s+/).map(Number)
				if (nums.length % 3 || nums.some((v) => !Number.isFinite(v))) throw new Error('Invalid LoD2 coordinates')
				return Array.from({ length: nums.length / 3 }, (_, i) => point(nums.slice(i * 3, i * 3 + 3)))
			}),
		)
	const models = []
	for (const [, member] of xml.matchAll(/<core:cityObjectMember>([\s\S]*?)<\/core:cityObjectMember>/g)) {
		const id = member.match(/<bldg:Building\b[^>]*gml:id="([^"]+)"/)?.[1]
		if (!id) continue
		const surfaces = (type) =>
			[...member.matchAll(new RegExp(`<bldg:${type}Surface\\b[^>]*>([\\s\\S]*?)<\\/bldg:${type}Surface>`, 'g'))].flatMap(([, s]) =>
				polygons(s),
			)
		const ground = surfaces('Ground')
		const roofs = surfaces('Roof')
		if (!ground.length || !roofs.length) continue
		const base = Math.min(...ground.flat(2).map((p) => p[2]))
		for (const poly of roofs) for (const ring of poly) for (const p of ring) p[2] = (p[2] - base) / tileM
		const box = bounds(roofs.flat())
		if (box[2] < 0 || box[3] < 0 || box[0] > map.w || box[1] > map.h) continue
		models.push({ id, roofs, box })
	}
	return models
}

const area = (ring) =>
	Math.abs(
		ring.reduce((sum, p, i) => {
			const q = ring[(i + 1) % ring.length]
			return sum + p[0] * q[1] - q[0] * p[1]
		}, 0),
	) / 2
const polyArea = (rings) => area(rings[0]) - rings.slice(1).reduce((sum, r) => sum + area(r), 0)
const bounds = (rings) => {
	const pts = rings.flat()
	return [
		Math.min(...pts.map((p) => p[0])),
		Math.min(...pts.map((p) => p[1])),
		Math.max(...pts.map((p) => p[0])),
		Math.max(...pts.map((p) => p[1])),
	]
}
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]

export function fitRoofs(map, models) {
	const out = []
	for (const b of map.buildings) {
		try {
			// Preserve the builder's even-odd rings, including disjoint parts.
			const rings = b.rings.map((r) => Array.from({ length: r.length / 2 }, (_, i) => r.slice(i * 2, i * 2 + 2)))
			let footprint = []
			for (const r of rings) footprint = polygonClipping.xor(footprint, [r])
			const size = footprint.reduce((s, p) => s + polyArea(p), 0)
			if (size < 1) continue
			const box = bounds(rings)
			const faces = []
			let covered = []
			for (const model of models) {
				if (!overlaps(box, model.box)) continue
				for (const poly of model.roofs) {
					const plane = planeOf(poly[0])
					if (!plane || Math.hypot(plane[0], plane[1]) > 5) continue
					const xy = poly.map((r) => r.map((p) => p.slice(0, 2).map((v) => Math.round(v * 10000) / 10000)))
					// Roofs can overlap (dormers, different building parts). First
					// accepted surface wins; coverage never counts an overlap twice.
					const clipped = polygonClipping.difference(polygonClipping.intersection(footprint, xy), covered)
					if (!clipped.length) continue
					covered = polygonClipping.union(covered, clipped)
					for (const piece of clipped) faces.push({ rings: piece, plane })
				}
			}
			const coverage = covered.reduce((s, p) => s + polyArea(p), 0) / size
			// A partial match is worse than the procedural fallback. Small survey
			// differences get a flat strip at the lowest eave, never a roof over a street.
			if (coverage < 0.95) continue
			const heights = faces.flatMap((f) => f.rings.flat().map(([x, y]) => f.plane[0] * x + f.plane[1] * y + f.plane[2]))
			const eave = Math.min(...heights)
			if (eave < 0.5 || Math.max(...heights) > 100) continue
			for (const piece of polygonClipping.difference(footprint, covered)) faces.push({ rings: piece, plane: [0, 0, eave] })
			// North-facing scene coordinates, with z relative to the eaves.
			const round = (n) => Math.round(n * 10000) / 10000
			const roof = faces.map((f) =>
				f.rings.map((r) =>
					r.slice(0, -1).map(([x, y]) => [round(x), round(-y), round(f.plane[0] * x + f.plane[1] * y + f.plane[2] - eave)]),
				),
			)
			out.push({ rings: b.rings, h: Math.round(eave * map.tileM * 100) / 100, faces: roof })
		} catch (error) {
			// Invalid survey polygons must not prevent the rest of the city from building.
			console.warn(`Keeping procedural roof at ${b.rings[0].slice(0, 2)}: ${error.message}`)
		}
	}
	return out
}
