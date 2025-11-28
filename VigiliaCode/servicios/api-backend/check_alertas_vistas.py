#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para consultar la tabla alertas_vistas y verificar qué se está guardando.
"""
import os
from sqlalchemy import create_engine, text

# Configuración de la base de datos usando Cloud SQL Proxy
DB_USER = "postgres"
DB_NAME = "postgres"
# DB_PASS debe venir de un secret o variable de entorno
DB_PASS = os.getenv("DB_PASS", "")

# Para conectar via Unix socket (Cloud SQL Proxy)
DB_SOCKET_DIR = "/cloudsql"
INSTANCE_CONNECTION_NAME = "composed-apogee-475623-p6:southamerica-west1:vigilia-db-main"

if os.path.exists(f"{DB_SOCKET_DIR}/{INSTANCE_CONNECTION_NAME}"):
    # Conexión via Unix socket (en Cloud Run)
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@/{DB_NAME}?host={DB_SOCKET_DIR}/{INSTANCE_CONNECTION_NAME}"
else:
    # Conexión directa (local con Cloud SQL Proxy en localhost:5432)
    print("[INFO] No se encontró socket de Cloud SQL, intentando conexión local...")
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@127.0.0.1:5432/{DB_NAME}"

try:
    engine = create_engine(DATABASE_URL, echo=False)

    with engine.connect() as conn:
        # Consultar las últimas 20 entradas
        query1 = text("""
            SELECT
                av.id,
                av.usuario_id,
                u.nombre as nombre_usuario,
                u.rol,
                av.alerta_id,
                av.recordatorio_id,
                r.titulo as titulo_recordatorio,
                av.fecha_vista
            FROM alertas_vistas av
            LEFT JOIN usuarios u ON av.usuario_id = u.id
            LEFT JOIN recordatorios r ON av.recordatorio_id = r.id
            ORDER BY av.fecha_vista DESC
            LIMIT 20
        """)

        print("\n[OK] Últimas 20 entradas en alertas_vistas:")
        print("-" * 120)
        results = conn.execute(query1).fetchall()

        if not results:
            print("[INFO] No hay entradas en la tabla alertas_vistas")
        else:
            for row in results:
                print(f"ID: {row[0]}, Usuario: {row[2]} ({row[3]}), Alerta ID: {row[4]}, Recordatorio ID: {row[5]} - '{row[6]}', Fecha: {row[7]}")

        # Contar por usuario
        query2 = text("""
            SELECT
                u.nombre,
                u.rol,
                COUNT(CASE WHEN alerta_id IS NOT NULL THEN 1 END) as alertas_vistas,
                COUNT(CASE WHEN recordatorio_id IS NOT NULL THEN 1 END) as recordatorios_vistos,
                COUNT(*) as total
            FROM alertas_vistas av
            JOIN usuarios u ON av.usuario_id = u.id
            GROUP BY u.id, u.nombre, u.rol
        """)

        print("\n[OK] Resumen por usuario:")
        print("-" * 80)
        results2 = conn.execute(query2).fetchall()

        if not results2:
            print("[INFO] No hay datos por usuario")
        else:
            for row in results2:
                print(f"Usuario: {row[0]} ({row[1]}) - Alertas: {row[2]}, Recordatorios: {row[3]}, Total: {row[4]}")

except Exception as e:
    print(f"[ERROR] Error al consultar la base de datos: {str(e)}")
    raise
