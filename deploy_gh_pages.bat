@echo off
set DEST_ROOT=C:\git\my\anego.github.io
set PROJ_DIR=%DEST_ROOT%\sd-webui-prompt-struct-manager
set ASSETS_DIR=%PROJ_DIR%\assets

echo Creating directories...
if not exist "%PROJ_DIR%" mkdir "%PROJ_DIR%"
if not exist "%ASSETS_DIR%" mkdir "%ASSETS_DIR%"

echo Copying assets...
xcopy /E /I /Y "assets" "%ASSETS_DIR%"

echo Moving HTML files...
copy /Y "site.html" "%PROJ_DIR%\index.html"
copy /Y "portal.html" "%DEST_ROOT%\index.html"

echo Deployment script completed.
