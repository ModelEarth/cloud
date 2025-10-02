# app/routes.py
from pathlib import Path
from flask import Blueprint, jsonify, render_template, send_from_directory, request
import pandas as pd

bp = Blueprint("main", __name__)

ROOT = Path(__file__).resolve().parents[1]        # .../cloud
DATA_DIR = ROOT / "app" / "data"
CSV_FILE = DATA_DIR / "county_density.csv"

def load_df():
    if not CSV_FILE.exists():
        return pd.DataFrame()
    df = pd.read_csv(CSV_FILE, dtype={"county_fips": str})
    if "state_fips" not in df.columns and "county_fips" in df.columns:
        df["state_fips"] = df["county_fips"].str[:2]
    return df

@bp.get("/health")
def health():
    return {"ok": True}

@bp.get("/")
def home():
    df = load_df()
    states = sorted(df["state_fips"].dropna().unique().tolist()) if not df.empty else []
    return render_template("index.html", states=states)

@bp.get("/api/county_density")
def api_county_density():
    df = load_df()
    if df.empty:
        return jsonify([])

    state = request.args.get("state_fips") or request.args.get("state")
    county_fips = request.args.get("county_fips")
    county = request.args.get("county")
    limit = request.args.get("limit", "100")

    if state:
        df = df[df["state_fips"] == state]
    if county_fips:
        df = df[df["county_fips"] == county_fips]
    if county:
        df = df[df["county_name"].str.contains(county, case=False, na=False)]

    try:
        df = df.head(int(limit))
    except:
        pass

    cols = [c for c in ["state_fips","county_fips","county_name","population","employment_5415","density_per_1k"] if c in df.columns]
    return df[cols].to_json(orient="records")

@bp.get("/download/county_density.csv")
def download_csv():
    if not CSV_FILE.exists():
        return jsonify({"error": "CSV not found"}), 404
    return send_from_directory(directory=DATA_DIR, path="county_density.csv", as_attachment=True)
