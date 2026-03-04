/**
 * Auction House Page
 * Browse active trade listings and manage your own auctions
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAuctions,
  getMyAuctions,
  createAuction,
  acceptAuction,
  cancelAuction,
  getCollection,
  API_URL,
  getCardImageUrl,
  handleCardImageError,
  CARD_PLACEHOLDER_IMAGE,
  type Auction,
  type CollectionEntry,
  type AcceptAuctionResponse,
} from '../api';

const MAX_ACTIVE_AUCTIONS = 3;

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m left`;
}

interface AuctionHousePageProps {
  auth: { token: string; user: { id: number; username: string } };
  onBack: () => void;
}

type Tab = 'browse' | 'my';
type ModalStep = 'pick-offered' | 'pick-wanted';

interface AllCard {
  id: number;
  pokemonName: string;
  setName: string;
  rarity: string;
  tier: number;
  imageUrl: string;
  imageUrlLarge: string | null;
  pokemon: { pokedexNumber: number };
}

export function AuctionHousePage({ auth, onBack }: AuctionHousePageProps) {
  const [tab, setTab] = useState<Tab>('browse');

  // Browse state
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseSearch, setBrowseSearch] = useState('');
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // My auctions state
  const [myAuctions, setMyAuctions] = useState<Auction[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Create auction modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('pick-offered');
  const [collection, setCollection] = useState<CollectionEntry[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [selectedOffered, setSelectedOffered] = useState<CollectionEntry | null>(null);
  const [allCards, setAllCards] = useState<AllCard[]>([]);
  const [allCardsLoading, setAllCardsLoading] = useState(false);
  const [wantedSearch, setWantedSearch] = useState('');
  const [selectedWanted, setSelectedWanted] = useState<AllCard | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Accept confirmation
  const [acceptConfirm, setAcceptConfirm] = useState<{ auction: Auction; userCardId: number } | null>(null);

  // XP gain toast shown after a successful trade
  const [xpToast, setXpToast] = useState<AcceptAuctionResponse | null>(null);

  const loadBrowse = useCallback(async () => {
    setBrowseLoading(true);
    const res = await getAuctions(auth.token);
    if (res.data) setAuctions(res.data);
    setBrowseLoading(false);
  }, [auth.token]);

  const loadMyAuctions = useCallback(async () => {
    setMyLoading(true);
    const res = await getMyAuctions(auth.token);
    if (res.data) setMyAuctions(res.data);
    setMyLoading(false);
  }, [auth.token]);

  useEffect(() => {
    loadBrowse();
  }, [loadBrowse]);

  useEffect(() => {
    if (tab === 'my') loadMyAuctions();
  }, [tab, loadMyAuctions]);

  const activeMyCount = myAuctions.filter((a) => a.status === 'active').length;

  // ---- Accept flow ----

  const handleAcceptClick = (auction: Auction) => {
    setAcceptError(null);
    // Find which UserCard instance to use (first available unlocked copy of wantedCardId)
    // We trust canFulfill from the server; userCardId is not returned yet, so we need to
    // find it from the collection. But collection is only loaded for create modal.
    // Instead, call the collection endpoint inline.
    doAccept(auction);
  };

  const doAccept = async (auction: Auction) => {
    setAcceptingId(auction.id);
    setAcceptError(null);
    try {
      // Fetch user's unlocked instances of the wanted card
      const collRes = await getCollection(auth.token);
      if (!collRes.data) {
        setAcceptError('Failed to load your collection.');
        setAcceptingId(null);
        return;
      }
      const entry = collRes.data.find((e) => e.card.id === auction.wantedCardId);
      if (!entry || entry.instances.length === 0) {
        setAcceptError('You no longer have an available copy of this card.');
        setAcceptingId(null);
        return;
      }
      // Use the oldest copy (first obtained)
      const instance = entry.instances[entry.instances.length - 1];
      setAcceptConfirm({ auction, userCardId: instance.id });
    } catch {
      setAcceptError('An error occurred.');
    }
    setAcceptingId(null);
  };

  const confirmAccept = async () => {
    if (!acceptConfirm) return;
    setAcceptingId(acceptConfirm.auction.id);
    const res = await acceptAuction(acceptConfirm.auction.id, { userCardId: acceptConfirm.userCardId }, auth.token);
    if (res.error) {
      setAcceptError(res.error);
    } else {
      setAcceptConfirm(null);
      loadBrowse();
      if (res.data && res.data.xpGained > 0) {
        setXpToast(res.data);
        setTimeout(() => setXpToast(null), 4000);
      }
    }
    setAcceptingId(null);
  };

  // ---- Cancel flow ----

  const handleCancel = async (auctionId: number) => {
    setCancellingId(auctionId);
    const res = await cancelAuction(auctionId, auth.token);
    if (!res.error) {
      setMyAuctions((prev) =>
        prev.map((a) => (a.id === auctionId ? { ...a, status: 'cancelled' } : a))
      );
    }
    setCancellingId(null);
  };

  // ---- Create modal flow ----

  const openCreateModal = async () => {
    setShowCreateModal(true);
    setModalStep('pick-offered');
    setSelectedOffered(null);
    setSelectedWanted(null);
    setCreateError(null);
    setWantedSearch('');
    setCollectionLoading(true);
    const res = await getCollection(auth.token);
    if (res.data) setCollection(res.data);
    setCollectionLoading(false);
  };

  const goToPickWanted = async () => {
    if (!selectedOffered) return;
    setModalStep('pick-wanted');
    if (allCards.length === 0) {
      setAllCardsLoading(true);
      const res = await fetch(`${API_URL}/pokedex/cards/all`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (res.ok) {
        const data: AllCard[] = await res.json();
        setAllCards(data);
      }
      setAllCardsLoading(false);
    }
  };

  const submitCreate = async () => {
    if (!selectedOffered || !selectedWanted) return;
    const instance = selectedOffered.instances[selectedOffered.instances.length - 1];
    setCreating(true);
    setCreateError(null);
    const res = await createAuction(
      { offeredUserCardId: instance.id, wantedCardId: selectedWanted.id },
      auth.token
    );
    if (res.error) {
      setCreateError(res.error);
    } else {
      setShowCreateModal(false);
      setTab('my');
      loadMyAuctions();
    }
    setCreating(false);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setCreateError(null);
  };

  // Filtered browse results
  const filteredAuctions = auctions.filter((a) => {
    if (!browseSearch) return true;
    const q = browseSearch.toLowerCase();
    return (
      a.offeredUserCard.card.pokemonName.toLowerCase().includes(q) ||
      a.wantedCard.pokemonName.toLowerCase().includes(q) ||
      a.creator.username.toLowerCase().includes(q)
    );
  });

  // Filtered wanted card results (exclude offered card)
  const filteredWanted = allCards
    .filter((c) => {
      if (selectedOffered && c.id === selectedOffered.card.id) return false;
      if (!wantedSearch) return true;
      return c.pokemonName.toLowerCase().includes(wantedSearch.toLowerCase());
    })
    .slice(0, 60);

  return (
    <div className="pokedex-page">
      <div className="pokedex-header">
        <button onClick={onBack} className="back-button">← Back</button>
        <h2>Auction House</h2>
        <div style={{ width: 80 }} />
      </div>

      {/* XP gain toast */}
      {xpToast && (
        <div className="auction-xp-toast">
          <span className="auction-xp-icon">★</span>
          <div>
            <div className="auction-xp-title">New card collected!</div>
            <div className="auction-xp-amount">+{xpToast.xpGained.toLocaleString()} XP</div>
            {xpToast.levelInfo && (
              <div className="auction-xp-level">Level {xpToast.levelInfo.level}</div>
            )}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="auction-tabs">
        <button
          className={`auction-tab${tab === 'browse' ? ' active' : ''}`}
          onClick={() => setTab('browse')}
        >
          Browse Listings
        </button>
        <button
          className={`auction-tab${tab === 'my' ? ' active' : ''}`}
          onClick={() => setTab('my')}
        >
          My Auctions
          {activeMyCount > 0 && (
            <span className="auction-tab-badge">{activeMyCount}/{MAX_ACTIVE_AUCTIONS}</span>
          )}
        </button>
      </div>

      {/* ---- BROWSE TAB ---- */}
      {tab === 'browse' && (
        <div>
          <div className="auction-browse-header">
            <input
              className="search-input auction-browse-search"
              placeholder="Search by Pokémon or trainer..."
              value={browseSearch}
              onChange={(e) => setBrowseSearch(e.target.value)}
            />
            <button className="auction-refresh-btn" onClick={loadBrowse}>↺ Refresh</button>
          </div>

          {acceptError && (
            <div className="auction-error-banner">{acceptError}</div>
          )}

          {browseLoading ? (
            <div className="pokedex-loading"><div className="loading-spinner" /><p>Loading listings...</p></div>
          ) : filteredAuctions.length === 0 ? (
            <div className="auction-empty">
              <p>No active listings found.</p>
              <p style={{ color: '#8c9eb0', fontSize: '0.9rem' }}>
                Be the first to post one in My Auctions!
              </p>
            </div>
          ) : (
            <div className="auction-grid">
              {filteredAuctions.map((auction) => (
                <AuctionCard
                  key={auction.id}
                  auction={auction}
                  onAccept={() => handleAcceptClick(auction)}
                  accepting={acceptingId === auction.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- MY AUCTIONS TAB ---- */}
      {tab === 'my' && (
        <div>
          <div className="auction-browse-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ color: '#8c9eb0' }}>
                {activeMyCount}/{MAX_ACTIVE_AUCTIONS} active slots used
              </span>
            </div>
            <button
              className="auction-create-btn"
              onClick={openCreateModal}
              disabled={activeMyCount >= MAX_ACTIVE_AUCTIONS}
              title={activeMyCount >= MAX_ACTIVE_AUCTIONS ? 'You have reached the max number of active auctions' : undefined}
            >
              + Create Auction
            </button>
          </div>

          {myLoading ? (
            <div className="pokedex-loading"><div className="loading-spinner" /><p>Loading your auctions...</p></div>
          ) : myAuctions.length === 0 ? (
            <div className="auction-empty">
              <p>You have no auctions yet.</p>
              <p style={{ color: '#8c9eb0', fontSize: '0.9rem' }}>
                Create one to trade your duplicate cards!
              </p>
            </div>
          ) : (
            <div className="auction-grid">
              {myAuctions.map((auction) => (
                <MyAuctionCard
                  key={auction.id}
                  auction={auction}
                  onCancel={() => handleCancel(auction.id)}
                  cancelling={cancellingId === auction.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- CREATE AUCTION MODAL ---- */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="auction-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                {modalStep === 'pick-offered' ? 'Step 1: Choose a card to offer' : 'Step 2: Choose the card you want'}
              </h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            {createError && (
              <div className="auction-error-banner" style={{ margin: '0 1.5rem' }}>{createError}</div>
            )}

            <div className="auction-modal-body">
              {modalStep === 'pick-offered' && (
                <>
                  {collectionLoading ? (
                    <div className="pokedex-loading"><div className="loading-spinner" /><p>Loading collection...</p></div>
                  ) : collection.length === 0 ? (
                    <div className="auction-empty"><p>You have no available cards to offer.</p></div>
                  ) : (
                    <div className="auction-pick-grid">
                      {collection.map((entry) => (
                        <div
                          key={entry.card.id}
                          className={`auction-pick-card${selectedOffered?.card.id === entry.card.id ? ' selected' : ''}`}
                          onClick={() => setSelectedOffered(entry)}
                        >
                          <div className="card-image-wrapper" style={{ position: 'relative' }}>
                            <img
                              src={getCardImageUrl(entry.card.imageUrl)}
                              alt={capitalizeFirst(entry.card.pokemonName)}
                              className="card-image"
                              onError={(e) => handleCardImageError(e, 'auction-house')}
                            />
                            {entry.quantity > 1 && (
                              <span className="card-quantity-badge">×{entry.quantity}</span>
                            )}
                          </div>
                          <div className="card-details">
                            <h4 className="card-pokemon-name">{capitalizeFirst(entry.card.pokemonName)}</h4>
                            <span className={`rarity-badge rarity-tier-${entry.card.tier}`}>{entry.card.rarity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {modalStep === 'pick-wanted' && (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <input
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="Search Pokémon name..."
                      value={wantedSearch}
                      onChange={(e) => setWantedSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {allCardsLoading ? (
                    <div className="pokedex-loading"><div className="loading-spinner" /><p>Loading cards...</p></div>
                  ) : (
                    <div className="auction-pick-grid">
                      {filteredWanted.map((card) => (
                        <div
                          key={card.id}
                          className={`auction-pick-card${selectedWanted?.id === card.id ? ' selected' : ''}`}
                          onClick={() => setSelectedWanted(card)}
                        >
                          <div className="card-image-wrapper">
                            <img
                              src={getCardImageUrl(card.imageUrl)}
                              alt={capitalizeFirst(card.pokemonName)}
                              className="card-image"
                              onError={(e) => handleCardImageError(e, 'auction-house')}
                            />
                          </div>
                          <div className="card-details">
                            <h4 className="card-pokemon-name">{capitalizeFirst(card.pokemonName)}</h4>
                            <span className={`rarity-badge rarity-tier-${card.tier}`}>{card.rarity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Summary bar */}
            {(selectedOffered || selectedWanted) && (
              <div className="auction-summary-bar">
                <div className="auction-summary-card">
                  {selectedOffered ? (
                    <>
                      <img
                        src={getCardImageUrl(selectedOffered.card.imageUrl)}
                        alt={selectedOffered.card.pokemonName}
                        className="auction-summary-img"
                        onError={(e) => handleCardImageError(e, 'auction-house')}
                      />
                      <span>{capitalizeFirst(selectedOffered.card.pokemonName)}</span>
                    </>
                  ) : (
                    <span style={{ color: '#8c9eb0' }}>Offering...</span>
                  )}
                </div>
                <div className="auction-summary-arrow">⇄</div>
                <div className="auction-summary-card">
                  {selectedWanted ? (
                    <>
                      <img
                        src={getCardImageUrl(selectedWanted.imageUrl)}
                        alt={selectedWanted.pokemonName}
                        className="auction-summary-img"
                        onError={(e) => handleCardImageError(e, 'auction-house')}
                      />
                      <span>{capitalizeFirst(selectedWanted.pokemonName)}</span>
                    </>
                  ) : (
                    <span style={{ color: '#8c9eb0' }}>Wanting...</span>
                  )}
                </div>
              </div>
            )}

            <div className="modal-footer">
              {modalStep === 'pick-offered' ? (
                <>
                  <button className="modal-btn-cancel" onClick={closeModal}>Cancel</button>
                  <button
                    className="modal-btn-primary"
                    onClick={goToPickWanted}
                    disabled={!selectedOffered}
                  >
                    Next →
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="modal-btn-cancel"
                    onClick={() => { setModalStep('pick-offered'); setSelectedWanted(null); }}
                  >
                    ← Back
                  </button>
                  <button
                    className="modal-btn-primary"
                    onClick={submitCreate}
                    disabled={!selectedWanted || creating}
                  >
                    {creating ? 'Posting...' : 'Post Auction'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- ACCEPT CONFIRMATION ---- */}
      {acceptConfirm && (
        <div className="modal-overlay" onClick={() => setAcceptConfirm(null)}>
          <div className="auction-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Confirm Trade</h3>
              <button className="modal-close" onClick={() => setAcceptConfirm(null)}>×</button>
            </div>
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div className="auction-confirm-trade">
                <div className="auction-confirm-side">
                  <p style={{ color: '#8c9eb0', marginBottom: '0.5rem', fontSize: '0.85rem' }}>You give</p>
                  <img
                    src={getCardImageUrl(acceptConfirm.auction.wantedCard.imageUrl)}
                    alt={acceptConfirm.auction.wantedCard.pokemonName}
                    className="auction-confirm-card-img"
                    onError={(e) => handleCardImageError(e, 'auction-house')}
                  />
                  <p>{capitalizeFirst(acceptConfirm.auction.wantedCard.pokemonName)}</p>
                  <span className={`rarity-badge rarity-tier-${acceptConfirm.auction.wantedCard.tier}`}>
                    {acceptConfirm.auction.wantedCard.rarity}
                  </span>
                </div>
                <div className="auction-confirm-arrow">⇄</div>
                <div className="auction-confirm-side">
                  <p style={{ color: '#8c9eb0', marginBottom: '0.5rem', fontSize: '0.85rem' }}>You receive</p>
                  <img
                    src={getCardImageUrl(acceptConfirm.auction.offeredUserCard.card.imageUrl)}
                    alt={acceptConfirm.auction.offeredUserCard.card.pokemonName}
                    className="auction-confirm-card-img"
                    onError={(e) => handleCardImageError(e, 'auction-house')}
                  />
                  <p>{capitalizeFirst(acceptConfirm.auction.offeredUserCard.card.pokemonName)}</p>
                  <span className={`rarity-badge rarity-tier-${acceptConfirm.auction.offeredUserCard.card.tier}`}>
                    {acceptConfirm.auction.offeredUserCard.card.rarity}
                  </span>
                </div>
              </div>
              <p style={{ color: '#8c9eb0', marginTop: '1rem', fontSize: '0.9rem' }}>
                Trading with <strong style={{ color: '#e7edf3' }}>{acceptConfirm.auction.creator.username}</strong>
              </p>
            </div>
            <div className="modal-footer">
              <button className="modal-btn-cancel" onClick={() => setAcceptConfirm(null)}>Cancel</button>
              <button
                className="modal-btn-primary"
                onClick={confirmAccept}
                disabled={acceptingId !== null}
              >
                {acceptingId !== null ? 'Processing...' : 'Confirm Trade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

function AuctionCard({
  auction,
  onAccept,
  accepting,
}: {
  auction: Auction;
  onAccept: () => void;
  accepting: boolean;
}) {
  return (
    <div className="auction-listing-card">
      <div className="auction-listing-trade">
        <div className="auction-listing-side">
          <div className="auction-listing-label">Offered</div>
          <img
            src={getCardImageUrl(auction.offeredUserCard.card.imageUrl)}
            alt={auction.offeredUserCard.card.pokemonName}
            className="auction-listing-img"
            onError={(e) => handleCardImageError(e, 'auction-house')}
          />
          <div className="auction-listing-name">{capitalizeFirst(auction.offeredUserCard.card.pokemonName)}</div>
          <span className={`rarity-badge rarity-tier-${auction.offeredUserCard.card.tier}`}>
            {auction.offeredUserCard.card.rarity}
          </span>
          <div className="auction-listing-set">{auction.offeredUserCard.card.setName}</div>
        </div>

        <div className="auction-listing-arrow">⇄</div>

        <div className="auction-listing-side">
          <div className="auction-listing-label">Wanted</div>
          <img
            src={getCardImageUrl(auction.wantedCard.imageUrl)}
            alt={auction.wantedCard.pokemonName}
            className="auction-listing-img"
            onError={(e) => handleCardImageError(e, 'auction-house')}
          />
          <div className="auction-listing-name">{capitalizeFirst(auction.wantedCard.pokemonName)}</div>
          <span className={`rarity-badge rarity-tier-${auction.wantedCard.tier}`}>
            {auction.wantedCard.rarity}
          </span>
          <div className="auction-listing-set">{auction.wantedCard.setName}</div>
        </div>
      </div>

      <div className="auction-listing-footer">
        <div className="auction-listing-meta">
          <span className="auction-trainer">by {auction.creator.username}</span>
          <span className="auction-time">{timeRemaining(auction.expiresAt)}</span>
        </div>
        <button
          className={`auction-accept-btn${auction.canFulfill ? '' : ' disabled'}`}
          onClick={onAccept}
          disabled={!auction.canFulfill || accepting}
          title={!auction.canFulfill ? "You don't own the wanted card" : undefined}
        >
          {accepting ? 'Processing...' : auction.canFulfill ? 'Accept Trade' : "Don't have it"}
        </button>
      </div>
    </div>
  );
}

function MyAuctionCard({
  auction,
  onCancel,
  cancelling,
}: {
  auction: Auction;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const isActive = auction.status === 'active';

  return (
    <div className={`auction-listing-card${!isActive ? ' inactive' : ''}`}>
      <div className="auction-card-header">
        <span className="auction-status-badge" data-status={auction.status}>
          {auction.status === 'active' && '● Active'}
          {auction.status === 'completed' && '✓ Completed'}
          {auction.status === 'cancelled' && '✕ Cancelled'}
        </span>
      </div>

      <div className="auction-listing-trade">
        <div className="auction-listing-side">
          <div className="auction-listing-label">You offer</div>
          <img
            src={getCardImageUrl(auction.offeredUserCard.card.imageUrl)}
            alt={auction.offeredUserCard.card.pokemonName}
            className="auction-listing-img"
            onError={(e) => handleCardImageError(e, 'auction-house')}
          />
          <div className="auction-listing-name">{capitalizeFirst(auction.offeredUserCard.card.pokemonName)}</div>
          <span className={`rarity-badge rarity-tier-${auction.offeredUserCard.card.tier}`}>
            {auction.offeredUserCard.card.rarity}
          </span>
        </div>

        <div className="auction-listing-arrow">⇄</div>

        <div className="auction-listing-side">
          <div className="auction-listing-label">You want</div>
          <img
            src={getCardImageUrl(auction.wantedCard.imageUrl)}
            alt={auction.wantedCard.pokemonName}
            className="auction-listing-img"
            onError={(e) => handleCardImageError(e, 'auction-house')}
          />
          <div className="auction-listing-name">{capitalizeFirst(auction.wantedCard.pokemonName)}</div>
          <span className={`rarity-badge rarity-tier-${auction.wantedCard.tier}`}>
            {auction.wantedCard.rarity}
          </span>
        </div>
      </div>

      <div className="auction-listing-footer">
        <div className="auction-listing-meta">
          {isActive && <span className="auction-time">{timeRemaining(auction.expiresAt)}</span>}
          {auction.status === 'completed' && auction.completedBy && (
            <span className="auction-trainer">Traded with {auction.completedBy.username}</span>
          )}
        </div>
        {isActive && (
          <button
            className="auction-cancel-btn"
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}
