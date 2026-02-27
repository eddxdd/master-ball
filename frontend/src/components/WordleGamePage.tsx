/**
 * Wordle Game Page
 * Main Pokemon Wordle gameplay interface
 */

import { useState, useEffect } from 'react';
import { CardRewardsModal } from './CardRewardsModal';
import { API_URL } from '../api';

interface Pokemon {
  id: number;
  name: string;
  imageUrl: string | null;
  pokedexNumber?: number;
  type1?: string;
  type2?: string | null;
  evolutionStage?: number;
  fullyEvolved?: boolean;
  color?: string;
  generation?: number;
}

interface GuessFeedback {
  type1: 'correct' | 'partial' | 'wrong' | 'n/a';
  type2: 'correct' | 'partial' | 'wrong' | 'n/a';
  evolutionStage: 'correct' | 'wrong' | 'n/a';
  fullyEvolved: 'correct' | 'wrong' | 'n/a';
  color: 'correct' | 'wrong' | 'n/a';
  generation: 'correct' | 'wrong' | 'n/a';
}

interface Guess {
  guessNum: number;
  pokemon: Pokemon;
  feedback: GuessFeedback;
}

interface PityInfo {
  consecutiveTier6: number;
  consecutiveTier5: number;
  consecutiveTier4: number;
  consecutiveTier3: number;
  consecutiveTier2: number;
  gamesWithoutCeiling: number;
  hardPityCounter: number;
  totalGames: number;
}

interface WordleGamePageProps {
  gameId: number;
  onGameComplete: (won: boolean, tier: number, offeredCards: any[], guaranteedCardId: number | null, pityCardId: number | null) => void;
  onOpenCardCaptureModal?: (capturedCardId: number | null) => void;
  shouldRefetch?: boolean;
  onBack: () => void;
  auth: { token: string; user?: { role?: string } };
}

