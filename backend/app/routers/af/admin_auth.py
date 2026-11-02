"""Verify ALB-signed x-amzn-oidc-data + explicit administrator sub allowlist.
Do not accept x-amzn-oidc-identity as identity proof: it is unsigned.
Requires outbound HTTPS to the regional ALB public key endpoint (or secure key distribution).
"""
import os
import re
import time
from functools import lru_cache
from urllib.request import urlopen

import jwt
from fastapi import HTTPException, Request


@lru_cache(maxsize=32)
def alb_public_key(region: str, kid: str) -> str:
    url = f"https://public-keys.auth.elb.{region}.amazonaws.com/{kid}"
    with urlopen(url, timeout=3) as response:
        return response.read(10000).decode("utf-8")


def verify_authenticated_alb(request: Request):
    if os.getenv("BIKEPULSE_AF_LOCAL_DEV") == "1" and os.getenv("AUTH_MODE") == "local":
        # ONLY for 127.0.0.1 local development. Not production authorization.
        return
    if os.getenv("AUTH_MODE") != "alb" or os.getenv("BIKEPULSE_AF_UI_ENABLED") != "true":
        raise HTTPException(403, "Administrator dashboard disabled on this service")
    signer = os.getenv("BIKEPULSE_AF_ALB_ARN", "")
    if not signer:
        raise HTTPException(403, "Expected ALB ARN not configured")
    token = request.headers.get("x-amzn-oidc-data", "")
    if not token:
        raise HTTPException(401, "Missing authenticated ALB claims")
    try:
        header = jwt.get_unverified_header(token)
        kid = header["kid"]
        if header.get("alg") != "ES256" or header.get("signer") != signer:
            raise ValueError("Invalid ALB signer or algorithm")
        if not isinstance(kid, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,100}", kid):
            raise ValueError("Invalid signing key ID")
        if int(header.get("exp", 0)) < time.time():
            raise ValueError("Expired ALB token")
        key = alb_public_key(os.environ["AWS_REGION"], kid)
        claims = jwt.decode(token, key=key, algorithms=["ES256"], options={"verify_aud": False, "verify_exp": False})
        if not claims.get("sub") or not isinstance(claims["sub"], str):
            raise HTTPException(401, "Missing signed user identity")
        return claims
    except HTTPException:
        raise
    except Exception as e:
        # Do not expose JWT or claims in messages/logs.
        raise HTTPException(401, "ALB token verification failed") from e


def require_admin(request: Request):
    if os.getenv("BIKEPULSE_AF_LOCAL_DEV") == "1" and os.getenv("AUTH_MODE") == "local":
        return
    claims = verify_authenticated_alb(request)
    allowed = {s.strip() for s in os.getenv("BIKEPULSE_AF_ADMIN_SUBS", "").split(",") if s.strip()}
    if not allowed or claims.get("sub") not in allowed:
        raise HTTPException(403, "Administrator role required")


def require_dashboard_view(request: Request):
    """Staging READ only with IP-restricted ALB rules; admin writes remain OIDC-only.

    Stage U is education-only HTTP STAGING.  Source-IP is enforced by ALB,
    NOT read from user-supplied HTTP headers in this application.
    """
    if (os.getenv('AUTH_MODE') == 'staging'
        and os.getenv('BIKEPULSE_AF_UI_ENABLED') == 'true'
        and os.getenv('BIKEPULSE_AF_ALLOW_STAGING_READONLY') == 'true'):
        return
    verify_authenticated_alb(request)
