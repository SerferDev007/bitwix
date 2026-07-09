@echo off
REM ===========================================================================
REM  Bitwix - launch backend (Express/MySQL) and frontend (Vite) together.
REM  Each runs in its own window so you can read the logs and Ctrl+C either.
REM  Uses start /D "path" so it works even though the folder path has spaces.
REM ===========================================================================

setlocal
set "ROOT=%~dp0"

echo Starting Bitwix dev environment...
echo   Backend : http://localhost:5000  (npm)
echo   Frontend: http://localhost:5173  (pnpm)
echo.

REM --- Backend: install deps on first run, then start the API ---
if exist "%ROOT%Backend\node_modules" (
    start "Bitwix Backend" /D "%ROOT%Backend" cmd /k npm run dev
) else (
    echo [backend] Installing dependencies ^(first run^)...
    start "Bitwix Backend" /D "%ROOT%Backend" cmd /k npm install ^&^& npm run dev
)

REM --- Frontend: install deps on first run (pnpm), then start Vite ---
if exist "%ROOT%Frontend\node_modules" (
    start "Bitwix Frontend" /D "%ROOT%Frontend" cmd /k pnpm dev
) else (
    echo [frontend] Installing dependencies ^(first run, pnpm^)...
    start "Bitwix Frontend" /D "%ROOT%Frontend" cmd /k pnpm install ^&^& pnpm dev
)

echo.
echo Two windows opened (Backend + Frontend).
echo NOTE: the backend needs MySQL running. If it fails to connect, run:
echo       cd Backend  then  npm run db:init
echo.
echo Admin console: http://localhost:5173/admin
endlocal
