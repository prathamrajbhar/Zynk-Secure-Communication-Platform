# Frontend Architecture

Complete reference for the Zynk web application frontend architecture, built with Next.js 14 and React 18.

## Table of Contents
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Application Architecture](#application-architecture)
- [State Management](#state-management)
- [Routing & Pages](#routing--pages)
- [Components Overview](#components-overview)
- [Stores (Zustand)](#stores-zustand)
- [Core Libraries](#core-libraries)
- [Styling System](#styling-system)
- [WebSocket Integration](#websocket-integration)
- [Performance Optimizations](#performance-optimizations)

---

## Technology Stack

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.1.0 | React framework with App Router |
| React | 18.2.0 | UI library |
| TypeScript | 5.3.3 | Type safety |

### State Management
| Library | Version | Purpose |
|---------|---------|---------|
| Zustand | 4.4.7 | Lightweight state management |
| React Hooks | Built-in | Local component state |

### Real-time Communication
| Library | Version | Purpose |
|---------|---------|---------|
| Socket.IO Client | 4.7.2 | WebSocket connections |
| Simple Peer | 9.11.1 | WebRTC peer connections |

### UI & Styling
| Library | Version | Purpose |
|---------|---------|---------|
| Tailwind CSS | 3.4.1 | Utility-first CSS |
| Lucide React | 0.294.0 | Icon library |
| React Hot Toast | 2.4.1 | Toast notifications |

### Encryption & Security
| Library | Version | Purpose |
|---------|---------|---------|
| Web Crypto API | Native | E2EE encryption |
| Axios | 1.6.0 | HTTP client with auth |

---

## Project Structure

```
web/
├── public/                 # Static assets
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service worker
│   ├── icons/              # App icons
│   └── sounds/             # Notification sounds
│
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── globals.css     # Global styles & CSS variables
│   │   ├── layout.tsx      # Root layout
│   │   ├── page.tsx        # Landing page (/)
│   │   ├── chat/           # Chat page (/chat)
│   │   ├── login/          # Login page (/login)
│   │   └── register/       # Register page (/register)
│   │
│   ├── components/         # React components (29 files)
│   │   ├── ChatArea.tsx            # Main chat interface
│   │   ├── Sidebar.tsx             # Conversations sidebar
│   │   ├── CallOverlay.tsx         # WebRTC call UI
│   │   ├── GroupInfoPanel.tsx      # Group settings
│   │   ├── ProfilePanel.tsx        # User profile
│   │   ├── SettingsPanel.tsx       # App settings
│   │   ├── MessageContextMenu.tsx  # Message actions
│   │   ├── EditMessageModal.tsx    # Edit message
│   │   ├── ForwardMessageModal.tsx # Forward message
│   │   ├── PollCreateModal.tsx     # Create poll
│   │   ├── PollBubble.tsx          # Poll display
│   │   ├── VoiceRecorder.tsx       # Voice messages
│   │   ├── GifPanel.tsx            # GIF picker
│   │   ├── MentionAutocomplete.tsx # @mention suggestions
│   │   ├── SafetyNumberModal.tsx   # E2EE verification
│   │   ├── MessageInfoModal.tsx    # Delivery receipts
│   │   ├── ReportModal.tsx         # Report users/groups
│   │   ├── DeviceLimitModal.tsx    # Device limit warning
│   │   ├── ConnectionIndicator.tsx # Network status
│   │   ├── ContactsPanel.tsx       # Contacts list
│   │   ├── CallLogsPanel.tsx       # Call history
│   │   ├── UserInfoPanel.tsx       # User details
│   │   ├── NewChatModal.tsx        # Start new chat
│   │   ├── GroupCreateModal.tsx    # Create group
│   │   ├── MessageSelectionBar.tsx # Multi-select actions
│   │   ├── ChatAreaBackgroundMenu.tsx # Background picker
│   │   ├── ChatContextMenu.tsx     # Chat actions menu
│   │   ├── ErrorBoundary.tsx       # Error handling
│   │   └── Skeletons.tsx           # Loading states
│   │
│   ├── stores/             # Zustand state stores (8 files)
│   │   ├── authStore.ts            # Authentication state
│   │   ├── chatStore.ts            # Messages & conversations
│   │   ├── callStore.ts            # Voice/video calls
│   │   ├── callHistoryStore.ts     # Call logs
│   │   ├── connectionStore.ts      # WebSocket connection
│   │   ├── cryptoStore.ts          # E2EE keys
│   │   ├── decryptionQueue.ts      # Background decryption
│   │   └── uiStore.ts              # UI preferences
│   │
│   └── lib/                # Utility libraries (6 files)
│       ├── api.ts                  # Axios HTTP client
│       ├── socket.ts               # Socket.IO client
│       ├── crypto.ts               # E2EE implementation
│       ├── utils.ts                # Helper functions
│       ├── notifications.ts        # Push notifications
│       └── logger.ts               # Client-side logging
│
├── next.config.js          # Next.js configuration
├── tailwind.config.js      # Tailwind CSS config
├── tsconfig.json           # TypeScript config
└── package.json            # Dependencies
```

---

## Application Architecture

### Overall Flow
```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│          Next.js App Router                 │
│  ┌─────────────────────────────────────┐   │
│  │  Layout (Theme, Toaster)            │   │
│  └──────────┬──────────────────────────┘   │
│             │                                │
│  ┌──────────▼──────────────────────────┐   │
│  │  Page (Login/Chat/Register)         │   │
│  └──────────┬──────────────────────────┘   │
└─────────────┼──────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│         React Components Tree               │
│  ┌────────────────────────────────────┐    │
│  │  Sidebar  │  ChatArea  │  Panels   │    │
│  └────────────────────────────────────┘    │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│         Zustand State Stores                │
│  ┌──────┬──────┬──────┬──────┬────────┐   │
│  │ Auth │ Chat │ Call │ UI   │ Crypto │   │
│  └──────┴──────┴──────┴──────┴────────┘   │
└─────────────┬───────────────────────────────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
┌─────────┐      ┌────────────┐
│ HTTP    │      │ WebSocket  │
│ (Axios) │      │(Socket.IO) │
└────┬────┘      └─────┬──────┘
     │                 │
     │                 │
     ▼                 ▼
┌─────────────────────────────┐
│    Backend API Server       │
│  (Express + Socket.IO)      │
└─────────────────────────────┘
```

---

## State Management

### Zustand Stores

Zynk uses **Zustand** for global state management - a lightweight alternative to Redux.

#### Why Zustand?
- **Minimal boilerplate**: No providers, actions, or reducers
- **TypeScript-first**: Excellent type inference
- **Devtools support**: Redux DevTools compatible
- **Small bundle**: ~1KB gzipped
- **No Context API overhead**: Direct subscription model

---

### Store Architecture Pattern

All stores follow this pattern:
```typescript
import { create } from 'zustand';

interface StoreState {
  // State
  data: SomeType;
  loading: boolean;
  
  // Actions
  setData: (data: SomeType) => void;
  reset: () => void;
}

export const useStore = create<StoreState>((set, get) => ({
  // Initial state
  data: null,
  loading: false,
  
  // Actions
  setData: (data) => set({ data }),
  reset: () => set({ data: null, loading: false }),
}));
```

---

## Stores (Zustand)

### 1. authStore.ts (283 lines)
**Purpose**: User authentication and session management

**State**:
```typescript
{
  user: User | null;              // Current user
  devices: Device[];              // User's devices
  token: string | null;           // JWT access token
  refreshToken: string | null;    // JWT refresh token
  isAuthenticated: boolean;       // Auth status
  loading: boolean;               // Auth loading state
}
```

**Key Actions**:
- `login(username, password)`: Authenticate user
- `register(username, display_name, password)`: Create account
- `logout()`: Clear session and redirect
- `refreshAuth()`: Refresh access token
- `fetchDevices()`: Get user's devices
- `deleteDevice(deviceId)`: Remove device
- `checkAuth()`: Validate existing session

**Usage Example**:
```typescript
const { user, login, logout } = useAuthStore();

const handleLogin = async () => {
  await login(username, password);
  router.push('/chat');
};
```

**Persistence**: Tokens stored in `localStorage`

---

### 2. chatStore.ts (1292 lines)
**Purpose**: Messages, conversations, and chat state

**State**:
```typescript
{
  conversations: Conversation[];              // All conversations
  messages: Record<string, Message[]>;        // Messages per conversation
  selectedConversation: Conversation | null;  // Active chat
  typingUsers: Record<string, string[]>;      // Typing indicators
  unreadCounts: Record<string, number>;       // Unread message counts
  onlineUsers: Set<string>;                   // Online user IDs
  searchResults: SearchResult[];              // Message search results
  loading: boolean;
}
```

**Key Actions**:
- `fetchConversations()`: Load all conversations
- `fetchMessages(conversationId)`: Load messages for chat
- `sendMessage(conversationId, encryptedContent)`: Send encrypted message
- `editMessage(messageId, newContent)`: Edit message
- `deleteMessage(messageId)`: Delete message
- `forwardMessages(messageIds, targetConversationId)`: Forward messages
- `addReaction(messageId, emoji)`: React to message
- `markAsRead(conversationId)`: Clear unread count
- `searchMessages(query)`: Search message content

**WebSocket Listeners**:
- `message:new`: New message received
- `message:edited`: Message updated
- `message:deleted`: Message removed
- `message:reaction:added`: Reaction added
- `typing:start`: User typing
- `user:online`: User came online

**E2EE Integration**:
All messages are encrypted/decrypted using `cryptoStore`:
```typescript
const encryptedContent = await cryptoStore.getState().encryptMessage(
  plaintext,
  recipientUserId
);
```

---

### 3. callStore.ts (634 lines)
**Purpose**: WebRTC voice/video calls

**State**:
```typescript
{
  callState: 'idle' | 'outgoing' | 'incoming' | 'connected' | 'ended';
  activeCall: Call | null;             // Current call data
  localStream: MediaStream | null;     // Local audio/video
  remoteStream: MediaStream | null;    // Remote audio/video
  peer: SimplePeer.Instance | null;    // WebRTC peer
  isMuted: boolean;                    // Microphone state
  isVideoOff: boolean;                 // Camera state
  incomingCallData: IncomingCall;     // Incoming call info
}
```

**Key Actions**:
- `initiateCall(userId, type)`: Start voice/video call
- `answerCall()`: Accept incoming call
- `rejectCall()`: Decline incoming call
- `endCall()`: Hang up call
- `toggleMute()`: Mute/unmute microphone
- `toggleVideo()`: Enable/disable camera

**WebRTC Flow**:
```
Caller                          Server                      Callee
  │                               │                           │
  │─── initiateCall() ────────────▶                           │
  │                               │─── call:initiate ────────▶│
  │                               │                           │
  │                               │◀── call:accept ───────────│
  │◀── call:accepted ─────────────│                           │
  │                               │                           │
  │─── offer (SDP) ───────────────▶                           │
  │                               │─── offer ────────────────▶│
  │                               │                           │
  │                               │◀── answer ────────────────│
  │◀── answer (SDP) ──────────────│                           │
  │                               │                           │
  │─── ICE candidates ────────────────────────────────────────▶│
  │◀── ICE candidates ─────────────────────────────────────────│
  │                               │                           │
  │══════════════════ WebRTC Connection ══════════════════════│
```

**Technologies Used**:
- **SimplePeer**: WebRTC wrapper library
- **getUserMedia**: Access camera/microphone
- **ICE**: NAT traversal (STUN/TURN)
- **SDP**: Session description protocol

---

### 4. cryptoStore.ts (458 lines)
**Purpose**: End-to-end encryption key management

**State**:
```typescript
{
  myKeys: { publicKey: string; privateKey: string } | null;  // My key pair
  userPublicKeys: Record<string, string>;                    // Other users' public keys
  sharedSecrets: Record<string, CryptoKey>;                  // ECDH shared secrets
  messageKeys: Map<string, CryptoKey>;                       // Derived AES keys
}
```

**Key Actions**:
- `initializeKeys()`: Generate ECDH P-256 key pair
- `uploadPublicKey()`: Send public key to server
- `fetchPublicKey(userId)`: Get user's public key
- `deriveSharedSecret(userId)`: ECDH key agreement
- `encryptMessage(plaintext, userId)`: AES-256-GCM encryption
- `decryptMessage(encryptedData, senderId)`: AES-256-GCM decryption

**Encryption Flow**:
```
Alice (Sender)                                      Bob (Recipient)
      │                                                   │
      │ 1. Generate ECDH key pair                        │
      │    (one-time setup)                              │
      │                                                   │
      │ 2. Upload public key to server                   │
      │────────────────────────────────────────────────▶ │
      │                                                   │
      │ 3. Fetch Bob's public key                        │
      │ ◀───────────────────────────────────────────────│
      │                                                   │
      │ 4. ECDH: derive shared secret                    │
      │    sharedSecret = ECDH(myPrivate, bobPublic)     │
      │                                                   │
      │ 5. HKDF: derive AES key                          │
      │    aesKey = HKDF(sharedSecret, salt, info)       │
      │                                                   │
      │ 6. AES-256-GCM: encrypt message                  │
      │    ciphertext = AES_GCM(plaintext, aesKey, iv)   │
      │                                                   │
      │ 7. Send encrypted message                        │
      │────────────────────────────────────────────────▶ │
      │                                                   │
      │                                       8. Derive shared secret
      │                                          (same as Alice)
      │                                                   │
      │                                       9. Decrypt with AES key
      │                                          plaintext = AES_GCM_DECRYPT(...)
```

---

### 5. uiStore.ts (186 lines)
**Purpose**: UI preferences and settings

**State**:
```typescript
{
  theme: 'light' | 'dark';                         // Color theme
  colorScheme: ColorScheme;                        // Accent color
  bubbleStyle: 'gradient' | 'solid' | 'minimal';   // Message bubble style
  fontSize: 'small' | 'medium' | 'large';          // Text size
  compactMode: boolean;                            // Dense layout
  animationsEnabled: boolean;                      // Motion effects
  sidebarOpen: boolean;                            // Sidebar visibility
  sidebarTab: 'chats' | 'calls' | 'contacts';      // Active sidebar tab
  showSettings: boolean;                           // Settings panel
  chatBackground: ChatBackground;                  // Chat background pattern
  messageSoundEnabled: boolean;                    // Message sound
  callSoundEnabled: boolean;                       // Call sound
}
```

**Color Schemes**:
```typescript
const COLOR_SCHEMES = [
  { id: 'violet', name: 'Indigo', color: '#5b5fc7' },
  { id: 'ocean', name: 'Blue', color: '#1a73e8' },
  { id: 'emerald', name: 'Green', color: '#0d9e5f' },
  { id: 'rose', name: 'Pink', color: '#e8366d' },
  { id: 'amber', name: 'Amber', color: '#e68a00' },
  { id: 'crimson', name: 'Red', color: '#d93025' },
];
```

**Persistence**: All settings saved to `localStorage`

---

### 6. connectionStore.ts (98 lines)
**Purpose**: WebSocket connection state

**State**:
```typescript
{
  isConnected: boolean;           // Socket connected
  connectionQuality: 'good' | 'poor' | 'offline';
  reconnectAttempts: number;      // Failed reconnection count
  lastPingTime: number;           // Latency tracking
}
```

**Key Actions**:
- `setConnected(connected)`: Update connection state
- `incrementReconnectAttempts()`: Track reconnection
- `resetReconnectAttempts()`: Clear on success

---

### 7. callHistoryStore.ts (152 lines)
**Purpose**: Call logs and history

**State**:
```typescript
{
  callLogs: CallLog[];            // Call history
  loading: boolean;
}
```

**CallLog Interface**:
```typescript
interface CallLog {
  call_id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'audio' | 'video';
  status: 'completed' | 'missed' | 'rejected';
  started_at: string;
  ended_at: string | null;
  duration_secs: number | null;
}
```

---

### 8. decryptionQueue.ts (127 lines)
**Purpose**: Background message decryption queue

**Why Needed**:
- Decryption is CPU-intensive
- Prevents UI blocking
- Processes messages in batches

**State**:
```typescript
{
  queue: EncryptedMessage[];      // Pending messages
  processing: boolean;            // Queue active
  decryptedCount: number;         // Progress tracking
}
```

**Key Actions**:
- `enqueue(messages)`: Add messages to queue
- `processQueue()`: Decrypt messages in background
- `clearQueue()`: Cancel pending decryption

**Processing Algorithm**:
```typescript
// Process 10 messages every 100ms
async function processQueue() {
  while (queue.length > 0) {
    const batch = queue.splice(0, 10);
    for (const msg of batch) {
      const plaintext = await cryptoStore.decryptMessage(msg);
      chatStore.updateMessage(msg.id, { decrypted: plaintext });
    }
    await sleep(100);
  }
}
```

---

## Routing & Pages

### Next.js App Router
Zynk uses Next.js 14 **App Router** (not Pages Router).

#### Route Structure
```
app/
├── layout.tsx          → Root layout (applied to all pages)
├── page.tsx            → Landing page (/)
├── chat/
│   └── page.tsx        → Main chat app (/chat)
├── login/
│   └── page.tsx        → Login page (/login)
└── register/
    └── page.tsx        → Register page (/register)
```

---

### Page Details

#### 1. Landing Page (`/`)
**File**: [app/page.tsx](../web/src/app/page.tsx)

**Purpose**: Marketing/splash page

**Features**:
- **Hero section**: App description
- **Feature highlights**: E2EE, calls, file sharing
- **CTA buttons**: "Get Started" → `/register`
- **Login link**: For existing users

**Access**: Public (no auth required)

---

#### 2. Login Page (`/login`)
**File**: [app/login/page.tsx](../web/src/app/login/page.tsx)

**Purpose**: User authentication

**Form Fields**:
- Username/email
- Password
- "Remember me" checkbox

**Flow**:
```
1. User enters credentials
2. authStore.login(username, password)
3. Server validates & returns tokens
4. Tokens saved to localStorage
5. Redirect to /chat
```

**Error Handling**:
- Invalid credentials
- Network errors
- Rate limiting

**Access**: Public (redirects to `/chat` if already logged in)

---

#### 3. Register Page (`/register`)
**File**: [app/register/page.tsx](../web/src/app/register/page.tsx)

**Purpose**: New user signup

**Form Fields**:
- Username (unique)
- Display name
- Password (min 8 chars)
- Confirm password

**Flow**:
```
1. User enters details
2. authStore.register(username, display_name, password)
3. Server creates account
4. Auto-login with new credentials
5. cryptoStore.initializeKeys() → Generate E2EE keys
6. cryptoStore.uploadPublicKey() → Upload to server
7. Redirect to /chat
```

**Validation**:
- Username availability check
- Password strength meter
- Password match verification

**Access**: Public (redirects to `/chat` if already logged in)

---

#### 4. Chat Page (`/chat`)
**File**: [app/chat/page.tsx](../web/src/app/chat/page.tsx)

**Purpose**: Main application interface

**Layout**:
```
┌─────────────────────────────────────────────┐
│  Sidebar  │      ChatArea      │  Panels    │
├───────────┼────────────────────┼────────────┤
│           │                    │            │
│ Chats     │  Messages          │  Profile   │
│ Calls     │  Input             │  Group     │
│ Contacts  │  Typing Indicator  │  Settings  │
│           │                    │            │
└───────────┴────────────────────┴────────────┘
```

**Components**:
- **Sidebar**: Conversation list
- **ChatArea**: Message thread + input
- **Panels**: Profile, group info, settings (slide-in)

**Access**: **Protected** (requires authentication)

**Auth Guard**:
```typescript
useEffect(() => {
  if (!isAuthenticated) {
    router.push('/login');
  }
}, [isAuthenticated]);
```

---

### Root Layout
**File**: [app/layout.tsx](../web/src/app/layout.tsx)

**Features**:
- **Theme script**: Loads theme from localStorage before render (prevents flash)
- **Inter font**: Google Fonts
- **Toast notifications**: React Hot Toast
- **PWA metadata**: Manifest, icons, apple-web-app-capable

**Theme Loading Script**:
```html
<script>
  (function() {
    try {
      var theme = localStorage.getItem('zynk-theme') || 'dark';
      var colorScheme = localStorage.getItem('zynk-color-scheme') || 'violet';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.setAttribute('data-theme', colorScheme);
    } catch(e) {
      // Fallback to dark violet
    }
  })()
</script>
```

This prevents the dreaded "flash of unstyled content" (FOUC).

---

## Components Overview

### Core Components

#### ChatArea.tsx (1182 lines)
**Purpose**: Main chat interface

**Features**:
- Message rendering with E2EE decryption
- Rich media support (images, videos, audio, files)
- Reactions, replies, forwards
- Message editing & deletion
- Polling creation
- Voice message recording
- GIF picker
- @mention autocomplete
- Read receipts
- Typing indicators
- Message search
- Context menus

**Message Rendering**:
```typescript
{messages.map((msg) => (
  <div key={msg.message_id} className={cn(
    'message-bubble',
    msg.sender_id === userId ? 'self' : 'other'
  )}>
    {msg.decrypted_content || <Loader2 className="animate-spin" />}
    <span className="time">{formatMessageTime(msg.created_at)}</span>
    <CheckCheck className={msg.read_by?.length > 0 ? 'text-blue-500' : ''} />
  </div>
))}
```

**File Uploads**:
- Drag-and-drop support
- Image preview with lightbox
- Video player with controls
- Audio waveform visualization
- Document download

---

#### Sidebar.tsx (985 lines)
**Purpose**: Conversation and navigation sidebar

**Features**:
- **Tabs**: Chats, Calls, Contacts
- **Search**: Filter conversations
- **Sorting**: Recent, unread, pinned
- **Indicators**: Unread count, online status, typing
- **Context menu**: Pin, mute, delete conversation
- **New chat button**: Start conversation modal

**Conversation List Item**:
```typescript
<div className="conversation-item">
  <Avatar user={conversation.participants[0]} />
  <div className="info">
    <div className="name">{conversation.display_name}</div>
    <div className="preview">{lastMessage.preview}</div>
  </div>
  <div className="meta">
    <span className="time">{formatTime(lastMessage.created_at)}</span>
    {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
  </div>
</div>
```

---

#### CallOverlay.tsx (723 lines)
**Purpose**: WebRTC call interface (voice/video)

**Features**:
- **Video streams**: Local and remote video
- **Call controls**: Mute, video toggle, end call
- **Connection status**: Quality indicator
- **Call timer**: Duration display
- **Screen share** (future feature)

**UI States**:
- **Outgoing**: "Calling..."
- **Incoming**: Answer/reject buttons
- **Connected**: Full call controls
- **Ended**: Call summary

**WebRTC Integration**:
```typescript
useEffect(() => {
  if (localStream && peer) {
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });
  }
}, [localStream, peer]);
```

---

#### SettingsPanel.tsx (647 lines)
**Purpose**: Application settings

**Tabs**:
1. **Appearance**: Theme, colors, fonts, backgrounds
2. **Notifications**: Sound, desktop notifications, mute
3. **Privacy**: Read receipts, typing indicators, last seen
4. **Devices**: Active sessions management
5. **Storage**: Cache clearing, data usage
6. **About**: Version, privacy policy, logout

**Settings Persistence**:
All settings stored in `uiStore` and persisted to `localStorage`.

---

### Modal Components

All modals use a consistent pattern with:
- Backdrop overlay (click to close)
- Centered dialog
- Close button
- Escape key handler

#### GroupCreateModal.tsx
Create new group chats:
- Group name and avatar
- Member selection
- Encryption key generation for group

#### EditMessageModal.tsx
Edit sent messages:
- Textarea with original content
- Save/cancel buttons
- Updates message content

#### ForwardMessageModal.tsx
Forward messages to other chats:
- Conversation selector
- Multi-forward support
- Preserves encryption

#### PollCreateModal.tsx
Create voting polls:
- Question input
- Multiple options (2-10)
- Duration picker
- Anonymous voting toggle

#### SafetyNumberModal.tsx
Verify E2EE safety numbers:
- Display fingerprints (SHA-256 of public keys)
- QR code for scanning
- Verification status

---

## Core Libraries

### lib/api.ts
**Purpose**: Axios HTTP client with JWT auth

**Features**:
- Automatic JWT token injection
- Token refresh on 401
- Request/response interceptors
- Error handling

**Usage**:
```typescript
import api from '@/lib/api';

const response = await api.get('/users/me');
const user = response.data;
```

**Token Refresh Flow**:
```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try refresh token
      const newToken = await refreshAuth();
      // Retry original request
      error.config.headers.Authorization = `Bearer ${newToken}`;
      return api.request(error.config);
    }
    throw error;
  }
);
```

---

### lib/socket.ts
**Purpose**: Socket.IO client initialization

**Configuration**:
```typescript
const socket = io(process.env.NEXT_PUBLIC_WS_URL!, {
  auth: { token: authStore.getState().token },
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling'],
});
```

**Event Handling**:
```typescript
socket.on('connect', () => {
  connectionStore.getState().setConnected(true);
});

socket.on('disconnect', () => {
  connectionStore.getState().setConnected(false);
});

socket.on('message:new', (data) => {
  chatStore.getState().addMessage(data);
});
```

---

### lib/crypto.ts (379 lines)
**Purpose**: End-to-end encryption implementation

**See**: [06-Encryption-and-Security.md](./06-Encryption-and-Security.md) for full details

**Key Functions**:
- `generateKeyPair()`: ECDH P-256 key generation
- `deriveSharedSecret()`: ECDH key agreement
- `encryptMessage()`: AES-256-GCM encryption
- `decryptMessage()`: AES-256-GCM decryption
- `exportPublicKey()`: Convert to base64
- `importPublicKey()`: Parse from base64

---

### lib/utils.ts
**Purpose**: Helper functions

**Functions**:
- `cn()`: Class name merger (tailwind-merge + clsx)
- `formatMessageTime()`: Human-readable timestamps
- `getInitials()`: Extract initials from name
- `getAvatarColor()`: Consistent color for user
- `formatFileSize()`: Bytes to human (KB/MB)
- `debounce()`: Debounce function calls
- `throttle()`: Throttle function calls

---

### lib/notifications.ts
**Purpose**: Push notifications & service worker

**Features**:
- Request notification permission
- Show desktop notifications
- Play notification sounds
- Service worker registration

**Usage**:
```typescript
showNotification('New message', {
  body: message.decrypted_content,
  icon: '/icons/icon-192x192.png',
  tag: message.message_id,
});
```

---

## Styling System

### Tailwind CSS + CSS Variables

Zynk uses **Tailwind CSS** for styling with **CSS custom properties** for theming.

### globals.css
**File**: [app/globals.css](../web/src/app/globals.css)

**Theme Variables**:
```css
:root {
  /* Light theme */
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-elevated: #ffffff;
  --text-primary: #1a1a1a;
  --text-secondary: #6b6b6b;
  --border: #e0e0e0;
  --accent: #5b5fc7;  /* Violet */
}

.dark {
  /* Dark theme */
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-elevated: #242424;
  --text-primary: #e8eaed;
  --text-secondary: #9aa0a6;
  --border: #3c4043;
  --accent: #7a7ef4;
}

[data-theme="ocean"] {
  --accent: #1a73e8;
}

[data-theme="emerald"] {
  --accent: #0d9e5f;
}

[data-theme="rose"] {
  --accent: #e8366d;
}
```

**Usage**:
```tsx
<div className="bg-[var(--bg-primary)] text-[var(--text-primary)] border-[var(--border)]">
  Content
</div>
```

---

## WebSocket Integration

### Event-Driven Architecture

All real-time features use Socket.IO events.

**Connection Management**:
```typescript
// Connect with JWT
socket.auth = { token: authStore.getState().token };
socket.connect();

// Reconnection handling
socket.on('connect', () => {
  console.log('Connected');
  connectionStore.getState().setConnected(true);
});

socket.on('disconnect', () => {
  console.log('Disconnected');
  connectionStore.getState().setConnected(false);
});
```

**Message Events**:
```typescript
socket.on('message:new', (message) => {
  chatStore.getState().addMessage(message);
});

socket.on('typing:start', ({ conversationId, userId }) => {
  chatStore.getState().addTypingUser(conversationId, userId);
});

socket.on('user:online', ({ userId }) => {
  chatStore.getState().setUserOnline(userId);
});
```

**Call Signaling**:
```typescript
socket.on('call:incoming', (data) => {
  callStore.getState().setIncomingCall(data);
});

socket.on('call:offer', ({ offer, callId }) => {
  callStore.getState().handleOffer(offer, callId);
});

socket.on('call:answer', ({ answer }) => {
  callStore.getState().handleAnswer(answer);
});

socket.on('call:ice-candidate', ({ candidate }) => {
  callStore.getState().addIceCandidate(candidate);
});
```

---

## Performance Optimizations

### 1. Code Splitting
Next.js automatically splits code by route.

**Dynamic Imports** for heavy components:
```typescript
const CallOverlay = dynamic(() => import('./CallOverlay'), { ssr: false });
const GifPanel = dynamic(() => import('./GifPanel'), { ssr: false });
```

---

### 2. Message Virtualization
For long message threads, use virtual scrolling:
```typescript
// Only render visible messages + buffer
const visibleMessages = messages.slice(startIndex, endIndex);
```

---

### 3. Image Optimization
```typescript
<Image 
  src={thumbnailUrl} 
  width={300} 
  height={300}
  placeholder="blur"
  loading="lazy"
/>
```

---

### 4. Memoization
```typescript
const sortedConversations = useMemo(() => {
  return conversations.sort((a, b) => 
    new Date(b.last_message_at) - new Date(a.last_message_at)
  );
}, [conversations]);
```

---

### 5. Debounced Search
```typescript
const debouncedSearch = useMemo(
  () => debounce((query: string) => {
    chatStore.getState().searchMessages(query);
  }, 300),
  []
);
```

---

### 6. Background Decryption
Decrypt messages in batches to avoid blocking UI:
```typescript
decryptionQueue.processQueue(); // Processes 10 messages every 100ms
```

---

## Next Steps

For more details, see:
- [Database Schema](./03-Database-Schema.md) - Backend data models
- [WebSocket Events](./04-WebSocket-Events.md) - Real-time event details
- [Encryption & Security](./06-Encryption-and-Security.md) - E2EE implementation
