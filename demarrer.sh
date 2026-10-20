#!/bin/bash
# Lanceur Mac / Linux — équivalent du DEMARRER.bat
cd "$(dirname "$0")" || exit 1

echo ""
echo "=============================================="
echo "   VIRALITY BOT — Démarrage"
echo "=============================================="
echo ""

if [ ! -f ".env" ]; then
  echo "[INFO] Création du fichier .env à partir de l'exemple..."
  cp ".env.example" ".env"
  echo "[IMPORTANT] Ouvre le fichier .env et colle ton token discord dedans, puis relance ce script."
  echo ""
fi

if [ ! -d "node_modules" ]; then
  echo "[INFO] Première installation des dépendances, ça peut prendre 1 minute..."
  npm install
  echo ""
fi

echo "[INFO] Lancement du bot + dashboard web : http://localhost:3000"
echo "[INFO] Pour arrêter : Ctrl+C"
echo ""
npm start
