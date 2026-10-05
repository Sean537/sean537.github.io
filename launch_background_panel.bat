@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 双击本文件即可启动文章管理台；也可以带一个端口参数，例如： 启动管理台.bat 4180
set "PORT=4173"
if not "%~1"=="" set "PORT=%~1"

where node >nul 2>nul
if errorlevel 1 (
	echo.
	echo   没有找到 Node.js，管理台需要它来运行。
	echo   请先安装 Node.js LTS： https://nodejs.org/
	echo.
	pause
	exit /b 1
)

rem 服务在当前窗口里跑；另起一个隐藏进程，等端口就绪后自动打开浏览器
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%PORT%/admin/'"

echo.
echo   正在启动文章管理台： http://127.0.0.1:%PORT%/admin/
echo   浏览器会自动打开；按 Ctrl+C 或直接关掉本窗口即可停止服务。
echo   本地预览博客： 在项目目录执行 python -m http.server 8000
echo.

node tools\admin-server.js --port %PORT%

echo.
echo   服务已停止。若上面提示端口被占用，可以换一个端口再运行本文件。
pause