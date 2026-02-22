/**
 * Card Capture Modal
 * Allows user to select one of three offered cards after winning
 */

import { useState, useMemo, useEffect, useRef } from 'react';

const CARD_PLACEHOLDER_IMAGE = '/images/cards/sets/Pokemon-Card-Back.png';

interface Card {
  id: number;
  tcgdexId: string;
  pokemonName: string;
  setName: string;
  setDisplayName?: string;
  rarity: string;
  tier: number;
  imageUrl: string;
  imageUrlLarge: string | null;
  biomeNames?: string[];
}

interface LevelInfo {
  level: number;
  currentXp: number;
  xpNeeded: number;
  progressPercent: number;
  totalXp: number;
  leveledUp: boolean;
  prevLevel: number;
}

interface SelectedAvatar {
  num: number;
  type: string;
  croppedImage?: string;
}

interface TrainerProfile {
  level: number;
  currentXp: number;
  xpNeeded: number;
  progressPercent: number;
  totalXp: number;
}

interface CardCaptureModalProps {
  gameId: number;
  offeredCards: Card[];
  guaranteedCardId: number;
  pityCardId?: number | null;
  alreadyCaptured?: boolean;
  capturedCardId?: number | null;
  onPlayAgain: () => void;
  onExit: () => void;
  onClose: () => void;
  /** Called immediately after a successful capture, with XP/level data */
  onCaptured?: (xpGained: number, levelInfo: LevelInfo) => void;
  selectedAvatar?: SelectedAvatar | null;
  /** Current trainer profile (used for View Cards mode when no fresh capture happened) */
  trainerProfile?: TrainerProfile | null;
  auth: { token: string };
}

