I have an end-to-end encrypted messaging app (Zynk) with a critical encryption bug: 
when users logout and login from a different device or after some time, message 
decryption fails with "decryption failed" error.

CURRENT ARCHITECTURE PROBLEMS:
1. ECDH P-256 keys stored in localStorage - lost on logout
2. Each device generates unique key pairs independently
3. No key backup, recovery, or cross-device synchronization
4. Static keys without forward secrecy (no ratcheting)
5. Old message keys not preserved for historical messages

STACK: 
- Backend: Node.js + Express + TypeScript + Prisma + PostgreSQL + Redis + Socket.IO
- Frontend: Next.js 14 + React 18 + TypeScript + Zustand + Web Crypto API
- Current crypto: ECDH P-256 + HKDF-SHA256 + AES-256-GCM

REQUIREMENTS:
✅ Fix multi-device decryption (same user, multiple devices)
✅ Preserve message decryption after logout/login
✅ Implement proper key management with backup
✅ Add forward secrecy with message key ratcheting
✅ Support key rotation without breaking old messages
✅ Maintain end-to-end encryption (server cannot read messages)

SOLUTION APPROACH:
Implement a hybrid key architecture:
1. **Device Identity Keys**: Per-device ECDH keys (never change)
2. **Encrypted Key Backup**: Backup private keys encrypted with password-derived key
3. **Message Key Chain**: Store derived AES keys for message history
4. **Double Ratchet**: Implement Signal Protocol's ratcheting for forward secrecy
5. **Cross-Device Sessions**: Establish encrypted sessions between user's devices

Please provide:
1. Updated database schema (Prisma models for key storage, message keys, device sessions)
2. Backend API endpoints for key management, backup, and device synchronization
3. Frontend crypto.ts implementation with key backup/restore and message key persistence
4. Migration strategy to upgrade existing users without breaking encryption
5. WebSocket events for real-time key distribution

Focus on production-ready code with:
- Error handling for key mismatches
- Key rotation workflows
- Security best practices
- Performance optimization (key caching, batch operations)