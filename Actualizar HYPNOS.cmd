@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title Actualizar HYPNOS 2.3 · Asistente Clínico de Cuidados Paliativos
color 0B

set "PROYECTO=C:\Users\jpccm\Desktop\HYPNOS APP\hypnos-app"
set "LOGFILE=%PROYECTO%\registro_actualizacion.log"
set "URL_PUB=https://jpccmedicine-svg.github.io/hypnos-app/"

echo ===============================================================================
echo   HYPNOS 2.3 — Asistente Clínico de Cuidados Paliativos
echo   Lanzador Oficial de Actualización y Despliegue en GitHub Pages
echo ===============================================================================
echo Fecha y hora: %date% %time%
echo.

:: 1. Localizar el proyecto correcto
echo [1/8] Verificando ubicación del proyecto...
if not exist "%PROYECTO%" (
    color 0C
    echo [ERROR] No se localizó la carpeta del proyecto en:
    echo "%PROYECTO%"
    pause
    exit /b 1
)
cd /d "%PROYECTO%"
echo   Carpeta confirmada: %PROYECTO%

:: 2. Detectar rama y repositorio
echo.
echo [2/8] Detectando repositorio y rama Git...
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set "RAMA_ACTUAL=%%i"
for /f "tokens=*" %%i in ('git remote get-url origin 2^>nul') do set "REPOSITORIO_RAW=%%i"

if "%RAMA_ACTUAL%"=="" (
    color 0C
    echo [ERROR] No se pudo determinar la rama activa en el repositorio.
    echo %date% %time% - ERROR: No se detectó rama Git activa. >> "%LOGFILE%"
    pause
    exit /b 1
)
if not "%RAMA_ACTUAL%"=="master" (
    color 0E
    echo [AVISO] La rama activa es '%RAMA_ACTUAL%'. La rama oficial de despliegue es 'master'.
)

:: Sanitizar URL remota para evitar imprimir credenciales en pantalla o logs
set "REPOSITORIO_MOSTRAR=%REPOSITORIO_RAW%"
echo %REPOSITORIO_RAW% | findstr /i "@" >nul
if not errorlevel 1 (
    set "REPOSITORIO_MOSTRAR=https://github.com/jpccmedicine-svg/hypnos-app.git"
)
echo   Rama activa: %RAMA_ACTUAL%
echo   Repositorio: %REPOSITORIO_MOSTRAR%

:: 3. Confirmar que no existen conflictos ni marcas de fusión sin resolver
echo.
echo [3/8] Comprobando ausencia de conflictos y coherencia del árbol de trabajo...
git rev-parse --is-inside-work-tree > nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] La carpeta no es un árbol Git válido.
    echo %date% %time% - ERROR: Árbol Git no válido. >> "%LOGFILE%"
    pause
    exit /b 1
)

:: Comprobar marcas de conflicto
git diff --check > nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR CRÍTICO] Se detectaron marcas de conflicto sin resolver en el código.
    echo Resuelva los conflictos antes de intentar publicar.
    echo %date% %time% - ERROR: Marcas de conflicto detectadas por git diff --check. >> "%LOGFILE%"
    pause
    exit /b 1
)

git status --porcelain | findstr "^UU ^AA ^UD ^DU" > nul 2>&1
if not errorlevel 1 (
    color 0C
    echo [ERROR CRÍTICO] Existen archivos en estado de conflicto sin resolver.
    echo %date% %time% - ERROR: Archivos en conflicto según git status. >> "%LOGFILE%"
    pause
    exit /b 1
)
echo   ✓ Sin conflictos de fusión detectados.

:: 4. Ejecutar pruebas automatizadas de lógica clínica
echo.
echo [4/8] Ejecutando pruebas automatizadas (node tests/test_engine.js)...
set "TEST_OK=0"
where node >nul 2>&1
if not errorlevel 1 (
    node tests\test_engine.js
    if not errorlevel 1 set "TEST_OK=1"
) else (
    where wsl >nul 2>&1
    if not errorlevel 1 (
        echo   (Ejecutando pruebas mediante entorno WSL...)
        wsl -e node tests/test_engine.js
        if not errorlevel 1 set "TEST_OK=1"
    )
)

if "%TEST_OK%"=="0" (
    color 0C
    echo.
    echo [ERROR CRÍTICO] Las pruebas automatizadas NO se superaron o no se localizó Node.js.
    echo Por seguridad clínica no se permite publicar una versión con pruebas fallidas.
    echo %date% %time% - ERROR: Pruebas automatizadas fallidas. Publicación abortada. >> "%LOGFILE%"
    pause
    exit /b 1
)
echo   ✓ Pruebas automatizadas superadas con éxito (100 %% de casos aprobados).

:: 5. Preparar exclusivamente archivos propios de HYPNOS
echo.
echo [5/8] Preparando exclusivamente archivos autorizados de HYPNOS...
git reset HEAD > nul 2>&1
git add app.js engine.js index.html hypnos.html manifest.json style.css sw.js icon.svg "tests\test_engine.js" "Actualizar HYPNOS.cmd" actualizar_github.bat
if errorlevel 1 (
    color 0C
    echo [ERROR] Falló la preparación de archivos con git add.
    echo %date% %time% - ERROR: Falló git add. >> "%LOGFILE%"
    pause
    exit /b 1
)
echo   ✓ Archivos de HYPNOS preparados en el índice.

