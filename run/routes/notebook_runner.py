from flask import Blueprint, request, jsonify, Response, stream_with_context
import sys, os, json, tempfile, nbformat, git, subprocess
from nbconvert import HTMLExporter
import papermill as pm
import traceback

# Webroot is 3 levels up from cloud/run/routes/
WEBROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from utils.config_utils import load_config
from utils.notebook_utils import (
    NOTEBOOK_PATH,
    SOURCE_REPO_URL,
    TARGET_REPO,
    execute_notebook_with_dependencies,
    execute_notebook_cloud,
    execute_notebook_simulation,
    NOTEBOOK_EXECUTION_AVAILABLE
)
from utils.auth_utils import require_token

notebook_blueprint = Blueprint('notebook', __name__)

@notebook_blueprint.route('/run-notebook', methods=['POST'])
@require_token
def run_notebook():
    try:
        print(f"[INFO] /run-notebook triggered", file=sys.stderr)
        payload = request.get_json(force=True, silent=True) or {}

        notebook_path = payload.get("notebook_path", NOTEBOOK_PATH)
        parameters = payload.get("parameters", {})
        steps = payload.get("steps", [])  # Optional, empty by default
        if steps:
            parameters['steps'] = steps
        print(f"[DEBUG] Received parameters: {json.dumps(parameters)}", file=sys.stderr)
        print(f"[DEBUG] Notebook path: {notebook_path}", file=sys.stderr)

        if not NOTEBOOK_EXECUTION_AVAILABLE:
            print("[WARN] Notebook execution dependencies missing", file=sys.stderr)
            return jsonify(execute_notebook_simulation())

        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"[DEBUG] Cloning {SOURCE_REPO_URL} into {temp_dir}", file=sys.stderr)
            git.Repo.clone_from(SOURCE_REPO_URL, temp_dir)

            notebook_file = os.path.join(temp_dir, notebook_path)
            output_path = os.path.join(temp_dir, 'executed.ipynb')

            if not os.path.exists(notebook_file):
                raise FileNotFoundError(f"Notebook not found: {notebook_file}")

            print(f"[DEBUG] Executing notebook: {notebook_file}", file=sys.stderr)

            try:
                pm.execute_notebook(
                    notebook_file,
                    output_path,
                    parameters=parameters
                )
                print("[DEBUG] Notebook executed", file=sys.stderr)
            except Exception as e:
                print(f"[ERROR] Execution failed: {e}", file=sys.stderr)
                return jsonify({'status': 'error', 'message': f"Execution failed: {str(e)}"}), 500

            # Read and print notebook cell outputs
            try:
                with open(output_path, 'r') as f:
                    nb = nbformat.read(f, as_version=4)

                for idx, cell in enumerate(nb.cells):
                    if cell.cell_type != 'code':
                        continue
                    outputs = cell.get('outputs', [])
                    for output in outputs:
                        if output.output_type == 'stream':
                            print(f"[NOTEBOOK CELL {idx}][{output.name}] {output.text}", file=sys.stderr)
                        elif output.output_type == 'error':
                            print(f"[NOTEBOOK CELL {idx}][ERROR] {output.ename}: {output.evalue}", file=sys.stderr)
                        elif output.output_type == 'execute_result':
                            text = output['data'].get('text/plain', '')
                            print(f"[NOTEBOOK CELL {idx}][RESULT] {text}", file=sys.stderr)

                html_exporter = HTMLExporter()
                html_data, _ = html_exporter.from_notebook_node(nb)
                print(f"[DEBUG] Notebook HTML size: {len(html_data)} bytes", file=sys.stderr)

            except Exception as e:
                print(f"[WARN] Reading or logging notebook output failed: {e}", file=sys.stderr)

            return jsonify({
                'status': 'success',
                'message': 'Notebook executed successfully'
            })

    except Exception as e:
        print(f"[ERROR] /run-notebook error: {e}", file=sys.stderr)
        return jsonify({'status': 'error', 'message': str(e)}), 500

