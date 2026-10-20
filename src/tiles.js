// Tile types, shared by the map builder and the game.
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

// Muted comic palette: charcoal roads, warm grey stone, slate water.
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

// Ink lines and the pale kerb between tarmac and pavement.
export const INK = 'rgba(26, 30, 30, 0.55)'
export const KERB = '#c9c1b2'
export const MARK = '#f4f1e7'

export const SOLID = new Set([T.BUILDING, T.WATER])
