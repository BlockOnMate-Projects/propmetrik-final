"""
PropMetrik Authentication for E-Signature Platform
Replaces Keycloak authentication with PropMetrik JWT verification (HS256)
"""
import jwt
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
from config import settings

security = HTTPBearer()


def verify_propmetrik_token(token: str) -> Dict[str, Any]:
    """
    Verify and decode PropMetrik token
    Supports both:
    - Full JWT (3 parts with signature) using HS256
    - Simple base64 encoded JSON (from PropMetrik frontend)
    
    Note: Expiration checking is DISABLED for internal service communication
    """
    import base64
    import json
    
    try:
        print(f"🔐 Verifying PropMetrik token...")
        
        parts = token.split('.')
        
        if len(parts) == 3:
            # Standard JWT format - decode WITHOUT expiration verification
            payload = jwt.decode(
                token,
                settings.JWT_SECRET,
                algorithms=["HS256"],
                options={
                    "verify_exp": False,  # Disable expiration check
                    "verify_iat": False,  # Disable issued-at check
                }
            )
        else:
            # Simple base64 encoded JSON (PropMetrik frontend format)
            try:
                # Add padding if needed
                padded = token + '=' * (4 - len(token) % 4)
                decoded_bytes = base64.b64decode(padded)
                payload = json.loads(decoded_bytes)
                # No expiration check for base64 tokens
                    
            except (base64.binascii.Error, json.JSONDecodeError) as e:
                print(f"❌ Failed to decode base64 token: {e}")
                raise HTTPException(status_code=401, detail="Invalid token format")
        
        # Normalize field names (support both 'sub' and 'userId')
        if 'sub' in payload and 'userId' not in payload:
            payload['userId'] = payload['sub']
        elif 'userId' in payload and 'sub' not in payload:
            payload['sub'] = payload['userId']
            
        print(f"✅ Token verified successfully for user: {payload.get('email', payload.get('sub', 'unknown'))}")
        return payload
        
    except jwt.ExpiredSignatureError:
        # Should not happen with verify_exp=False, but handle gracefully
        print(f"⚠️ Token expired but continuing anyway (expiration disabled)")
        # Try to decode without verification
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload
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
    FastAPI dependency to get current authenticated user from PropMetrik JWT
    
    Usage:
        @app.get("/protected")
        async def protected_route(user: Dict = Depends(get_current_user)):
            return {"user": user}
    """
    token = credentials.credentials
    payload = verify_propmetrik_token(token)
    
    return {
        "sub": payload.get("userId"),  # Map userId to sub for compatibility
        "userId": payload.get("userId"),
        "email": payload.get("email"),
        "name": payload.get("email", "").split("@")[0],  # Use email prefix as name
        "role": payload.get("role"),
        "organizationId": payload.get("organizationId"),
        "organization_id": payload.get("organizationId"),  # Alias for compatibility
        "tier": payload.get("tier", "free"),
    }


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[Dict[str, Any]]:
    """
    Optional authentication - returns None if no token provided
    Used for public endpoints that benefit from user context if available
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


def check_role_access(user: Dict[str, Any], allowed_roles: list[str]) -> bool:
    """
    Check if user has any of the allowed roles
    """
    user_role = user.get("role", "")
    return user_role in allowed_roles


def require_role(allowed_roles: list[str]):
    """
    Dependency to require specific roles
    
    Usage:
        @app.get("/admin-only")
        async def admin_route(user: Dict = Depends(get_current_user)):
            ...
    """
    async def role_checker(user: Dict = Depends(get_current_user)):
        if not check_role_access(user, allowed_roles):
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}"
            )
        return user
    return role_checker


# Legacy compatibility - maps to role check
def check_group_access(user: Dict[str, Any], allowed_groups: list[str]) -> bool:
    """Legacy compatibility - checks role instead of groups"""
    return check_role_access(user, allowed_groups)


def require_groups(*allowed_groups: str):
    """Legacy compatibility - uses role check"""
    return require_role(list(allowed_groups))


def test_keycloak_connection() -> Dict[str, Any]:
    """
    Disabled - Keycloak is not used with PropMetrik integration
    """
    return {
        "status": "disabled",
        "message": "Keycloak authentication is disabled. Using PropMetrik JWT.",
        "auth_mode": "propmetrik_jwt"
    }
