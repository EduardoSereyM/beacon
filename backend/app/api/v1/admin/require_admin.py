"""
BEACON PROTOCOL — RequireAdminRole (El Guardián del Overlord)
==============================================================
Dependencia FastAPI que verifica que el usuario autenticado
tenga rol 'admin' antes de acceder a cualquier endpoint
de la carpeta /admin.

"El que no tiene la llave, no entra al Búnker de Control."
"""

from fastapi import HTTPException, Request


async def require_admin_role(request: Request) -> dict:
    """
    Dependencia que valida el Bearer token contra Supabase Auth y verifica
    que el usuario tenga rol 'admin' en la tabla 'users'.

    Supabase verifica su propio JWT server-side — no se usa JWT_SECRET_KEY.
    El rol se lee desde nuestra tabla 'users', no desde claims del JWT
    (Supabase emite role='authenticated', no 'admin').

    Returns:
        dict con user_id, role y email del admin autenticado.

    Raises:
        HTTPException 401: si no hay token o es inválido.
        HTTPException 403: si el usuario no tiene rol ADMIN en la tabla.
    """
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Token de autenticación requerido",
        )

    token = auth_header.replace("Bearer ", "")

    # ─── 1. Validar token contra Supabase Auth ───
    try:
        from app.core.database import get_supabase_client
        supabase = get_supabase_client()
        auth_response = supabase.auth.get_user(token)
        user_id = auth_response.user.id
        user_email = auth_response.user.email or ""
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Token inválido o expirado",
        )

    # ─── 2. Verificar rol en tabla 'users' (no en claims JWT) ───
    from app.services.auth_service import get_user_by_id
    user = await get_user_by_id(user_id)

    if not user or user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: se requiere rol ADMIN",
        )

    return {
        "user_id": user_id,
        "role": "admin",
        "email": user_email,
    }
