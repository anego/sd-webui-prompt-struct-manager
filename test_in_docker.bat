@echo off
echo [PSM] Starting Verification in Docker...

echo [1/2] Building Frontend...
docker compose run --rm psm-builder /bin/bash -c "npm install && npm run build"
if %errorlevel% neq 0 (
    echo [ERROR] Build Failed!
    exit /b %errorlevel%
)

echo [2/2] Running Playwright Tests...
echo (Ensure SD WebUI is running at http://localhost:7860)
docker compose run --rm psm-test
if %errorlevel% neq 0 (
    echo [ERROR] Tests Failed!
    exit /b %errorlevel%
)

echo [SUCCESS] All checks passed!
pause
