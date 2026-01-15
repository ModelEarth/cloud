from dotenv import load_dotenv
load_dotenv()

import os
from flask import Flask, send_from_directory, render_template, jsonify
from flask_cors import CORS

from routes.core_routes import core_blueprint
from routes.notebook_runner import notebook_blueprint

app = Flask(__name__)


CORS(
    app,
    resources={r"/*": {"origins": ["http://localhost:8887", "http://127.0.0.1:8887"]}},
    allow_headers=["Content-Type", "X-Access-Token"],
    methods=["GET", "POST", "OPTIONS"],
)

app.register_blueprint(core_blueprint)
app.register_blueprint(notebook_blueprint)

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "cloud-run"}), 200

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/static/js/<path:filename>")
def serve_js(filename):
    return send_from_directory("static/js", filename)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8100))
    app.run(host="0.0.0.0", port=port, debug=True)
