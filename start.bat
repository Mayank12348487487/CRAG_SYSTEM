@echo off
echo === Starting Backend ===
cd /d d:\crazy_shorts\backend
start "CRAG Backend" cmd /k "pip install -r requirements.txt && uvicorn main:app --reload --port 8000"

timeout /t 3

echo === Starting Frontend ===
cd /d d:\crazy_shorts\frontend
start "CRAG Frontend" cmd /k "npm run dev"

echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
