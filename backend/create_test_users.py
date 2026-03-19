import asyncio
import sys
import os

# Ensure backend directory is in path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import get_supabase_client

async def create_user(supabase, email, password, first_name, last_name, role):
    print(f"\n--- Creando/Actualizando: {email} ({role}) ---")
    user_id = None

    try:
        # Intentar crear en Auth
        res = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True
        })
        user_id = res.user.id
        print(f"✅ Creado en Supabase Auth con ID: {user_id}")
    except Exception as e:
        print(f"⚠️ El usuario ya existe en Auth (o hubo error: {e}). Abortando script automatizado para evitar conflictos de id.")
        print("=> Por favor, elimínelos manualmente de Auth en el dashboard de Supabase si desea regenerarlos.")
        return

    if user_id:
        print("Creando registro en public.users...")
        new_user = {
            "id": user_id,
            "first_name": first_name,
            "last_name": last_name,
            "rut_hash": None,
            "rank": "VERIFIED" if role == "admin" else "BASIC",
            "reputation_score": 5.0 if role == "admin" else 1.0,
            "is_rut_verified": True,
            "is_shadow_banned": False,
            "role": role,
        }
        try:
            supabase.table("users").insert(new_user).execute()
            print(f"✅ Registro creado en public.users ({role})")
        except Exception as e2:
            print(f"❌ Error al crear registro en public.users: {e2}")

async def main():
    print("============================================================")
    print("🛡️  BEACON PROTOCOL — Creador de Cuentas de Prueba")
    print("============================================================")

    supabase = get_supabase_client()

    # Usuario ADMIN
    await create_user(
        supabase,
        email="overlord2026@beacon.com",
        password="OverlordPassword2026*",
        first_name="System",
        last_name="Overlord",
        role="admin"
    )

    # Usuario NORMAL
    await create_user(
        supabase,
        email="ciudadano2026@beacon.com",
        password="CiudadanoPassword2026*",
        first_name="Ciudadano",
        last_name="Prueba",
        role="user"
    )

    print("\n============================================================")
    print("🚀 PROCESO COMPLETADO. CUENTAS REGISTRADAS:")
    print("   [ADMIN] overlord2026@beacon.com / OverlordPassword2026*")
    print("   [USER]  ciudadano2026@beacon.com / CiudadanoPassword2026*")
    print("============================================================")

if __name__ == "__main__":
    asyncio.run(main())
