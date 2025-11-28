#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para crear la tabla alertas_vistas en PostgreSQL.
Este script debe ejecutarse con las credenciales de GCP adecuadas.
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy import engine as sqlalchemy_engine

# Configuración de la base de datos
PROJECT_ID = "composed-apogee-475623-p6"
REGION = "southamerica-west1"
INSTANCE_NAME = "vigilia-db-main"
DB_USER = "postgres"
DB_PASS = os.environ.get("DB_PASS", "")
DB_NAME = "postgres"

db_socket_dir = os.environ.get("DB_SOCKET_DIR", "/cloudsql")
cloud_sql_connection_name = f"{PROJECT_ID}:{REGION}:{INSTANCE_NAME}"

db_url = sqlalchemy_engine.URL.create(
    drivername="postgresql+psycopg2",
    username=DB_USER,
    password=DB_PASS,
    database=DB_NAME,
    query={
        "host": f"{db_socket_dir}/{cloud_sql_connection_name}"
    }
)

engine = create_engine(db_url)

# Leer el script SQL
with open('schema_alertas_vistas.sql', 'r', encoding='utf-8') as f:
    sql_script = f.read()

# Ejecutar el script
try:
    with engine.connect() as conn:
        # Dividir el script en statements individuales
        statements = [s.strip() for s in sql_script.split(';') if s.strip() and not s.strip().startswith('--')]

        for statement in statements:
            if statement.upper().startswith('COMMENT'):
                # Los comentarios necesitan ser ejecutados con commit
                conn.execute(text(statement))
                conn.commit()
            elif statement.upper().startswith('CREATE') or statement.upper().startswith('ALTER'):
                conn.execute(text(statement))
                conn.commit()
                print(f"[OK] Ejecutado: {statement[:50]}...")

        print("\n[OK] Tabla alertas_vistas creada exitosamente!")
        print("[OK] Indices creados")
        print("[OK] Comentarios agregados")

except Exception as e:
    print(f"[ERROR] Error al crear la tabla: {str(e)}")
    raise
