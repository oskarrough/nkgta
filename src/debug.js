// TEMPORARY, for finding what makes frames slow: ?off=shadows,ink,clouds,cars
// turns those off, and any ?off shows fps and the GPU in the corner.
export const OFF = new Set(new URLSearchParams(globalThis.location?.search).get('off')?.split(',') ?? [])
export const DEBUG = new URLSearchParams(globalThis.location?.search).has('off')
