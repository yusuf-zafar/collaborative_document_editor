const Redis = require('ioredis');
require('dotenv').config();

// Create Redis client with flexible configuration
function createRedisClient() {
    const { REDIS_URL, REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_TLS } = process.env;

    try {
        if (REDIS_URL) {
            // Parse URL and decide whether to use TLS based on protocol or explicit flag
            const parsedUrl = new URL(REDIS_URL);
            const useTls = parsedUrl.protocol === 'rediss:' || String(REDIS_TLS).toLowerCase() === 'true';

            return new Redis({
                host: parsedUrl.hostname,
                port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 6379,
                password: parsedUrl.password,
                // Username is optional and only used when provided in URL
                username: parsedUrl.username,
                tls: useTls ? { rejectUnauthorized: false } : undefined,
                connectTimeout: 30000,
                // Do not fail requests permanently; let higher-level code handle absence gracefully
                maxRetriesPerRequest: 1,
                retryStrategy(times) {
                    const delay = Math.min(times * 500, 5000);
                    return delay;
                },
                reconnectOnError(err) {
                    console.log('Reconnecting due to error:', err.message);
                    return true;
                }
            });
        }

        // Fallback to host/port configuration (no TLS by default)
        return new Redis({
            host: REDIS_HOST,
            port: REDIS_PORT ? parseInt(REDIS_PORT, 10) : 6379,
            password: REDIS_PASSWORD,
            connectTimeout: 30000,
            maxRetriesPerRequest: 1,
            retryStrategy(times) {
                const delay = Math.min(times * 500, 5000);
                return delay;
            },
            reconnectOnError(err) {
                console.log('Reconnecting due to error:', err.message);
                return true;
            }
        });
    } catch (error) {
        console.error('Failed to configure Redis client:', error.message);
        // Create a client pointing to localhost without TLS as a last resort
        return new Redis({ host: '127.0.0.1', port: 6379, maxRetriesPerRequest: 1 });
    }
}

const redisClient = createRedisClient();

// Event listeners
redisClient.on('connect', () => {
    console.log('🔴 Redis: Connected');
});

redisClient.on('ready', () => {
    console.log('🔴 Redis: Ready');
});

redisClient.on('error', (err) => {
    console.error('❌ Redis: Error:', err.message);
});

redisClient.on('reconnecting', () => {
    console.log('🔄 Redis: Reconnecting...');
});

// Helper functions
const redisHelpers = {
    // Presence management
    addUserToDocument: async (documentId, userId, username) => {
        const key = `presence:doc:${documentId}`;
        
        // First, remove any existing user with the same userId OR same username
        const existingMembers = await redisClient.hgetall(key);
        for (const [existingUserId, userData] of Object.entries(existingMembers)) {
            const user = JSON.parse(userData);
            if (user.userId === userId || user.username === username) {
                await redisClient.hdel(key, existingUserId);
            }
        }
        
        // Add the new user
        await redisClient.hset(key, userId, JSON.stringify({ userId, username, joinedAt: new Date().toISOString() }));
        await redisClient.expire(key, 3600); // 1 hour TTL
    },

    removeUserFromDocument: async (documentId, userId) => {
        const key = `presence:doc:${documentId}`;
        await redisClient.hdel(key, userId);
    },

    getDocumentPresence: async (documentId) => {
        const key = `presence:doc:${documentId}`;
        const members = await redisClient.hgetall(key);
        return Object.values(members).map(member => JSON.parse(member));
    },

    // Cursor management
    setUserCursor: async (documentId, userId, cursorData) => {
        const key = `cursor:doc:${documentId}:${userId}`;
        await redisClient.setex(key, 300, JSON.stringify(cursorData));
    },

    getUserCursor: async (documentId, userId) => {
        const key = `cursor:doc:${documentId}:${userId}`;
        const cursor = await redisClient.get(key);
        return cursor ? JSON.parse(cursor) : null;
    },

    getAllCursors: async (documentId) => {
        const pattern = `cursor:doc:${documentId}:*`;
        const keys = await redisClient.keys(pattern);
        const cursors = {};
        
        for (const key of keys) {
            const cursor = await redisClient.get(key);
            if (cursor) {
                const userId = key.split(':').pop();
                cursors[userId] = JSON.parse(cursor);
            }
        }
        
        return cursors;
    },

    // Document caching
    cacheDocument: async (documentId, content) => {
        const key = `doc:${documentId}`;
        await redisClient.setex(key, 3600, JSON.stringify(content));
    },

    getCachedDocument: async (documentId) => {
        const key = `doc:${documentId}`;
        const cached = await redisClient.get(key);
        return cached ? JSON.parse(cached) : null;
    },

    invalidateDocumentCache: async (documentId) => {
        const key = `doc:${documentId}`;
        await redisClient.del(key);
    },

    // Global active users
    addActiveUser: async (userId, username) => {
        const key = 'active:users';
        
        // First, remove any existing user with the same userId
        const members = await redisClient.smembers(key);
        for (const member of members) {
            const user = JSON.parse(member);
            if (user.userId === userId) {
                await redisClient.srem(key, member);
            }
        }
        
        // Add the new user
        await redisClient.sadd(key, JSON.stringify({ userId, username, lastSeen: new Date().toISOString() }));
    },

    removeActiveUser: async (userId) => {
        const key = 'active:users';
        const members = await redisClient.smembers(key);
        for (const member of members) {
            const user = JSON.parse(member);
            if (user.userId === userId) {
                await redisClient.srem(key, member);
                break;
            }
        }
    },

    getActiveUsers: async () => {
        const key = 'active:users';
        const members = await redisClient.smembers(key);
        return members.map(member => JSON.parse(member));
    },

    // Chat typing indicators
    setTypingIndicator: async (documentId, userId, username, isTyping) => {
        const key = `typing:doc:${documentId}`;
        if (isTyping) {
            await redisClient.hset(key, userId, JSON.stringify({ username, timestamp: Date.now() }));
            await redisClient.expire(key, 30);
        } else {
            await redisClient.hdel(key, userId);
        }
    },

    getTypingIndicators: async (documentId) => {
        const key = `typing:doc:${documentId}`;
        const indicators = await redisClient.hgetall(key);
        const result = [];
        
        for (const [userId, data] of Object.entries(indicators)) {
            const parsed = JSON.parse(data);
            if (Date.now() - parsed.timestamp < 10000) {
                result.push({ userId, username: parsed.username });
            }
        }
        
        return result;
    }
};

// Export a healthcheck function
const checkRedisHealth = async () => {
    try {
        await redisClient.ping();
        return true;
    } catch (error) {
        console.error('Redis health check failed:', error.message);
        return false;
    }
};

module.exports = {
    redis: redisClient,
    checkRedisHealth,
    ...redisHelpers
};