#!/bin/bash
cd "$(dirname "$0")"
echo "Alanya Racing Motors baslatiliyor..."
if [ ! -d "node_modules" ]; then
  echo "Gerekli paketler kuruluyor..."
  npm install
fi
( sleep 2 && (open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) ) &
npm start
