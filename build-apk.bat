@echo off
chcp 65001 >nul
echo ========================================================
echo   Сборка Финансист 1.6 для Android (Capacitor APK)
echo ========================================================
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [!] Установите Node.js 20+ с https://nodejs.org/
  pause
  exit /b 1
)
call npm install
call node prepare-www.mjs
if not exist android (
  call npx cap add android
) else (
  call npx cap sync android
)
echo.
echo Готово! Если установлена Android Studio, сейчас откроется проект для сборки APK (Build -^> Build APK).
call npx cap open android
pause