export function WordleGamePage({ gameId, onGameComplete, onOpenCardCaptureModal, shouldRefetch, onBack, auth }: WordleGamePageProps) {
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [pokemonList, setPokemonList] = useState<Pokemon[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPokemon, setSelectedPokemon] = useState<Pokemon | null>(null);
  const [loading, setLoading] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [won, setWon] = useState(false);
  const [answer, setAnswer] = useState<Pokemon | null>(null);
  const [tier, setTier] = useState<number | null>(null);
  const [_biomeId, setBiomeId] = useState<number | null>(null);
  const [biomeName, setBiomeName] = useState<string | null>(null);
  const [biomeImageUrl, setBiomeImageUrl] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [offeredCards, setOfferedCards] = useState<any[]>([]);
  const [guaranteedCardId, setGuaranteedCardId] = useState<number | null>(null);
  const [pityCardId, setPityCardId] = useState<number | null>(null);
  const [cardCaptured, setCardCaptured] = useState(false);
  const [capturedCardId, setCapturedCardId] = useState<number | null>(null);
  const [pity, setPity] = useState<PityInfo | null>(null);
  const [showCardRewardsModal, setShowCardRewardsModal] = useState(false);

  const maxGuesses = 6;
  const isAdmin = auth.user?.role === 'ADMIN';
  
  const capitalizeFirst = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  useEffect(() => {
    fetchGameState();
  }, [gameId]);
  
  // Refetch when shouldRefetch prop changes
  useEffect(() => {
    if (shouldRefetch) {
      fetchGameState();
    }
  }, [shouldRefetch]);

  const fetchGameState = async () => {
    try {
      const response = await fetch(`${API_URL}/games/${gameId}`, {
        headers: {
          'Authorization': `Bearer ${auth.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch game state');
      }
      
      const data = await response.json();
      setGuesses(data.guesses || []);
      setGameCompleted(data.completed);
      setWon(data.won);
      setTier(data.tier);
      setBiomeId(data.biome.id);
      setBiomeName(data.biome.name ?? null);
      setBiomeImageUrl(data.biome.imageUrl ?? null);
      setTimeOfDay(data.timeOfDay);
      setPity(data.pity || null);
      
      setCardCaptured(!!data.capturedCardId);
      setCapturedCardId(data.capturedCardId ?? null);
      
      // Answer: when completed (all users) or always when admin
      setAnswer(data.answer || null);
      
      if (data.completed && data.offeredCards && data.offeredCards.length === 3) {
        setOfferedCards(data.offeredCards);
      }
      
      // Fetch ALL Pokemon (not just biome-specific)
      fetchAllPokemon();
    } catch (err) {
      console.error('Error fetching game state:', err);
    }
  };

  const fetchAllPokemon = async () => {
    try {
      const response = await fetch(`${API_URL}/games/pokemon`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch Pokemon list');
      }
      
      const data = await response.json();
      setPokemonList(data);
    } catch (err) {
      console.error('Error fetching Pokemon list:', err);
    }
  };

  const handleSubmitGuess = async () => {
    if (!selectedPokemon || loading) return;
    
    try {
      setLoading(true);
      
      const response = await fetch(`${API_URL}/games/${gameId}/guess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify({ pokemonId: selectedPokemon.id })
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit guess');
      }
      
      const data = await response.json();
      
      setGuesses([...guesses, data.guess]);
      setSelectedPokemon(null);
      setSearchTerm('');
      
      if (data.gameCompleted) {
        setGameCompleted(true);
        setWon(data.won);
        setAnswer(data.answer);
        setTier(data.tier);
        
        console.log('Game completed response:', { 
          won: data.won, 
          tier: data.tier,
          offeredCards: data.offeredCards,
          offeredCardsLength: data.offeredCards?.length 
        });
        
        const cards = Array.isArray(data.offeredCards) && data.offeredCards.length === 3
          ? data.offeredCards
          : [];
        setOfferedCards(cards);
        const gid: number | null = data.guaranteedCardId ?? (cards[0]?.id ?? null);
        const pid: number | null = data.pityCardId ?? null;
        setGuaranteedCardId(gid);
        setPityCardId(pid);
        
        if (cards.length === 3) {
          onGameComplete(data.won, data.tier, cards, gid, pid);
        } else {
          // Cards weren't in the initial response — refetch once
          const refetch = await fetch(`${API_URL}/games/${gameId}`, {
            headers: { 'Authorization': `Bearer ${auth.token}` }
          });
          if (refetch.ok) {
            const gameData = await refetch.json();
            if (Array.isArray(gameData.offeredCards) && gameData.offeredCards.length === 3) {
              const gid2: number | null = gameData.guaranteedCardId ?? (gameData.offeredCards[0]?.id ?? null);
              const pid2: number | null = gameData.pityCardId ?? null;
              setOfferedCards(gameData.offeredCards);
              setGuaranteedCardId(gid2);
              setPityCardId(pid2);
              onGameComplete(data.won, data.tier, gameData.offeredCards, gid2, pid2);
            }
            // If still no cards, the "View Your Cards" button in the result section
            // lets the player retry manually without blocking the UI.
          }
        }
      }
    } catch (err) {
      console.error('Error submitting guess:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPokemon = pokemonList.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFeedbackIcon = (feedback: 'correct' | 'partial' | 'wrong' | 'n/a') => {
    if (feedback === 'n/a') return <span className="na-indicator">✕</span>;
    if (feedback === 'correct') return '🟢'; // Master Ball
    if (feedback === 'partial') return '🟡'; // Great Ball
    return '⚪'; // Poke Ball
  };

  const renderGuessGrid = () => {
    const rows = [];
    
    for (let i = 0; i < maxGuesses; i++) {
      const guess = guesses[i];
      
      if (guess) {
        rows.push(
          <div key={i} className="wordle-row">
            <div className="wordle-cell pokemon-name">
              {capitalizeFirst(guess.pokemon.name)}
              {guess.pokemon.imageUrl && (
                <img src={guess.pokemon.imageUrl} alt={capitalizeFirst(guess.pokemon.name)} className="pokemon-icon" />
              )}
            </div>
            <div className={`wordle-cell feedback-${guess.feedback.type1.replace('/', '-')}`}>
              {getFeedbackIcon(guess.feedback.type1)}
            </div>
            <div className={`wordle-cell feedback-${guess.feedback.type2.replace('/', '-')}`}>
              {getFeedbackIcon(guess.feedback.type2)}
            </div>
            <div className={`wordle-cell feedback-${guess.feedback.evolutionStage.replace('/', '-')}`}>
              {getFeedbackIcon(guess.feedback.evolutionStage)}
            </div>
            <div className={`wordle-cell feedback-${guess.feedback.fullyEvolved.replace('/', '-')}`}>
              {getFeedbackIcon(guess.feedback.fullyEvolved)}
            </div>
            <div className={`wordle-cell feedback-${guess.feedback.color.replace('/', '-')}`}>
              {getFeedbackIcon(guess.feedback.color)}
            </div>
            <div className={`wordle-cell feedback-${guess.feedback.generation.replace('/', '-')}`}>
              {getFeedbackIcon(guess.feedback.generation)}
            </div>
          </div>
        );
      } else {
        rows.push(
          <div key={i} className="wordle-row empty">
            <div className="wordle-cell"></div>
            <div className="wordle-cell"></div>
            <div className="wordle-cell"></div>
            <div className="wordle-cell"></div>
            <div className="wordle-cell"></div>
            <div className="wordle-cell"></div>
            <div className="wordle-cell"></div>
          </div>
        );
      }
    }
    
    return rows;
  };

  const renderAnswerRow = () => {
    if (!answer) return null;

    const type2Label = answer.type2 ? capitalizeFirst(answer.type2) : '—';
    const evolvedLabel = answer.fullyEvolved != null ? (answer.fullyEvolved ? 'Yes' : 'No') : '?';

    return (
      <>
        <div className="answer-row-divider">
          <span className="answer-row-label">✦ Answer ✦</span>
        </div>
        <div className="wordle-row answer-row">
          <div className="wordle-cell pokemon-name answer-cell">
            {answer.imageUrl
              ? <img src={answer.imageUrl} alt={capitalizeFirst(answer.name)} className="pokemon-icon" />
              : answer.pokedexNumber
                ? <img
                    src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${answer.pokedexNumber}.png`}
                    alt={capitalizeFirst(answer.name)}
                    className="pokemon-icon"
                  />
                : null
            }
            <span className="answer-pokemon-name">{capitalizeFirst(answer.name)}</span>
          </div>
          <div className="wordle-cell answer-cell">
            <span className="answer-value">{answer.type1 ? capitalizeFirst(answer.type1) : '?'}</span>
          </div>
          <div className="wordle-cell answer-cell">
            <span className="answer-value">{type2Label}</span>
          </div>
          <div className="wordle-cell answer-cell">
            <span className="answer-value">{answer.evolutionStage ?? '?'}</span>
          </div>
          <div className="wordle-cell answer-cell">
            <span className="answer-value">{evolvedLabel}</span>
          </div>
          <div className="wordle-cell answer-cell">
            <span className="answer-value">{answer.color ? capitalizeFirst(answer.color) : '?'}</span>
          </div>
          <div className="wordle-cell answer-cell">
            <span className="answer-value">{answer.generation ?? '?'}</span>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="wordle-game-page">
      <div className="wordle-header">
        <button onClick={onBack} className="back-button">← Back</button>
        <h2>Pokemon Wordle</h2>
        <div className="guess-counter">
          Guesses: {guesses.length} / {maxGuesses}
        </div>
      </div>

      <div className="wordle-top-bar">
        <div className="card-rewards-button-wrap">
          <button
            type="button"
            className="card-rewards-button"
            onClick={() => setShowCardRewardsModal(true)}
          >
            🎴 Card Rewards
          </button>
        </div>

        {biomeName && (
          <div className="biome-indicator">
            {biomeImageUrl && (
              <div className="biome-indicator-img-wrap">
                <img
                  src={biomeImageUrl}
                  alt={biomeName}
                  className="biome-indicator-img"
                />
                {/* Night overlay */}
                {timeOfDay === 'night' && <div className="biome-indicator-night-overlay" />}
              </div>
            )}
            <div className="biome-indicator-text">
              <span className="biome-indicator-name">{biomeName}</span>
              <span className={`biome-indicator-time biome-indicator-time--${timeOfDay ?? 'day'}`}>
                {timeOfDay === 'night' ? '🌙 Night' : '☀️ Day'}
              </span>
            </div>
          </div>
        )}
      </div>

      {showCardRewardsModal && (
        <CardRewardsModal
          pity={pity}
          onClose={() => setShowCardRewardsModal(false)}
        />
      )}

      <div className="wordle-grid-container">
        <div className="wordle-grid-header">
          <div className="header-cell">Pokemon</div>
          <div className="header-cell">Type 1</div>
          <div className="header-cell">Type 2</div>
          <div className="header-cell">Stage</div>
          <div className="header-cell">Evolved</div>
          <div className="header-cell">Color</div>
          <div className="header-cell">Gen</div>
        </div>
        
        <div className="wordle-grid">
          {renderGuessGrid()}
          {(gameCompleted || (isAdmin && answer)) && renderAnswerRow()}
        </div>
      </div>

      {!gameCompleted && (
        <div className="guess-input-section">
          <input
            type="text"
            className="pokemon-search"
            placeholder="Search Pokemon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          
          {searchTerm && (
            <div className="pokemon-suggestions">
              {filteredPokemon.slice(0, 10).map(p => (
                <div
                  key={p.id}
                  className="pokemon-suggestion"
                  onClick={() => {
                    setSelectedPokemon(p);
                    setSearchTerm(capitalizeFirst(p.name));
                  }}
                >
                  {capitalizeFirst(p.name)}
                </div>
              ))}
            </div>
          )}
          
          <button
            className="submit-guess-button"
            onClick={handleSubmitGuess}
            disabled={!selectedPokemon || loading}
          >
            {loading ? 'Submitting...' : 'Submit Guess'}
          </button>
        </div>
      )}

      {gameCompleted && (
        <div className="game-result">
          <h3>{won ? '🎉 You Won!' : '😔 Game Over'}</h3>
          {answer && (
            <div className="answer-reveal">
              <p>The Pokemon was:</p>
              <div className="answer-pokemon">
                <img 
                  src={
                    offeredCards.length === 3
                      ? (offeredCards[0].imageUrlLarge || offeredCards[0].imageUrl)
                      : (answer as any).imageUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${(answer as any).pokedexNumber ?? (answer as any).id ?? 0}.png`
                  }
                  alt={capitalizeFirst(answer.name)}
                  className="answer-card-image"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes('official-artwork')) return;
                    const a = answer as any;
                    target.src = a?.imageUrl || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${a?.pokedexNumber ?? a?.id ?? 0}.png`;
                  }}
                />
                <h4>{capitalizeFirst(answer.name)}</h4>
              </div>
            </div>
          )}
          {tier && <p className="tier-result">Performance: Tier {tier}</p>}
          
          <div className="game-result-actions">
            {!cardCaptured && (
              <button 
                className="view-cards-button"
                onClick={async () => {
                  if (offeredCards.length === 3) {
                    onGameComplete(won, tier || 6, offeredCards, guaranteedCardId, pityCardId);
                    return;
                  }
                  const refetch = await fetch(`${API_URL}/games/${gameId}`, {
                    headers: { 'Authorization': `Bearer ${auth.token}` }
                  });
                  if (refetch.ok) {
                    const gameData = await refetch.json();
                    if (Array.isArray(gameData.offeredCards) && gameData.offeredCards.length === 3) {
                      setOfferedCards(gameData.offeredCards);
                      const gid = gameData.guaranteedCardId ?? (gameData.offeredCards[0]?.id ?? null);
                      const pid = gameData.pityCardId ?? null;
                      setGuaranteedCardId(gid);
                      setPityCardId(pid);
                      onGameComplete(won, tier || 6, gameData.offeredCards, gid, pid);
                    } else {
                      alert('Cards are still loading. Please try again in a moment.');
                    }
                  } else {
                    alert('Failed to load cards. Please try again.');
                  }
                }}
              >
                🎴 View Your Cards
              </button>
            )}
            
            {cardCaptured && (
              <>
                {onOpenCardCaptureModal && (
                  <button
                    type="button"
                    className="view-cards-button"
                    onClick={() => onOpenCardCaptureModal(capturedCardId)}
                  >
                    🎴 View Cards
                  </button>
                )}
                <button 
                  className="play-again-button"
                  onClick={onBack}
                >
                  🎮 Play Again
                </button>
                <button 
                  className="exit-button"
                  onClick={() => window.location.href = '/'}
                >
                  🏠 Home
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
