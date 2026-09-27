"""Local dev server for the game: like `python3 -m http.server`, but tells the browser never to cache,
so an edited ES module is always picked up on reload. Usage: python3 tools/serve.py [port=8123]"""
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
