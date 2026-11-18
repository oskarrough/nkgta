export const T = {
	GROUND: 0, // courtyards, Hinterhöfe, anything unmapped
	ROAD: 1,
	SIDEWALK: 2,
	BUILDING: 3,
	GRASS: 4,
	WATER: 5,
	PLAYGROUND: 6,
	PITCH: 7,
	CYCLEWAY: 8,
	PRIVATE: 9, // paths and passages you're not really meant to use
}

export const COLORS = {
	[T.GROUND]: '#8d8577',
	[T.ROAD]: '#46484c',
	[T.SIDEWALK]: '#b3aa9b',
	[T.BUILDING]: '#b86a52',
	[T.GRASS]: '#5b8636',
	[T.WATER]: '#42605f',
	[T.PLAYGROUND]: '#c9a45e',
	[T.PITCH]: '#4f8040',
	[T.CYCLEWAY]: '#a05d55',
	[T.PRIVATE]: '#9d9484',
}

export const INK = 'rgba(26, 30, 30, 0.55)'
export const KERB = '#c9c1b2'
export const MARK = '#f4f1e7'

export const SOLID = new Set([T.BUILDING, T.WATER])

// Scan each square ring in row order so ties keep the same street or pavement.
export function nearestTile(x, y, radius, match) {
	for (let r = 0; r <= radius; r++) {
		for (let dy = -r; dy <= r; dy++) {
			const step = Math.abs(dy) === r ? 1 : 2 * r
			for (let dx = -r; dx <= r; dx += step) {
				const hit = match(x + dx, y + dy)
				if (hit) return hit
			}
		}
	}
}
