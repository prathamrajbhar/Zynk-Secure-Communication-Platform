// ═══════════════════════════════════════════════════════
// ZYNK — MediaGallery + Lightbox
// Full-screen image/video viewer with zoom, swipe, download
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { cn } from '@/lib/utils';
import {
  X, Download, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, RotateCw, Share2,
} from 'lucide-react';
import { IconButton } from '@/components/ui/primitives';
import type { MediaGalleryProps } from '@/components/ui/types';

// ─── Lightbox ───
const MediaGallery = memo(function MediaGallery({
  items,
  initialIndex = 0,
  isOpen,
  onClose,
  onDownload,
  onForward,
}: MediaGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const currentItem = items[currentIndex];

  // Reset zoom/rotation when changing images
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setDragOffset({ x: 0, y: 0 });
  }, [currentIndex]);

  // Reset index when gallery opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          setCurrentIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
          setCurrentIndex(prev => Math.min(items.length - 1, prev + 1));
          break;
        case '+':
        case '=':
          setZoom(prev => Math.min(prev + 0.5, 5));
          break;
        case '-':
          setZoom(prev => Math.max(prev - 0.5, 0.5));
          break;
        case '0':
          setZoom(1);
          setRotation(0);
          setDragOffset({ x: 0, y: 0 });
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, items.length, onClose]);

  // Pan handlers for zoomed images
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setStartPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
  }, [zoom, dragOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setDragOffset({
      x: e.clientX - startPos.x,
      y: e.clientY - startPos.y,
    });
  }, [isDragging, startPos]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Double-click to zoom
  const handleDoubleClick = useCallback(() => {
    if (zoom > 1) {
      setZoom(1);
      setDragOffset({ x: 0, y: 0 });
    } else {
      setZoom(2.5);
    }
  }, [zoom]);

  // Touch swipe for mobile
  const touchStartX = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (zoom > 1) return;
    touchStartX.current = e.touches[0].clientX;
  }, [zoom]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (zoom > 1) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 60) {
      if (delta > 0 && currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (delta < 0 && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    }
  }, [zoom, currentIndex, items.length]);

  if (!isOpen || !currentItem) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/95 flex flex-col animate-fade-in"
      role="dialog"
      aria-label="Media gallery"
      aria-modal="true"
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <div className="text-white min-w-0">
          {currentItem.senderName && (
            <p className="text-sm font-medium truncate">{currentItem.senderName}</p>
          )}
          {currentItem.timestamp && (
            <p className="text-xs text-white/50">
              {new Date(currentItem.timestamp).toLocaleDateString([], {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <IconButton
            label="Zoom in"
            onClick={() => setZoom(prev => Math.min(prev + 0.5, 5))}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <ZoomIn className="w-5 h-5" />
          </IconButton>
          <IconButton
            label="Zoom out"
            onClick={() => setZoom(prev => Math.max(prev - 0.5, 0.5))}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <ZoomOut className="w-5 h-5" />
          </IconButton>
          <IconButton
            label="Rotate"
            onClick={() => setRotation(prev => prev + 90)}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <RotateCw className="w-5 h-5" />
          </IconButton>
          {onDownload && (
            <IconButton
              label="Download"
              onClick={() => onDownload(currentItem)}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <Download className="w-5 h-5" />
            </IconButton>
          )}
          {onForward && (
            <IconButton
              label="Forward"
              onClick={() => onForward(currentItem)}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <Share2 className="w-5 h-5" />
            </IconButton>
          )}
          <IconButton
            label="Close"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </IconButton>
        </div>
      </div>

      {/* Main content */}
      <div
        ref={containerRef}
        className={cn(
          'flex-1 flex items-center justify-center overflow-hidden',
          zoom > 1 ? 'cursor-grab' : 'cursor-default',
          isDragging && 'cursor-grabbing',
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          if (e.target === containerRef.current) onClose();
        }}
      >
        {currentItem.type === 'video' ? (
          <video
            src={currentItem.url}
            className="max-w-[90vw] max-h-[85vh] rounded-lg"
            controls
            autoPlay
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentItem.url}
            alt={currentItem.caption || 'Media'}
            className="max-w-[90vw] max-h-[85vh] object-contain select-none transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg) translate(${dragOffset.x / zoom}px, ${dragOffset.y / zoom}px)`,
            }}
            draggable={false}
          />
        )}
      </div>

      {/* Navigation arrows */}
      {items.length > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={() => setCurrentIndex(prev => prev - 1)}
              className={cn(
                'absolute left-4 top-1/2 -translate-y-1/2 z-10',
                'w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm',
                'flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60',
                'transition-all duration-150',
              )}
              aria-label="Previous image"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {currentIndex < items.length - 1 && (
            <button
              onClick={() => setCurrentIndex(prev => prev + 1)}
              className={cn(
                'absolute right-4 top-1/2 -translate-y-1/2 z-10',
                'w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm',
                'flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60',
                'transition-all duration-150',
              )}
              aria-label="Next image"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </>
      )}

      {/* Footer: caption + counter */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center justify-between">
          {currentItem.caption && (
            <p className="text-sm text-white/80 max-w-[70%] truncate">{currentItem.caption}</p>
          )}
          {items.length > 1 && (
            <p className="text-xs text-white/50 ml-auto">
              {currentIndex + 1} / {items.length}
            </p>
          )}
        </div>

        {/* Thumbnail strip */}
        {items.length > 1 && items.length <= 20 && (
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {items.map((item, i) => (
              <button
                key={item.id}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  'w-12 h-12 rounded-lg overflow-hidden border-2 transition-all duration-150 flex-shrink-0',
                  i === currentIndex
                    ? 'border-white scale-100 opacity-100'
                    : 'border-transparent scale-90 opacity-50 hover:opacity-80'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnailUrl || item.url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default MediaGallery;
