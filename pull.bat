@echo off
chcp 65001 >nul
title 财务APP - 更新代码
cd /d "%~dp0"

echo ============================================
echo   财务语音记账 APP  -  一键更新
echo   目录: %cd%
echo ============================================
echo.

REM 首次运行若不是 git 仓库，则初始化、关联远程并检出（兼容非空文件夹）
if not exist ".git" (
    echo [首次运行] 正在初始化 Git 仓库并关联远程...
    git init
    git remote add origin https://github.com/anasrimoneera-bot/Voice-Enabled-Financial-Software.git
    echo 正在拉取代码（同名文件将以仓库版本为准）...
    git fetch origin main
    git checkout -f -B main origin/main
) else (
    echo 正在从 GitHub 拉取最新代码（main 分支）...
    git pull origin main
)

echo.
if %errorlevel%==0 (
    echo [成功] 已更新到最新版本。
) else (
    echo [失败] 拉取出错，请检查网络或 Git 登录凭据。
)
echo.
echo 按任意键关闭窗口...
pause >nul
