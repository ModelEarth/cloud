from flask import Flask, render_template, request, jsonify
import pandas as pd
from pathlib import Path

app = Flask(__name__, static_folder="static", template_folder="templates")

DATA_PATH = Path(__file__).resolve().parent / "data" / "acs_bls_merged.csv"
_df = None

def load_df():
    global _df
    if _df is None:
        if DATA_PATH.exists():
            # Keep zip as string (preserve leading zeros)
            _df = pd.read_csv(DATA_PATH, dtype={"zip": "string"})
        else:
            # Empty placeholder so app still runs
            _df = pd.DataFrame(columns=["state", "county", "zip"])
    return _df

@app.route("/")
def index():
    return render_template("index.html")

@app.get("/api/states")
def api_states():
    d = load_df()
    states = sorted([s for s in d["state"].dropna().unique().tolist()])
    return jsonify(states)

@app.get("/api/counties")
def api_counties():
    state = request.args.get("state")
    d = load_df()
    q = d if not state else d[d["state"] == state]
    counties = sorted([c for c in q["county"].dropna().unique().tolist()])
    return jsonify(counties)

@app.get("/api/zips")
def api_zips():
    state = request.args.get("state")
    county = request.args.get("county")
    d = load_df()
    q = d
    if state:
        q = q[q["state"] == state]
    if county:
        q = q[q["county"] == county]
    z = sorted([str(z) for z in q["zip"].dropna().astype(str).unique().tolist()])
    return jsonify(z)

@app.get("/api/filter")
def api_filter():
    state = request.args.get("state")
    county = request.args.get("county")
    zip_code = request.args.get("zip")

    d = load_df().copy()
    if state:
        d = d[d["state"] == state]
    if county:
        d = d[d["county"] == county]
    if zip_code:
        d = d[d["zip"].astype(str) == str(zip_code)]

    # Cap payload
    return jsonify(d.head(500).to_dict(orient="records"))

if __name__ == "__main__":
    # 0.0.0.0 works on local and platforms like Render/Railway
    app.run(host="0.0.0.0", port=5000, debug=True)
