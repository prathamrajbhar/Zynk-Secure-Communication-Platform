# Zynk

Zynk is a secure communication platform featuring a web interface, a mobile application, and a robust backend.

## Project Structure

- **`server/`**: Node.js/TypeScript backend API.
- **`web/`**: Next.js frontend application.
- **`mobile/`**: Flutter mobile application.
- **`docker-compose.yml`**: Infrastructure setup (PostgreSQL, Redis).

## Prerequisites

Ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- [Flutter SDK](https://docs.flutter.dev/get-started/install) (for mobile development)
- [NPM](https://www.npmjs.com/) or [Yarn](https://yarnpkg.com/)

---

## Getting Started

### 1. Infrastructure Setup

Start the database and cache services using Docker:

```bash
docker-compose up -d
```

### 2. Backend Setup (Server)

Navigate to the server directory, install dependencies, and start the development server:

```bash
cd server
npm install
# Copy .env.example to .env and configure it
cp .env.example .env
# Run migrations and seed data (optional)
npm run migrate
npm run seed
# Start the server
npm run dev
```
The server will be running at `http://localhost:8000`.

### 3. Frontend Setup (Web)

Navigate to the web directory, install dependencies, and start the development server:

```bash
cd web
npm install
npm run dev
```
The application will be available at `http://localhost:3000`.

### 4. Mobile Setup (Flutter)

Navigate to the mobile directory, fetch dependencies, and run the app:

```bash
cd mobile
flutter pub get
flutter run
```

---

## Environment Variables

The project uses `.env` files for configuration.
- Check `server/.env.example` for backend configurations.
- Check `web/.env.local` for frontend configurations.

## Documentation

For more detailed information, please refer to the `docs/` folder.
