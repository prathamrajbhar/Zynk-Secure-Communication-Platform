import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Production-optimized connection pool configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Connection pool settings for production
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),        // Max connections
    min: parseInt(process.env.DB_POOL_MIN || '5', 10),          // Min idle connections
    idleTimeoutMillis: 30000,                                   // Close idle connections after 30s
    connectionTimeoutMillis: 5000,                              // Connection acquisition timeout
    allowExitOnIdle: false,                                     // Keep pool alive
});

// Log pool events in development
if (process.env.NODE_ENV !== 'production') {
    pool.on('error', (err) => {
        console.error('PG Pool Error:', err.message);
    });
}

const prismaClientSingleton = (): PrismaClient => {
    const adapter = new PrismaPg(pool);
    const client = new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development'
            ? [
                { emit: 'event', level: 'query' },
                { emit: 'stdout', level: 'error' },
                { emit: 'stdout', level: 'warn' },
            ]
            : ['error'],
    });

    // Slow query logging in development (queries > 100ms)
    if (process.env.NODE_ENV === 'development') {
        (client as any).$on('query', (e: any) => {
            if (e.duration > 100) {
                console.warn(`🐢 Slow query (${e.duration}ms):`, e.query);
            }
        });
    }

    return client;
};

declare global {
    var prisma: undefined | PrismaClient;
}

const prisma: PrismaClient = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
