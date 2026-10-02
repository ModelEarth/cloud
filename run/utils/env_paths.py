"""Locate the webroot's shared .env file.

The .env lives outside the webroot. Its path is the `env_file` value in the
webroot's automation/paths.yaml (gitignored), relative to that automation folder.
"""
import os
import re

WEBROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


def resolve_env_path():
    """Return the absolute .env path set by automation/paths.yaml, or None when it isn't set."""
    automation_dir = os.path.join(WEBROOT, 'automation')
    try:
        with open(os.path.join(automation_dir, 'paths.yaml'), 'r') as f:
            text = f.read()
    except OSError:
        return None
    match = re.search(r'^\s*env_file:\s*(.+)$', text, re.MULTILINE)
    if not match:
        return None
    value = re.sub(r'\s+#.*$', '', match.group(1)).strip().strip('"\'')
    return os.path.abspath(os.path.join(automation_dir, value)) if value else None