@notebook_blueprint.route('/run-local-stream', methods=['POST'])
def run_local_stream():
    payload = request.get_json(force=True, silent=True) or {}
    notebook_path = payload.get('notebook_path', '').lstrip('/')
    is_localhost = not os.environ.get('K_SERVICE')
    full_path = os.path.join(WEBROOT, notebook_path)

    def load_github_token():
        """Load GitHub token from docker/.env, trying keys in priority order."""
        import re
        docker_env = os.path.join(WEBROOT, 'docker', '.env')
        if not os.path.exists(docker_env):
            return None, None, f"docker/.env not found at {docker_env}"
        priority = ['GITHUB_REPORTS_TOKEN', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'GITHUB_TOKEN']
        found = {}
        with open(docker_env, 'r') as f:
            for line in f:
                m = re.match(r'^([A-Z_]+)=(.+)$', line.strip())
                if m and m.group(1) in priority:
                    val = m.group(2).strip().strip('"\'')
                    if val and 'placeholder' not in val.lower():
                        found[m.group(1)] = val
        for key in priority:
            if key in found:
                return found[key], key, None
        return None, None, f"No valid GitHub token in docker/.env (checked: {', '.join(priority)})"

    def sanitize_tokens(source):
        """Replace hardcoded token literals and [GITHUB_TOKEN] placeholder
        with os.environ.get('GITHUB_TOKEN', '') so no token is written to any file."""
        import re
        token_re = re.compile(r"""(["'])(ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})\1""")
        source = token_re.sub("os.environ.get('GITHUB_TOKEN', '')", source)
        source = source.replace("'[GITHUB_TOKEN]'", "os.environ.get('GITHUB_TOKEN', '')")
        source = source.replace('"[GITHUB_TOKEN]"', "os.environ.get('GITHUB_TOKEN', '')")
        return source

    def generate(full_path, is_localhost):
        import re
        if not os.path.exists(full_path):
            yield f"File not found: {full_path}\n"
            yield "[EXIT:1]\n"
            return

        # Load GitHub token from docker/.env
        github_token, token_key, token_err = load_github_token()
        if token_err:
            yield f"⚠️  {token_err}\n"
        else:
            yield f"✓ GitHub token loaded from docker/.env ({token_key})\n"

        env = os.environ.copy()
        if github_token:
            env['GITHUB_REPORTS_TOKEN'] = github_token
        env['ENABLE_GPU'] = os.environ.get('ENABLE_GPU', 'false')

        if full_path.endswith('.py'):
            with open(full_path, 'r', encoding='utf-8') as f:
                source = f.read()

            # Sanitize any hardcoded token literals — never write real token to temp file
            source = sanitize_tokens(source)

            # Convert Jupyter shell commands (!cmd) to subprocess calls
            def _replace_bang(m):
                indent, cmd = m.group(1), m.group(2).strip()
                cmd = re.sub(r'^pip\b', f'{sys.executable} -m pip', cmd)
                escaped = cmd.replace('\\', '\\\\').replace("'", "\\'")
                return f"{indent}import subprocess as _bang_sp; _bang_sp.run('{escaped}', shell=True, check=False)"
            cleaned = re.sub(r'^(\s*)!(.+)$', _replace_bang, source, flags=re.MULTILINE)

            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as tmp:
                tmp.write(cleaned)
                tmp_path = tmp.name
            try:
                proc = subprocess.Popen(
                    [sys.executable, '-u', tmp_path],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, env=env, bufsize=1
                )
                try:
                    for line in proc.stdout:
                        yield line
                    proc.wait()
                    yield f"[EXIT:{proc.returncode}]\n"
                finally:
                    if proc.poll() is None:
                        proc.kill()
            finally:
                os.unlink(tmp_path)

        elif full_path.endswith('.ipynb'):
            import json
            with open(full_path, 'r', encoding='utf-8') as f:
                nb_text = f.read()

            with tempfile.NamedTemporaryFile(mode='w', suffix='.ipynb', delete=False, encoding='utf-8') as tmp:
                tmp.write(nb_text)
                tmp_path = tmp.name
            out_path = tmp_path.replace('.ipynb', '_out.ipynb')
            params = {'useGPU': False} if is_localhost else {}
            if github_token:
                params['GITHUB_REPORTS_TOKEN'] = github_token  # injected by papermill, never in file
            try:
                import papermill as pm
                pm.execute_notebook(tmp_path, out_path, parameters=params)
                yield "✓ Notebook executed successfully\n"
                yield "[EXIT:0]\n"
            except Exception as e:
                yield f"Execution failed: {e}\n"
                yield "[EXIT:1]\n"
            finally:
                os.unlink(tmp_path)
                if os.path.exists(out_path):
                    os.unlink(out_path)
        else:
            yield f"Unsupported file type: {full_path}\n"
            yield "[EXIT:1]\n"

    return Response(
        stream_with_context(generate(full_path, is_localhost)),
        mimetype='text/plain',
        headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache'}
    )


