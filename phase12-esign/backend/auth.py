"""
Keycloak Authentication for E-Signature Platform
"""
import jwt
import requests
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
from config import settings

security = HTTPBearer()


def get_keycloak_public_key() -> str:
    """Fetch Keycloak realm public key for JWT verification"""
    try:
        print(f"🔍 Fetching public key from: {settings.KEYCLOAK_ISSUER}")
        response = requests.get(f"{settings.KEYCLOAK_ISSUER}")
        response.raise_for_status()
        realm_info = response.json()
        public_key = realm_info.get("public_key")
        
        if not public_key:
            raise ValueError("Public key not found in realm info")
        
        # Format the public key for PyJWT
        formatted_key = f"-----BEGIN PUBLIC KEY-----\n{public_key}\n-----END PUBLIC KEY-----"
        print(f"✅ Successfully fetched public key")
        return formatted_key
    
    except Exception as e:
        print(f"❌ Failed to fetch Keycloak public key: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch Keycloak configuration")


def verify_token(token: str) -> Dict[str, Any]:
    """Verify and decode Keycloak JWT token"""
    try:
        print(f"🔐 Verifying token (first 30 chars): {token[:30]}...")
        
        # Get public key from Keycloak
        public_key = get_keycloak_public_key()
        
        # Token issuer might be:
        # - localhost:8080 (from browser in dev)
        # - host.docker.internal:8080 (from backend in Docker)
        # - https://sso.cedynhq.com (from browser in production)
        # - Internal Keycloak URL (from backend in Docker)
        # We need to accept all
        possible_issuers = [
            f"http://localhost:8080/realms/{settings.KEYCLOAK_REALM}",
            f"http://host.docker.internal:8080/realms/{settings.KEYCLOAK_REALM}",
            f"https://sso.cedynhq.com/realms/{settings.KEYCLOAK_REALM}",
            settings.KEYCLOAK_ISSUER,
        ]
        
        print(f"🔍 Trying issuers: {possible_issuers}")
        
        # Try to decode with each possible issuer
        payload = None
        last_error = None
        
        for issuer in possible_issuers:
            try:
                payload = jwt.decode(
                    token,
                    public_key,
                    algorithms=["RS256"],
                    issuer=issuer,
                    options={
                        "verify_aud": False,  # Public clients don't require audience validation
                        "verify_exp": True,
                        "verify_iss": True,
                    }
                )
                print(f"✅ Token verified successfully with issuer: {issuer}")
                print(f"✅ User: {payload.get('preferred_username')}")
                return payload
            except jwt.InvalidIssuerError as e:
                last_error = e
                continue
            except Exception as e:
                last_error = e
                break
        
        # If we get here, none of the issuers worked
        if last_error:
            raise last_error
        
    except jwt.ExpiredSignatureError:
        print(f"❌ Token expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"❌ Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        print(f"❌ Token verification error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=401, detail="Token verification failed")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> Dict[str, Any]:
    """
    FastAPI dependency to get current authenticated user from JWT token
    
    Usage:
        @app.get("/protected")
        async def protected_route(user: Dict = Depends(get_current_user)):
            return {"user": user}
    """
    token = credentials.credentials
    payload = verify_token(token)
    
    return {
        "sub": payload.get("sub"),  # Keycloak user ID
        "email": payload.get("email"),
        "preferred_username": payload.get("preferred_username"),
        "name": payload.get("name"),
        "given_name": payload.get("given_name"),
        "family_name": payload.get("family_name"),
        "groups": payload.get("groups", []),
        "realm_access": payload.get("realm_access", {}),
        "resource_access": payload.get("resource_access", {})
    }


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[Dict[str, Any]]:
    """
    Optional authentication - returns None if no token provided
    
    Usage for public endpoints that benefit from user context if available
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


def check_group_access(user: Dict[str, Any], allowed_groups: list[str]) -> bool:
    """
    Check if user belongs to any of the allowed groups
    
    Args:
        user: User dict from get_current_user
        allowed_groups: List of group paths (e.g., ["/cedyn/engineering", "/cedyn/leadership"])
    
    Returns:
        True if user has access, False otherwise
    """
    user_groups = user.get("groups", [])
    return any(group in user_groups for group in allowed_groups)


def require_groups(*allowed_groups: str):
    """
    Decorator to require specific Keycloak groups
    
    Usage:
        @app.get("/admin")
        @require_groups("/cedyn/leadership", "/cedyn/engineering")
        async def admin_route(user: Dict = Depends(get_current_user)):
            return {"message": "Admin access granted"}
    """
    def decorator(func):
        async def wrapper(*args, user: Dict[str, Any] = None, **kwargs):
            if not user:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            if not check_group_access(user, list(allowed_groups)):
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied. Required groups: {', '.join(allowed_groups)}"
                )
            
            return await func(*args, user=user, **kwargs)
        return wrapper
    return decorator


def test_keycloak_connection() -> Dict[str, Any]:
    """
    Test Keycloak connectivity and configuration
    Returns status information for debugging
    """
    result = {
        "keycloak_url": settings.KEYCLOAK_BASE_URL,
        "realm": settings.KEYCLOAK_REALM,
        "issuer": settings.KEYCLOAK_ISSUER,
        "client_id": settings.KEYCLOAK_CLIENT_ID,
        "client_secret_configured": bool(settings.KEYCLOAK_CLIENT_SECRET),
        "connection_status": "unknown",
        "realm_accessible": False,
        "error": None
    }
    
    try:
        # Test 1: Check if realm is accessible
        response = requests.get(settings.KEYCLOAK_ISSUER, timeout=5)
        response.raise_for_status()
        result["connection_status"] = "success"
        result["realm_accessible"] = True
        result["realm_info"] = response.json()
        
        # Test 2: Try to get OIDC configuration
        oidc_config_url = f"{settings.KEYCLOAK_ISSUER}/.well-known/openid-configuration"
        oidc_response = requests.get(oidc_config_url, timeout=5)
        oidc_response.raise_for_status()
        result["oidc_configured"] = True
        result["token_endpoint"] = oidc_response.json().get("token_endpoint")
        result["auth_endpoint"] = oidc_response.json().get("authorization_endpoint")
        
    except requests.exceptions.ConnectionError as e:
        result["connection_status"] = "failed"
        result["error"] = f"Connection error: {str(e)}"
    except requests.exceptions.Timeout:
        result["connection_status"] = "timeout"
        result["error"] = "Request timed out"
    except requests.exceptions.HTTPError as e:
        result["connection_status"] = "http_error"
        result["error"] = f"HTTP {e.response.status_code}: {e.response.text}"
    except Exception as e:
        result["connection_status"] = "error"
        result["error"] = str(e)
    
    return result
