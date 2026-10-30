// Injected before three.js: estimated live WebGL allocations, excluding driver
// overhead. Canvas/compositor buffers and worker canvases are not WebGL textures.
;(() => {
	const p = WebGL2RenderingContext.prototype
	const buffers = new Map(),
		textures = new Map(),
		renders = new Map()
	const storage = new Map()
	const bound = new Map()
	const slots = new Map()
	let unit = 0,
		render
	const texture = () => slots.get(unit)
	const wrap = (name, track) => {
		const original = p[name]
		p[name] = function (...args) {
			const result = original.apply(this, args)
			track.apply(this, args)
			return result
		}
	}
	wrap('bindBuffer', (target, buffer) => bound.set(target, buffer))
	wrap('bufferData', (target, data) => buffers.set(bound.get(target), typeof data === 'number' ? data : (data?.byteLength ?? 0)))
	wrap('deleteBuffer', (b) => buffers.delete(b))
	wrap('activeTexture', (n) => {
		unit = n
	})
	wrap('bindTexture', (_, t) => {
		slots.set(unit, t)
	})
	const bpp = (format, type) => {
		if ([p.DEPTH_COMPONENT, p.DEPTH_COMPONENT24, p.DEPTH_COMPONENT32F, p.DEPTH_STENCIL, p.DEPTH24_STENCIL8].includes(format)) return 4
		if ([p.RGBA32F].includes(format)) return 16
		if ([p.RGBA16F].includes(format)) return 8
		if ([p.R8, p.ALPHA, p.LUMINANCE, p.RED].includes(format)) return 1
		if ([p.DEPTH_COMPONENT16].includes(format)) return 2
		if (format === p.RGB) return 3
		return type === p.FLOAT ? 16 : type === p.HALF_FLOAT ? 8 : 4
	}
	const mipBytes = (w, h, bytes, levels) => {
		let total = 0
		for (let level = 0; level < levels; level++) {
			total += w * h * bytes
			w = Math.max(1, Math.floor(w / 2))
			h = Math.max(1, Math.floor(h / 2))
		}
		return total
	}
	wrap('texStorage2D', (_, levels, format, w, h) => {
		storage.set(texture(), { immutable: true, width: w, height: h, bytes: bpp(format) })
		textures.set(texture(), mipBytes(w, h, bpp(format), levels))
	})
	wrap('texImage2D', function (...a) {
		const image = a.length < 9 ? a[5] : null
		const width = image?.width ?? a[3],
			height = image?.height ?? a[4]
		const bytes = bpp(a[2], a.length < 9 ? a[4] : a[7])
		const entry = storage.get(texture()) ?? { levels: new Map() }
		entry.levels.set(a[1], width * height * bytes)
		if (a[1] === 0) Object.assign(entry, { width, height, bytes })
		storage.set(texture(), entry)
		textures.set(
			texture(),
			[...entry.levels.values()].reduce((s, n) => s + n, 0),
		)
	})
	wrap('generateMipmap', () => {
		const entry = storage.get(texture())
		// Immutable storage already allocated the entire chain; regenerating
		// either kind of texture replaces texels, never multiplies storage.
		if (!entry || entry.immutable) return
		const { width, height, bytes } = entry
		const levels = 1 + Math.floor(Math.log2(Math.max(width, height)))
		for (let l = 0; l < levels; l++) entry.levels.set(l, Math.max(1, width >> l) * Math.max(1, height >> l) * bytes)
		textures.set(
			texture(),
			[...entry.levels.values()].reduce((s, n) => s + n, 0),
		)
	})
	wrap('deleteTexture', (t) => {
		textures.delete(t)
		storage.delete(t)
	})
	wrap('bindRenderbuffer', (_, r) => {
		render = r
	})
	wrap('renderbufferStorage', (_, format, w, h) => renders.set(render, w * h * bpp(format)))
	wrap('renderbufferStorageMultisample', (_, samples, format, w, h) => renders.set(render, samples * w * h * bpp(format)))
	wrap('deleteRenderbuffer', (r) => renders.delete(r))
	globalThis.memoryProbe = () => {
		const sum = (m) => [...m.values()].reduce((s, n) => s + n, 0)
		const bufferBytes = sum(buffers),
			textureBytes = sum(textures),
			renderBytes = sum(renders)
		return {
			bufferBytes,
			textureBytes,
			renderBytes,
			total: bufferBytes + textureBytes + renderBytes,
			buffers: buffers.size,
			textures: textures.size,
			textureSizes: [...textures]
				.map(([texture, bytes]) => ({ width: storage.get(texture)?.width, height: storage.get(texture)?.height, bytes }))
				.sort((a, b) => b.bytes - a.bytes),
		}
	}
})()
