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

export const COLORS = {
	[T.GROUND]: '#8a8170',
	[T.ROAD]: '#4a4a4f',
	[T.SIDEWALK]: '#b9b2a6',
	[T.BUILDING]: '#c8735a',
	[T.GRASS]: '#6f9a4e',
	[T.WATER]: '#3f6f9a',
	[T.PLAYGROUND]: '#d9b45a',
	[T.PITCH]: '#4f8a52',
	[T.CYCLEWAY]: '#b4615a',
	[T.PRIVATE]: '#a89f90',
}

export const SOLID = new Set([T.BUILDING, T.WATER])
