// Download raw OpenStreetMap data for the play area from Overpass.
// Usage: bun scripts/fetch-osm.js
import { BBOX } from './bbox.js'

const b = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`
const query = `[out:json][timeout:90];
(
  way["highway"](${b});
  way["building"](${b});
  way["leisure"~"park|playground|pitch|garden"](${b});
  way["landuse"~"grass|cemetery|allotments|recreation_ground"](${b});
  way["natural"~"water|wood|scrub"](${b});
  way["waterway"](${b});
  node["shop"](${b});
  node["amenity"](${b});
  node["leisure"="playground"](${b});
);
out geom;`

const servers = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.private.coffee/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter',
]

for (let attempt = 0; attempt < 6; attempt++) {
	const url = servers[attempt % servers.length]
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'User-Agent': 'nkgta/0.1 (github.com/oskarrough/nkgta)' },
			body: new URLSearchParams({ data: query }),
		})
		const text = await res.text()
		const json = JSON.parse(text)
		await Bun.write('data/osm.json', text)
		console.log(`${json.elements.length} elements from ${url}`)
		process.exit(0)
	} catch (err) {
		console.warn(`${url} failed (${err.message}), retrying`)
		await Bun.sleep(15000)
	}
}
console.error('All Overpass servers busy. Try again later.')
process.exit(1)
