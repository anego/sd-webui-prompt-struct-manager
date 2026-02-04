@echo off
setlocal

:: Set Environment Variables
set "BASE_URL=http://localhost:7860"
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0.playwright"

echo [PSM] Setting up local test environment...
echo ----------------------------------------
echo BASE_URL: %BASE_URL%
echo BROWSERS: %PLAYWRIGHT_BROWSERS_PATH%
echo ----------------------------------------

:: Install Node Dependencies (if needed)
echo [1/3] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed.
    exit /b %ERRORLEVEL%
)

:: Install Playwright Browsers to local path
echo [2/3] Installing Playwright browsers locally...
call npx playwright install chromium
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Browser installation failed.
    exit /b %ERRORLEVEL%
)

:: Run Tests
echo [3/3] Running tests...
call npx playwright test
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Tests failed.
    exit /b %ERRORLEVEL%
)

echo [SUCCESS] All local tests passed!
endlocal
