// The looks P cycles through, and every choice that makes them differ. All
// three draw the same city; a look only says how it's finished.
//
// outline: ink silhouette width in game pixels (device pixels off the grid),
//   with creases shaded darker.
// palette: snap every pixel to the fixed palette in palette.js.
// grid: draw at one game pixel per PX_PER_TILE tiles, blown up by whole
//   device pixels, with crisp textures, zoom in steps and the camera on
//   whole game pixels.
// plain: one flat grey for everything, no clouds, shadow decals or skids,
//   and the walk grid on top: the shapes and walls we built from the map,
//   not how they're painted.
export const LOOKS = {
	// The game as it's meant to look.
	default: { outline: 2, palette: false, grid: false, plain: false },
	// The default, cheaply: big pixels, one-pixel ink, a limited palette.
	pixel: { outline: 1, palette: true, grid: true, plain: false },
	// For testing: geometry and colliders.
	raw: { outline: 1, palette: false, grid: false, plain: true },
}

export const DEFAULT_LOOK = 'default'

export const nextLook = (name) => {
	const names = Object.keys(LOOKS)
	return names[(names.indexOf(name) + 1) % names.length]
}

// One game pixel per PX_PER_TILE tiles: 3 m / 10 = 0.3 m. The upscale to the
// screen is a whole number of device pixels, so nothing gets smoothed.
const PX_PER_TILE = 10
export const gameUpscale = (scale) => Math.max(1, Math.round(scale / PX_PER_TILE))

// Device pixels per drawn pixel at `scale` device pixels per tile. The other
// looks draw one pixel per CSS pixel, so a HiDPI screen doesn't pay four times
// over for a frame that looks the same.
export const upscaleOf = (look, scale, dpr = globalThis.devicePixelRatio ?? 1) =>
	look.grid ? gameUpscale(scale) : Math.max(1, Math.floor(dpr))
