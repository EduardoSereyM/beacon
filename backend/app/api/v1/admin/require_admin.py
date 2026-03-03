"""
BEACON PROTOCOL — RequireAdminRole (El Guardián del Overlord)
==============================================================
Dependencia FastAPI que verifica que el usuario autenticado
tenga rol 'admin' antes de acceder a cualquier endpoint
de la carpeta /admin.

"El que no tiene la llave, no entra al Búnker de Control."
"""

from fastapi import Depends, HTTPException, Request
from jose import jwt, JWTError
from app.core.config import settings


async def require_admin_role(request: Request) -> dict:
    """
    Dependencia que extrae y verifica el JWT del header Authorization.
    Verifica que el claim 'role' sea 'admin'.
    
    Returns:
        dict con user_id y role del admin autenticado.
    
    Raises:
        HTTPException 401: si no hay token o es inválido.
        HTTPException 403: si el usuario no es admin.
    """
    auth_header = request.headers.get("Authorization", "")
    
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token de autenticación requerido",
        )
    
    token = auth_header.replace("Bearer ", "")
    
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o expirado",
        )
    
    user_role = payload.get("role", "user")
    user_id = payload.get("sub") or payload.get("user_id")
    
    if user_role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: se requiere rol ADMIN",
        )
    
    return {
        "user_id": user_id,
        "role": user_role,
        "email": payload.get("email", ""),
    }
