@echo off
setlocal
chcp 65001 >nul
title Portal Medicion
pushd "%~dp0"
if errorlevel 1 exit /b 1
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Instala Node.js 24 LTS o posterior desde https://nodejs.org/en/download
  echo Despues cierra esta ventana y vuelve a abrir Iniciar.cmd.
  pause
  popd
  exit /b 1
)
node.exe asistente.mjs iniciar
set "resultado=%errorlevel%"
if not "%resultado%"=="0" pause
popd
exit /b %resultado%
