// Download raw OpenStreetMap data for the default area from Overpass.
// Big areas go in pieces of about 2 km², one after the other, so no single
// query runs into Overpass's time limit. Elements on a seam come back twice;
// keep one of each. Each piece is kept in data/pieces/, so a rerun after
// Overpass gives up picks up where it stopped.
// Usage: bun scripts/fetch-osm.js
import { BBOX } from '../src/default-area.js'
import { fetchOsm } from '../src/overpass.js'

const PIECE_KM2 = 2

const kmTall = (BBOX.north - BBOX.south) * 111.3
const kmWide = (BBOX.east - BBOX.west) * 111.3 * Math.cos((BBOX.south * Math.PI) / 180)
const cols = Math.max(1, Math.ceil(kmWide / Math.sqrt(PIECE_KM2)))
const rows = Math.max(1, Math.ceil(kmTall / Math.sqrt(PIECE_KM2)))

const seen = new Map()
for (let r = 0; r < rows; r++) {
	for (let c = 0; c < cols; c++) {
		const piece = {
			south: BBOX.south + ((BBOX.north - BBOX.south) * r) / rows,
			north: BBOX.south + ((BBOX.north - BBOX.south) * (r + 1)) / rows,
			west: BBOX.west + ((BBOX.east - BBOX.west) * c) / cols,
			east: BBOX.west + ((BBOX.east - BBOX.west) * (c + 1)) / cols,
		}
		const n = r * cols + c + 1
		const file = Bun.file(
			`data/pieces/${Object.values(piece)
				.map((v) => v.toFixed(5))
				.join(',')}.json`,
		)
		let json
		if (await file.exists()) json = await file.json()
		else {
			console.log(`Piece ${n} of ${rows * cols}`)
			;({ json } = await fetchOsm(piece, {
				onStatus: console.log,
				headers: { 'User-Agent': 'nkgta/0.1 (github.com/oskarrough/nkgta)' },
			}))
			await Bun.write(file, JSON.stringify(json))
		}
		for (const el of json.elements) seen.set(`${el.type}/${el.id}`, el)
	}
}
const elements = [...seen.values()]
await Bun.write('data/osm.json', JSON.stringify({ elements }))
console.log(`${elements.length} elements`)
