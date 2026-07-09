@echo off
REM ===========================================================================
REM  Bitwix backend - initialise the database, start the API in its own window,
REM  then verify the /api/health endpoint actually responds.
REM  Run this AFTER starting MySQL in the XAMPP Control Panel.
REM ===========================================================================
setlocal
cd /d "%~dp0"

echo Checking that MySQL is reachable on localhost:3306 ...
node -e "const net=require('net');const s=net.connect({host:'127.0.0.1',port:3306},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),3000)"
if errorlevel 1 (
    echo.
    echo   MySQL is NOT running. Open the XAMPP Control Panel and click
    echo   "Start" on the MySQL row, then run this file again.
    echo.
    pause
    exit /b 1
)

echo MySQL is up. Creating / seeding the "bitwix" database ...
call npm run db:init
if errorlevel 1 (
    echo.
    echo   Database init failed - check the error above.
    pause
    exit /b 1
)

echo.
echo Starting the backend API in a new window ...
start "Bitwix Backend" /D "%~dp0" cmd /k npm run dev

echo Waiting for the API to become healthy (up to ~25s) ...
node src/scripts/waitHealth.mjs
if errorlevel 1 (
    echo.
    echo   [WARN] The backend did not report healthy. Check the
    echo          "Bitwix Backend" window for the error.
) else (
    echo.
    echo   [OK] Backend is UP and healthy at http://localhost:5000
    echo        Try:  http://localhost:5000/api/projects
    echo        Admin console (start the frontend too): http://localhost:5173/admin
)
echo.
pause
endlocal
