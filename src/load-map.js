// Load the default map, or the area picked on /pick.html (?area=south,west,north,east).
import { decodeMap } from './map-codec.js'
import { getArea, putArea } from './area-cache.js'
import { areaFromUrl } from './area-url.js'
import { TILE_M } from './default-area.js'
import { phase } from './perf.js'

// Bump when build-map.js or map-codec.js changes, so cached areas get rebuilt.
const BUILD_VERSION = 9

export async function loadMap(onStatus) {
	const bbox = areaFromUrl()
	if (!bbox) {
		onStatus('Lade Karte…')
		// The lie of the land comes alongside; without it the ground stays flat.
		const terrain = fetch('/terrain.json')
			.then((res) => (res.ok ? res.json() : null))
			.catch(() => null)
		const text = await (await fetch('/map.json')).text()
		phase('fetch')
		const json = JSON.parse(text)
		phase('parse')
		const map = decodeMap(json)
		phase('decode')
		map.terrain = await terrain
		return map
	}

	const key = `${BUILD_VERSION}:${Object.values(bbox).join(',')}`
	const cached = await getArea(key).catch((err) => console.warn('Area cache unavailable', err))
	if (cached) return cached

	const text = await buildInWorker(bbox, onStatus)
	const map = decodeMap(JSON.parse(text))
	putArea(key, text).catch((err) => console.warn('Could not cache area', err))
	return map
}

function buildInWorker(bbox, onStatus) {
	const worker = new Worker(new URL('./build-worker.js', import.meta.url), { type: 'module' })
	worker.postMessage({ bbox, tileM: TILE_M })
	return new Promise((resolve, reject) => {
		worker.onmessage = ({ data }) => {
			if (data.status) return onStatus(data.status)
			worker.terminate()
			if (data.error) reject(new Error(data.error))
			else resolve(data.text)
		}
		worker.onerror = (err) => {
			worker.terminate()
			reject(new Error(err.message))
		}
	})
}
