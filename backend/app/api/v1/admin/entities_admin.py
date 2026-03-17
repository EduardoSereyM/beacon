"""
BEACON PROTOCOL — Entities Admin CRUD (Gestión del Overlord)
==============================================================
Endpoints exclusivos para administradores.
CRUD completo de entidades con auditoría forzada.

Cada acción genera un log en audit_logs con prefijo OVERLORD_ACTION,
capturando old_data y new_data de forma obligatoria.

Endpoints:
  GET    /admin/entities       → Lista todas (activas e inactivas)
  POST   /admin/entities       → Crear nueva entidad
  PATCH  /admin/entities/{id}  → Editar entidad (requiere change_reason)
  DELETE /admin/entities/{id}  → Soft delete (is_active: false)

"El Overlord edita la realidad. El Escriba registra cada cambio."
"""

from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from datetime import datetime
import uuid

from app.core.database import get_async_supabase_client
from app.core.audit_logger import audit_bus
from app.api.v1.admin.require_admin import require_admin_role

STORAGE_BUCKET = "imagenes"
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB

router = APIRouter(prefix="/admin", tags=["Admin — Entities"])


@router.get("/entities", summary="[ADMIN] Listar todas las entidades")
async def admin_list_entities(
    include_inactive: bool = Query(False, description="Incluir entidades desactivadas"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(require_admin_role),
):
    """Lista completa de entidades para el panel de administración."""
    supabase = get_async_supabase_client()

    query = (
        supabase.table("entities")
        .select("*")
        .order("updated_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if not include_inactive:
        query = query.eq("is_active", True)

    result = await query.execute()

    entities = list(result.data or [])

    return {
        "entities": entities,
        "total": len(entities),
        "admin_id": admin["user_id"],
    }


@router.post("/entities", summary="[ADMIN] Crear nueva entidad")
async def admin_create_entity(
    entity_data: dict,
    admin: dict = Depends(require_admin_role),
):
    """
    Crea una nueva entidad en la BBDD.
    Requiere campos: first_name, last_name, category.
    """
    required = ["first_name", "last_name", "category"]
    for field in required:
        if not entity_data.get(field):
            raise HTTPException(
                status_code=400,
                detail=f"Campo obligatorio faltante: {field}",
            )

    # Validar category contra CHECK constraint
    valid_categories = ["politico", "periodista", "empresario", "empresa", "evento"]
    cat = entity_data.get("category", "").lower()
    if cat not in valid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Categoría inválida. Válidas: {valid_categories}",
        )

    supabase = get_async_supabase_client()

    # Construir payload limpio
    payload = {
        "first_name": entity_data["first_name"],
        "last_name": entity_data["last_name"],
        "second_last_name": entity_data.get("second_last_name"),
        "category": cat,
        "position": entity_data.get("position"),
        "region": entity_data.get("region"),
        "district": entity_data.get("district"),
        "bio": entity_data.get("bio", ""),
        "party": entity_data.get("party"),
        "official_links": entity_data.get("official_links", {}),
        "is_active": True,
        "updated_by": admin["user_id"],
        "updated_at": datetime.utcnow().isoformat(),
    }

    result = await supabase.table("entities").insert(payload).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear entidad")

    new_entity = result.data[0]

    # Auditoría obligatoria
    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_CREATE_ENTITY",
        entity_type="ENTITY",
        entity_id=new_entity["id"],
        details={
            "new_data": payload,
            "change_reason": entity_data.get("change_reason", "Creación desde panel admin"),
        },
    )

    return {"status": "created", "entity": new_entity}


@router.patch("/entities/{entity_id}", summary="[ADMIN] Editar entidad")
async def admin_update_entity(
    entity_id: str,
    update_data: dict,
    admin: dict = Depends(require_admin_role),
):
    """
    Actualiza una entidad existente.
    Requiere campo 'change_reason' para auditoría.
    """
    change_reason = update_data.pop("change_reason", None)
    if not change_reason:
        raise HTTPException(
            status_code=400,
            detail="Campo 'change_reason' es obligatorio para auditoría",
        )

    supabase = get_async_supabase_client()

    # Obtener estado actual (old_data)
    current = await (
        supabase.table("entities")
        .select("*")
        .eq("id", entity_id)
        .execute()
    )

    if not current.data:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    old_data = current.data[0]

    # Campos permitidos para actualización
    allowed = [
        "first_name", "last_name", "second_last_name",
        "category", "position", "region", "district",
        "bio", "party", "official_links", "photo_path", "is_active",
    ]

    payload = {}
    for key in allowed:
        if key in update_data:
            payload[key] = update_data[key]

    if not payload:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    # Validar category si se envía
    if "category" in payload:
        valid_categories = ["politico", "periodista", "empresario", "empresa", "evento"]
        if payload["category"].lower() not in valid_categories:
            raise HTTPException(
                status_code=400,
                detail=f"Categoría inválida. Válidas: {valid_categories}",
            )
        payload["category"] = payload["category"].lower()

    payload["updated_by"] = admin["user_id"]
    payload["updated_at"] = datetime.utcnow().isoformat()

    result = await (
        supabase.table("entities")
        .update(payload)
        .eq("id", entity_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Error al actualizar entidad")

    # Auditoría forzada con old_data y new_data
    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_UPDATE_ENTITY",
        entity_type="ENTITY",
        entity_id=entity_id,
        details={
            "old_data": {k: old_data.get(k) for k in payload.keys() if k not in ["updated_by", "updated_at"]},
            "new_data": {k: v for k, v in payload.items() if k not in ["updated_by", "updated_at"]},
            "change_reason": change_reason,
        },
    )

    return {"status": "updated", "entity": result.data[0]}


@router.delete("/entities/{entity_id}", summary="[ADMIN] Soft delete de entidad")
async def admin_delete_entity(
    entity_id: str,
    admin: dict = Depends(require_admin_role),
):
    """
    Soft delete: marca is_active=false y registra deleted_at.
    La entidad permanece en la BBDD para auditoría pero desaparece del frontend.
    """
    supabase = get_async_supabase_client()

    # Verificar existencia
    current = await (
        supabase.table("entities")
        .select("id, first_name, last_name, is_active")
        .eq("id", entity_id)
        .execute()
    )

    if not current.data:
        raise HTTPException(status_code=404, detail="Entidad no encontrada")

    old_data = current.data[0]

    if not old_data.get("is_active"):
        raise HTTPException(status_code=400, detail="La entidad ya está desactivada")

    # Soft delete
    await (
        supabase.table("entities")
        .update({
            "is_active": False,
            "deleted_at": datetime.utcnow().isoformat(),
            "updated_by": admin["user_id"],
        })
        .eq("id", entity_id)
        .execute()
    )

    # Auditoría
    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_DELETE_ENTITY",
        entity_type="ENTITY",
        entity_id=entity_id,
        details={
            "old_data": old_data,
            "soft_deleted": True,
        },
    )

    return {"status": "soft_deleted", "entity_id": entity_id}


@router.post("/entities/upload-photo", summary="[ADMIN] Subir foto de entidad al Storage")
async def admin_upload_entity_photo(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin_role),
):
    """
    Recibe una imagen (JPEG/PNG/WEBP ≤ 5 MB), la sube al bucket 'imagenes'
    de Supabase Storage y devuelve la URL pública para guardar en photo_path.
    """
    # Validar MIME
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no permitido: {file.content_type}. Use JPEG, PNG o WEBP.",
        )

    # Leer y validar tamaño
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Archivo demasiado grande ({len(contents) // 1024} KB). Máximo 5 MB.",
        )

    # Nombre único con extensión original
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    filename = f"entities/{uuid.uuid4().hex}.{ext}"

    supabase = get_async_supabase_client()

    try:
        await supabase.storage.from_(STORAGE_BUCKET).upload(
            path=filename,
            file=contents,
            file_options={"content-type": file.content_type, "upsert": "false"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error subiendo imagen al Storage: {e}")

    # URL pública del objeto (get_public_url es síncrono en supabase-py v2)
    public_url = supabase.storage.from_(STORAGE_BUCKET).get_public_url(filename)

    await audit_bus.alog_event(
        actor_id=admin["user_id"],
        action="OVERLORD_ACTION_UPLOAD_PHOTO",
        entity_type="STORAGE",
        entity_id=filename,
        details={"filename": filename, "size_bytes": len(contents), "content_type": file.content_type},
    )

    return {"url": public_url, "path": filename}
