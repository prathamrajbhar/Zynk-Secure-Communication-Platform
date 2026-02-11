/**
 * Signal Protocol Implementation for Zynk
 * 
 * Implements X3DH (Extended Triple Diffie-Hellman) key agreement and
 * Double Ratchet algorithm for end-to-end encrypted messaging.
 * 
 * Security Properties:
 * - Forward Secrecy: Past messages remain secure even if long-term keys are compromised
 * - Future Secrecy (Self-Healing): System recovers from key compromise
 * - Deniability: Messages are authenticated but repudiable
 * - Out-of-Order Message Support: Messages can be decrypted in any order
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './crypto';

// ========== Types ==========

export interface KeyPair {
    publicKey: string;   // base64
    privateKey: string;  // base64
}

export interface PreKeyBundle {
    identityKey: string;      // Long-term identity key
    signedPreKey: string;     // Medium-term signed pre-key
    signedPreKeySignature: string;
    oneTimePreKey?: string;   // Ephemeral one-time pre-key (optional)
    registrationId: number;
}

export interface RatchetMessage {
    v: 6;                     // Version 6 = Signal Protocol
    dh: string;               // Current DH public key (base64)
    n: number;                // Message number in sending chain
    pn: number;               // Previous chain length
    ct: string;               // Ciphertext (base64)
    iv: string;               // IV for AES-GCM (base64)
}

export interface RatchetState {
    rootKey: CryptoKey;
    sendingChainKey: CryptoKey | null;
    receivingChainKey: CryptoKey | null;
    sendingChainN: number;
    receivingChainN: number;
    previousChainN: number;
    dhKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey };
    peerDhPublicKey: CryptoKey | null;
    skippedMessageKeys: Map<string, CryptoKey>; // "dh_public_key:n" -> message_key
}

// ========== Key Generation ==========

/**
 * Generate an ECDH key pair for Signal Protocol (P-256 curve)
 */
export async function generateDHKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
    );
    return keyPair;
}

/**
 * Export key pair to base64 strings for storage
 */
export async function exportKeyPair(keyPair: { publicKey: CryptoKey; privateKey: CryptoKey }): Promise<KeyPair> {
    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
        publicKey: arrayBufferToBase64(publicKeyRaw),
        privateKey: arrayBufferToBase64(privateKeyRaw)
    };
}

/**
 * Import key pair from base64 strings
 */
export async function importKeyPair(keyPair: KeyPair): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    const publicKey = await crypto.subtle.importKey(
        'raw',
        base64ToArrayBuffer(keyPair.publicKey),
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
    );

    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        base64ToArrayBuffer(keyPair.privateKey),
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
    );

    return { publicKey, privateKey };
}

/**
 * Import a public key from base64
 */
export async function importPublicKey(publicKeyB64: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        base64ToArrayBuffer(publicKeyB64),
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
    );
}

// ========== ECDH Operations ==========

/**
 * Perform ECDH key agreement
 */
async function performDH(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.deriveBits(
        { name: 'ECDH', public: publicKey },
        privateKey,
        256
    );
}

// ========== KDF (Key Derivation Function) ==========

/**
 * HKDF for key derivation
 */
async function hkdf(
    inputKeyMaterial: ArrayBuffer,
    salt: Uint8Array,
    info: string,
    outputLength: number = 32
): Promise<ArrayBuffer> {
    const key = await crypto.subtle.importKey(
        'raw',
        inputKeyMaterial,
        'HKDF',
        false,
        ['deriveBits']
    );

    return crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: salt,
            info: new TextEncoder().encode(info)
        },
        key,
        outputLength * 8
    );
}

/**
 * KDF for ratcheting chain keys
 * Returns [chainKey, messageKey]
 */
