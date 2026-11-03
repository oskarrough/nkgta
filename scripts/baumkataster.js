const GENERA = ['Platanus', 'Tilia', 'Acer', 'Aesculus', 'Robinia']
const CONIFERS = /^(Abies|Cedrus|Chamaecyparis|Larix|Metasequoia|Picea|Pinus|Pseudotsuga|Sequoiadendron|Taxodium|Taxus|Thuja|Tsuga)$/i
const positive = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null)
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

export function treeSpecies(p) {
	const genus = (p.gattung || p.art_bot || '').trim().split(/\s+/)[0]
	const group = GENERA.findIndex((name) => name.toLowerCase() === genus.toLowerCase())
	return group >= 0 ? group + 1 : CONIFERS.test(genus) ? 6 : 0
}

export function treeMeasurements(p) {
	const circumference = positive(p.stammumfg)
	const age = positive(p.standalter)
	const diameter = circumference ? circumference / (100 * Math.PI) : age ? 0.04 + age * 0.008 : 0.25
	// Missing survey sizes use the recorded stem or age, never a random mature crown.
	const crown = clamp(positive(p.kronedurch) ?? 1.2 + diameter * 16, 0.5, 35)
	const top = clamp(positive(p.baumhoehe) ?? 3 + Math.sqrt(diameter) * 18, 1.5, 45)
	return { crown, top, stem: clamp(diameter / 2, 0.02, 2) }
}

export function packTrees(collections, bbox, tileM) {
	const lonM = 111320 * Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180)
	const seen = new Set()
	const trees = []
	const features = collections.flatMap((c) => c.features).sort((a, b) => String(a.id).localeCompare(String(b.id)))
	for (const f of features) {
		if (f.geometry?.type !== 'Point') continue
		const [lon, lat] = f.geometry.coordinates
		if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < bbox.west || lon >= bbox.east || lat <= bbox.south || lat > bbox.north)
			continue
		const p = f.properties ?? {}
		const id = p.gisid || f.id
		if (id && seen.has(id)) continue
		if (id) seen.add(id)
		const { crown, top, stem } = treeMeasurements(p)
		trees.push(
			Math.round((((lon - bbox.west) * lonM) / tileM) * 10),
			Math.round((((bbox.north - lat) * 111320) / tileM) * 10),
			Math.round(crown * 10),
			Math.round(top * 10),
			Math.round(stem * 100),
			treeSpecies(p),
		)
	}
	return { version: 1, bbox, tileM, trees }
}
