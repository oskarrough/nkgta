import { BBOX, TILE_M } from '../src/default-area.js'
import { packTrees } from './baumkataster.js'

const collections = []
const key = [BBOX.south, BBOX.west, BBOX.north, BBOX.east].join('-')
for (const layer of ['strassenbaeume', 'anlagenbaeume']) {
	const file = Bun.file(`data/trees/${layer}-${key}.json`)
	if (!(await file.exists())) {
		const query = new URLSearchParams({
			service: 'WFS',
			version: '2.0.0',
			request: 'GetFeature',
			typeNames: `baumbestand:${layer}`,
			srsName: 'CRS:84',
			bbox: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north},CRS:84`,
			outputFormat: 'application/json',
			count: '100000',
		})
		console.log(`Downloading Berlin ${layer}`)
		const res = await fetch(`https://gdi.berlin.de/services/wfs/baumbestand?${query}`, { signal: AbortSignal.timeout(180000) })
		if (!res.ok) throw new Error(`${layer}: HTTP ${res.status}`)
		const text = await res.text()
		const json = JSON.parse(text)
		if (!Array.isArray(json.features) || json.features.length !== Number(json.numberMatched))
			throw new Error(`${layer}: incomplete WFS response`)
		await Bun.write(file, text)
	}
	const collection = await file.json()
	if (!collection.features.length || collection.features.length !== Number(collection.numberMatched))
		throw new Error(`${layer}: incomplete cache`)
	collections.push(collection)
}
const data = packTrees(collections, BBOX, TILE_M)
data.source = {
	url: 'https://gdi.berlin.de/services/wfs/baumbestand',
	licence: 'DL-DE-Zero-2.0',
	snapshots: collections.map((c) => c.timeStamp),
}
const text = JSON.stringify(data)
if (Buffer.byteLength(text) > 1024 ** 2) throw new Error('Trees exceed the 1 MiB payload budget')
await Bun.write('public/trees.json', text)
console.log(`${data.trees.length / 6} registered trees, ${Math.round(Buffer.byteLength(text) / 1024)} KiB`)
