export default {
	server: { host: true, allowedHosts: ['.ts.net'] },
	build: {
		rollupOptions: { input: { main: 'index.html', pick: 'pick.html', jukebox: 'jukebox.html', hof: 'hof.html' } },
	},
}
