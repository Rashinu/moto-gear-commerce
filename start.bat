@echo off
echo Alanya Racing Motors baslatiliyor...
if not exist node_modules (
  echo Gerekli paketler kuruluyor, bu birkac dakika surebilir...
  call npm install
)
start "" http://localhost:3000
call npm start
pause
