@echo off
chcp 65001 > nul
title Actualizar HYPNOS 2.2
color 0B
echo.
echo  =============================================================
echo    ACTUALIZADOR AUTOMATICO DE HYPNOS 2.2
echo  =============================================================
echo.
echo  Paso 1/2: Accediendo a la carpeta del repositorio...
cd /d "C:\Users\jpccm\Desktop\HYPNOS APP\hypnos-app"
if errorlevel 1 (
    color 0C
    echo.
    echo  [ERROR] No se encontro la carpeta del repositorio en:
    echo  C:\Users\jpccm\Desktop\HYPNOS APP\hypnos-app
    echo.
    pause
    exit /b 1
)

:: Si hubiera cambios pendientes sin commitear, los anadimos
git add -A > nul 2>&1
git diff-index --quiet HEAD > nul 2>&1
if errorlevel 1 (
    git commit -m "HYPNOS 2.2: Actualizacion automatica" > nul 2>&1
)

echo.
echo  Paso 2/2: Subiendo cambios a GitHub Pages...
echo.
git push origin master
if errorlevel 1 (
    echo.
    color 0C
    echo  [AVISO] Hubo un problema al subir a GitHub.
    echo  Compruebe su conexion a internet o sus permisos de GitHub
    echo  y vuelva a intentarlo haciendo doble clic de nuevo.
    echo.
    pause
    exit /b 1
)

echo.
echo  =============================================================
echo    ACTUALIZACION COMPLETADA CON EXITO!
echo  =============================================================
echo.
echo    1. APP EN LINEA (enlace directo para movil y PC):
echo       https://jpccmedicine-svg.github.io/hypnos-app/
echo       (GitHub Pages tarda aproximadamente 1-2 minutos en refrescar)
echo.
echo    2. APP INSTALADA EN TU PC (PWA) O NAVEGADOR:
echo       - Abre el enlace en tu navegador o abre tu PWA instalada.
echo       - Pulsa Ctrl + F5 (o abre una pestana de incognito).
echo       - Se cargara automaticamente HYPNOS 2.2 by JP.
echo.
echo  =============================================================
echo.
pause
