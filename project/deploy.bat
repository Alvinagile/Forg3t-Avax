@echo off
echo 🚀 Starting Netlify deployment...

echo 🔍 Checking if Netlify CLI is installed...
netlify --version >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Netlify CLI is already installed
) else (
    echo ⚠️ Installing Netlify CLI...
    npm install -g netlify-cli
    if %errorlevel% == 0 (
        echo ✅ Netlify CLI installed successfully
    ) else (
        echo ❌ Failed to install Netlify CLI
        pause
        exit /b 1
    )
)

echo 🏗️ Building the project...
npm run build
if %errorlevel% == 0 (
    echo ✅ Project built successfully
) else (
    echo ❌ Failed to build the project
    pause
    exit /b 1
)

echo 🌐 Deploying to Netlify...
netlify deploy --prod
if %errorlevel% == 0 (
    echo ✅ Deployment completed successfully!
) else (
    echo ❌ Failed to deploy to Netlify
    pause
    exit /b 1
)

pause