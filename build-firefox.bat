rmdir /s /q dist\firefox
mkdir dist\firefox
xcopy src dist\firefox /E /I /Y
copy firefox\manifest.json dist\firefox\manifest.json