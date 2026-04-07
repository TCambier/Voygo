@echo off
setlocal
REM Proxy pour le serveur Node et les requêtes backend.
REM Pour ne pas utiliser le proxy, commentez les lignes ci-dessous.
set "HTTP_PROXY=http://10.1.2.5:8080"
set "HTTPS_PROXY=http://10.1.2.5:8080"
set "http_proxy=%HTTP_PROXY%"
set "https_proxy=%HTTPS_PROXY%"
set "NO_PROXY=localhost,127.0.0.1"

echo Proxy configure: %HTTP_PROXY%
REM Démarrage du serveur Node
npm run dev

pause
endlocal
