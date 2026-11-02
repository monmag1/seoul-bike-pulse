#!/usr/bin/env python3
"""Patch the Stage U installed backend for ALB signed identity + Origin check.
Non-destructive, idempotent, backups; does NOT deploy to AWS.
"""
import ast
from datetime import datetime
from pathlib import Path
import sys

project = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv)>1 else Path.home()/'seoul-bike-pulse'
main = project/'backend/app/main.py'
auth = project/'backend/app/routers/af/admin_auth.py'
if not (main.is_file() and auth.is_file()):
    raise SystemExit('Stage U backend/app/main.py and routers/af/admin_auth.py required')

src = auth.read_text(encoding='utf-8')
assert 'def require_dashboard_view(request: Request):' in src
node = next((n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name=='require_dashboard_view'),None)
assert node is not None and node.body
lines = src.splitlines(keepends=True)
last = node.body[-1]
actual = ''.join(lines[last.lineno-1:last.end_lineno]).strip()
if actual=='require_admin(request)':
    stamp=datetime.now().strftime('%Y%m%d%H%M%S')
    auth.with_name(auth.name+'.before-v-'+stamp+'.bak').write_text(src,encoding='utf-8')
    lines[last.lineno-1:last.end_lineno] = ['    verify_authenticated_alb(request)\n']
    src=''.join(lines)
    ast.parse(src)
    auth.write_text(src,encoding='utf-8')
    print('Read-only dashboard view: signed ALB authentication, not admin allowlist')
elif actual != 'verify_authenticated_alb(request)':
    raise RuntimeError(f'Unexpected require_dashboard_view ending: {actual!r}')
else:
    print('Dashboard ALB authentication patch already present')

source=main.read_text(encoding='utf-8')
MARKER = '# Stage V: ALB Cognito-origin protection for state-changing browser API requests'
if MARKER not in source:
    main.with_name(main.name+'.before-v-'+datetime.now().strftime('%Y%m%d%H%M%S')+'.bak').write_text(source,encoding='utf-8')
    source += '''\n\n'''+MARKER+'''\nfrom fastapi.responses import JSONResponse as _V_JSONResponse\n\n@app.middleware("http")\nasync def v_enforce_browser_origin(request: Request, call_next):\n    # Origin checks are defense in depth; verified ALB login is the identity gate.\n    if (\n        os.environ.get("AUTH_MODE") == "alb"\n        and request.url.path.startswith("/api/v1/")\n        and request.url.path != "/api/v1/machine/predict"\n        and request.method in {"POST", "PUT", "PATCH", "DELETE"}\n    ):\n        expected = os.environ.get("ALLOWED_ORIGIN", "")\n        if not expected:\n            return _V_JSONResponse(\n                status_code=503,\n                content={"detail": {"code": "ORIGIN_NOT_CONFIGURED"}}\n            )\n        if request.headers.get("origin") != expected:\n            return _V_JSONResponse(\n                status_code=403,\n                content={"detail": {"code": "INVALID_ORIGIN"}}\n            )\n    return await call_next(request)\n'''
    ast.parse(source)
    main.write_text(source,encoding='utf-8')
    print('Browser Origin middleware appended')
else:
    if 'and request.url.path != "/api/v1/machine/predict"' not in source:
        raise SystemExit("Existing middleware lacks machine API exclusion")
    print('Browser Origin middleware already present and validated')
print('PASS: Stage V Python AST validation')
