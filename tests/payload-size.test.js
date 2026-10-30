import { expect, test } from 'bun:test'
import { readdirSync, statSync } from 'node:fs'

const publicDir = new URL('../public/', import.meta.url)
const MiB = 2 ** 20
const limits = { 'map.json': 8 * MiB, 'terrain.json': 0.5 * MiB, 'roofs.bin': 10 * MiB }

test('shipped map payloads stay inside the phone download budget', () => {
	const files = [...new Set([...Object.keys(limits), ...readdirSync(publicDir).filter((name) => name.endsWith('.json'))])]
	let total = 0
	for (const name of files) {
		const bytes = statSync(new URL(name, publicDir)).size
		expect(bytes, `${name} grew past its phone payload budget`).toBeLessThanOrEqual(limits[name] ?? MiB)
		total += bytes
	}
	expect(total, 'Combined JSON and roofs payload exceeds 20 MiB').toBeLessThanOrEqual(20 * MiB)
})
