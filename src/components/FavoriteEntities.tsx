import { useState, useCallback } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'dp-favorite-entities';

interface FavoriteEntity {
  id: string;
  type: 'deal' | 'lead';
  title: string;
}

function readFavorites(): FavoriteEntity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeFavorites(favs: FavoriteEntity[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(favs)); } catch {}
}

export function useFavoriteEntities() {
  const [favorites, setFavorites] = useState<FavoriteEntity[]>(readFavorites);

  const toggleFavorite = useCallback((entity: FavoriteEntity) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.id === entity.id);
      const next = exists ? prev.filter(f => f.id !== entity.id) : [...prev, entity].slice(0, 6);
      writeFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.some(f => f.id === id), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}

interface FavoriteStarProps {
  entityId: string;
  entityType: 'deal' | 'lead';
  entityTitle: string;
  isFavorite: boolean;
  onToggle: (entity: FavoriteEntity) => void;
  className?: string;
}

export function FavoriteStar({ entityId, entityType, entityTitle, isFavorite, onToggle, className }: FavoriteStarProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle({ id: entityId, type: entityType, title: entityTitle });
      }}
      className={cn('p-0.5 rounded transition-colors', className)}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Star className={cn('h-3.5 w-3.5', isFavorite ? 'fill-gold text-gold' : 'text-muted-foreground/40 hover:text-gold/60')} />
    </button>
  );
}

interface FavoritesStripProps {
  favorites: FavoriteEntity[];
  onSelect: (id: string, type: 'deal' | 'lead') => void;
}

export function FavoritesStrip({ favorites, onSelect }: FavoritesStripProps) {
  if (favorites.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1 animate-fade-in">
      <Star className="h-3.5 w-3.5 text-gold shrink-0" />
      {favorites.map(fav => (
        <button
          key={fav.id}
          onClick={() => onSelect(fav.id, fav.type)}
          className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-gold/10 text-foreground hover:bg-gold/20 border border-gold/20 transition-colors truncate max-w-[140px]"
        >
          {fav.title}
        </button>
      ))}
    </div>
  );
}
