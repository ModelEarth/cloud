Project issue: https://github.com/ModelEarth/projects/issues/36
Demo (after PR #26 merges): ./ux.html

# Flask UX - ACS + BLS Filters

## What it does
- Simple Flask interface for filtering ACS + BLS data.
- Endpoints:
  /api/states
  /api/counties
  /api/zips
  /api/filter
  /api/debug/info

## How to run (Windows)
1) Open Command Prompt
2) cd team\2025\Sampreethi66
3) python -m venv .venv
4) .venv\Scripts\activate
5) pip install -r requirements.txt
6) python app.py
7) Open http://127.0.0.1:5000 in your browser
