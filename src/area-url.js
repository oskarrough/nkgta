// The picked area travels in the URL as ?area=south,west,north,east.

export function areaFromUrl() {
	const area = new URLSearchParams(location.search).get('area')
	if (!area) return null
	const [south, west, north, east] = area.split(',').map(Number)
	return { south, west, north, east }
}

export const areaUrl = ({ south, west, north, east }) => `/?area=${[south, west, north, east].join(',')}`
