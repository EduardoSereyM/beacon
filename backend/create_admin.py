import asyncio
import sys
import os

# Ensure backend directory is in path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import get_supabase_client
from app.services.auth_service import hash_password
from datetime import datetime

async def main():
    print("============================================================")
    print("🛡️  BEACON PROTOCOL — Creación de Usuario Overlord Admin")
    print("============================================================")

    supabase = get_supabase_client()
    email = "overlord@beacon.com"
    password = "OverlordPassword2026*"
    full_name = "System Overlord"
    
    user_id = None

    try:
        print(f"Buscando si el usuario {email} ya existe en auth...")
        # Intentar crear en Auth
        res = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True
        })
        user_id = res.user.id
        print(f"✅ Usuario creado en Supabase Auth con ID: {user_id}")
    except Exception as e:
        print(f"⚠️ El usuario parece ya existir en Auth ({e}). Intentando actualizar...")
        # Si ya existe, asumimos que está en la tabla public.users
        # No podemos listar fácilmente en auth con la version actual, 
        # así que buscamos en public.users
        res = supabase.table("users").select("id").eq("email", email).execute()
        if res.data:
            user_id = res.data[0]["id"]
            print(f"Obtenido ID de BBDD: {user_id}")
            # Actualizar contraseña en auth
            try:
                supabase.auth.admin.update_user_by_id(user_id, {"password": password, "email_confirm": True})
                print("✅ Contraseña restablecida en Supabase Auth.")
            except Exception as e2:
                print(f"No se pudo actualizar la contraseña en Auth: {e2}")
        else:
            print("❌ No se pudo crear ni encontrar en la BBDD. Abortando.")
            return

    if user_id:
        # Verificar si existe en public.users
        res = supabase.table("users").select("id").eq("id", user_id).execute()
        if not res.data:
            print("Creando registro en public.users...")
            new_user = {
                "id": user_id,
                "email": email,
                "full_name": full_name,
                "hashed_password": hash_password(password),
                "password_history": [hash_password(password)],
                "rank": "DIAMOND",
                "integrity_score": 1.0,
                "reputation_score": 5.0,
                "verification_level": "gov_id",
                "is_verified": True,
                "is_active": True,
                "is_shadow_banned": False,
                "created_at": datetime.utcnow().isoformat(),
                "role": "admin"
            }
            supabase.table("users").insert(new_user).execute()
            print("✅ Registro creado en public.users con rango DIAMOND y rol ADMIN.")
        else:
            print("Actualizando registro en public.users...")
            supabase.table("users").update({
                "role": "admin",
                "rank": "DIAMOND",
                "is_verified": True
            }).eq("id", user_id).execute()
            print("✅ Registro en public.users actualizado a rol ADMIN.")

    print("============================================================")
    print("🚀 Creación de Overlord COMPLETADA.")
    print(f"   Email: {email}")
    print(f"   Password: {password}")
    print("============================================================")

if __name__ == "__main__":
    asyncio.run(main())