@notebook_blueprint.route('/run-local-notebook', methods=['POST'])
def run_local_notebook():
    try:
        payload = request.get_json(force=True, silent=True) or {}
        notebook_path = payload.get('notebook_path', '').lstrip('/')
        parameters = payload.get('parameters', {})

        # Inject useGPU=False on localhost (Cloud Run sets K_SERVICE)
        is_localhost = not os.environ.get('K_SERVICE')
        if is_localhost:
            parameters['useGPU'] = False

        full_path = os.path.join(WEBROOT, notebook_path)
        print(f"[INFO] run-local-notebook: {full_path} | useGPU={parameters.get('useGPU', 'unset')}", file=sys.stderr)

        if not os.path.exists(full_path):
            return jsonify({'status': 'error', 'message': f'Notebook not found: {full_path}'}), 404

        if full_path.endswith('.ipynb'):
            output_path = full_path.replace('.ipynb', '_executed.ipynb')
            try:
                pm.execute_notebook(full_path, output_path, parameters=parameters)
            except Exception as e:
                print(f"[ERROR] Papermill execution failed: {e}", file=sys.stderr)
                return jsonify({'status': 'error', 'message': f'Execution failed: {str(e)}'}), 500
            return jsonify({'status': 'success', 'message': f'Executed: {notebook_path}'})

        elif full_path.endswith('.py'):
            env = os.environ.copy()
            env['USE_GPU'] = '0' if is_localhost else '1'
            result = subprocess.run(
                [sys.executable, full_path],
                capture_output=True, text=True, env=env
            )
            if result.returncode != 0:
                return jsonify({'status': 'error', 'message': result.stderr or 'Script failed'}), 500
            return jsonify({'status': 'success', 'message': f'Executed: {notebook_path}'})

        else:
            return jsonify({'status': 'error', 'message': f'Unsupported file type: {notebook_path}'}), 400

    except Exception as e:
        print(f"[ERROR] /run-local-notebook: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@notebook_blueprint.route('/list-notebook-steps', methods=['GET'])
@require_token
def list_notebook_steps():
    import traceback
    try:
        print("[INFO] /list-notebook-steps triggered", file=sys.stderr)
        print(f"[DEBUG] NOTEBOOK_PATH: {NOTEBOOK_PATH}", file=sys.stderr)

        # Clone the repo into a temp directory
        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"[DEBUG] Cloning {SOURCE_REPO_URL} into {temp_dir}", file=sys.stderr)
            git.Repo.clone_from(SOURCE_REPO_URL, temp_dir)

            notebook_file = os.path.join(temp_dir, NOTEBOOK_PATH)
            if not os.path.exists(notebook_file):
                raise FileNotFoundError(f"Notebook not found at: {notebook_file}")

            print(f"[DEBUG] Parsing notebook for step tags: {notebook_file}", file=sys.stderr)
            with open(notebook_file, 'r') as f:
                nb = nbformat.read(f, as_version=4)

            # Extract step tags like 'step:xyz'
            step_tags = set()
            for cell in nb.cells:
                tags = cell.metadata.get("tags", [])
                for tag in tags:
                    if tag.startswith("step:"):
                        step_tags.add(tag.split("step:")[1])

            print(f"[DEBUG] Steps found: {step_tags}", file=sys.stderr)
            return jsonify({
                "status": "success",
                "steps": sorted(step_tags)
            })

    except Exception as e:
        print("[ERROR] Exception in /list-notebook-steps", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
