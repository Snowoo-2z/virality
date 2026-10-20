@echo off
chcp 65001 >nul
cd /d %~dp0
title Virality Bot

echo.
echo ==============================================
echo    VIRALITY BOT - Demarrage
echo ==============================================
echo.

if not exist ".env" (
  echo [INFO] Creation du fichier .env a partir de l'exemple...
  copy ".env.example" ".env" >nul
  echo [IMPORTANT] Ouvre le fichier .env et colle ton token discord dedans,
  echo             puis relance ce fichier.
  echo.
)

if not exist "node_modules" (
  echo [INFO] Premiere installation des dependances, ca peut prendre 1 minute...
  call npm install
  echo.
)

echo [INFO] Lancement du bot + dashboard web...
echo [INFO] Dashboard : http://localhost:3000
echo [INFO] Pour arreter le bot : ferme cette fenetre ou fais Ctrl+C
echo.
call npm start

pause
