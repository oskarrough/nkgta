// Fetch raw OpenStreetMap data for an area from Overpass. Runs in Bun and the browser.

const SERVERS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.private.coffee/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter',
]

function overpassQuery({ south, west, north, east }) {
	const b = `${south},${west},${north},${east}`
	return `[out:json][timeout:180];
(
  way["highway"](${b});
  way["building"](${b});
  relation["building"]["type"="multipolygon"](${b});
  way["leisure"~"park|playground|pitch|garden"](${b});
  relation["leisure"~"park|playground|pitch|garden"]["type"="multipolygon"](${b});
  way["landuse"~"grass|cemetery|allotments|recreation_ground|meadow"](${b});
  relation["landuse"~"grass|cemetery|allotments|recreation_ground|meadow"]["type"="multipolygon"](${b});
  way["natural"~"water|wood|scrub|grassland"](${b});
  relation["natural"~"water|wood|scrub|grassland"]["type"="multipolygon"](${b});
  way["waterway"](${b});
  node["shop"](${b});
  node["addr:housenumber"]["addr:street"](${b});
  node["amenity"](${b});
  way["amenity"="hospital"](${b});
  relation["amenity"="hospital"]["type"="multipolygon"](${b});
  node["leisure"="playground"](${b});
  node["railway"~"station|subway_entrance"](${b});
  node["highway"="bus_stop"](${b});
  node["highway"="traffic_signals"](${b});
  node["highway"="street_lamp"](${b});
  node["natural"="tree"](${b});
  way["natural"="tree_row"](${b});
  nw["tourism"="artwork"]["artwork_type"="mural"](${b});
);
out geom;
// Which lines stop where: route relations through the stops, members by id only.
node["public_transport"="stop_position"](${b})->.stops;
node["highway"="bus_stop"](${b})->.poles;
(rel(bn.stops)["route"~"bus|subway"]; rel(bn.poles)["route"="bus"];);
out body;
.stops out;`
}

export async function fetchOsm(bbox, { onStatus = () => {}, headers = {} } = {}) {
	const body = new URLSearchParams({ data: overpassQuery(bbox) })
	for (let attempt = 0; attempt < 6; attempt++) {
		const url = SERVERS[attempt % SERVERS.length]
		try {
			onStatus(`Lade Karte von ${new URL(url).host}…`)
			const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(240_000) })
			const text = await res.text()
			const json = JSON.parse(text)
			if (!json.elements) throw new Error('no elements')
			return { json, text }
		} catch {
			onStatus(`${new URL(url).host} ist beschäftigt, versuche nochmal…`)
			await new Promise((r) => setTimeout(r, 5000 + attempt * 5000))
		}
	}
	throw new Error('All Overpass servers busy. Try again later.')
}
