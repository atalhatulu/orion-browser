#!/bin/bash
# Orion Browser Başlatıcı

echo "Orion Browser başlatılıyor..."
cd /home/teha/Documents/GitHub/orion-browser
npx electron . 2> >(grep -v "Fontconfig warning" >&2)
