// Kinds of places on the map, how they look and what they're called.

// Every kind belongs to a family with its badge colour, so from far away the
// colour alone says roughly what's there: warm food, amber drinks, teal
// shops, grey services, green for outdoors. `glyph` is the colour drawn on it.
export const FAMILIES = {
	food: { color: '#B5603F', glyph: '#FFF4E2' },
	drink: { color: '#E8B22A', glyph: '#1A1E1B' },
	shop: { color: '#2F7F7B', glyph: '#FFFFFF' },
	service: { color: '#6E7480', glyph: '#FFFFFF' },
	outdoors: { color: '#3FA34D', glyph: '#FFFFFF' },
}

export const FAMILY = {
	spaeti: 'shop',
	doener: 'food',
	imbiss: 'food',
	cafe: 'drink',
	bar: 'drink',
	restaurant: 'food',
	bikeshop: 'shop',
	supermarket: 'shop',
	bakery: 'food',
	pharmacy: 'service',
	hospital: 'service',
	school: 'service',
	kita: 'service',
	playground: 'outdoors',
}

export const badgeColor = (kind) => FAMILIES[FAMILY[kind]].color

export const LABELS = {
	spaeti: 'Späti',
	doener: 'Döner',
	imbiss: 'Imbiss',
	cafe: 'Café',
	bar: 'Bar',
	restaurant: 'Restaurant',
	bikeshop: 'Fahrradladen',
	supermarket: 'Supermarkt',
	bakery: 'Bäckerei',
	pharmacy: 'Apotheke',
	hospital: 'Krankenhaus',
	school: 'Schule',
	kita: 'Kita',
	playground: 'Spielplatz',
}

export const placeName = (p) => p.name || LABELS[p.kind]

// Closest place to (x, y) within `within` tiles, optionally of one kind.
export function nearestPlace(pois, x, y, within, kind) {
	let best = null
	let bestD = within
	for (const p of pois) {
		if (kind && p.kind !== kind) continue
		const d = Math.hypot(p.x - x, p.y - y)
		if (d < bestD) {
			best = p
			bestD = d
		}
	}
	return best
}
