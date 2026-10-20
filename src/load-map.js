// Load the default map, or the area picked on /pick.html (?area=south,west,north,east).
import { buildMap } from './build-map.js'
import { fetchOsm } from './overpass.js'
import { decodeMap } from './map-codec.js'
import { getArea, putArea } from './area-cache.js'
import { areaFromUrl } from './area-url.js'
import { TILE_M } from './default-area.js'

// Bump when build-map.js changes, so cached areas get rebuilt.
const BUILD_VERSION = 7

export async function loadMap(onStatus) {
	const bbox = areaFromUrl()
	if (!bbox) {
		onStatus('Lade Karte…')
		return decodeMap(await (await fetch('/map.json')).json())
	}

	const key = `${BUILD_VERSION}:${Object.values(bbox).join(',')}`
	const cached = await getArea(key).catch((err) => console.warn('Area cache unavailable', err))
	if (cached) return cached

	const { json } = await fetchOsm(bbox, { onStatus })
	onStatus(`Baue Neukölln aus ${json.elements.length} Teilen…`)
	await new Promise((r) => setTimeout(r, 50)) // let the status paint
	const map = buildMap(json, bbox, TILE_M)
	putArea(key, map).catch((err) => console.warn('Could not cache area', err))
	return map
}