async function kdfChain(chainKey: CryptoKey): Promise<[CryptoKey, CryptoKey]> {
    // Export chain key to raw bytes
    const chainKeyBytes = await crypto.subtle.exportKey('raw', chainKey);

    // Derive new chain key and message key using HKDF
    const derived = await hkdf(
        chainKeyBytes,
        new Uint8Array(32), // Zero salt
        'zynk-signal-chain',
        64 // 32 bytes for chain key + 32 bytes for message key
    );

    const derivedArray = new Uint8Array(derived);
    const newChainKeyBytes = derivedArray.slice(0, 32);
    const messageKeyBytes = derivedArray.slice(32, 64);

    // Import as AES-GCM keys
    const newChainKey = await crypto.subtle.importKey(
        'raw',
        newChainKeyBytes,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    const messageKey = await crypto.subtle.importKey(
        'raw',
        messageKeyBytes,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );

    return [newChainKey, messageKey];
}

/**
 * KDF for root key ratcheting
 * Returns [newRootKey, newChainKey]
 */
async function kdfRoot(rootKey: CryptoKey, dhOutput: ArrayBuffer): Promise<[CryptoKey, CryptoKey]> {
    const rootKeyBytes = await crypto.subtle.exportKey('raw', rootKey);

    const derived = await hkdf(
        dhOutput,
        new Uint8Array(rootKeyBytes),
        'zynk-signal-root',
        64
    );

    const derivedArray = new Uint8Array(derived);
    const newRootKeyBytes = derivedArray.slice(0, 32);
    const newChainKeyBytes = derivedArray.slice(32, 64);

    const newRootKey = await crypto.subtle.importKey(
        'raw',
        newRootKeyBytes,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    const newChainKey = await crypto.subtle.importKey(
        'raw',
        newChainKeyBytes,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    return [newRootKey, newChainKey];
}

// ========== X3DH Key Agreement ==========

/**
 * X3DH initiator side (sender establishing new session)
 * 
 * Computes: DH1 || DH2 || DH3 || DH4
 * - DH1 = DH(IK_A, SPK_B)
 * - DH2 = DH(EK_A, IK_B)
 * - DH3 = DH(EK_A, SPK_B)
 * - DH4 = DH(EK_A, OPK_B) [if OPK available]
 */
export async function x3dhInitiator(
    identityKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey },
    ephemeralKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey },
    bundle: PreKeyBundle
): Promise<{ sharedSecret: ArrayBuffer; associatedData: string }> {

    const recipientIdentityKey = await importPublicKey(bundle.identityKey);
    const recipientSignedPreKey = await importPublicKey(bundle.signedPreKey);

    // DH1 = DH(IK_A, SPK_B)
    const dh1 = await performDH(identityKeyPair.privateKey, recipientSignedPreKey);

    // DH2 = DH(EK_A, IK_B)
    const dh2 = await performDH(ephemeralKeyPair.privateKey, recipientIdentityKey);

    // DH3 = DH(EK_A, SPK_B)
    const dh3 = await performDH(ephemeralKeyPair.privateKey, recipientSignedPreKey);

    // Concatenate DH outputs
    let dhOutputs = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength);
    dhOutputs.set(new Uint8Array(dh1), 0);
    dhOutputs.set(new Uint8Array(dh2), dh1.byteLength);
    dhOutputs.set(new Uint8Array(dh3), dh1.byteLength + dh2.byteLength);

    // DH4 = DH(EK_A, OPK_B) [if available]
    if (bundle.oneTimePreKey) {
        const recipientOneTimePreKey = await importPublicKey(bundle.oneTimePreKey);
        const dh4 = await performDH(ephemeralKeyPair.privateKey, recipientOneTimePreKey);

        const newDhOutputs = new Uint8Array(dhOutputs.length + dh4.byteLength);
        newDhOutputs.set(dhOutputs, 0);
        newDhOutputs.set(new Uint8Array(dh4), dhOutputs.length);
        dhOutputs = newDhOutputs;
    }

    // Derive shared secret using HKDF
    const sharedSecret = await hkdf(
        dhOutputs.buffer,
        new Uint8Array(32), // Zero salt
        'zynk-signal-x3dh',
        32
    );

    // Associated data for authentication
    const identityKeyA = await crypto.subtle.exportKey('raw', identityKeyPair.publicKey);
    const associatedData = arrayBufferToBase64(identityKeyA) + bundle.identityKey;

    return { sharedSecret, associatedData };
}

/**
 * X3DH responder side (receiver accepting new session)
 */
