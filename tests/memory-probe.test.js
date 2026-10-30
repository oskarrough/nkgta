import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../scripts/memory-probe.js', import.meta.url), 'utf8')
function probe() {
	class GL {}
	Object.assign(GL.prototype, { RGBA: 0x1908, RGBA8: 0x8058, UNSIGNED_BYTE: 0x1401, FLOAT: 0x1406, HALF_FLOAT: 0x140b })
	for (const name of [
		'bindBuffer',
		'bufferData',
		'deleteBuffer',
		'activeTexture',
		'bindTexture',
		'texStorage2D',
		'texImage2D',
		'generateMipmap',
		'deleteTexture',
		'bindRenderbuffer',
		'renderbufferStorage',
		'renderbufferStorageMultisample',
		'deleteRenderbuffer',
	])
		GL.prototype[name] = () => {}
	const context = { WebGL2RenderingContext: GL }
	runInNewContext(source, context)
	return { gl: new GL(), bytes: () => context.memoryProbe().textureBytes }
}

test('immutable mip storage is counted once, including non-square tails', () => {
	const { gl, bytes } = probe()
	const texture = {}
	gl.bindTexture(0, texture)
	gl.texStorage2D(0, 4, gl.RGBA8, 8, 2)
	expect(bytes()).toBe((16 + 4 + 2 + 1) * 4)
	gl.generateMipmap(0)
	gl.generateMipmap(0)
	expect(bytes()).toBe(92)
	gl.deleteTexture(texture)
	expect(bytes()).toBe(0)
})

test('mutable mip generation and level uploads replace their existing allocations', () => {
	const { gl, bytes } = probe()
	gl.bindTexture(0, {})
	gl.texImage2D(0, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
	expect(bytes()).toBe(64)
	gl.texImage2D(0, 1, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
	expect(bytes()).toBe(80)
	gl.generateMipmap(0)
	gl.generateMipmap(0)
	expect(bytes()).toBe(84)
	gl.texImage2D(0, 1, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
	expect(bytes()).toBe(84)
})
