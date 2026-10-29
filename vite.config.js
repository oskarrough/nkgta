import { execSync } from 'node:child_process'

// The git commit the build came from, else the day it was built; sent along with feedback.
let version = new Date().toISOString().slice(0, 10)
try {
	version =
		execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim() || version
} catch {
	// No git in this build: the date will do.
}

export default {
	define: { __GAME_VERSION__: JSON.stringify(version) },
	// jukebox/songs globs its .song files, which Vite can't do once the package is pre-bundled.
	optimizeDeps: { exclude: ['jukebox'] },
	server: { host: true, allowedHosts: ['.ts.net'] },
	build: {
		rollupOptions: { input: { main: 'index.html', pick: 'pick.html', hof: 'hof.html' } },
	},
}
