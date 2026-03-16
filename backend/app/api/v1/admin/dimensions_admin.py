"""
BEACON PROTOCOL — Admin Dimensions CRUD
========================================
CRUD de dimensiones de evaluación para el panel del Overlord.

Endpoints:
  GET    /admin/dimensions             → listar todas (con inactivas)
  POST   /admin/dimensions             → crear nueva dimensión
  PATCH  /admin/dimensions/{id}        → editar (label, icon, order, is_active)
  DELETE /admin/dimensions/{id}        → eliminar permanente (usar con cuidado)

"El Overlord define los criterios con los que la República juzga."
"""

from fastapi import APIRouter, HTTPException, Depends, Query

from app.core.database import get_async_supabase_client
from app.core.audit_logger import audit_bus
from app.api.v1.admin.require_admin import require_admin_role

router = APIRouter(prefix="/admin", tags=["Admin — Dimensions"])

VALID_CATEGORIES = [
    "politico", "periodista", "empresario", "empresa", "evento",
    "artista", "presentador", "influencer", "deportista", "activista", "otro",
]


@router.get("/dimensions", summary="[ADMIN] Listar todas las dimensiones")
async def admin_list_dimensions(
    category: str = Query(None, description="Filtrar por categoría"),
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()
    query = (
        supabase.table("evaluation_dimensions")
        .select("*")
        .order("category")
        .order("display_order")
    )
    if category:
        query = query.eq("category", category.lower())

    result = await query.execute()
    return {"dimensions": result.data or []}


@router.post("/dimensions", summary="[ADMIN] Crear nueva dimensión")
async def admin_create_dimension(
    data: dict,
    admin: dict = Depends(require_admin_role),
):
    category = (data.get("category") or "").lower()
    key      = (data.get("key") or "").lower().replace(" ", "_")
    label    = (data.get("label") or "").strip()
    icon     = data.get("icon", "📊")
    order    = int(data.get("display_order", 99))

    if not category or category not in VALID_CATEGORIES:
        raise HTTPException(400, f"Categoría inválida. Válidas: {VALID_CATEGORIES}")
    if not key:
        raise HTTPException(400, "Campo 'key' es obligatorio (slug único)")
    if not label:
        raise HTTPException(400, "Campo 'label' es obligatorio")

    supabase = get_async_supabase_client()
    result = await (
        supabase.table("evaluation_dimensions")
        .insert({
            "category":      category,
            "key":           key,
            "label":         label,
            "icon":          icon,
            "display_order": order,
            "is_active":     True,
        })
        .execute()
    )

    if not result.data:
        raise HTTPException(500, "Error al crear dimensión")

    return {"status": "created", "dimension": result.data[0]}


@router.patch("/dimensions/{dim_id}", summary="[ADMIN] Editar dimensión")
async def admin_update_dimension(
    dim_id: str,
    data: dict,
    admin: dict = Depends(require_admin_role),
):
    allowed = ["label", "icon", "display_order", "is_active"]
    payload = {k: v for k, v in data.items() if k in allowed}

    if not payload:
        raise HTTPException(400, "No hay campos válidos para actualizar")

    supabase = get_async_supabase_client()
    result = await (
        supabase.table("evaluation_dimensions")
        .update(payload)
        .eq("id", dim_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(404, "Dimensión no encontrada")

    return {"status": "updated", "dimension": result.data[0]}


@router.delete("/dimensions/{dim_id}", summary="[ADMIN] Eliminar dimensión")
async def admin_delete_dimension(
    dim_id: str,
    admin: dict = Depends(require_admin_role),
):
    supabase = get_async_supabase_client()

    # Verificar existencia antes de eliminar (evita 200 fantasma)
    check = await (
        supabase.table("evaluation_dimensions")
        .select("id, category, key, label")
        .eq("id", dim_id)
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Dimensión no encontrada")

    dim_data = check.data[0]

    await (
        supabase.table("evaluation_dimensions")
        .delete()
        .eq("id", dim_id)
        .execute()
    )

    # Audit log: hard delete — trazabilidad obligatoria
    await audit_bus.alog_event(
        actor_id=admin.get("id", "SYSTEM"),
        action="OVERLORD_ACTION_DELETE_DIMENSION",
        entity_type="DIMENSION",
        entity_id=dim_id,
        details={
            "deleted_data": dim_data,
            "warning": "HARD_DELETE — no hay soft delete en evaluation_dimensions",
        },
    )

    return {"status": "deleted", "id": dim_id}
