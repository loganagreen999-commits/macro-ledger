#!/usr/bin/env python3
"""Serve Macro Ledger on the LAN so the phone can reach it.

    ~/nutrition/serve.py [port]

Port 8099 is already open in both Windows firewalls (castbox). For any other
port run:  ~/castbox/open-port.sh <port>
"""
import http.server, socketserver, socket, os, sys, functools

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
ROOT = os.path.dirname(os.path.abspath(__file__))

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80)); return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map,
                          **{".webmanifest": "application/manifest+json",
                             ".woff2": "font/woff2",
                             ".js": "text/javascript"})
    def end_headers(self):
        # never let a stale service worker or page stick around during testing
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, fmt, *a):
        sys.stderr.write("  %s\n" % (fmt % a))

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT),
                            functools.partial(Handler, directory=ROOT)) as httpd:
    print("\n  Macro Ledger — serving %s\n" % ROOT)
    print("    this laptop :  http://localhost:%d/" % PORT)
    print("    your iPhone :  http://%s:%d/\n" % (lan_ip(), PORT))
    print("  Ctrl-C to stop.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped.\n")
