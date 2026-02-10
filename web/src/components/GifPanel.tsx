'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import type { IGif } from '@giphy/js-types';
import { Search, X, TrendingUp, Loader2, Image as ImageIcon, Sticker } from 'lucide-react';
import { cn } from '@/lib/utils';
import logger from '@/lib/logger';

const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || '';
const gf = new GiphyFetch(GIPHY_API_KEY);

type GifTab = 'gifs' | 'stickers';

interface GifPanelProps {
  onSelect: (gif: { url: string; previewUrl: string; title: string; width: number; height: number }) => void;
  onClose: () => void;
}

export default function GifPanel({ onSelect, onClose }: GifPanelProps) {
  const [tab, setTab] = useState<GifTab>('gifs');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IGif[]>([]);
  const [trending, setTrending] = useState<IGif[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [trendingTerms, setTrendingTerms] = useState<string[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch trending on mount
  useEffect(() => {
    fetchTrending();
    fetchTrendingTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const fetchTrending = async () => {
    setIsLoading(true);
    try {
      const { data } = tab === 'gifs'
        ? await gf.trending({ limit: 20, rating: 'pg-13' })
        : await gf.trending({ limit: 20, rating: 'pg-13', type: 'stickers' });
      setTrending(data);
    } catch (err) {
      logger.error('Failed to fetch trending:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTrendingTerms = async () => {
    try {
      const res = await fetch(`https://api.giphy.com/v1/trending/searches?api_key=${GIPHY_API_KEY}`);
      const json = await res.json();
      setTrendingTerms((json.data || []).slice(0, 8));
    } catch { /* ignore */ }
  };

  const searchGifs = useCallback(async (q: string, off: number = 0) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const { data, pagination } = tab === 'gifs'
        ? await gf.search(q, { limit: 20, offset: off, rating: 'pg-13' })
        : await gf.search(q, { limit: 20, offset: off, rating: 'pg-13', type: 'stickers' });
      if (off === 0) {
        setResults(data);
      } else {
        setResults(prev => [...prev, ...data]);
      }
      setHasMore(pagination.total_count > off + 20);
    } catch (err) {
      logger.error('GIF search failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tab]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setOffset(0);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => searchGifs(query, 0), 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchGifs]);

  const handleScroll = useCallback(() => {
    const el = gridRef.current;
    if (!el || isLoading || !hasMore || !query.trim()) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      const newOffset = offset + 20;
      setOffset(newOffset);
      searchGifs(query, newOffset);
    }
  }, [isLoading, hasMore, query, offset, searchGifs]);

  const handleGifClick = (gif: IGif) => {
    const images = gif.images;
    onSelect({
      url: images.original.url || images.downsized_medium?.url || '',
      previewUrl: images.fixed_width_small?.url || images.preview_gif?.url || images.original.url || '',
      title: gif.title || '',
      width: images.original.width ? Number(images.original.width) : 300,
      height: images.original.height ? Number(images.original.height) : 200,
    });
    onClose();
  };

  const displayGifs = query.trim() ? results : trending;

  return (
    <div ref={panelRef}
      className="absolute bottom-full left-0 mb-2 w-80 max-h-[420px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-overlay z-40 flex flex-col overflow-hidden animate-scale-in"
    >
      {/* Header tabs */}
      <div className="flex items-center border-b border-[var(--border)] flex-shrink-0">
        <button
          onClick={() => { setTab('gifs'); setQuery(''); }}
          className={cn(
            'flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
            tab === 'gifs' ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          )}
        >
          <ImageIcon className="w-3.5 h-3.5" /> GIFs
        </button>
        <button
          onClick={() => { setTab('stickers'); setQuery(''); }}
          className={cn(
            'flex-1 py-2.5 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5',
            tab === 'stickers' ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          )}
        >
          <Sticker className="w-3.5 h-3.5" /> Stickers
        </button>
        <button onClick={onClose} className="px-3 py-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search input */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab === 'gifs' ? 'GIFs' : 'Stickers'}...`}
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-wash)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-ring)]"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-[var(--text-muted)]" />
            </button>
          )}
        </div>
      </div>

      {/* Trending tags */}
      {!query.trim() && trendingTerms.length > 0 && (
        <div className="px-3 pb-2 flex gap-1.5 flex-wrap flex-shrink-0">
          <TrendingUp className="w-3 h-3 text-[var(--text-muted)] mt-0.5" />
          {trendingTerms.map(term => (
            <button key={term} onClick={() => setQuery(term)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-wash)] text-[var(--text-secondary)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] transition-colors"
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {/* GIF grid */}
      <div ref={gridRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-2 pb-2 min-h-0">
        {isLoading && displayGifs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" />
          </div>
        ) : displayGifs.length === 0 && query.trim() ? (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            No {tab === 'gifs' ? 'GIFs' : 'stickers'} found for &quot;{query}&quot;
          </div>
        ) : (
          <div className="columns-2 gap-1.5">
            {displayGifs.map((gif) => {
              const img = gif.images.fixed_width_small || gif.images.fixed_width;
              const w = Number(img?.width || 150);
              const h = Number(img?.height || 150);
              return (
                <button key={gif.id} onClick={() => handleGifClick(gif)}
                  className="w-full mb-1.5 rounded-lg overflow-hidden hover:opacity-80 transition-opacity cursor-pointer group relative block break-inside-avoid"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img?.url || ''}
                    alt={gif.title || 'GIF'}
                    width={w}
                    height={h}
                    loading="lazy"
                    className="w-full h-auto rounded-lg bg-[var(--bg-wash)]"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg" />
                </button>
              );
            })}
          </div>
        )}
        {isLoading && displayGifs.length > 0 && (
          <div className="flex justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
          </div>
        )}
      </div>

      {/* GIPHY attribution */}
      <div className="px-3 py-1.5 border-t border-[var(--border)] flex items-center justify-center flex-shrink-0">
        <span className="text-[9px] text-[var(--text-muted)]">Powered by GIPHY</span>
      </div>
    </div>
  );
}
