// Injected before three.js: estimated live WebGL allocations, excluding driver
// overhead. Canvas/compositor buffers and worker canvases are not WebGL textures.
;(() => {
	const p = WebGL2RenderingContext.prototype
	const buffers = new Map(),
		textures = new Map(),
		renders = new Map()
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
	wrap('texStorage2D', (_, levels, format, w, h) => textures.set(texture(), w * h * bpp(format) * (levels > 1 ? 4 / 3 : 1)))
	wrap('texImage2D', function (...a) {
		if (a[1] !== 0) return
		const image = a.length < 9 ? a[5] : null
		textures.set(texture(), (image?.width ?? a[3]) * (image?.height ?? a[4]) * bpp(a[2], a.length < 9 ? a[4] : a[7]))
	})
	wrap('generateMipmap', () => textures.set(texture(), ((textures.get(texture()) ?? 0) * 4) / 3))
	wrap('deleteTexture', (t) => textures.delete(t))
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
		}
	}
})()
