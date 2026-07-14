@echo off
REM ===========================================================================
REM  Bitwix one-click deploy.
REM
REM  Commits everything and pushes to origin/main. GitHub Actions then deploys
REM  whatever changed:
REM    - Frontend/**  -> build + S3 sync + CloudFront invalidation
REM    - Backend/**   -> Docker build + ECR push + App Runner start-deployment
REM
REM  Usage (from the project root):
REM    deploy.bat                 (uses an auto commit message)
REM    deploy.bat your message    (uses "your message" as the commit message)
REM
REM  Double-clicking also works.
REM ===========================================================================
setlocal
cd /d "%~dp0"

REM Build the commit message from all args, or fall back to a timestamped one.
set "MSG=%*"
if "%MSG%"=="" set "MSG=deploy: %DATE% %TIME%"

echo(
echo === Staging all changes ===
git add -A
if errorlevel 1 goto :fail

REM Commit only if there is something staged; otherwise just push what's ahead.
git diff --cached --quiet
if errorlevel 1 (
  echo === Committing: %MSG% ===
  git commit -m "%MSG%"
  if errorlevel 1 goto :fail
) else (
  echo No file changes to commit. Will push any unpushed commits.
)

echo(
echo === Pushing to origin/main ===
git push origin main
if errorlevel 1 goto :fail

echo(
echo ===========================================================================
echo  Pushed. GitHub Actions is now deploying (only for the parts that changed):
echo    Frontend  -^> S3 + CloudFront
echo    Backend   -^> ECR + App Runner
echo  Watch progress: https://github.com/SerferDev007/bitwix/actions
echo ===========================================================================
endlocal
exit /b 0

:fail
echo(
echo *** Something failed above. Nothing was pushed (or the push failed). ***
echo *** Fix the error and run deploy.bat again. ***
endlocal
exit /b 1
