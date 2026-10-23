@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0world-atlas"
if not exist package.json (
  echo 未找到 world-atlas 项目，请完整解压或下载仓库。
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo 请先安装 Node.js LTS：https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\vite\bin\vite.js (
  echo 正在安装地图所需依赖，请稍候……
  if exist package-lock.json (
    call npm.cmd ci
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 (
    echo 安装未完成，请检查上方的错误信息。
    pause
    exit /b 1
  )
)
echo 地图即将启动，请保留此窗口。按 Ctrl+C 可以停止服务。
call npm.cmd run dev -- --open
if errorlevel 1 pause
