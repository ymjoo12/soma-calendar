rmdir /s /q dist\chrome
mkdir dist\chrome
xcopy src dist\chrome /E /I /Y
copy chrome\manifest.json dist\chrome\manifest.json