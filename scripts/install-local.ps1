param(
  [string]$InstallDir = "$HOME\.pgstudio",
  [int]$WebPort = 8080,
  [string]$ExternalDatabaseUrl = $env:DATABASE_URL,
  [string]$ApiImage = $(if ($env:PGSTUDIO_API_IMAGE) { $env:PGSTUDIO_API_IMAGE } else { "pgstudio/api:local" }),
  [string]$WebImage = $(if ($env:PGSTUDIO_WEB_IMAGE) { $env:PGSTUDIO_WEB_IMAGE } else { "pgstudio/web:local" }),
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function New-RandomHex {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Require-Command([string]$Command) {
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Command"
  }
}

Require-Command docker
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

if (-not $SkipBuild -and $env:PGSTUDIO_SKIP_BUILD -ne "1") {
  docker build -f (Join-Path $RepoRoot "docker/api.Dockerfile") -t $ApiImage $RepoRoot
  docker build -f (Join-Path $RepoRoot "docker/web.Dockerfile") -t $WebImage $RepoRoot
}

$JwtSecret = if ($env:JWT_SECRET) { $env:JWT_SECRET } else { New-RandomHex }
$JwtRefreshSecret = if ($env:JWT_REFRESH_SECRET) { $env:JWT_REFRESH_SECRET } else { New-RandomHex }
$EncryptionKey = if ($env:CREDENTIALS_ENCRYPTION_KEY) { $env:CREDENTIALS_ENCRYPTION_KEY } else { New-RandomHex }
$CorsOrigin = if ($env:CORS_ORIGIN) { $env:CORS_ORIGIN } else { "http://localhost:$WebPort" }
$EnvPath = Join-Path $InstallDir ".env.production"
$ComposePath = Join-Path $InstallDir "docker-compose.yml"

if ($ExternalDatabaseUrl) {
  @"
PGSTUDIO_WEB_PORT=$WebPort
DATABASE_URL=$ExternalDatabaseUrl
JWT_SECRET=$JwtSecret
JWT_REFRESH_SECRET=$JwtRefreshSecret
CREDENTIALS_ENCRYPTION_KEY=$EncryptionKey
CORS_ORIGIN=$CorsOrigin
"@ | Set-Content -Encoding ASCII $EnvPath

  @"
services:
  api:
    image: $ApiImage
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: `${DATABASE_URL:?DATABASE_URL is required}
      JWT_SECRET: `${JWT_SECRET:?JWT_SECRET is required}
      JWT_REFRESH_SECRET: `${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}
      CREDENTIALS_ENCRYPTION_KEY: `${CREDENTIALS_ENCRYPTION_KEY:?CREDENTIALS_ENCRYPTION_KEY is required}
      CORS_ORIGIN: `${CORS_ORIGIN:?CORS_ORIGIN is required}
    expose:
      - "3000"
    restart: unless-stopped

  web:
    image: $WebImage
    environment:
      API_PROXY_URL: http://api:3000
    ports:
      - "`${PGSTUDIO_WEB_PORT:-8080}:80"
    depends_on:
      - api
    restart: unless-stopped
"@ | Set-Content -Encoding ASCII $ComposePath
} else {
  $DbPassword = if ($env:PGSTUDIO_DB_PASSWORD) { $env:PGSTUDIO_DB_PASSWORD } else { New-RandomHex }
  @"
PGSTUDIO_WEB_PORT=$WebPort
PGSTUDIO_DB_USER=pgstudio
PGSTUDIO_DB_PASSWORD=$DbPassword
PGSTUDIO_DB_NAME=pgstudio
DATABASE_URL=postgresql://pgstudio:$DbPassword@postgres:5432/pgstudio
JWT_SECRET=$JwtSecret
JWT_REFRESH_SECRET=$JwtRefreshSecret
CREDENTIALS_ENCRYPTION_KEY=$EncryptionKey
CORS_ORIGIN=$CorsOrigin
"@ | Set-Content -Encoding ASCII $EnvPath

  @"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: `${PGSTUDIO_DB_USER:?PGSTUDIO_DB_USER is required}
      POSTGRES_PASSWORD: `${PGSTUDIO_DB_PASSWORD:?PGSTUDIO_DB_PASSWORD is required}
      POSTGRES_DB: `${PGSTUDIO_DB_NAME:?PGSTUDIO_DB_NAME is required}
    volumes:
      - pgstudio-data:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    image: $ApiImage
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: `${DATABASE_URL:?DATABASE_URL is required}
      JWT_SECRET: `${JWT_SECRET:?JWT_SECRET is required}
      JWT_REFRESH_SECRET: `${JWT_REFRESH_SECRET:?JWT_REFRESH_SECRET is required}
      CREDENTIALS_ENCRYPTION_KEY: `${CREDENTIALS_ENCRYPTION_KEY:?CREDENTIALS_ENCRYPTION_KEY is required}
      CORS_ORIGIN: `${CORS_ORIGIN:?CORS_ORIGIN is required}
    expose:
      - "3000"
    depends_on:
      - postgres
    restart: unless-stopped

  web:
    image: $WebImage
    environment:
      API_PROXY_URL: http://api:3000
    ports:
      - "`${PGSTUDIO_WEB_PORT:-8080}:80"
    depends_on:
      - api
    restart: unless-stopped

volumes:
  pgstudio-data:
"@ | Set-Content -Encoding ASCII $ComposePath
}

docker compose --env-file $EnvPath -f $ComposePath up -d

Write-Host "PgStudio is running at http://localhost:$WebPort"
Write-Host "Install directory: $InstallDir"
