import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { config } from '../config';
import sharp from 'sharp';

const router = Router();

// SECURITY: Allowed MIME types (prevents executable upload attacks)
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'application/pdf', 'text/plain', 'text/markdown',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Audio
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac',
  // Video
  'video/mp4', 'video/webm', 'video/ogg',
  // Archives
  'application/zip', 'application/gzip',
  // E2EE encrypted blobs
  'application/octet-stream',
]);

// SECURITY: Dangerous file extensions that should never be allowed
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.js', '.vbs', '.wsf', '.wsh', '.ps1', '.sh', '.bash',
  '.php', '.asp', '.aspx', '.jsp', '.cgi',
]);

// Ensure upload directory exists
const uploadDir = path.resolve(config.upload.dir);
const thumbnailDir = path.join(uploadDir, 'thumbnails');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(thumbnailDir, { recursive: true });

// Multer storage config with security hardening
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // SECURITY: Never use original filename - generate a random one
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (req, file, cb) => {
    // SECURITY: Check MIME type
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('File type not allowed'));
      return;
    }
    // SECURITY: Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      cb(new Error('File extension not allowed'));
      return;
    }
    cb(null, true);
  },
});

// POST /files/upload
router.post('/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { conversation_id } = req.body;
    const file = req.file;

    // Verify user has access to the conversation (if provided)
    if (conversation_id) {
      const participant = await prisma.conversationParticipant.findFirst({
        where: { conversation_id, user_id: req.userId! }
      });
      if (!participant) {
        // Clean up uploaded file since access was denied
        fs.unlinkSync(file.path);
        return res.status(403).json({ error: 'Not a participant in this conversation' });
      }
    }

    // Calculate file hash using streaming to avoid loading entire file into memory
    const hash = await new Promise<string>((resolve, reject) => {
      const hashStream = crypto.createHash('sha256');
      const fileStream = fs.createReadStream(file.path);
      fileStream.on('data', (chunk) => hashStream.update(chunk));
      fileStream.on('end', () => resolve(hashStream.digest('hex')));
      fileStream.on('error', reject);
    });

    // Generate thumbnail for images
    let thumbnailFilename: string | null = null;
    if (file.mimetype.startsWith('image/')) {
      try {
        thumbnailFilename = `thumb_${file.filename}`;
        const thumbPath = path.join(thumbnailDir, thumbnailFilename);
        await sharp(file.path)
          .resize(200, 200, { fit: 'cover', withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toFile(thumbPath);

        // Also compress original if > 1MB and is an image
        if (file.size > 1024 * 1024) {
          const compressedPath = file.path + '.compressed';
          await sharp(file.path)
            .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toFile(compressedPath);
          fs.renameSync(compressedPath, file.path);
        }
      } catch (thumbErr) {
        console.error('Thumbnail generation failed:', thumbErr);
        thumbnailFilename = null;
      }
    }

    const result = await prisma.file.create({
      data: {
        uploader_id: req.userId!,
        conversation_id: conversation_id || null,
        filename: file.originalname,
        file_size: BigInt(file.size),
        mime_type: file.mimetype,
        storage_path: file.filename,
        content_hash: hash,
        thumbnail_path: thumbnailFilename,
        metadata: { original_name: file.originalname },
      }
    });

    return res.status(201).json({
      file_id: result.id,
      filename: result.filename,
      file_size: Number(result.file_size),
      mime_type: result.mime_type,
      content_hash: result.content_hash,
      thumbnail_path: thumbnailFilename,
      created_at: result.created_at,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /files/:fileId/thumbnail — serve thumbnail by file ID (for inline chat previews)
router.get('/:fileId/thumbnail', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const file = await prisma.file.findUnique({
      where: { id: req.params.fileId, deleted_at: null },
      select: { thumbnail_path: true, storage_path: true, mime_type: true, conversation_id: true }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify access
    if (file.conversation_id) {
      const participant = await prisma.conversationParticipant.findFirst({
        where: { conversation_id: file.conversation_id, user_id: req.userId! }
      });
      if (!participant) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const thumbFile = file.thumbnail_path
      ? path.join(thumbnailDir, file.thumbnail_path)
      : path.join(uploadDir, file.storage_path);

    if (!fs.existsSync(thumbFile)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    res.setHeader('Cache-Control', 'private, max-age=86400');
    // Thumbnails are always generated as JPEG by sharp
    res.setHeader('Content-Type', file.thumbnail_path ? 'image/jpeg' : (file.mime_type || 'image/jpeg'));
    return res.sendFile(thumbFile);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// GET /files/:fileId/download
router.get('/:fileId/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const file = await prisma.file.findUnique({
      where: { id: req.params.fileId, deleted_at: null },
      select: { filename: true, storage_path: true, mime_type: true, conversation_id: true, content_hash: true }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Verify requester has access to the file's conversation
    if (file.conversation_id) {
      const participant = await prisma.conversationParticipant.findFirst({
        where: { conversation_id: file.conversation_id, user_id: req.userId! }
      });
      if (!participant) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const filePath = path.join(uploadDir, file.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Add ETag for caching (use content_hash if available)
    if (file.content_hash) {
      res.setHeader('ETag', `"${file.content_hash}"`);

      // Check If-None-Match for 304 response
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch === `"${file.content_hash}"`) {
        return res.status(304).send();
      }
    }

    // For images, use inline disposition so browsers can display them
    const isImage = file.mime_type?.startsWith('image/');
    res.setHeader('Content-Disposition', isImage
      ? `inline; filename="${file.filename}"`
      : `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400'); // 24 hour cache
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ error: 'Download failed' });
  }
});

// ========== SPECIFIC PATH ROUTES (must come before /:fileId catch-all) ==========

// GET /files/conversation/:conversationId
router.get('/conversation/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    const files = await prisma.file.findMany({
      where: {
        conversation_id: req.params.conversationId,
        deleted_at: null
      },
      select: {
        id: true,
        filename: true,
        file_size: true,
        mime_type: true,
        created_at: true
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset
    });

    const formattedFiles = files.map(f => ({
      file_id: f.id,
      filename: f.filename,
      file_size: Number(f.file_size),
      mime_type: f.mime_type,
      created_at: f.created_at
    }));

    return res.json({ files: formattedFiles });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Serve uploaded files statically (with path traversal protection)
router.get('/serve/:filename', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filePath = path.resolve(uploadDir, req.params.filename);
    if (!filePath.startsWith(path.resolve(uploadDir))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Serve thumbnails (with path traversal protection)
router.get('/thumbnail/:filename', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filePath = path.resolve(thumbnailDir, req.params.filename);
    if (!filePath.startsWith(path.resolve(thumbnailDir))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// ========== PARAMETERIZED CATCH-ALL ROUTES (must come last) ==========

// GET /files/:fileId — file metadata
router.get('/:fileId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const file = await prisma.file.findUnique({
      where: { id: req.params.fileId, deleted_at: null }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.json({
      ...file,
      file_size: Number(file.file_size)
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get file metadata' });
  }
});

// DELETE /files/:fileId
router.delete('/:fileId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const file = await prisma.file.findUnique({
      where: { id: req.params.fileId, uploader_id: req.userId! },
      select: { storage_path: true }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Soft delete in DB
    await prisma.file.update({
      where: { id: req.params.fileId },
      data: { deleted_at: new Date() }
    });

    // Delete from disk
    const filePath = path.join(uploadDir, file.storage_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
