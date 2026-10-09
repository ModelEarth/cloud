"""Local-only /keys page: paste NAME=value lines (for example from a Google Doc) into the OS credential store.

Served only to 127.0.0.1 so it never appears on Cloud Run. Values are written to the
store and never echoed back; the page lists names and today's read counts only.
"""
from flask import Blueprint, abort, redirect, request

from utils import keystore

keys_blueprint = Blueprint("keys", __name__)

PAGE = """<!doctype html><meta charset="utf-8"><title>Local keys</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px}
textarea{width:100%;height:160px;font-family:monospace}table{border-collapse:collapse;margin:16px 0}
td,th{border:1px solid #ccc;padding:4px 10px;text-align:left}.note{color:#555;font-size:.9em}</style>
<h1>Local keys</h1>
<p class="note">Stored in {backend}. Each line is <code>NAME=value</code>; blank lines and <code>#</code> comments are ignored.
Values are never shown again. Daily read limit per key: {limit}.</p>
<form method="post"><textarea name="lines" placeholder="GITHUB_REPORTS_TOKEN=ghp_...&#10;DATACOMMONS_API_KEY=AIza..."></textarea>
<p><button type="submit">Store</button> {msg}</p></form>
<table><tr><th>Name</th><th>Reads today</th><th></th></tr>{rows}</table>
<p class="note">A key that must never be readable on this computer belongs in Secret Manager on Cloud Run, not here.</p>
"""


def _local_only():
    if request.remote_addr not in ("127.0.0.1", "::1"):
        abort(404)


@keys_blueprint.route("/keys", methods=["GET"])
def keys_page():
    _local_only()
    if not keystore.available():
        return "No OS credential store is available on this machine.", 503
    counts = keystore.reads_today()
    rows = "".join(
        f"<tr><td>{n}</td><td>{counts.get(n, 0)}</td>"
        f"<td><form method='post' action='/keys/delete/{n}' style='margin:0'><button>delete</button></form></td></tr>"
        for n in keystore.names()
    ) or "<tr><td colspan=3>nothing stored yet</td></tr>"
    backend = type(__import__("keyring").get_keyring()).__name__
    page = PAGE
    for key, val in (("{backend}", backend), ("{limit}", str(keystore.DAILY_READ_LIMIT)), ("{rows}", rows),
                     ("{msg}", request.args.get("msg", ""))):
        page = page.replace(key, val)
    return page


@keys_blueprint.route("/keys", methods=["POST"])
def keys_store():
    _local_only()
    stored = 0
    for line in request.form.get("lines", "").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() and value.strip():
            keystore.set_key(name, value)
            stored += 1
    return redirect(f"/keys?msg=stored+{stored}")


@keys_blueprint.route("/keys/delete/<name>", methods=["POST"])
def keys_delete(name):
    _local_only()
    keystore.delete_key(name)
    return redirect("/keys?msg=deleted")
