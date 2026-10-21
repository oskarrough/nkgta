// The pixel-art palette: tiny.london's sampled tones plus Neukölln terracotta,
// BVG yellow, signal colours, cloud blues and wave teal. The pixel look snaps
// every pixel to one of these, so its frame never shows a colour off the list.
import * as THREE from 'three'

export const PALETTE = [
	'#1A1E1B',
	'#303231',
	'#493A31',
	'#365B25',
	'#34502D',
	'#4D4B38',
	'#685537',
	'#4C6F32',
	'#363B44',
	'#3B474B',
	'#4D4C4B',
	'#4B5D5C',
	'#56585A',
	'#67594F',
	'#556D4C',
	'#4D615F',
	'#6E6856',
	'#565B63',
	'#546A69',
	'#706F6E',
	'#8F4C35',
	'#887666',
	'#5E8636',
	'#6C8B55',
	'#8F8775',
	'#A7946F',
	'#C0A576',
	'#3D5E82',
	'#747A85',
	'#7A858B',
	'#61ADC5',
	'#8F908E',
	'#A9A7A0',
	'#C2BDB0',
	'#D1D0CD',
	'#E7E7E5',
	'#FFFFFF',
	'#6E3A2A',
	'#B5603F',
	'#C97A52',
	'#E0A070',
	'#E8C21A',
	'#E8C46A',
	'#C8302A',
	'#3FA34D',
	'#689A3E',
	'#2D333D',
	'#DCE3EA',
	'#B4C1D0',
	'#8D9CB1',
	'#D2C4A0',
	'#6E8B89',
]

export const PALETTE_SIZE = PALETTE.length

// Look knobs: how fine the snapping table is, and how hard the ordered dither
// pushes a pixel towards the next colour (0 is off, 1 is a whole table cell).
export const LUT_SIZE = 32
export const DITHER = 0

export function paletteIndex(hex) {
	const i = PALETTE.indexOf(hex.toUpperCase())
	if (i < 0) throw new Error(`${hex} is not in the palette`)
	return i
}

// The palette in one row, so the upscale pass can pick a colour by index.
// Bytes are the plain sRGB values, so the texture decodes to exactly the hex.
export function paletteTexture() {
	const data = new Uint8Array(PALETTE_SIZE * 4)
	PALETTE.forEach((hex, i) => {
		const n = parseInt(hex.slice(1), 16)
		data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], i * 4)
	})
	const tex = new THREE.DataTexture(data, PALETTE_SIZE, 1, THREE.RGBAFormat)
	tex.colorSpace = THREE.SRGBColorSpace
	tex.minFilter = tex.magFilter = THREE.NearestFilter
	tex.generateMipmaps = false
	tex.needsUpdate = true
	return tex
}

const srgbToLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

function linearOf(hex) {
	const n = parseInt(hex.slice(1), 16)
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(srgbToLinear)
}

// Linear RGB to OKLab, so "nearest colour" means nearest to the eye.
function oklab([r, g, b]) {
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

// Every cell of a 32³ grid of linear colours answered with its palette index,
// laid out for the shader's sampler: x = r + b * 32, y = g, which is the
// row-major index (g * 32 + b) * 32 + r. One lookup instead of 48 compares.
export function paletteLut() {
	const n = LUT_SIZE
	const lab = PALETTE.map((hex) => oklab(linearOf(hex)))
	const data = new Uint8Array(n * n * n)
	for (let b = 0; b < n; b++) {
		for (let g = 0; g < n; g++) {
			for (let r = 0; r < n; r++) {
				const cell = oklab([(r + 0.5) / n, (g + 0.5) / n, (b + 0.5) / n])
				let best = 0
				let bestDist = Infinity
				for (let i = 0; i < lab.length; i++) {
					const d = (cell[0] - lab[i][0]) ** 2 + (cell[1] - lab[i][1]) ** 2 + (cell[2] - lab[i][2]) ** 2
					if (d < bestDist) {
						bestDist = d
						best = i
					}
				}
				data[(g * n + b) * n + r] = best
			}
		}
	}
	const tex = new THREE.DataTexture(data, n * n, n, THREE.RedFormat)
	tex.minFilter = tex.magFilter = THREE.NearestFilter
	tex.generateMipmaps = false
	tex.needsUpdate = true
	return tex
}
