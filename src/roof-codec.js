// Integer survey coordinates keep the source's 0.0001-tile precision without
// JSON strings or decimal parsing. Footprints keep the map's 0.1-tile grid.
const MAGIC = 0x31464f52 // ROF1, little endian

export function encodeRoofs({ bbox, tileM, buildings }) {
	const words = []
	const rings = (rs, scale) => {
		words.push(rs.length)
		for (const r of rs) {
			words.push(r.length)
			for (const n of r) words.push(Math.round(n * scale))
		}
	}
	for (const b of buildings) {
		rings(b.rings, 10)
		words.push(Math.round(b.h * 100), b.faces.length)
		for (const face of b.faces)
			rings(
				face.map((r) => r.flat()),
				10000,
			)
	}
	const buffer = new ArrayBuffer(48 + words.length * 4)
	const view = new DataView(buffer)
	view.setUint32(0, MAGIC, true)
	view.setUint32(4, buildings.length, true)
	for (const [i, n] of [bbox.south, bbox.west, bbox.north, bbox.east, tileM].entries()) view.setFloat64(8 + i * 8, n, true)
	words.forEach((n, i) => view.setInt32(48 + i * 4, n, true))
	return buffer
}

export function decodeRoofs(buffer) {
	const view = new DataView(buffer)
	if (view.getUint32(0, true) !== MAGIC) throw new Error('Unknown roof format')
	const count = view.getUint32(4, true)
	const [south, west, north, east, tileM] = Array.from({ length: 5 }, (_, i) => view.getFloat64(8 + i * 8, true))
	let offset = 48
	const next = () => {
		const n = view.getInt32(offset, true)
		offset += 4
		return n
	}
	const rings = (scale, dimensions = 1) => {
		const result = []
		const count = next()
		for (let i = 0; i < count; i++) {
			const length = next()
			if (length < 0 || length % dimensions || length > (buffer.byteLength - offset) / 4) throw new Error('Invalid roof ring')
			const ring = []
			for (let j = 0; j < length; j += dimensions) {
				if (dimensions === 1) ring.push(next() / scale)
				else ring.push([next() / scale, next() / scale, next() / scale])
			}
			result.push(ring)
		}
		return result
	}
	const buildings = []
	for (let i = 0; i < count; i++) {
		const outline = rings(10)
		const h = next() / 100
		const count = next()
		const faces = []
		for (let j = 0; j < count; j++) faces.push(rings(10000, 3))
		buildings.push({ rings: outline, h, faces })
	}
	if (offset !== buffer.byteLength) throw new Error('Invalid roof length')
	return { bbox: { south, west, north, east }, tileM, buildings }
}
