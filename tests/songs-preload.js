// jukebox/songs reads the songs with Vite's import.meta.glob, which bun test
// doesn't have; here it reads the same files off the disk instead.
import { plugin } from 'bun'
import { readFileSync, readdirSync } from 'node:fs'

plugin({
	name: 'jukebox-songs',
	setup(build) {
		build.onLoad({ filter: /jukebox[\\/]src[\\/]songs\.js$/ }, ({ path }) => {
			const dir = new URL('../music/', `file://${path}`)
			const songs = Object.fromEntries(
				readdirSync(dir)
					.filter((f) => f.endsWith('.song'))
					.map((f) => [f.slice(0, -'.song'.length), readFileSync(new URL(f, dir), 'utf8')]),
			)
			return { contents: `export const SONGS = ${JSON.stringify(songs)}\nexport const NAMES = Object.keys(SONGS)`, loader: 'js' }
		})
	},
})
