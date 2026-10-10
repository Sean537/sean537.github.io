@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 优先读 ADMIN_PORT 环境变量，否则取命令行参数，默认 4173
set "PORT="
if defined ADMIN_PORT set "PORT=%ADMIN_PORT%"
if "%PORT%"=="" if not "%~1"=="" set "PORT=%~1"
if "%PORT%"=="" set "PORT=4173"

where node >nul 2>nul
if errorlevel 1 (
	echo.
	echo   没有找到 Node.js，开发服务器需要它来运行。
	echo   请先安装 Node.js LTS： https://nodejs.org/
	echo.
	pause
	exit /b 1
)

rem 服务在当前窗口里跑；另起一个隐藏进程，等端口就绪后自动打开浏览器
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%PORT%/'"

echo.
echo   开发服务器已启动：
echo     博客站点 : http://127.0.0.1:%PORT%/
echo     管理台   : http://127.0.0.1:%PORT%/admin/
echo.
echo   浏览器会自动打开；按 Ctrl+C 或直接关掉本窗口即可停止服务。
echo   若使用 VS Code Live Server 打开管理台页面，需在 HTML ^<head^> 里添加：
echo     ^<script^>window.ADMIN_API = 'http://127.0.0.1:%PORT%/admin/';^</script^>
echo.
echo   （ADMIN_PORT 环境变量可覆盖端口，例如 set ADMIN_PORT=5000 启动开发服务器.bat）
echo.

node tools\admin-server.js --port %PORT%

echo.
echo   服务已停止。若上面提示端口被占用，可以换一个端口再运行本文件。
pause