/** Derive set display name from imageUrl path (e.g. team-rocket -> "Team Rocket") */
function getSetDisplayFromImageUrl(imageUrl: string | null | undefined): string {
  if (!imageUrl || typeof imageUrl !== 'string') return '';
  const match = imageUrl.match(/\/images\/cards\/sets\/([^/]+)\//);
  if (!match) return '';
  return match[1]
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function CardCaptureModal({
  gameId,
  offeredCards,
  guaranteedCardId,
  pityCardId = null,
  alreadyCaptured = false,
  capturedCardId = null,
  onPlayAgain,
  onExit,
  onClose,
  onCaptured,
  selectedAvatar = null,
  trainerProfile = null,
  auth
}: CardCaptureModalProps) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [captureXpGained, setCaptureXpGained] = useState<number | null>(null);
  const [captureLevelInfo, setCaptureLevelInfo] = useState<LevelInfo | null>(null);

  // Displayed XP bar values — start at profile baseline and animate to post-capture values
  const [displayedLevel, setDisplayedLevel] = useState(trainerProfile?.level ?? 1);
  const [displayedPercent, setDisplayedPercent] = useState(trainerProfile?.progressPercent ?? 0);
  const [displayedCurrentXp, setDisplayedCurrentXp] = useState(trainerProfile?.currentXp ?? 0);
  const [displayedXpNeeded, setDisplayedXpNeeded] = useState(trainerProfile?.xpNeeded ?? 0);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (alreadyCaptured && capturedCardId) setSelectedCardId(capturedCardId);
  }, [alreadyCaptured, capturedCardId]);

  // Sync displayed values to profile on mount/profile change (before any capture)
  useEffect(() => {
    if (!captureLevelInfo && trainerProfile) {
      setDisplayedLevel(trainerProfile.level);
      setDisplayedPercent(trainerProfile.progressPercent);
      setDisplayedCurrentXp(trainerProfile.currentXp);
      setDisplayedXpNeeded(trainerProfile.xpNeeded);
    }
  }, [trainerProfile, captureLevelInfo]);

  // When capture data arrives, animate the bar to its new position
  useEffect(() => {
    if (!captureLevelInfo) return;
    // Use rAF to ensure browser paints the "before" state first, then animates
    animFrameRef.current = requestAnimationFrame(() => {
      animFrameRef.current = requestAnimationFrame(() => {
        setDisplayedLevel(captureLevelInfo.level);
        setDisplayedPercent(captureLevelInfo.level >= 100 ? 100 : captureLevelInfo.progressPercent);
        setDisplayedCurrentXp(captureLevelInfo.currentXp);
        setDisplayedXpNeeded(captureLevelInfo.xpNeeded);
      });
    });
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [captureLevelInfo]);
  /** After capture, show Play Again / Home instead of closing */
  const [captured, setCaptured] = useState(false);
  /** Card ids that have been revealed: guaranteed always; others only after Capture (or alreadyCaptured) */
  const [revealedIds, setRevealedIds] = useState<Set<number>>(() => new Set([guaranteedCardId]));
  /** Ids currently playing the flip animation */
  const [flippingIds, setFlippingIds] = useState<Set<number>>(new Set());

  /** Order: [mystery, guaranteed, mystery] so guaranteed is in the middle */
  const orderedCards = useMemo(() => {
    if (offeredCards.length !== 3) return offeredCards;
    const guaranteed = offeredCards.find((c) => c.id === guaranteedCardId);
    const others = offeredCards.filter((c) => c.id !== guaranteedCardId);
    if (!guaranteed) return offeredCards;
    return [others[0], guaranteed, others[1]];
  }, [offeredCards, guaranteedCardId]);

  /** When alreadyCaptured, show all cards revealed */
  const effectiveRevealedIds = alreadyCaptured
    ? new Set(orderedCards.map((c) => c.id))
    : revealedIds;

  const handleCardClick = (card: Card) => {
    if (alreadyCaptured || captured) return;
    setSelectedCardId(card.id);
  };

  const handleCapture = async () => {
    if (!selectedCardId || loading || alreadyCaptured) return;
    const isGuaranteedSelected = selectedCardId === guaranteedCardId;
    const leftId = orderedCards[0]?.id;
    const rightId = orderedCards[2]?.id;

    const flipCard = (id: number, delay: number) => {
      setTimeout(() => {
        setRevealedIds((prev) => new Set(prev).add(id));
        setFlippingIds((prev) => new Set(prev).add(id));
        setTimeout(() => setFlippingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }), 600);
      }, delay);
    };

    // 1) If a mystery card was selected, flip it immediately
    if (!isGuaranteedSelected) {
      flipCard(selectedCardId, 0);
    }

    // 2) Flip remaining unselected cards:
    //    - Middle selected → left at 0.5s, right at 1s
    //    - Left or right selected → the other mystery flips 0.5s after the selected one (i.e. at 0.5s)
    const remainingIds = [leftId, rightId].filter((id): id is number => !!id && id !== selectedCardId);

    if (isGuaranteedSelected) {
      // Middle selected: left then right with 0.5s gap each
      if (leftId) flipCard(leftId, 500);
      if (rightId) flipCard(rightId, 1000);
    } else {
      // Mystery selected: the one remaining mystery flips 0.5s later
      remainingIds.forEach((id) => flipCard(id, 500));
    }
    // 3) Call API
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:4000/games/${gameId}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify({ cardId: selectedCardId })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to capture card');
      }
      const data = await response.json();
      setCaptured(true);
      if (data.xpGained != null && data.levelInfo != null) {
        setCaptureXpGained(data.xpGained as number);
        setCaptureLevelInfo(data.levelInfo as LevelInfo);
        onCaptured?.(data.xpGained as number, data.levelInfo as LevelInfo);
      }
    } catch (err: any) {
      console.error('Error capturing card:', err);
      alert(err.message || 'Failed to capture card. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const capitalizeFirst = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getRarityClass = (tier: number) => {
    if (tier <= 2) return 'rarity-legendary';
    if (tier <= 4) return 'rarity-rare';
    return 'rarity-common';
  };

  return (
    <div className="modal-backdrop">
      <div className="card-capture-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Choose Your Card!</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="offered-cards-grid">
          {orderedCards.map((card) => {
            const isGuaranteed = card.id === guaranteedCardId;
            const isSelected = selectedCardId === card.id;
            const isRevealed = effectiveRevealedIds.has(card.id);
            const isFlipping = flippingIds.has(card.id);
            const setLabel = card.setDisplayName ?? (getSetDisplayFromImageUrl(card.imageUrl) || card.setName);
            
            const isPityCard = pityCardId != null && card.id === pityCardId;
            // Only apply rarity colouring when the card face is visible
            const rarityClass = isRevealed ? getRarityClass(card.tier) : '';

            return (
              <div
                key={card.id}
                className={`offered-card ${rarityClass} ${isSelected ? 'selected' : ''} ${!isGuaranteed && !isRevealed ? 'mystery' : ''}`}
                onClick={() => handleCardClick(card)}
              >
                {isGuaranteed && <div className="guaranteed-badge">Guaranteed</div>}
                {isPityCard && <div className="pity-badge">Pity</div>}

                {isGuaranteed ? (
                  /* Guaranteed card always shows its face — no flip needed */
                  <div className="offered-card-face-direct">
                    <img
                      src={card.imageUrlLarge || card.imageUrl}
                      alt={capitalizeFirst(card.pokemonName)}
                      className="card-face-img"
                      onError={(e) => {
                        e.currentTarget.src = CARD_PLACEHOLDER_IMAGE;
                        e.currentTarget.onerror = null;
                      }}
                    />
                  </div>
                ) : (
                  /* Mystery card flips from back to front on reveal */
                  <div className={`offered-card-flip ${isRevealed ? 'revealed' : ''} ${isFlipping ? 'flipping' : ''}`}>
                    <div className="offered-card-face offered-card-back-face">
                      <img
                        src={CARD_PLACEHOLDER_IMAGE}
                        alt="Mystery card"
                        className="card-face-img"
                      />
                    </div>
                    <div className="offered-card-face offered-card-front-face">
                      <img
                        src={card.imageUrlLarge || card.imageUrl}
                        alt={capitalizeFirst(card.pokemonName)}
                        className="card-face-img"
                        onError={(e) => {
                          e.currentTarget.src = CARD_PLACEHOLDER_IMAGE;
                          e.currentTarget.onerror = null;
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Card info always visible below */}
                <div className="offered-card-info">
                  {isGuaranteed || isRevealed ? (
                    <>
                      <h3 className="offered-card-name">{capitalizeFirst(card.pokemonName)}</h3>
                      <div className="offered-card-tags">
                        {setLabel && <span className="card-tag">{setLabel}</span>}
                        <span className="card-tag card-tag-rarity">{card.rarity}</span>
                      </div>
                      {card.biomeNames && card.biomeNames.length > 0 && (
                        <div className="offered-card-tags offered-card-biomes">
                          {card.biomeNames.map((biome) => (
                            <span key={biome} className="card-tag card-tag-biome">{biome}</span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <h3 className="offered-card-name">Mystery Card</h3>
                      <div className="offered-card-tags">
                        <span className="card-tag">?</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trainer strip — always visible when profile data is available */}
        {(captureLevelInfo ?? trainerProfile) != null && (
          <div className="capture-trainer-strip">
            <div className={`capture-trainer-avatar ${selectedAvatar ? `type-${selectedAvatar.type}` : ''}`}>
              {selectedAvatar ? (
                <img
                  src={selectedAvatar.croppedImage ?? `/images/profiles/avatars/${selectedAvatar.num}-${selectedAvatar.type}.png`}
                  alt="Trainer avatar"
                />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              )}
            </div>

            <div className="capture-trainer-info">
              <div className="capture-trainer-top-row">
                <span className="capture-trainer-level">Lv.{displayedLevel}</span>
                {captured && captureXpGained != null && (
                  <span className="capture-xp-gained">+{captureXpGained.toLocaleString()} XP</span>
                )}
                {captured && captureLevelInfo?.leveledUp && (
                  <span className="capture-levelup-badge">Level Up!</span>
                )}
              </div>
              <div className="capture-trainer-bar-wrap">
                <div className="capture-trainer-bar">
                  <div
                    className="capture-trainer-bar-fill"
                    style={{ width: `${displayedPercent}%` }}
                  />
                </div>
                <span className="capture-trainer-xp-label">
                  {displayedLevel >= 100
                    ? 'Max level'
                    : `${displayedCurrentXp.toLocaleString()} / ${displayedXpNeeded.toLocaleString()} XP`}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions">
          {captured || alreadyCaptured ? (
            <div className="modal-actions-buttons">
              <button
                className="play-again-button"
                onClick={() => {
                  if (captured) onClose();
                  onPlayAgain();
                }}
              >
                🎮 Play Again
              </button>
              <button
                className="exit-button"
                onClick={() => {
                  if (captured) onClose();
                  onExit();
                }}
              >
                🏠 Home
              </button>
            </div>
          ) : (
            <button
              className="capture-button"
              onClick={handleCapture}
              disabled={!selectedCardId || loading}
            >
              {loading ? 'Capturing...' : 'Confirm Capture'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
