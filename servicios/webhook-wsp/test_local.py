"""
Script de prueba local para el webhook de WhatsApp
Ejecutar con: python test_local.py
"""

import httpx
import asyncio
from dotenv import load_dotenv
import os

# Cargar variables de entorno del archivo .env
load_dotenv()

# Configuración
BASE_URL = "http://localhost:8080"
API_KEY = os.getenv("API_KEY", "12345abcdtokenseguro")
TEST_PHONE = "56957342441"  # Cambiar por tu número de teléfono

async def test_health():
    """Prueba el endpoint de health check"""
    print("\n🔍 Probando health check...")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200

async def test_root():
    """Prueba el endpoint raíz"""
    print("\n🔍 Probando endpoint raíz...")
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200

async def test_send_template():
    """Prueba enviar un mensaje de plantilla"""
    print(f"\n📤 Probando envío de template a {TEST_PHONE}...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/send-template",
                headers={"X-API-Key": API_KEY},
                json={
                    "to": TEST_PHONE,
                    "template_name": "hello_world",
                    "language_code": "en_US"
                },
                timeout=30.0
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            return response.status_code == 200
        except Exception as e:
            print(f"❌ Error: {e}")
            return False

async def test_send_text():
    """Prueba enviar un mensaje de texto"""
    print(f"\n📤 Probando envío de texto a {TEST_PHONE}...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/send-text",
                headers={"X-API-Key": API_KEY},
                json={
                    "to": TEST_PHONE,
                    "message": "Hola! Este es un mensaje de prueba desde VigilIA 🤖"
                },
                timeout=30.0
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            return response.status_code == 200
        except Exception as e:
            print(f"❌ Error: {e}")
            return False

async def test_send_notification():
    """Prueba enviar una notificación"""
    print(f"\n📤 Probando envío de notificación a {TEST_PHONE}...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/send-notification",
                headers={"X-API-Key": API_KEY},
                json={
                    "phone_number": TEST_PHONE,
                    "notification_type": "reminder",
                    "title": "Recordatorio de Medicamento",
                    "body": "Es hora de tomar tu medicamento de las 10:00"
                },
                timeout=30.0
            )
            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")
            return response.status_code == 200
        except Exception as e:
            print(f"❌ Error: {e}")
            return False

async def test_unauthorized():
    """Prueba que la autenticación funcione (debe fallar sin API Key)"""
    print("\n🔒 Probando protección de API Key (debe fallar)...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{BASE_URL}/send-template",
                # No enviamos API Key
                json={
                    "to": TEST_PHONE,
                    "template_name": "hello_world",
                    "language_code": "en_US"
                },
                timeout=30.0
            )
            print(f"Status: {response.status_code}")
            if response.status_code == 401:
                print("✅ Protección funcionando correctamente")
                return True
            else:
                print("❌ Debería haber retornado 401 Unauthorized")
                return False
        except Exception as e:
            print(f"❌ Error: {e}")
            return False

async def main():
    """Ejecuta todas las pruebas"""
    print("=" * 60)
    print("🧪 PRUEBAS DEL WEBHOOK DE WHATSAPP")
    print("=" * 60)
    print(f"URL Base: {BASE_URL}")
    print(f"API Key: {API_KEY[:10]}...")
    print(f"Teléfono de prueba: {TEST_PHONE}")
    print("=" * 60)

    results = []

    # Pruebas básicas
    results.append(("Health Check", await test_health()))
    results.append(("Root Endpoint", await test_root()))
    results.append(("API Key Protection", await test_unauthorized()))

    # Pregunta al usuario si quiere enviar mensajes reales
    print("\n" + "=" * 60)
    print("⚠️  Las siguientes pruebas enviarán mensajes REALES a WhatsApp")
    print("=" * 60)

    respuesta = input("\n¿Deseas continuar con las pruebas de envío? (s/n): ")

    if respuesta.lower() in ['s', 'si', 'yes', 'y']:
        results.append(("Send Template", await test_send_template()))
        # Comentar si no quieres enviar texto (requiere número verificado)
        # results.append(("Send Text", await test_send_text()))
        results.append(("Send Notification", await test_send_notification()))
    else:
        print("\n⏭️  Saltando pruebas de envío")

    # Resumen
    print("\n" + "=" * 60)
    print("📊 RESUMEN DE PRUEBAS")
    print("=" * 60)

    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {test_name}")

    total = len(results)
    passed = sum(1 for _, p in results if p)
    print("=" * 60)
    print(f"Total: {passed}/{total} pruebas exitosas")
    print("=" * 60)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Pruebas interrumpidas por el usuario")
    except Exception as e:
        print(f"\n\n❌ Error general: {e}")
