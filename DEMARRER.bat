@echo off
chcp 65001 >nul
cd /d %~dp0
setlocal
title Virality Bot

echo.
echo ==============================================
echo    VIRALITY BOT - Demarrage guide
echo ==============================================
echo.
echo Reste dans cette fenetre noire et suis les etapes affichees.
echo.

rem ---------- Verification : Node.js installe ? ----------
where node >nul 2>nul
if errorlevel 1 goto NODE_MANQUANT

rem ---------- Premier lancement : creer le fichier .env ----------
if not exist ".env" goto PREMIER_LANCEMENT
goto SUITE

:PREMIER_LANCEMENT
echo [ETAPE 1] Premier lancement : je cree ton fichier de reglages.
copy ".env.example" ".env" >nul
echo.
echo --------------------------------------------------
echo  Le BLOC-NOTES va s'ouvrir avec ce fichier.
echo  Tu dois juste changer 2 lignes :
echo.
echo   1) DISCORD_TOKEN=colle_ton_token_ici
echo      -^> remplace  colle_ton_token_ici  par ton token discord
echo         (le long code secret de ton bot).
echo.
echo   2) DASHBOARD_PASSWORD=choisis_un_mot_de_passe
echo      -^> remplace  choisis_un_mot_de_passe  par un mot de passe
echo         a toi, et RETIENS-LE (il sert a ouvrir le dashboard).
echo.
echo  Ensuite : ENREGISTRE avec Ctrl+S, puis FERME le Bloc-notes.
echo --------------------------------------------------
echo.
echo Appuie sur une touche pour ouvrir le Bloc-notes...
pause >nul
notepad ".env"
echo.
echo Quand le Bloc-notes est ferme, clique dans cette fenetre
echo noire et appuie sur une touche pour continuer.
pause >nul
findstr /C:"colle_ton_token_ici" ".env" >nul
if not errorlevel 1 goto TOKEN_OUBLIE
goto SUITE

:TOKEN_OUBLIE
echo.
echo [ATTENTION] On dirait que le token n'a pas ete colle.
echo Ce n'est pas grave pour tester le dashboard, mais le bot
echo restera HORS LIGNE sur discord.
echo Tu pourras corriger plus tard dans le fichier .env,
echo puis relancer DEMARRER.bat.
echo.
pause
goto SUITE

:SUITE
rem ---------- Installation des morceaux du bot (1ere fois) ----------
if not exist "node_modules" goto INSTALLER
if not exist "node_modules\@supabase" goto INSTALLER
goto LANCER

:INSTALLER
echo [ETAPE 2] Installation des morceaux du bot...
echo           (premiere fois seulement, environ 1 minute, patience)
call npm install
echo.

:LANCER
echo [ETAPE 3] Demarrage du bot...
echo.
echo   -^> Quand tu verras les messages de demarrage,
echo       ouvre Chrome et va sur :  http://localhost:3000
echo   -^> Si un lien d'invitation s'affiche plus bas,
echo       fais Ctrl+clic dessus pour ajouter le bot a ton serveur.
echo.
echo   IMPORTANT : LAISSE CETTE FENETRE NOIRE OUVERTE.
echo   C'est elle le bot. La fermer = eteindre le bot.
echo.
echo --------------------------------------------------
call npm start
goto FIN

:NODE_MANQUANT
echo [STOP] Il manque Node.js sur ton PC.
echo C'est le moteur gratuit qui fait tourner le bot.
echo.
echo J'ouvre la page de telechargement pour toi :
echo   1) Clique sur le gros bouton vert (version LTS)
echo   2) Installe-le en cliquant "Suivant" partout
echo   3) Quand c'est fini, re-double-clique sur DEMARRER.bat
echo.
start "" "https://nodejs.org/fr"
echo Appuie sur une touche pour fermer cette fenetre.
pause >nul
goto FIN

:FIN
echo.
echo Le bot est arrete. Tu peux fermer cette fenetre.
pause >nul
endlocal