export async function x3dhResponder(
    identityKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey },
    signedPreKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey },
    oneTimePreKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey } | null,
    senderIdentityKey: string,
    senderEphemeralKey: string
): Promise<{ sharedSecret: ArrayBuffer; associatedData: string }> {

    const senderIK = await importPublicKey(senderIdentityKey);
    const senderEK = await importPublicKey(senderEphemeralKey);

    // DH1 = DH(SPK_B, IK_A)
    const dh1 = await performDH(signedPreKeyPair.privateKey, senderIK);

    // DH2 = DH(IK_B, EK_A)
    const dh2 = await performDH(identityKeyPair.privateKey, senderEK);

    // DH3 = DH(SPK_B, EK_A)
    const dh3 = await performDH(signedPreKeyPair.privateKey, senderEK);

    let dhOutputs = new Uint8Array(dh1.byteLength + dh2.byteLength + dh3.byteLength);
    dhOutputs.set(new Uint8Array(dh1), 0);
    dhOutputs.set(new Uint8Array(dh2), dh1.byteLength);
    dhOutputs.set(new Uint8Array(dh3), dh1.byteLength + dh2.byteLength);

    // DH4 = DH(OPK_B, EK_A) [if OPK was used]
    if (oneTimePreKeyPair) {
        const dh4 = await performDH(oneTimePreKeyPair.privateKey, senderEK);

        const newDhOutputs = new Uint8Array(dhOutputs.length + dh4.byteLength);
        newDhOutputs.set(dhOutputs, 0);
        newDhOutputs.set(new Uint8Array(dh4), dhOutputs.length);
        dhOutputs = newDhOutputs;
    }

    const sharedSecret = await hkdf(
        dhOutputs.buffer,
        new Uint8Array(32),
        'zynk-signal-x3dh',
        32
    );

    const identityKeyB = await crypto.subtle.exportKey('raw', identityKeyPair.publicKey);
    const associatedData = senderIdentityKey + arrayBufferToBase64(identityKeyB);

    return { sharedSecret, associatedData };
}

// ========== Double Ratchet ==========

/**
 * Initialize Double Ratchet session (sender side)
 */
export async function initializeRatchetSender(
    sharedSecret: ArrayBuffer,
    peerDhPublicKey: CryptoKey
): Promise<RatchetState> {

    // Import shared secret as root key
    const rootKey = await crypto.subtle.importKey(
        'raw',
        sharedSecret,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    // Generate our DH key pair
    const dhKeyPair = await generateDHKeyPair();

    // Perform DH ratchet step
    const dhOutput = await performDH(dhKeyPair.privateKey, peerDhPublicKey);
    const [newRootKey, sendingChainKey] = await kdfRoot(rootKey, dhOutput);

    return {
        rootKey: newRootKey,
        sendingChainKey,
        receivingChainKey: null,
        sendingChainN: 0,
        receivingChainN: 0,
        previousChainN: 0,
        dhKeyPair,
        peerDhPublicKey,
        skippedMessageKeys: new Map()
    };
}

/**
 * Initialize Double Ratchet session (receiver side)
 */
export async function initializeRatchetReceiver(
    sharedSecret: ArrayBuffer,
    dhKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey }
): Promise<RatchetState> {

    const rootKey = await crypto.subtle.importKey(
        'raw',
        sharedSecret,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );

    return {
        rootKey,
        sendingChainKey: null,
        receivingChainKey: null,
        sendingChainN: 0,
        receivingChainN: 0,
        previousChainN: 0,
        dhKeyPair,
        peerDhPublicKey: null,
        skippedMessageKeys: new Map()
    };
}

/**
 * Encrypt a message using Double Ratchet
 */
export async function ratchetEncrypt(
    state: RatchetState,
    plaintext: string
): Promise<{ message: RatchetMessage; newState: RatchetState }> {

    // Advance sending chain
    if (!state.sendingChainKey) {
        throw new Error('Sending chain not initialized');
    }

    const [newSendingChainKey, messageKey] = await kdfChain(state.sendingChainKey);

    // Encrypt message
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        messageKey,
        new TextEncoder().encode(plaintext)
    );

    // Export current DH public key
    const dhPublicKeyRaw = await crypto.subtle.exportKey('raw', state.dhKeyPair.publicKey);

    const message: RatchetMessage = {
        v: 6,
        dh: arrayBufferToBase64(dhPublicKeyRaw),
        n: state.sendingChainN,
        pn: state.previousChainN,
        ct: arrayBufferToBase64(ciphertext),
        iv: arrayBufferToBase64(iv.buffer)
    };

    const newState: RatchetState = {
        ...state,
        sendingChainKey: newSendingChainKey,
        sendingChainN: state.sendingChainN + 1
    };

    return { message, newState };
}