:: 6. Comprobación exhaustiva de seguridad: secretos y archivos sensibles
echo.
echo [6/8] Verificando ausencia de secretos, tokens o archivos sensibles...
if exist ".env" (
    color 0C
    echo [ALERTA DE SEGURIDAD] Archivo .env detectado. No se permite publicar credenciales.
    echo %date% %time% - ALERTA: Archivo .env detectado. Abortado. >> "%LOGFILE%"
    pause
    exit /b 1
)
if exist "*.key" (
    color 0C
    echo [ALERTA DE SEGURIDAD] Archivo .key detectado en la carpeta. Abortado.
    echo %date% %time% - ALERTA: Archivo .key detectado. Abortado. >> "%LOGFILE%"
    pause
    exit /b 1
)
if exist "*.pem" (
    color 0C
    echo [ALERTA DE SEGURIDAD] Archivo .pem detectado en la carpeta. Abortado.
    echo %date% %time% - ALERTA: Archivo .pem detectado. Abortado. >> "%LOGFILE%"
    pause
    exit /b 1
)

:: Inspeccionar diff preparado para descartar tokens o claves privadas
powershell.exe -NoProfile -Command "$d = git diff --cached --no-ext-diff --unified=0; if ($LASTEXITCODE -ne 0) { exit 0 }; if ($d -match '(?i)gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|(?:PRIVATE_KEY|BEGIN_PRIVATE_KEY)\s*[:=]\s*[\x22\x27]?[a-z0-9/+]{20,}') { exit 0 }; exit 1" > nul 2>&1
if not errorlevel 1 (
    color 0C
    echo [ALERTA DE SEGURIDAD] Posible token o clave privada detectada en el diff preparado.
    echo %date% %time% - ALERTA: Patrón de credencial detectado en git diff --cached. >> "%LOGFILE%"
    pause
    exit /b 1
)
echo   ✓ Verificación de secretos superada: sin credenciales ni claves privadas en el índice.

:: 7. Preparar commit
echo.
echo [7/8] Comprobando estado de cambios para commit...
git diff-index --quiet HEAD > nul 2>&1
if errorlevel 1 (
    echo   Nuevos cambios detectados. Creando commit local...
    git commit -m "HYPNOS 2.3: 12 correcciones obligatorias, escala Ramsay, catálogo auditado y desglose matemático"
    if errorlevel 1 (
        color 0C
        echo [ERROR] No se pudo crear el commit local.
        echo %date% %time% - ERROR: Falló git commit. >> "%LOGFILE%"
        pause
        exit /b 1
    )
) else (
    echo   Árbol local al día. No hay cambios pendientes de commit.
)

:: 8. Confirmación única antes de publicar externamente
echo.
echo ===============================================================================
echo   ATENCIÓN: Se dispone a publicar la actualización a GitHub Pages:
echo   Destino: %REPOSITORIO_MOSTRAR% (rama %RAMA_ACTUAL%)
echo   URL final: %URL_PUB%
echo ===============================================================================
echo.
set /p "CONFIRMA=¿Desea enviar y publicar ahora esta versión en GitHub Pages? [S/N]: "
if /i not "%CONFIRMA%"=="S" (
    echo.
    echo [CANCELADO] Operación de subida cancelada por el usuario. Los cambios locales se conservan.
    echo %date% %time% - Publicación cancelada por el usuario (confirmación N). >> "%LOGFILE%"
    pause
    exit /b 0
)

:: 9. Publicar sin force push
echo.
echo Enviando cambios a GitHub (git push origin %RAMA_ACTUAL%)...
git push origin %RAMA_ACTUAL%
if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] No se pudo completar el push a GitHub.
    echo Compruebe su conexión a internet, credenciales o posibles cambios remotos pendientes.
    echo %date% %time% - ERROR: Falló git push origin %RAMA_ACTUAL%. >> "%LOGFILE%"
    pause
    exit /b 1
)

:: 10, 11 y 12. Comprobación, URL y Registro
echo.
echo ===============================================================================
echo   ¡PUBLICACIÓN COMPLETADA CON ÉXITO!
echo ===============================================================================
echo.
echo   La aplicación estará actualizada en GitHub Pages en 1-2 minutos:
echo   URL: %URL_PUB%
echo.
echo   Para recargar en su navegador o PWA:
echo   - Abra %URL_PUB%
echo   - Presione Ctrl + F5 (o modo incógnito) para actualizar la caché del Service Worker.
echo.
for /f "tokens=*" %%h in ('git rev-parse --short HEAD 2^>nul') do set "COMMIT_HASH=%%h"
echo %date% %time% - Publicación exitosa de HYPNOS 2.3. Commit: %COMMIT_HASH%. Rama: %RAMA_ACTUAL%. >> "%LOGFILE%"
echo Operación registrada en: %LOGFILE%
echo.
pause
