/**
 * Pokedex Page
 * Displays user's card collection
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL, getCardImageUrl, handleCardImageError } from '../api';

interface Pokemon {
  id: number;
  name: string;
  pokedexNumber: number;
  imageUrl: string | null;
}


interface Card {
  id: number;
  tcgdexId: string;
  pokemonName: string;
  setId?: string;
  setName: string;
  setDisplayName?: string;
  rarity: string;
  tier: number;
  imageUrl: string;
  imageUrlLarge: string | null;
  pokemon: Pokemon;
  biomeNames?: string[];
}

interface PokedexEntry {
  card: Card;
  captured: boolean;
  discovered: string | null;
  quantity: number;
}

interface PokedexStats {
  totalCards: number;
  collectedCards: number;
  completionPercentage: number;
  cardsByRarity: Record<string, number>;
  cardsByBiome: Array<{ biome: string; count: number }>;
  rarestCard: Card | null;
}

interface PokedexPageProps {
  onBack: () => void;
  auth: { token: string };
}

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function PokedexPage({ onBack, auth }: PokedexPageProps) {
  const [entries, setEntries] = useState<PokedexEntry[]>([]);
  const [stats, setStats] = useState<PokedexStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [filterCaptured, setFilterCaptured] = useState<string>('all'); // all, captured, uncaptured
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPokedex();
    fetchStats();
  }, []);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!selectedCard) return;
      
      if (e.key === 'Escape') {
        handleCloseViewer();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedCard, zoomLevel]);

  const fetchPokedex = async () => {
    try {
      const response = await fetch(`${API_URL}/pokedex`, {
        headers: {
          'Authorization': `Bearer ${auth.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch Pokedex');
      }
      
      const data = await response.json();
      setEntries(data);
    } catch (err) {
      console.error('Error fetching Pokedex:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/pokedex/stats`, {
        headers: {
          'Authorization': `Bearer ${auth.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const filteredEntries = entries.filter(entry => {
    const matchesRarity = filterRarity === 'all' || entry.card.rarity === filterRarity;
    const matchesCaptured = 
      filterCaptured === 'all' || 
      (filterCaptured === 'captured' && entry.captured) ||
      (filterCaptured === 'uncaptured' && !entry.captured);
    const matchesSearch = 
      entry.card.pokemonName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.card.setName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesRarity && matchesCaptured && matchesSearch;
  });

  // Get unique Pokemon names for autocomplete
  const allPokemonNames = Array.from(new Set(entries.map(e => e.card.pokemonName))).sort();
  const suggestionList = searchTerm.length > 0 
    ? allPokemonNames.filter(name => 
        name.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 8).map(name => capitalizeFirst(name))
    : [];

  const uniqueRarities = Array.from(new Set(entries.map(e => e.card.rarity)));

  const handleCardClick = (card: Card) => {
    setSelectedCard(card);
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
  };

  const handleCloseViewer = () => {
    setSelectedCard(null);
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoomLevel(prev => Math.max(0.5, Math.min(3, prev + delta)));
  }, []);

  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el || !selectedCard) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [selectedCard, handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  useEffect(() => {
    if (!selectedCard || !isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      setPanX(prev => prev + dx);
      setPanY(prev => prev + dy);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectedCard, isDragging]);

  if (loading) {
    return (
      <div className="pokedex-loading">
        <div className="loading-spinner"></div>
        <p>Loading Pokedex...</p>
      </div>
    );
  }

  return (
    <div className="pokedex-page">
      <div className="pokedex-header">
        <button onClick={onBack} className="back-button">← Back</button>
        <h2>Your Pokedex</h2>
      </div>

      {stats && (
        <div className="pokedex-stats">
          <div className="stat-card">
            <h3>{stats.collectedCards}</h3>
            <p>Cards Collected</p>
          </div>
          <div className="stat-card">
            <h3>{stats.completionPercentage}%</h3>
            <p>Collection Complete</p>
          </div>
          <div className="stat-card">
            <h3>{stats.rarestCard?.rarity || 'N/A'}</h3>
            <p>Rarest Card</p>
          </div>
        </div>
      )}

      <div className="pokedex-filters">
        <div className="search-container">
          <input
            type="text"
            className="search-input"
            placeholder="Search Pokemon or Set..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowSuggestions(e.target.value.length > 0);
            }}
            onFocus={() => setShowSuggestions(searchTerm.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          
          {showSuggestions && suggestionList.length > 0 && (
            <div className="search-suggestions">
              {suggestionList.map((name) => (
                <div
                  key={name}
                  className="search-suggestion-item"
                  onClick={() => {
                    setSearchTerm(name);
                    setShowSuggestions(false);
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <select
          className="rarity-filter"
          value={filterRarity}
          onChange={(e) => setFilterRarity(e.target.value)}
        >
          <option value="all">All Rarities</option>
          {uniqueRarities.map(rarity => (
            <option key={rarity} value={rarity}>{rarity}</option>
          ))}
        </select>
        
        <select
          className="capture-filter"
          value={filterCaptured}
          onChange={(e) => setFilterCaptured(e.target.value)}
        >
          <option value="all">All Cards</option>
          <option value="captured">Captured</option>
          <option value="uncaptured">Not Captured</option>
        </select>
      </div>

      <div className="pokedex-grid">
        {filteredEntries.length === 0 ? (
          <div className="no-cards">
            <p>No cards match your filters.</p>
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <div 
              key={`${entry.card.id}-${index}`} 
              className={`pokedex-card ${!entry.captured ? 'uncaptured' : ''}`}
              onClick={() => handleCardClick(entry.card)}
              style={{ cursor: 'pointer' }}
            >
              {!entry.captured && (
                <div className="uncaptured-overlay">
                  <span className="lock-icon">🔒</span>
                </div>
              )}
              <div
                className="card-image-wrapper"
                style={{ position: 'relative' }}
                data-set-id={entry.card.setId ?? ''}
                data-set-name={entry.card.setDisplayName ?? entry.card.setName ?? ''}
                title={entry.card.setDisplayName ?? entry.card.setName ? `Set: ${entry.card.setDisplayName ?? entry.card.setName}` : undefined}
              >
                <img
                  src={getCardImageUrl(entry.card.imageUrl)}
                  alt={capitalizeFirst(entry.card.pokemonName)}
                  className="card-image"
                  onError={(e) => handleCardImageError(e, 'pokedex-grid')}
                  data-set-id={entry.card.setId ?? ''}
                  data-set-name={entry.card.setDisplayName ?? entry.card.setName ?? ''}
                />
                {entry.captured && entry.quantity > 1 && (
                  <span className="card-quantity-badge">×{entry.quantity}</span>
                )}
              </div>
              <div className="card-details">
                <h4 className="card-pokemon-name">{capitalizeFirst(entry.card.pokemonName)}</h4>
                {(entry.card.setDisplayName ?? entry.card.setName) && (
                  <span className="card-set-tag">{entry.card.setDisplayName ?? entry.card.setName}</span>
                )}
                <span className={`rarity-badge rarity-tier-${entry.card.tier}`}>
                  {entry.card.rarity}
                </span>
                {entry.card.biomeNames && entry.card.biomeNames.length > 0 && (
                  <div className="card-biome-tags">
                    {entry.card.biomeNames.map((b) => (
                      <span key={b} className="card-tag card-tag-biome">{b}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedCard && (
        <div className="card-viewer-modal" onClick={handleCloseViewer}>
          <div className="card-viewer-content" onClick={(e) => e.stopPropagation()}>
            <button className="card-viewer-close" onClick={handleCloseViewer}>×</button>
            
            <div className="card-viewer-rarity">
              <span className={`rarity-badge rarity-tier-${selectedCard.tier}`}>
                {selectedCard.rarity}
              </span>
              {selectedCard.biomeNames && selectedCard.biomeNames.length > 0 && (
                <div className="card-viewer-biomes">
                  {selectedCard.biomeNames.map((b) => (
                    <span key={b} className="card-tag card-tag-biome">{b}</span>
                  ))}
                </div>
              )}
            </div>

            <div
              ref={imageContainerRef}
              className={`card-viewer-image-container ${isDragging ? 'dragging' : ''}`}
              onMouseDown={handleMouseDown}
            >
              <img
                src={getCardImageUrl(selectedCard.imageUrlLarge || selectedCard.imageUrl)}
                alt={capitalizeFirst(selectedCard.pokemonName)}
                className="card-viewer-image"
                style={{
                  transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`
                }}
                draggable={false}
                onError={(e) => handleCardImageError(e, 'pokedex-viewer')}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
