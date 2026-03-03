/**
 * Biome Selection Page
 * Main entry point for the Pokemon Wordle game
 */

import { useState, useEffect } from 'react';
import { API_URL } from '../api';

interface Biome {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

interface BiomeSelectionPageProps {
  onStartGame: (biomeId: number, timeOfDay: 'day' | 'night') => void;
}

export function BiomeSelectionPage({ onStartGame }: BiomeSelectionPageProps) {
  const [biomes, setBiomes] = useState<Biome[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<'day' | 'night'>('day');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBiomes();
  }, []);

  const fetchBiomes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/biomes`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch biomes');
      }
      
      const data = await response.json();
      setBiomes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleBiomeClick = (biomeId: number) => {
    onStartGame(biomeId, timeOfDay);
  };

  if (loading) {
    return (
      <div className="biome-selection-loading">
        <div className="loading-spinner"></div>
        <p>Loading biomes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="biome-selection-error">
        <p className="error-message">{error}</p>
        <button onClick={fetchBiomes} className="retry-button">Retry</button>
      </div>
    );
  }

  if (biomes.length === 0) {
    return (
      <div className="biome-selection-page">
        <header className="biome-selection-header">
          <h1>Select Your Biome</h1>
          <p className="subtitle">Choose where your Pokemon adventure begins</p>
        </header>
        <div className="biome-selection-empty">
          <p>No biomes available.</p>
          <p className="biome-selection-empty-hint">
            The database has not been seeded with biomes yet. Run the Wordle seed script on the server (e.g. <code>npx tsx src/scripts/seedWordle.ts</code>) to populate biomes and Pokemon spawns.
          </p>
          <button onClick={fetchBiomes} className="retry-button">Retry</button>
        </div>
      </div>
    );
  }
  return (
    <div className="biome-selection-page">
      <header className="biome-selection-header">
        <h1>Select Your Biome</h1>
        <p className="subtitle">Choose where your Pokemon adventure begins</p>
        
        <div className="time-toggle">
          <button
            className={`time-button ${timeOfDay === 'day' ? 'active' : ''}`}
            onClick={() => setTimeOfDay('day')}
          >
            ☀️ Day
          </button>
          <button
            className={`time-button ${timeOfDay === 'night' ? 'active' : ''}`}
            onClick={() => setTimeOfDay('night')}
          >
            🌙 Night
          </button>
        </div>
      </header>

      <div className="biomes-grid">
        {biomes.map((biome) => (
          <div
            key={biome.id}
            className="biome-card"
            onClick={() => handleBiomeClick(biome.id)}
          >
            <div className="biome-card-image">
              {biome.imageUrl ? (
                <img
                  src={biome.imageUrl}
                  alt={biome.name}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const placeholder = e.currentTarget.nextElementSibling;
                    if (placeholder) (placeholder as HTMLElement).style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="biome-placeholder"
                style={{ display: biome.imageUrl ? 'none' : 'flex' }}
              >
                {biome.name.charAt(0)}
              </div>
            </div>
            <div className="biome-card-content">
              <h3 className="biome-name">{biome.name}</h3>
              {biome.description && (
                <p className="biome-description">{biome.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