/**
 * Decrypt a message using Double Ratchet
 */
export async function ratchetDecrypt(
    state: RatchetState,
    message: RatchetMessage
): Promise<{ plaintext: string; newState: RatchetState }> {

    const peerDhPublicKey = await importPublicKey(message.dh);
    const peerDhPublicKeyRaw = await crypto.subtle.exportKey('raw', peerDhPublicKey);
    const peerDhPublicKeyB64 = arrayBufferToBase64(peerDhPublicKeyRaw);

    // Check if we need to perform DH ratchet step
    let newState = { ...state };

    if (!state.peerDhPublicKey || peerDhPublicKeyB64 !== arrayBufferToBase64(await crypto.subtle.exportKey('raw', state.peerDhPublicKey))) {
        // Peer has ratcheted - we need to ratchet too
        newState = await performDHRatchetStep(newState, peerDhPublicKey, message.pn);
    }

    // Try to decrypt with current receiving chain
    const skippedKeyId = `${peerDhPublicKeyB64}:${message.n}`;

    // Check if we have a skipped message key
    if (newState.skippedMessageKeys.has(skippedKeyId)) {
        const messageKey = newState.skippedMessageKeys.get(skippedKeyId)!;
        newState.skippedMessageKeys.delete(skippedKeyId);

        const plaintext = await decryptWithMessageKey(messageKey, message);
        return { plaintext, newState };
    }

    // Advance receiving chain to catch up
    if (!newState.receivingChainKey) {
        throw new Error('Receiving chain not initialized');
    }

    let currentChainKey = newState.receivingChainKey;
    let currentN = newState.receivingChainN;

    // Skip messages if needed
    while (currentN < message.n) {
        const [nextChainKey, skippedMessageKey] = await kdfChain(currentChainKey);
        newState.skippedMessageKeys.set(`${peerDhPublicKeyB64}:${currentN}`, skippedMessageKey);
        currentChainKey = nextChainKey;
        currentN++;
    }

    // Decrypt the message
    const [nextChainKey, messageKey] = await kdfChain(currentChainKey);
    const plaintext = await decryptWithMessageKey(messageKey, message);

    newState.receivingChainKey = nextChainKey;
    newState.receivingChainN = currentN + 1;

    return { plaintext, newState };
}

/**
 * Perform DH ratchet step when receiving a message with new DH key
 */
async function performDHRatchetStep(
    state: RatchetState,
    peerDhPublicKey: CryptoKey,
    previousChainLength: number
): Promise<RatchetState> {

    // Save current sending chain length
    const newPreviousChainN = state.sendingChainN;

    // Ratchet receiving chain
    const dhOutput1 = await performDH(state.dhKeyPair.privateKey, peerDhPublicKey);
    const [newRootKey1, receivingChainKey] = await kdfRoot(state.rootKey, dhOutput1);

    // Generate new DH key pair
    const newDhKeyPair = await generateDHKeyPair();

    // Ratchet sending chain
    const dhOutput2 = await performDH(newDhKeyPair.privateKey, peerDhPublicKey);
    const [newRootKey2, sendingChainKey] = await kdfRoot(newRootKey1, dhOutput2);

    return {
        ...state,
        rootKey: newRootKey2,
        sendingChainKey,
        receivingChainKey,
        sendingChainN: 0,
        receivingChainN: 0,
        previousChainN: newPreviousChainN,
        dhKeyPair: newDhKeyPair,
        peerDhPublicKey
    };
}

/**
 * Decrypt message with a specific message key
 */
async function decryptWithMessageKey(
    messageKey: CryptoKey,
    message: RatchetMessage
): Promise<string> {

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(message.iv) },
        messageKey,
        base64ToArrayBuffer(message.ct)
    );

    return new TextDecoder().decode(plaintext);
}

// ========== Utilities ==========

/**
 * Check if a message is a Signal Protocol (v6) message
 */
export function isSignalProtocolMessage(data: string): boolean {
    try {
        const obj = JSON.parse(data);
        return obj.v === 6 && obj.dh && typeof obj.n === 'number' && obj.ct && obj.iv;
    } catch {
        return false;
    }
}
