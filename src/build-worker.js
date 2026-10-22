// Fetches and builds a picked area off the main thread, so the page stays
// responsive however big it is. Sends back status lines as it goes, then the
// map encoded as JSON text, ready to decode and to cache as it is.
import { buildMap } from './build-map.js'
import { fetchOsm } from './overpass.js'
import { encodeMap } from './map-codec.js'

onmessage = async ({ data: { bbox, tileM } }) => {
	try {
		const onStatus = (status) => postMessage({ status })
		const { json } = await fetchOsm(bbox, { onStatus })
		onStatus(`Baue Neukölln aus ${json.elements.length} Teilen…`)
		postMessage({ text: JSON.stringify(encodeMap(buildMap(json, bbox, tileM))) })
	} catch (err) {
		postMessage({ error: err.message })
	}
}
