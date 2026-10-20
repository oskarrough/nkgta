// WGS84/ETRS89 latitude and longitude to UTM zone 33 north (EPSG:25833),
// the grid Berlin's elevation model comes in. Krüger's series, good to well
// under a millimetre across the zone.
const A = 6378137
const F = 1 / 298.257222101
const K0 = 0.9996
const LON0 = (15 * Math.PI) / 180

const n = F / (2 - F)
const AA = (A / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64)
const alpha = [n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3, (13 / 48) * n ** 2 - (3 / 5) * n ** 3, (61 / 240) * n ** 3]
const e = Math.sqrt(F * (2 - F))

export function toUtm33(lat, lon) {
	const phi = (lat * Math.PI) / 180
	const lam = (lon * Math.PI) / 180 - LON0
	const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)))
	const xi = Math.atan2(t, Math.cos(lam))
	const eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t))
	let x = eta
	let y = xi
	for (let j = 1; j <= 3; j++) {
		x += alpha[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta)
		y += alpha[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta)
	}
	return { e: 500000 + K0 * AA * x, n: K0 * AA * y }
}
