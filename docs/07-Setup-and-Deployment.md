# Setup and Deployment Guide

Complete guide for setting up and deploying the Zynk platform.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Production Deployment](#production-deployment)
- [Docker Deployment](#docker-deployment)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
| Software | Minimum Version | Purpose |
|----------|----------------|---------|
| Node.js | 18.0+ | JavaScript runtime |
| NPM | 9.0+ | Package manager |
| PostgreSQL | 16.0+ | Database |
| Redis | 7.0+ | Cache & presence |
| Docker | 24.0+ | Containerization (optional) |
| Docker Compose | 2.0+ | Multi-container orchestration (optional) |

### Recommended Tools
- **Git**: Version control
- **VS Code**: Code editor with TypeScript support
- **Postman/Insomnia**: API testing
- **PostgreSQL GUI**: TablePlus, pgAdmin, or DBeaver

---

## Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/zynk.git
cd zynk
```

### 2. Install Dependencies

#### Backend (Server)
```bash
cd server
npm install
```

#### Frontend (Web)
```bash
cd web
npm install
```

---

## Environment Configuration

### Server Environment Variables

Create `server/.env` file:
```env
# Server Configuration
NODE_ENV=development
PORT=8000

# Database
DATABASE_URL=postgresql://zynk:apple@localhost:5432/zynk
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zynk
DB_USER=zynk
DB_PASSWORD=apple

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secrets (CHANGE IN PRODUCTION!)
JWT_SECRET=dev-jwt-secret-CHANGE-THIS-IN-PRODUCTION-min-32-chars
JWT_REFRESH_SECRET=dev-refresh-secret-CHANGE-THIS-IN-PRODUCTION-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3000

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800  # 50MB in bytes

# WebRTC
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_URLS=
TURN_USERNAME=
TURN_CREDENTIAL=

# Call Configuration
CALL_RING_TIMEOUT_MS=30000  # 30 seconds
CALL_MAX_DURATION_SECS=3600  # 1 hour

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX_LOGIN=5
AUTH_RATE_LIMIT_MAX_REGISTER=3

# Security
BCRYPT_ROUNDS=12
MIN_PASSWORD_LENGTH=8
MAX_DEVICES=5
SESSION_EXPIRY_MS=900000  # 15 minutes
REFRESH_EXPIRY_MS=604800000  # 7 days

# Express
BODY_LIMIT=2mb
MORGAN_MODE=dev
```

**SECURITY NOTE FOR PRODUCTION:**
- Generate strong random secrets (min 32 characters)
- Use environment-specific values
- Never commit `.env` file to version control

---

### Web Environment Variables

Create `web/.env.local` file:
```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=http://localhost:8000

# WebSocket Configuration
NEXT_PUBLIC_WS_RECONNECTION_ATTEMPTS=15
NEXT_PUBLIC_WS_RECONNECTION_DELAY=1000

# Feature Flags (optional)
NEXT_PUBLIC_ENABLE_GIPHY=true
NEXT_PUBLIC_ENABLE_VOICE_RECORDING=true
```

---

## Database Setup

### Option 1: Docker Compose (Recommended for Development)

Start PostgreSQL and Redis containers:
```bash
# From project root
docker-compose up -d
```

Verify services are running:
```bash
docker-compose ps
```

Expected output:
```
NAME                IMAGE                COMMAND                  STATUS              PORTS
zynk-postgres       postgres:16-alpine   "docker-entrypoint.s…"   Up 5 seconds        0.0.0.0:5432->5432/tcp
zynk-redis          redis:7-alpine       "docker-entrypoint.s…"   Up 5 seconds        0.0.0.0:6379->6379/tcp
```

---

### Option 2: Manual Installation

#### Install PostgreSQL
**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-16
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS (Homebrew):**
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Windows:**
Download installer from [postgresql.org](https://www.postgresql.org/download/windows/)

#### Create Database and User
```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE zynk;
CREATE USER zynk WITH PASSWORD 'apple';
GRANT ALL PRIVILEGES ON DATABASE zynk TO zynk;
\c zynk
GRANT ALL ON SCHEMA public TO zynk;
\q
```

#### Install Redis
**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Windows:**
Download from [redis.io](https://redis.io/download/) or use WSL

---

### Database Migrations

#### Generate Prisma Client
```bash
cd server
npx prisma generate
```

#### Run Migrations
```bash
npx prisma migrate dev
```

This will:
1. Create all database tables
2. Apply indexes and constraints
3. Generate TypeScript types

#### Seed Database (Optional)
```bash
npx tsx prisma/seed.ts
```

Creates sample users and data for testing.

---

## Running the Application

### Development Mode

#### Terminal 1: Start Backend
```bash
cd server
npm run dev
```

Output:
```
╔══════════════════════════════════════════════╗
║                                              ║
║    🔐 Zynk Server running on port 8000       ║
║    📡 WebSocket ready                        ║
║    🌐 API: http://localhost:8000/api/v1      ║
║    ❤️  Health: http://localhost:8000/api/health║
║    🛡️  CORS Allowed: http://localhost:3000   ║
║                                              ║
╚══════════════════════════════════════════════╝
```

#### Terminal 2: Start Frontend
```bash
cd web
npm run dev
```

Output:
```
   ▲ Next.js 14.1.0
   - Local:        http://localhost:3000
   - Experiments (use with caution):
     · typedRoutes

 ✓ Ready in 2.3s
```

#### Access Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/api/v1
- **Health Check**: http://localhost:8000/api/health
- **Prisma Studio** (optional): `npx prisma studio` (http://localhost:5555)

---

### Production Build

#### Build Backend
```bash
cd server
npm run build
```

Creates compiled JavaScript in `dist/` directory.

#### Build Frontend
```bash
cd web
npm run build
```

Creates optimized production build in `.next/` directory.

#### Run Production Server
```bash
# Backend
cd server
npm run start:prod

# Frontend
cd web
npm run start
```

---

## Production Deployment

### Infrastructure Requirements

#### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **OS**: Ubuntu 22.04 LTS or similar

#### Recommended for 1000+ users
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 50GB+ SSD
- **Load Balancer**: Nginx or AWS ALB
- **CDN**: CloudFlare or AWS CloudFront for static assets

---

### Deployment Steps

#### 1. Server Setup (Ubuntu 22.04)
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL 16
sudo apt install -y postgresql-16

# Install Redis
sudo apt install -y redis-server

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install Git
sudo apt install -y git

# Install PM2 (process manager)
sudo npm install -g pm2
```

---

#### 2. Clone and Build Application
```bash
# Create app directory
sudo mkdir -p /var/www/zynk
sudo chown $USER:$USER /var/www/zynk
cd /var/www/zynk

# Clone repository
git clone https://github.com/your-org/zynk.git .

# Install dependencies and build
cd server
npm ci --production
npm run build

cd ../web
npm ci --production
npm run build
```

---

#### 3. Configure Environment
```bash
# Create production .env files
nano /var/www/zynk/server/.env
nano /var/www/zynk/web/.env.local
```

**CRITICAL**: Use strong, randomly generated secrets in production.

Generate secrets:
```bash
# Generate 64-character random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

#### 4. Setup PM2 Process Manager
```bash
# Start backend
cd /var/www/zynk/server
pm2 start dist/index.js --name zynk-server

# Start frontend
cd /var/www/zynk/web
pm2 start npm --name zynk-web -- start

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the generated command
```

---

#### 5. Configure Nginx Reverse Proxy

Create `/etc/nginx/sites-available/zynk`:
```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/zynk /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

#### 6. Setup SSL with Let's Encrypt
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificates
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

---

### Database Backups

#### Setup Automated Backups
Create `/usr/local/bin/backup-zynk-db.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/zynk"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="zynk_backup_$DATE.sql.gz"

mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U zynk -h localhost zynk | gzip > "$BACKUP_DIR/$FILENAME"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "zynk_backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $FILENAME"
```

Make executable and schedule:
```bash
chmod +x /usr/local/bin/backup-zynk-db.sh

# Add to crontab (daily at 2 AM)
sudo crontab -e
```

Add line:
```cron
0 2 * * * /usr/local/bin/backup-zynk-db.sh >> /var/log/zynk-backup.log 2>&1
```

---

## Docker Deployment

### Production Docker Compose
Create `docker-compose.prod.yml`:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: zynk-postgres-prod
    restart: always
    environment:
      POSTGRES_DB: zynk
      POSTGRES_USER: zynk
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - zynk-network

  redis:
    image: redis:7-alpine
    container_name: zynk-redis-prod
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - zynk-network

  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: zynk-server-prod
    restart: always
    depends_on:
      - postgres
      - redis
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://zynk:${DB_PASSWORD}@postgres:5432/zynk
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
    ports:
      - "8000:8000"
    volumes:
      - ./server/uploads:/app/uploads
    networks:
      - zynk-network

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    container_name: zynk-web-prod
    restart: always
    depends_on:
      - server
    environment:
      NEXT_PUBLIC_API_URL: https://api.yourdomain.com/api/v1
      NEXT_PUBLIC_WS_URL: wss://api.yourdomain.com
    ports:
      - "3000:3000"
    networks:
      - zynk-network

volumes:
  postgres_data:
  redis_data:

networks:
  zynk-network:
    driver: bridge
```

#### Backend Dockerfile
Create `server/Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
RUN npx prisma generate
EXPOSE 8000
CMD ["npm", "run", "start:prod"]
```

#### Frontend Dockerfile
Create `web/Dockerfile`:
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

#### Run Docker Compose
```bash
# Create .env file with secrets
nano .env

# Start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Run migrations
docker-compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

---

## Monitoring & Logging

### PM2 Monitoring
```bash
# View all processes
pm2 list

# Monitor resources
pm2 monit

# View logs
pm2 logs zynk-server
pm2 logs zynk-web

# Flush logs
pm2 flush
```

### Application Logs
```bash
# Server logs
tail -f /var/www/zynk/server/logs/app.log

# Nginx access logs
tail -f /var/log/nginx/access.log

# Nginx error logs
tail -f /var/log/nginx/error.log
```

### Health Check Endpoint
```bash
curl http://localhost:8000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-11T10:00:00.000Z"
}
```

---

## Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U zynk -h localhost -d zynk

# View PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log
```

### Redis Connection Issues
```bash
# Check if Redis is running
sudo systemctl status redis-server

# Test connection
redis-cli ping
# Expected: PONG

# View Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

### Port Already in Use
```bash
# Find process using port 8000
sudo lsof -i :8000

# Kill process
sudo kill -9 <PID>
```

### WebSocket Connection Fails
- Check if CORS origin is correctly configured
- Verify firewall allows WebSocket connections
- Ensure Nginx proxy_set_header Upgrade is configured
- Check browser console for errors

### File Upload Fails
```bash
# Check upload directory permissions
ls -la /var/www/zynk/server/uploads

# Fix permissions
sudo chown -R www-data:www-data /var/www/zynk/server/uploads
sudo chmod -R 755 /var/www/zynk/server/uploads
```

---

## Next Steps

For configuration details, see:
- [Configuration Guide](./08-Configuration-Guide.md) - Detailed environment variable reference
- [Database Schema](./03-Database-Schema.md) - Database structure and migrations
- [Backend API Reference](./02-Backend-API-Reference.md) - API endpoints
