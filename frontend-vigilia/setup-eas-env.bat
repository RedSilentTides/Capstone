@echo off
echo Configurando variables de entorno en EAS...
echo.

cd /d "%~dp0"

echo [1/7] Configurando FIREBASE_API_KEY...
call eas env:create --name EXPO_PUBLIC_FIREBASE_API_KEY --value "AIzaSyBwJPJeP_J_AffNfygR9fx9ZT732cDl_jc" --environment preview --scope project --visibility plaintext --non-interactive --force

echo [2/7] Configurando FIREBASE_AUTH_DOMAIN...
call eas env:create --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "composed-apogee-475623-p6.firebaseapp.com" --environment preview --scope project --visibility plaintext --non-interactive --force

echo [3/7] Configurando FIREBASE_PROJECT_ID...
call eas env:create --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "composed-apogee-475623-p6" --environment preview --scope project --visibility plaintext --non-interactive --force

echo [4/7] Configurando FIREBASE_STORAGE_BUCKET...
call eas env:create --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "composed-apogee-475623-p6.appspot.com" --environment preview --scope project --visibility plaintext --non-interactive --force

echo [5/7] Configurando FIREBASE_MESSAGING_SENDER_ID...
call eas env:create --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "687053793381" --environment preview --scope project --visibility plaintext --non-interactive --force

echo [6/7] Configurando FIREBASE_APP_ID...
call eas env:create --name EXPO_PUBLIC_FIREBASE_APP_ID --value "1:687053793381:web:2bc620ae3586434c29be8c" --environment preview --scope project --visibility plaintext --non-interactive --force

echo [7/7] Configurando FIREBASE_MEASUREMENT_ID...
call eas env:create --name EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID --value "G-BHWEE84XZT" --environment preview --scope project --visibility plaintext --non-interactive --force

echo.
echo ¡Listo! Variables de entorno configuradas para el entorno 'preview'
echo Ahora puedes ejecutar: eas build --platform android --profile preview
pause
