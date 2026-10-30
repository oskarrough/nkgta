// Berlin LoD2 (DL-DE-Zero-2.0), cached by kilometre tile in data/lod2/.
// Fit measured surfaces to the game's OSM footprints, preserving passages.
// Usage: bun scripts/build-roofs.js. Rebuild after rebuilding the map.
import { encodeRoofs } from '../src/roof-codec.js'
import { BBOX } from '../src/default-area.js'
import { toUtm33 } from '../src/utm.js'
import { decodeMap } from '../src/map-codec.js'
// Survey slivers can explode into millions of clipping segments. Bound
// that work per building; fitRoofs keeps the generated roof on failure.
process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE = '10000'
process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS = '10000'
const { parseLod2, fitRoofs } = await import('./lod2.js')

const map = decodeMap(await Bun.file('public/map.json').json())
if (JSON.stringify(map.bbox) !== JSON.stringify(BBOX)) throw new Error('Rebuild the default map first')
const corners = [
	[BBOX.south, BBOX.west],
	[BBOX.south, BBOX.east],
	[BBOX.north, BBOX.west],
	[BBOX.north, BBOX.east],
].map(([lat, lon]) => toUtm33(lat, lon))
const e0 = Math.floor(Math.min(...corners.map((p) => p.e)) / 1000)
const e1 = Math.floor(Math.max(...corners.map((p) => p.e)) / 1000)
const n0 = Math.floor(Math.min(...corners.map((p) => p.n)) / 1000)
const n1 = Math.floor(Math.max(...corners.map((p) => p.n)) / 1000)
const models = new Map()
for (let e = e0; e <= e1; e++) {
	for (let n = n0; n <= n1; n++) {
		const path = `data/lod2/LoD2_${e}_${n}.zip`
		const file = Bun.file(path)
		if (!(await file.exists())) {
			console.log(`Downloading ${path}`)
			const res = await fetch(`https://gdi.berlin.de/data/a_lod2/atom/LoD2_${e}_${n}.zip`)
			if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
			await Bun.write(file, res)
		}
		const unzip = Bun.spawn(['unzip', '-p', path], { stderr: 'inherit' })
		const xml = await new Response(unzip.stdout).text()
		if (await unzip.exited) throw new Error(`Cannot unzip ${path}`)
		for (const model of parseLod2(xml, map)) models.set(model.id, model)
	}
}
const buildings = fitRoofs(map, [...models.values()])
await Bun.write('public/roofs.bin', encodeRoofs({ bbox: map.bbox, tileM: map.tileM, buildings }))
console.log(`${buildings.length} of ${map.buildings.length} buildings fitted with measured roofs`)
