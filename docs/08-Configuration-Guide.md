# Configuration Guide

Complete reference for all configuration options in the Zynk platform.

## Table of Contents
- [Server Configuration](#server-configuration)
- [Web Configuration](#web-configuration)
- [Database Configuration](#database-configuration)
- [Redis Configuration](#redis-configuration)
- [Security Configuration](#security-configuration)
- [File Upload Configuration](#file-upload-configuration)
- [WebRTC Configuration](#webrtc-configuration)
- [Call Configuration](#call-configuration)
- [Rate Limiting](#rate-limiting)
- [CORS Configuration](#cors-configuration)
- [Logging Configuration](#logging-configuration)
- [Docker Configuration](#docker-configuration)

---

## Server Configuration

### Core Environment Variables

Located in `server/.env`:

#### `NODE_ENV`
- **Type**: `string`
- **Default**: `development`
- **Options**: `development`, `production`, `test`
- **Description**: Runtime environment mode
- **Impact**: 
  - `development`: Verbose logging, CORS relaxed
  - `production`: Compressed responses, strict security
- **Example**: `NODE_ENV=production`

#### `PORT`
- **Type**: `number`
- **Default**: `8000`
- **Range**: `1024-65535`
- **Description**: HTTP server listening port
- **Example**: `PORT=8000`

---

## Database Configuration

### PostgreSQL Settings

#### `DATABASE_URL`
- **Type**: `string` (Prisma connection string)
- **Format**: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA`
- **Required**: ✅ Yes
- **Description**: Complete PostgreSQL connection string for Prisma
- **Example**: `postgresql://zynk:apple@localhost:5432/zynk?schema=public`
- **Components**:
  - **Protocol**: `postgresql://`
  - **User**: Database user name
  - **Password**: Database password
  - **Host**: Database server hostname/IP
  - **Port**: Database server port (default 5432)
  - **Database**: Database name
  - **Schema**: PostgreSQL schema (default `public`)

#### `DB_HOST`
- **Type**: `string`
- **Default**: `localhost`
- **Description**: PostgreSQL server hostname
- **Example**: `DB_HOST=db.example.com`

#### `DB_PORT`
- **Type**: `number`
- **Default**: `5432`
- **Description**: PostgreSQL server port
- **Example**: `DB_PORT=5432`

#### `DB_NAME`
- **Type**: `string`
- **Default**: `zynk`
- **Description**: Database name
- **Example**: `DB_NAME=zynk`

#### `DB_USER`
- **Type**: `string`
- **Default**: `zynk`
- **Description**: Database username
- **Example**: `DB_USER=zynk`

#### `DB_PASSWORD`
- **Type**: `string`
- **Default**: `apple`
- **Security**: 🔐 **CRITICAL - Change in production!**
- **Description**: Database password
- **Example**: `DB_PASSWORD=strong_random_password_here`

### Database Connection Pool
Configured in Prisma schema:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Default pool settings (can be overridden in connection string):
- **Connection timeout**: 20s
- **Pool timeout**: 10s
- **Max connections**: 10
- **Min connections**: 2

Override example:
```
postgresql://zynk:password@localhost:5432/zynk?connection_limit=20&pool_timeout=30
```

---

## Redis Configuration

### Connection Settings

#### `REDIS_URL`
- **Type**: `string`
- **Format**: `redis://[username][:password]@[host][:port][/database]`
- **Required**: ✅ Yes
- **Description**: Redis connection string
- **Examples**:
  - **Local**: `redis://localhost:6379`
  - **With password**: `redis://:password@localhost:6379`
  - **Specific DB**: `redis://localhost:6379/1`
  - **Remote**: `redis://username:password@redis.example.com:6379`

### Redis Usage in Zynk
- **User presence tracking**: Online/offline status
- **Typing indicators**: Temporary states (TTL: 5s)
- **Session caching**: JWT validation cache
- **Rate limiting**: Request counting per IP/user
- **Active call tracking**: Current call states

### Redis Key Patterns
```
user:presence:{userId}      # Online status (TTL: 30s)
typing:{conversationId}     # Typing users list (TTL: 5s)
session:{sessionId}         # Session validation cache (TTL: 15min)
ratelimit:{ip}:{endpoint}   # Rate limit counter (TTL: 15min)
call:active:{callId}        # Active call participants
```

---

## Security Configuration

### JWT Configuration

#### `JWT_SECRET`
- **Type**: `string`
- **Minimum Length**: 32 characters
- **Security**: 🔐 **CRITICAL - Must be random and secure!**
- **Description**: Secret key for signing access tokens
- **Example**: `JWT_SECRET=your-super-secret-jwt-key-change-this-min-32-chars`
- **Generation**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

#### `JWT_REFRESH_SECRET`
- **Type**: `string`
- **Minimum Length**: 32 characters
- **Security**: 🔐 **CRITICAL - Must be different from JWT_SECRET!**
- **Description**: Secret key for signing refresh tokens
- **Example**: `JWT_REFRESH_SECRET=different-secret-for-refresh-tokens-min-32-chars`

#### `JWT_EXPIRES_IN`
- **Type**: `string` (time span)
- **Default**: `15m`
- **Format**: Zeit/ms format (`60s`, `5m`, `2h`, `7d`)
- **Recommended**: `15m` - `1h`
- **Description**: Access token expiration time
- **Examples**:
  - `15m` = 15 minutes
  - `1h` = 1 hour
  - `30s` = 30 seconds

#### `JWT_REFRESH_EXPIRES_IN`
- **Type**: `string` (time span)
- **Default**: `7d`
- **Recommended**: `7d` - `30d`
- **Description**: Refresh token expiration time
- **Examples**:
  - `7d` = 7 days
  - `30d` = 30 days

### Password Hashing

#### `BCRYPT_ROUNDS`
- **Type**: `number`
- **Default**: `12`
- **Range**: `10-14`
- **Description**: Bcrypt salt rounds for password hashing
- **Impact**:
  - Higher = More secure but slower
  - Lower = Faster but less secure
- **Recommendations**:
  - Development: `10`
  - Production: `12`
  - High-security: `14`
- **Example**: `BCRYPT_ROUNDS=12`

#### `MIN_PASSWORD_LENGTH`
- **Type**: `number`
- **Default**: `8`
- **Range**: `8-128`
- **Description**: Minimum password length for new accounts
- **Example**: `MIN_PASSWORD_LENGTH=8`

### Device & Session Management

#### `MAX_DEVICES`
- **Type**: `number`
- **Default**: `5`
- **Range**: `1-20`
- **Description**: Maximum concurrent devices per user
- **Behavior**: When exceeded, oldest device is logged out
- **Example**: `MAX_DEVICES=5`

#### `SESSION_EXPIRY_MS`
- **Type**: `number` (milliseconds)
- **Default**: `900000` (15 minutes)
- **Description**: Session validity duration
- **Examples**:
  - `900000` = 15 minutes
  - `3600000` = 1 hour
- **Example**: `SESSION_EXPIRY_MS=900000`

#### `REFRESH_EXPIRY_MS`
- **Type**: `number` (milliseconds)
- **Default**: `604800000` (7 days)
- **Description**: Refresh token validity duration
- **Examples**:
  - `604800000` = 7 days
  - `2592000000` = 30 days
- **Example**: `REFRESH_EXPIRY_MS=604800000`

---

## File Upload Configuration

### Upload Settings

#### `UPLOAD_DIR`
- **Type**: `string` (path)
- **Default**: `./uploads`
- **Description**: Directory for uploaded files
- **Structure**:
  ```
  uploads/
    ├── thumbnails/     # Image thumbnails
    ├── images/         # Full images
    ├── videos/         # Video files
    ├── documents/      # PDFs, docs
    └── audio/          # Audio files
  ```
- **Permissions**: Must be writable by server process
- **Example**: `UPLOAD_DIR=/var/www/zynk/uploads`

#### `MAX_FILE_SIZE`
- **Type**: `number` (bytes)
- **Default**: `52428800` (50MB)
- **Description**: Maximum allowed file upload size
- **Size Conversions**:
  - `5242880` = 5MB
  - `10485760` = 10MB
  - `52428800` = 50MB
  - `104857600` = 100MB
- **Example**: `MAX_FILE_SIZE=52428800`

### Supported File Types

Configured in server logic:

**Images**:
- Formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Max size: As per `MAX_FILE_SIZE`

**Videos**:
- Formats: `.mp4`, `.webm`, `.mov`
- Max size: As per `MAX_FILE_SIZE`

**Documents**:
- Formats: `.pdf`, `.doc`, `.docx`, `.txt`
- Max size: As per `MAX_FILE_SIZE`

**Audio**:
- Formats: `.mp3`, `.wav`, `.ogg`, `.m4a`
- Max size: As per `MAX_FILE_SIZE`

---

## WebRTC Configuration

### STUN/TURN Servers

#### `STUN_URLS`
- **Type**: `string` (comma-separated list)
- **Default**: `stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302`
- **Description**: STUN server URLs for NAT traversal
- **Format**: `stun:<host>:<port>`
- **Free STUN Servers**:
  - Google: `stun:stun.l.google.com:19302`
  - Google: `stun:stun1.l.google.com:19302`
  - Google: `stun:stun2.l.google.com:19302`
  - Twilio: `stun:global.stun.twilio.com:3478`
- **Example**:
  ```
  STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
  ```

#### `TURN_URLS`
- **Type**: `string` (comma-separated list)
- **Default**: (empty)
- **Description**: TURN server URLs for relay connections
- **Format**: `turn:<host>:<port>`
- **Required for**: Corporate networks, symmetric NAT
- **Example**:
  ```
  TURN_URLS=turn:turn.example.com:3478,turn:turn2.example.com:3478
  ```

#### `TURN_USERNAME`
- **Type**: `string`
- **Default**: (empty)
- **Description**: Username for TURN server authentication
- **Example**: `TURN_USERNAME=zynk_turn_user`

#### `TURN_CREDENTIAL`
- **Type**: `string`
- **Security**: 🔐 TURN server password
- **Default**: (empty)
- **Description**: Password/credential for TURN server
- **Example**: `TURN_CREDENTIAL=turn_password_here`

### TURN Server Setup (Optional)

For self-hosted TURN server using Coturn:
```bash
# Install Coturn
sudo apt install coturn

# Configure /etc/turnserver.conf
listening-port=3478
fingerprint
use-auth-secret
static-auth-secret=your-secret-here
realm=turn.yourdomain.com
total-quota=100
stale-nonce=600
```

---

## Call Configuration

### Call Timing

#### `CALL_RING_TIMEOUT_MS`
- **Type**: `number` (milliseconds)
- **Default**: `30000` (30 seconds)
- **Range**: `10000-60000`
- **Description**: How long call rings before auto-reject
- **Examples**:
  - `10000` = 10 seconds
  - `30000` = 30 seconds
  - `60000` = 1 minute
- **Example**: `CALL_RING_TIMEOUT_MS=30000`

#### `CALL_MAX_DURATION_SECS`
- **Type**: `number` (seconds)
- **Default**: `3600` (1 hour)
- **Range**: `300-7200`
- **Description**: Maximum call duration before auto-disconnect
- **Examples**:
  - `300` = 5 minutes
  - `1800` = 30 minutes
  - `3600` = 1 hour
  - `7200` = 2 hours
- **Example**: `CALL_MAX_DURATION_SECS=3600`

---

## Rate Limiting

### General Rate Limits

#### `RATE_LIMIT_WINDOW_MS`
- **Type**: `number` (milliseconds)
- **Default**: `900000` (15 minutes)
- **Description**: Time window for rate limit counting
- **Example**: `RATE_LIMIT_WINDOW_MS=900000`

#### `RATE_LIMIT_MAX`
- **Type**: `number`
- **Default**: `100`
- **Description**: Maximum requests per window
- **Example**: `RATE_LIMIT_MAX=100`

### Authentication Rate Limits

#### `AUTH_RATE_LIMIT_MAX_LOGIN`
- **Type**: `number`
- **Default**: `5`
- **Description**: Maximum login attempts per window
- **Purpose**: Prevent brute force attacks
- **Example**: `AUTH_RATE_LIMIT_MAX_LOGIN=5`

#### `AUTH_RATE_LIMIT_MAX_REGISTER`
- **Type**: `number`
- **Default**: `3`
- **Description**: Maximum registration attempts per window
- **Purpose**: Prevent spam account creation
- **Example**: `AUTH_RATE_LIMIT_MAX_REGISTER=3`

### HTTP 429 Response
When rate limit exceeded:
```json
{
  "error": "Too many requests, please try again later."
}
```

---

## CORS Configuration

### `CORS_ORIGIN`
- **Type**: `string` or `string[]` (comma-separated)
- **Default**: `http://localhost:3000`
- **Description**: Allowed CORS origins
- **Examples**:
  - Single: `CORS_ORIGIN=http://localhost:3000`
  - Multiple: `CORS_ORIGIN=https://app.example.com,https://www.example.com`
  - All (dev only): `CORS_ORIGIN=*`
- **Production**: Must be specific domains (never use `*`)
- **Example**:
  ```
  CORS_ORIGIN=https://zynk.app,https://www.zynk.app
  ```

### CORS Headers Set by Server
```javascript
{
  origin: process.env.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
```

---

## Logging Configuration

### Morgan HTTP Logger

#### `MORGAN_MODE`
- **Type**: `string`
- **Default**: `dev`
- **Options**:
  - `dev`: Colored status output
  - `combined`: Apache combined log format
  - `common`: Apache common log format
  - `short`: Shorter than default
  - `tiny`: Minimal output
- **Example**: `MORGAN_MODE=combined`

### Log Formats

**dev** (recommended for development):
```
GET /api/v1/users/me 200 12.345 ms - 245
```

**combined** (recommended for production):
```
::1 - - [11/Feb/2026:10:00:00 +0000] "GET /api/v1/users/me HTTP/1.1" 200 245 "-" "Mozilla/5.0..."
```

---

## Web Configuration

### Frontend Environment Variables

Located in `web/.env.local`:

#### `NEXT_PUBLIC_API_URL`
- **Type**: `string` (URL)
- **Required**: ✅ Yes
- **Description**: Backend API base URL
- **Format**: `http(s)://domain:port/api/v1`
- **Examples**:
  - Development: `http://localhost:8000/api/v1`
  - Production: `https://api.zynk.app/api/v1`
- **Example**: `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`

#### `NEXT_PUBLIC_WS_URL`
- **Type**: `string` (URL)
- **Required**: ✅ Yes
- **Description**: WebSocket server URL
- **Format**: `ws(s)://domain:port` or `http(s)://domain:port`
- **Examples**:
  - Development: `http://localhost:8000`
  - Production: `https://api.zynk.app` or `wss://api.zynk.app`
- **Note**: Socket.IO can use HTTP(S) and upgrade to WebSocket
- **Example**: `NEXT_PUBLIC_WS_URL=http://localhost:8000`

### WebSocket Configuration

#### `NEXT_PUBLIC_WS_RECONNECTION_ATTEMPTS`
- **Type**: `number`
- **Default**: `15`
- **Description**: Maximum WebSocket reconnection attempts
- **Example**: `NEXT_PUBLIC_WS_RECONNECTION_ATTEMPTS=15`

#### `NEXT_PUBLIC_WS_RECONNECTION_DELAY`
- **Type**: `number` (milliseconds)
- **Default**: `1000`
- **Description**: Delay between reconnection attempts
- **Example**: `NEXT_PUBLIC_WS_RECONNECTION_DELAY=1000`

### Feature Flags

#### `NEXT_PUBLIC_ENABLE_GIPHY`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable GIF picker feature
- **Example**: `NEXT_PUBLIC_ENABLE_GIPHY=true`

#### `NEXT_PUBLIC_ENABLE_VOICE_RECORDING`
- **Type**: `boolean`
- **Default**: `true`
- **Description**: Enable/disable voice message recording
- **Example**: `NEXT_PUBLIC_ENABLE_VOICE_RECORDING=true`

---

## Docker Configuration

### Docker Compose Environment

Located in `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_NAME:-zynk}
      POSTGRES_USER: ${DB_USER:-zynk}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-apple}
    ports:
      - "${DB_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
```

### Docker Environment File

Create `.env` in project root:
```env
# Database
DB_NAME=zynk
DB_USER=zynk
DB_PASSWORD=apple
DB_PORT=5432

# Redis
REDIS_PORT=6379
```

---

## Configuration Best Practices

### Security Checklist
- ✅ Change all default passwords
- ✅ Use strong random JWT secrets (min 32 chars)
- ✅ Enable HTTPS in production
- ✅ Set specific CORS origins (no wildcards)
- ✅ Use environment-specific `.env` files
- ✅ Never commit `.env` files to Git
- ✅ Rotate secrets regularly
- ✅ Use secure TURN servers for production calls

### Performance Tuning
- Database connection pool size based on concurrent users
- Redis memory limit based on active users
- Rate limits adjusted for expected traffic
- File upload size limits based on storage capacity

### Environment-Specific Configurations

**Development**:
- Verbose logging (`MORGAN_MODE=dev`)
- Lower bcrypt rounds (`BCRYPT_ROUNDS=10`)
- Relaxed rate limits
- Local CORS (`http://localhost:3000`)

**Production**:
- Compressed logging (`MORGAN_MODE=combined`)
- Higher bcrypt rounds (`BCRYPT_ROUNDS=12`)
- Strict rate limits
- Specific CORS domains
- HTTPS only
- Strong JWT secrets
- TURN servers configured

---

## Configuration Validation

### Startup Checks

The server validates critical configuration on startup:

```typescript
// Example validation
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required');
}
```

### Health Check
```bash
curl http://localhost:8000/api/health
```

Verifies:
- Server is running
- Database connection
- Redis connection

---

## Troubleshooting Configuration Issues

### "JWT_SECRET not defined"
**Solution**: Set `JWT_SECRET` in `server/.env`

### "Database connection failed"
**Solution**: 
1. Check `DATABASE_URL` format
2. Verify PostgreSQL is running
3. Test connection: `psql $DATABASE_URL`

### "Redis connection refused"
**Solution**:
1. Check `REDIS_URL` format
2. Verify Redis is running: `redis-cli ping`

### "CORS error in browser"
**Solution**:
1. Add frontend URL to `CORS_ORIGIN`
2. Ensure credentials: true in CORS config
3. Check browser URL matches CORS entry exactly

### "File upload fails"
**Solution**:
1. Check `UPLOAD_DIR` exists and is writable
2. Verify file size under `MAX_FILE_SIZE`
3. Check file type is allowed

---

## Next Steps

For deployment instructions, see:
- [Setup and Deployment Guide](./07-Setup-and-Deployment.md)
- [Backend API Reference](./02-Backend-API-Reference.md)
