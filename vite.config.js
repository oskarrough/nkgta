export default {
	// jukebox/songs globs its .song files, which Vite can't do once the package is pre-bundled.
	optimizeDeps: { exclude: ['jukebox'] },
	server: { host: true, allowedHosts: ['.ts.net'] },
	build: {
		rollupOptions: { input: { main: 'index.html', pick: 'pick.html', hof: 'hof.html' } },
	},
}
