// Fetch raw OpenStreetMap data for an area from Overpass. Runs in Bun and the browser.

const SERVERS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.private.coffee/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter',
]

export function overpassQuery({ south, west, north, east }) {
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
  node["amenity"](${b});
  node["leisure"="playground"](${b});
);
out geom;`
}

export async function fetchOsm(bbox, { onStatus = () => {}, headers = {} } = {}) {
	const body = new URLSearchParams({ data: overpassQuery(bbox) })
	for (let attempt = 0; attempt < 6; attempt++) {
		const url = SERVERS[attempt % SERVERS.length]
		try {
			onStatus(`Lade Karte von ${new URL(url).host}…`)
			const res = await fetch(url, { method: 'POST', headers, body })
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
