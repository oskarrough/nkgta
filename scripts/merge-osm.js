// Add the elements of another Overpass answer to data/osm.json, say the
// murals after the query learnt to ask for them, without fetching it all again.
// Usage: bun scripts/merge-osm.js extra.json
import { renameSync } from 'node:fs'

const osm = await Bun.file('data/osm.json').json()
const extra = await Bun.file(process.argv[2]).json()
const seen = new Set(osm.elements.map((e) => `${e.type}/${e.id}`))
const added = extra.elements.filter((e) => !seen.has(`${e.type}/${e.id}`))
osm.elements.push(...added)
// Written alongside, then moved over, so a symlinked osm.json is replaced, not written through.
await Bun.write('data/osm.json.tmp', JSON.stringify(osm))
renameSync('data/osm.json.tmp', 'data/osm.json')
console.log(`${added.length} elements added, ${osm.elements.length} in all`)
