import { expect, test } from 'bun:test'
import { createWorld } from '../src/world.js'
import { defaultMap } from './default-map.js'
import { stationsOf } from '../src/ubahn.js'

test('U7 and U8 stations come from real entrances, in line order', async () => {
	const stations = stationsOf(createWorld(await defaultMap()))
	const onward = (from, line) => stations.find((s) => s.name === from).services.find((s) => s.line === line && s.dir === 1)?.next.name
	expect(onward('Hermannplatz', 'U7')).toBe('Rathaus Neukölln')
	expect(onward('Boddinstraße', 'U8')).toBe('Leinestraße')
	expect(onward('Hermannstraße', 'U8')).toBeUndefined()
	// A Hermannstraße-named exit up at Hermannplatz stays out of that station.
	const hermannstr = stations.find((s) => s.name === 'Hermannstraße')
	for (const e of hermannstr.entrances) expect(Math.hypot(e.x - hermannstr.x, e.y - hermannstr.y)).toBeLessThan(30)
})
