// Built maps for picked areas, kept in the browser with TinyJoin so a reload
// skips Overpass. Rows max out at 1 MB, so each map is gzipped and split.
// OPFS needs a secure context (https or localhost); elsewhere this is a no-op.
import { create } from 'tinyjoin'
import { encodeMap, decodeMap, toBase64, fromBase64 } from './map-codec.js'

const CHUNK = 900_000

let dbPromise
function db() {
	dbPromise ??= create('opfs://nkgta-areas-v1').then(async (db) => {
		await db.exec(`
			CREATE TABLE IF NOT EXISTS area_chunks (
				id TEXT PRIMARY KEY,
				area TEXT NOT NULL,
				n INTEGER NOT NULL,
				data TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS area_chunks_area ON area_chunks (area);
		`)
		return db
	})
	return dbPromise
}

const usable = () => globalThis.isSecureContext

export async function getArea(key) {
	if (!usable()) return null
	const store = await db()
	const { rows } = await store.query('SELECT data FROM area_chunks WHERE area = $1 ORDER BY n', [key])
	if (!rows.length) return null
	return decodeMap(JSON.parse(await gunzip(rows.map((r) => r.data).join(''))))
}

export async function putArea(key, map) {
	if (!usable()) return
	const packed = await gzip(JSON.stringify(encodeMap(map)))
	const store = await db()
	await store.transaction(async (tx) => {
		await tx.query('DELETE FROM area_chunks WHERE area = $1', [key])
		for (let n = 0; n * CHUNK < packed.length; n++) {
			await tx.query('INSERT INTO area_chunks (id, area, n, data) VALUES ($1, $2, $3, $4)', [
				`${key}#${n}`,
				key,
				n,
				packed.slice(n * CHUNK, (n + 1) * CHUNK),
			])
		}
	})
}

// gzip to base64 text and back.
async function gzip(text) {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
	return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()))
}

function gunzip(b64) {
	const stream = new Blob([fromBase64(b64)]).stream().pipeThrough(new DecompressionStream('gzip'))
	return new Response(stream).text()
}
