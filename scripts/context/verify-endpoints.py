#!/usr/bin/env python3
import os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
required = [
    os.path.join(ROOT, 'offline-panel', 'index.html'),
    os.path.join(ROOT, 'offline-panel', 'app.css'),
    os.path.join(ROOT, 'offline-panel', 'app.js'),
]
missing = [p for p in required if not os.path.isfile(p)]
if missing:
    print('MISSING:', *missing, sep='\n - ')
    sys.exit(1)
print('OK: offline-panel assets present')
