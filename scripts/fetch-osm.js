// Download raw OpenStreetMap data for the default area from Overpass.
// Usage: bun scripts/fetch-osm.js
import { BBOX } from '../src/default-area.js'
import { fetchOsm } from '../src/overpass.js'

const { json, text } = await fetchOsm(BBOX, {
	onStatus: console.log,
	headers: { 'User-Agent': 'nkgta/0.1 (github.com/oskarrough/nkgta)' },
})
await Bun.write('data/osm.json', text)
console.log(`${json.elements.length} elements`)
