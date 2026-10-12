(function () {
  'use strict';

  const TRUTH_OR_DARE_DATA = window.TRUTH_OR_DARE_DATA || [];
  const GET_TO_KNOW_YOU_DATA = window.GET_TO_KNOW_YOU_DATA || [];
  const soundFX = window.soundFX || {
    playPop: () => {},
    playCardFlip: () => {},
    playTick: () => {},
    playSuccess: () => {},
    playBuzzer: () => {},
    playBottleSpin: () => {},
    toggleMute: () => false,
    muted: false
  };

  /**
   * All-In-One Party Games Manager
   */
class PartyGameEngine {
  constructor() {
    this.players = this.loadPlayers();
    this.customQuestions = this.loadCustomQuestions();
    this.currentTurnIndex = 0;
    this.activeTab = 'truth-or-dare'; // 'truth-or-dare' | 'get-to-know' | 'spin-bottle' | 'players'
    
    // Truth or dare state
    this.todLevel = 'all'; // 'classic' | 'party' | 'spicy' | 'extreme' | 'all'
    this.todChoice = null; // 'truth' | 'dare'
    this.currentTodCard = null;
    this.usedTodIds = new Set();

    // Get to know you state
    this.gtkCategory = 'all'; // 'icebreaker' | 'deep' | 'relationships' | 'hypothetical' | 'hot_takes' | 'all'
    this.currentGtkCard = null;
    this.usedGtkIds = new Set();
    this.gtkMode = 'player'; // 'player' | 'room'

    // Bottle spin state
    this.isSpinning = false;
    this.bottleRotation = 0;
    this.bottleSelectedPlayer = null;

    // DOM Elements cache
    this.dom = {};
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.renderPlayersList();
    this.updateActivePlayerDisplays();
    this.renderBottleWheel();
    this.showTab(this.activeTab);

    // If no players, provide easy quickstart or welcome
    if (this.players.length === 0) {
      this.populateSamplePlayers();
    }
  }

  // ==========================================
  // STORAGE HELPERS
  // ==========================================
  loadPlayers() {
    try {
      const saved = localStorage.getItem('party_game_players');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  }

  savePlayers() {
    localStorage.setItem('party_game_players', JSON.stringify(this.players));
  }

  loadCustomQuestions() {
    try {
      const saved = localStorage.getItem('party_game_custom_questions');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return { tod: [], gtk: [] };
  }

  saveCustomQuestions() {
    localStorage.setItem('party_game_custom_questions', JSON.stringify(this.customQuestions));
  }

  populateSamplePlayers() {
    this.players = [
      { id: 'p_1', name: 'Alex', gender: 'male', avatar: '👨', truths: 0, dares: 0, chickens: 0, score: 0 },
      { id: 'p_2', name: 'Sophia', gender: 'female', avatar: '👩', truths: 0, dares: 0, chickens: 0, score: 0 },
      { id: 'p_3', name: 'Liam', gender: 'male', avatar: '👦', truths: 0, dares: 0, chickens: 0, score: 0 },
      { id: 'p_4', name: 'Emma', gender: 'female', avatar: '👧', truths: 0, dares: 0, chickens: 0, score: 0 }
    ];
    this.savePlayers();
    this.renderPlayersList();
    this.updateActivePlayerDisplays();
    this.renderBottleWheel();
  }

  // ==========================================
  // DOM CACHING & EVENT BINDINGS
  // ==========================================
  cacheDom() {
    this.dom = {
      navTabs: document.querySelectorAll('.nav-tab'),
      tabViews: document.querySelectorAll('.tab-view'),
      soundToggle: document.getElementById('sound-toggle'),
      
      // Players Tab
      playerForm: document.getElementById('player-form'),
      playerNameInput: document.getElementById('player-name-input'),
      playerGenderSelect: document.getElementById('player-gender-select'),
      playerAvatarSelect: document.getElementById('player-avatar-select'),
      playersListContainer: document.getElementById('players-list-container'),
      playerCountBadge: document.getElementById('player-count-badge'),
      loadSamplePlayersBtn: document.getElementById('load-sample-players-btn'),
      clearAllPlayersBtn: document.getElementById('clear-all-players-btn'),

      // Truth or Dare Tab
      todActivePlayerName: document.getElementById('tod-active-player-name'),
      todActivePlayerAvatar: document.getElementById('tod-active-player-avatar'),
      todActivePlayerGender: document.getElementById('tod-active-player-gender'),
      todLevelButtons: document.querySelectorAll('.tod-level-btn'),
      btnPickTruth: document.getElementById('btn-pick-truth'),
      btnPickDare: document.getElementById('btn-pick-dare'),
      btnPickRandom: document.getElementById('btn-pick-random'),
      todCardWrapper: document.getElementById('tod-card-wrapper'),
      todCardTypeBadge: document.getElementById('tod-card-type-badge'),
      todCardLevelBadge: document.getElementById('tod-card-level-badge'),
      todCardText: document.getElementById('tod-card-text'),
      todCardPlaceholder: document.getElementById('tod-card-placeholder'),
      todActions: document.getElementById('tod-actions'),
      btnTodComplete: document.getElementById('btn-tod-complete'),
      btnTodChicken: document.getElementById('btn-tod-chicken'),
      btnTodReroll: document.getElementById('btn-tod-reroll'),
      btnTodNextPlayer: document.getElementById('btn-tod-next-player'),

      // Get to Know You Tab
      gtkActivePlayerName: document.getElementById('gtk-active-player-name'),
      gtkActivePlayerAvatar: document.getElementById('gtk-active-player-avatar'),
      gtkCategoryButtons: document.querySelectorAll('.gtk-cat-btn'),
      gtkModePlayerBtn: document.getElementById('gtk-mode-player-btn'),
      gtkModeRoomBtn: document.getElementById('gtk-mode-room-btn'),
      btnDrawGtk: document.getElementById('btn-draw-gtk'),
      gtkCardWrapper: document.getElementById('gtk-card-wrapper'),
      gtkCardPlaceholder: document.getElementById('gtk-card-placeholder'),
      gtkCardCatBadge: document.getElementById('gtk-card-cat-badge'),
      gtkCardText: document.getElementById('gtk-card-text'),
      gtkActions: document.getElementById('gtk-actions'),
      btnGtkNextCard: document.getElementById('btn-gtk-next-card'),
      btnGtkNextPlayer: document.getElementById('btn-gtk-next-player'),

      // Bottle Spin Tab
      bottleCanvas: document.getElementById('bottle-canvas'),
      btnSpinBottle: document.getElementById('btn-spin-bottle'),
      bottleResultModal: document.getElementById('bottle-result-modal'),
      bottleResultName: document.getElementById('bottle-result-name'),
      bottleResultAvatar: document.getElementById('bottle-result-avatar'),
      bottleResultGender: document.getElementById('bottle-result-gender'),
      btnBottlePlayTod: document.getElementById('btn-bottle-play-tod'),
      btnBottlePlayGtk: document.getElementById('btn-bottle-play-gtk'),
      btnBottleCloseModal: document.getElementById('btn-bottle-close-modal'),

      // Add Custom Question Modal
      btnAddCustomModalOpen: document.getElementById('btn-add-custom-modal-open'),
      customQuestionModal: document.getElementById('custom-question-modal'),
      btnCloseCustomModal: document.getElementById('btn-close-custom-modal'),
      customQuestionForm: document.getElementById('custom-question-form'),
      customGameType: document.getElementById('custom-game-type'),
      customSubCategoryGroup: document.getElementById('custom-subcategory-group'),
      customSubCategorySelect: document.getElementById('custom-subcategory-select'),
      customQuestionText: document.getElementById('custom-question-text'),

      // Scoreboard Modal
      btnScoreboardOpen: document.getElementById('btn-scoreboard-open'),
      scoreboardModal: document.getElementById('scoreboard-modal'),
      btnCloseScoreboard: document.getElementById('btn-close-scoreboard'),
      scoreboardList: document.getElementById('scoreboard-list'),

      // Quick Help / Rules Modal
      btnRulesOpen: document.getElementById('btn-rules-open'),
      rulesModal: document.getElementById('rules-modal'),
      btnCloseRules: document.getElementById('btn-close-rules')
    };
  }

  bindEvents() {
    // Navigation
    this.dom.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        soundFX.playPop();
        const target = tab.dataset.target;
        this.showTab(target);
      });
    });

    // Sound toggle
    if (this.dom.soundToggle) {
      this.updateSoundToggleUI();
      this.dom.soundToggle.addEventListener('click', () => {
        const isMuted = soundFX.toggleMute();
        this.updateSoundToggleUI();
        if (!isMuted) soundFX.playPop();
      });
    }

    // Players Management
    if (this.dom.playerForm) {
      this.dom.playerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAddPlayer();
      });
    }

    if (this.dom.loadSamplePlayersBtn) {
      this.dom.loadSamplePlayersBtn.addEventListener('click', () => {
        soundFX.playSuccess();
        this.populateSamplePlayers();
      });
    }

    if (this.dom.clearAllPlayersBtn) {
      this.dom.clearAllPlayersBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to remove all players?')) {
          soundFX.playBuzzer();
          this.players = [];
          this.currentTurnIndex = 0;
          this.savePlayers();
          this.renderPlayersList();
          this.updateActivePlayerDisplays();
          this.renderBottleWheel();
        }
      });
    }

    // Truth or Dare Level Filters
    this.dom.todLevelButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        soundFX.playTick();
        this.dom.todLevelButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.todLevel = btn.dataset.level;
      });
    });

    // Truth or Dare Actions
    if (this.dom.btnPickTruth) {
      this.dom.btnPickTruth.addEventListener('click', () => {
        this.drawTodCard('truth');
      });
    }
    if (this.dom.btnPickDare) {
      this.dom.btnPickDare.addEventListener('click', () => {
        this.drawTodCard('dare');
      });
    }
    if (this.dom.btnPickRandom) {
      this.dom.btnPickRandom.addEventListener('click', () => {
        const choice = Math.random() > 0.5 ? 'truth' : 'dare';
        this.drawTodCard(choice);
      });
    }
    if (this.dom.btnTodComplete) {
      this.dom.btnTodComplete.addEventListener('click', () => {
        this.handleTodComplete(true);
      });
    }
    if (this.dom.btnTodChicken) {
      this.dom.btnTodChicken.addEventListener('click', () => {
        this.handleTodComplete(false);
      });
    }
    if (this.dom.btnTodReroll) {
      this.dom.btnTodReroll.addEventListener('click', () => {
        if (this.todChoice) {
          soundFX.playCardFlip();
          this.drawTodCard(this.todChoice, true);
        }
      });
    }
    if (this.dom.btnTodNextPlayer) {
      this.dom.btnTodNextPlayer.addEventListener('click', () => {
        soundFX.playPop();
        this.advanceNextPlayer();
        this.resetTodCard();
      });
    }

    // Get to Know You Filters & Draw
    this.dom.gtkCategoryButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        soundFX.playTick();
        this.dom.gtkCategoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.gtkCategory = btn.dataset.category;
      });
    });

    if (this.dom.gtkModePlayerBtn && this.dom.gtkModeRoomBtn) {
      this.dom.gtkModePlayerBtn.addEventListener('click', () => {
        soundFX.playTick();
        this.gtkMode = 'player';
        this.dom.gtkModePlayerBtn.classList.add('active');
        this.dom.gtkModeRoomBtn.classList.remove('active');
      });
      this.dom.gtkModeRoomBtn.addEventListener('click', () => {
        soundFX.playTick();
        this.gtkMode = 'room';
        this.dom.gtkModeRoomBtn.classList.add('active');
        this.dom.gtkModePlayerBtn.classList.remove('active');
      });
    }

    if (this.dom.btnDrawGtk) {
      this.dom.btnDrawGtk.addEventListener('click', () => {
        this.drawGtkCard();
      });
    }
    if (this.dom.btnGtkNextCard) {
      this.dom.btnGtkNextCard.addEventListener('click', () => {
        this.drawGtkCard();
      });
    }
    if (this.dom.btnGtkNextPlayer) {
      this.dom.btnGtkNextPlayer.addEventListener('click', () => {
        soundFX.playPop();
        this.advanceNextPlayer();
        this.drawGtkCard();
      });
    }

    // Bottle Spin Events
    if (this.dom.btnSpinBottle) {
      this.dom.btnSpinBottle.addEventListener('click', () => {
        this.spinBottle();
      });
    }
    if (this.dom.bottleCanvas) {
      this.dom.bottleCanvas.addEventListener('click', () => {
        this.spinBottle();
      });
    }
    if (this.dom.btnBottleCloseModal) {
      this.dom.btnBottleCloseModal.addEventListener('click', () => {
        this.dom.bottleResultModal.classList.add('hidden');
      });
    }
    if (this.dom.btnBottlePlayTod) {
      this.dom.btnBottlePlayTod.addEventListener('click', () => {
        this.dom.bottleResultModal.classList.add('hidden');
        if (this.bottleSelectedPlayer) {
          const idx = this.players.findIndex(p => p.id === this.bottleSelectedPlayer.id);
          if (idx !== -1) this.currentTurnIndex = idx;
          this.updateActivePlayerDisplays();
        }
        this.showTab('truth-or-dare');
      });
    }
    if (this.dom.btnBottlePlayGtk) {
      this.dom.btnBottlePlayGtk.addEventListener('click', () => {
        this.dom.bottleResultModal.classList.add('hidden');
        if (this.bottleSelectedPlayer) {
          const idx = this.players.findIndex(p => p.id === this.bottleSelectedPlayer.id);
          if (idx !== -1) this.currentTurnIndex = idx;
          this.updateActivePlayerDisplays();
        }
        this.showTab('get-to-know');
      });
    }

    // Custom Question Modal
    if (this.dom.btnAddCustomModalOpen) {
      this.dom.btnAddCustomModalOpen.addEventListener('click', () => {
        soundFX.playPop();
        this.dom.customQuestionModal.classList.remove('hidden');
      });
    }
    if (this.dom.btnCloseCustomModal) {
      this.dom.btnCloseCustomModal.addEventListener('click', () => {
        this.dom.customQuestionModal.classList.add('hidden');
      });
    }
    if (this.dom.customGameType) {
      this.dom.customGameType.addEventListener('change', (e) => {
        this.updateCustomSubcategoryOptions(e.target.value);
      });
    }
    if (this.dom.customQuestionForm) {
      this.dom.customQuestionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAddCustomQuestion();
      });
    }

    // Scoreboard Modal
    if (this.dom.btnScoreboardOpen) {
      this.dom.btnScoreboardOpen.addEventListener('click', () => {
        soundFX.playPop();
        this.renderScoreboard();
        this.dom.scoreboardModal.classList.remove('hidden');
      });
    }
    if (this.dom.btnCloseScoreboard) {
      this.dom.btnCloseScoreboard.addEventListener('click', () => {
        this.dom.scoreboardModal.classList.add('hidden');
      });
    }

    // Rules Modal
    if (this.dom.btnRulesOpen) {
      this.dom.btnRulesOpen.addEventListener('click', () => {
        soundFX.playPop();
        this.dom.rulesModal.classList.remove('hidden');
      });
    }
    if (this.dom.btnCloseRules) {
      this.dom.btnCloseRules.addEventListener('click', () => {
        this.dom.rulesModal.classList.add('hidden');
      });
    }

    // Responsive Canvas Resize
    window.addEventListener('resize', () => {
      this.renderBottleWheel();
    });
  }

  updateSoundToggleUI() {
    if (!this.dom.soundToggle) return;
    const isMuted = soundFX.muted;
    this.dom.soundToggle.innerHTML = isMuted 
      ? '<span class="icon">🔇</span><span>Muted</span>' 
      : '<span class="icon">🔊</span><span>Sound On</span>';
  }

  showTab(tabId) {
    this.activeTab = tabId;
    this.dom.navTabs.forEach(t => {
      if (t.dataset.target === tabId) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    this.dom.tabViews.forEach(v => {
      if (v.id === `tab-${tabId}`) {
        v.classList.remove('hidden');
      } else {
        v.classList.add('hidden');
      }
    });

    if (tabId === 'spin-bottle') {
      setTimeout(() => this.renderBottleWheel(), 50);
    }
  }

  // ==========================================
  // PLAYER MANAGEMENT & GENDER AWARENESS
  // ==========================================
  handleAddPlayer() {
    const name = this.dom.playerNameInput.value.trim();
    if (!name) return;

    const gender = this.dom.playerGenderSelect.value; // 'male' | 'female'
    const avatar = this.dom.playerAvatarSelect.value;

    const newPlayer = {
      id: 'p_' + Date.now(),
      name,
      gender,
      avatar,
      truths: 0,
      dares: 0,
      chickens: 0,
      score: 0
    };

    this.players.push(newPlayer);
    this.savePlayers();
    soundFX.playSuccess();

    this.dom.playerNameInput.value = '';
    this.renderPlayersList();
    this.updateActivePlayerDisplays();
    this.renderBottleWheel();
  }

  removePlayer(playerId) {
    soundFX.playPop();
    this.players = this.players.filter(p => p.id !== playerId);
    if (this.currentTurnIndex >= this.players.length) {
      this.currentTurnIndex = 0;
    }
    this.savePlayers();
    this.renderPlayersList();
    this.updateActivePlayerDisplays();
    this.renderBottleWheel();
  }

  renderPlayersList() {
    if (!this.dom.playersListContainer) return;
    this.dom.playerCountBadge.textContent = `${this.players.length} Players`;

    if (this.players.length === 0) {
      this.dom.playersListContainer.innerHTML = `
        <div class="empty-state">
          <p>No players added yet! Add at least 2 players or click "Load Sample Party" to begin immediately.</p>
        </div>
      `;
      return;
    }

    this.dom.playersListContainer.innerHTML = this.players.map((p, idx) => {
      const isCurrent = idx === this.currentTurnIndex;
      const genderBadge = p.gender === 'female' 
        ? '<span class="gender-tag female"><i class="gender-icon">♀</i> Female</span>' 
        : '<span class="gender-tag male"><i class="gender-icon">♂</i> Male</span>';

      return `
        <div class="player-card ${isCurrent ? 'current-turn' : ''}">
          <div class="player-avatar">${p.avatar}</div>
          <div class="player-info">
            <div class="player-name-row">
              <span class="player-name">${this.escapeHtml(p.name)}</span>
              ${isCurrent ? '<span class="turn-indicator">Turn</span>' : ''}
            </div>
            <div class="player-tags">
              ${genderBadge}
              <span class="score-tag">Score: ${p.score} pts</span>
            </div>
          </div>
          <button class="btn-remove-player" data-id="${p.id}" title="Remove player">✕</button>
        </div>
      `;
    }).join('');

    // Attach remove handlers
    this.dom.playersListContainer.querySelectorAll('.btn-remove-player').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removePlayer(btn.dataset.id);
      });
    });
  }

  getCurrentPlayer() {
    if (this.players.length === 0) {
      return { id: 'dummy', name: 'Player 1', gender: 'male', avatar: '😎', score: 0 };
    }
    return this.players[this.currentTurnIndex % this.players.length];
  }

  advanceNextPlayer() {
    if (this.players.length <= 1) return;
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
    this.updateActivePlayerDisplays();
    this.renderPlayersList();
  }

  updateActivePlayerDisplays() {
    const current = this.getCurrentPlayer();
    const genderIcon = current.gender === 'female' ? '♀ Female' : '♂ Male';

    if (this.dom.todActivePlayerName) {
      this.dom.todActivePlayerName.textContent = current.name;
    }
    if (this.dom.todActivePlayerAvatar) {
      this.dom.todActivePlayerAvatar.textContent = current.avatar;
    }
    if (this.dom.todActivePlayerGender) {
      this.dom.todActivePlayerGender.textContent = genderIcon;
      this.dom.todActivePlayerGender.className = `gender-pill ${current.gender}`;
    }

    if (this.dom.gtkActivePlayerName) {
      this.dom.gtkActivePlayerName.textContent = current.name;
    }
    if (this.dom.gtkActivePlayerAvatar) {
      this.dom.gtkActivePlayerAvatar.textContent = current.avatar;
    }
  }

  // ==========================================
  // SMART DYNAMIC QUESTION INTERPOLATION ENGINE
  // ==========================================
  /**
   * Resolves dynamic tokens according to current turn player and party dynamics:
   * {player} -> Current player's name
   * {target} -> Another player's name
   * {target_opposite} -> A player of opposite gender (falls back gracefully)
   * {target_same} -> A player of same gender (falls back gracefully)
   * {he_she}, {him_her}, {his_her} -> Current player pronouns
   * {target_he_she}, {target_him_her}, {target_his_her} -> Target player pronouns
   */
  resolveQuestionTokens(rawTemplate) {
    const currentPlayer = this.getCurrentPlayer();
    const others = this.players.filter(p => p.id !== currentPlayer.id);

    // Pick target
    let targetPlayer = null;
    let oppositeTarget = null;
    let sameTarget = null;

    if (others.length > 0) {
      // General target
      targetPlayer = others[Math.floor(Math.random() * others.length)];

      // Opposite gender target
      const oppositeGenderPlayers = others.filter(p => p.gender !== currentPlayer.gender);
      oppositeTarget = oppositeGenderPlayers.length > 0 
        ? oppositeGenderPlayers[Math.floor(Math.random() * oppositeGenderPlayers.length)]
        : targetPlayer; // fallback if single gender room

      // Same gender target
      const sameGenderPlayers = others.filter(p => p.gender === currentPlayer.gender);
      sameTarget = sameGenderPlayers.length > 0
        ? sameGenderPlayers[Math.floor(Math.random() * sameGenderPlayers.length)]
        : targetPlayer;
    } else {
      // Dummy fallbacks for solo testing
      targetPlayer = { name: 'someone in the room', gender: 'female' };
      oppositeTarget = { name: 'someone of the opposite gender', gender: 'female' };
      sameTarget = { name: 'a friend', gender: 'male' };
    }

    let text = rawTemplate;

    // 1. Current player tokens
    text = text.replace(/{player}/g, currentPlayer.name);
    text = text.replace(/{he_she}/g, currentPlayer.gender === 'female' ? 'she' : 'he');
    text = text.replace(/{him_her}/g, currentPlayer.gender === 'female' ? 'her' : 'him');
    text = text.replace(/{his_her}/g, currentPlayer.gender === 'female' ? 'her' : 'his');
    text = text.replace(/{his_hers}/g, currentPlayer.gender === 'female' ? 'hers' : 'his');

    // If template mentions opposite target, tie target pronouns to oppositeTarget
    const activeTarget = rawTemplate.includes('{target_opposite}') ? oppositeTarget : targetPlayer;

    text = text.replace(/{target_opposite}/g, oppositeTarget.name);
    text = text.replace(/{target_same}/g, sameTarget.name);
    text = text.replace(/{target}/g, targetPlayer.name);
    text = text.replace(/{target_he_she}/g, activeTarget.gender === 'female' ? 'she' : 'he');
    text = text.replace(/{target_him_her}/g, activeTarget.gender === 'female' ? 'her' : 'him');
    text = text.replace(/{target_his_her}/g, activeTarget.gender === 'female' ? 'her' : 'his');

    return text;
  }

  // ==========================================
  // TRUTH OR DARE GAME ENGINE
  // ==========================================
  drawTodCard(choice, isReroll = false) {
    soundFX.playCardFlip();
    this.todChoice = choice;

    // Pool of questions
    const allItems = [...TRUTH_OR_DARE_DATA, ...this.customQuestions.tod];
    
    // Filter by type (truth / dare)
    let eligible = allItems.filter(item => item.type === choice);

    // Filter by level
    if (this.todLevel !== 'all') {
      eligible = eligible.filter(item => item.level === this.todLevel);
    }

    // Filter out already used in this round
    let available = eligible.filter(item => !this.usedTodIds.has(item.id));
    if (available.length === 0) {
      this.usedTodIds.clear();
      available = eligible;
    }

    if (available.length === 0) {
      alert("No questions found for this level! Please choose another level or add custom questions.");
      return;
    }

    const picked = available[Math.floor(Math.random() * available.length)];
    this.usedTodIds.add(picked.id);
    this.currentTodCard = picked;

    const formattedText = this.resolveQuestionTokens(picked.text);

    // UI Updates
    this.dom.todCardPlaceholder.classList.add('hidden');
    this.dom.todCardWrapper.classList.remove('hidden');
    this.dom.todActions.classList.remove('hidden');

    this.dom.todCardTypeBadge.textContent = choice.toUpperCase();
    this.dom.todCardTypeBadge.className = `card-badge type-${choice}`;

    this.dom.todCardLevelBadge.textContent = picked.level.toUpperCase();
    this.dom.todCardLevelBadge.className = `card-badge level-${picked.level}`;

    this.dom.todCardText.textContent = formattedText;

    // Card pop animation
    this.dom.todCardWrapper.classList.remove('animate-flip');
    void this.dom.todCardWrapper.offsetWidth; // trigger reflow
    this.dom.todCardWrapper.classList.add('animate-flip');
  }

  handleTodComplete(isComplete) {
    const current = this.getCurrentPlayer();
    if (isComplete) {
      soundFX.playSuccess();
      current.score += 10;
      if (this.todChoice === 'truth') current.truths++;
      if (this.todChoice === 'dare') current.dares++;
    } else {
      soundFX.playBuzzer();
      current.chickens++;
      current.score = Math.max(0, current.score - 5);
    }

    this.savePlayers();
    this.advanceNextPlayer();
    this.resetTodCard();
  }

  resetTodCard() {
    this.todChoice = null;
    this.currentTodCard = null;
    this.dom.todCardWrapper.classList.add('hidden');
    this.dom.todActions.classList.add('hidden');
    this.dom.todCardPlaceholder.classList.remove('hidden');
  }

  // ==========================================
  // GET TO KNOW YOU GAME ENGINE
  // ==========================================
  drawGtkCard() {
    soundFX.playCardFlip();
    const allItems = [...GET_TO_KNOW_YOU_DATA, ...this.customQuestions.gtk];

    let eligible = allItems;
    if (this.gtkCategory !== 'all') {
      eligible = eligible.filter(item => item.category === this.gtkCategory);
    }

    let available = eligible.filter(item => !this.usedGtkIds.has(item.id));
    if (available.length === 0) {
      this.usedGtkIds.clear();
      available = eligible;
    }

    const picked = available[Math.floor(Math.random() * available.length)];
    this.usedGtkIds.add(picked.id);
    this.currentGtkCard = picked;

    const formattedText = this.resolveQuestionTokens(picked.text);

    // UI Updates
    this.dom.gtkCardPlaceholder.classList.add('hidden');
    this.dom.gtkCardWrapper.classList.remove('hidden');
    this.dom.gtkActions.classList.remove('hidden');

    const catLabels = {
      icebreaker: '❄️ ICEBREAKER & FUN',
      deep: '🌌 DEEP & SOULFUL',
      relationships: '❤️ LOVE & DATING',
      hypothetical: '🌀 HYPOTHETICAL',
      hot_takes: '🔥 UNFILTERED HOT TAKES'
    };

    this.dom.gtkCardCatBadge.textContent = catLabels[picked.category] || picked.category.toUpperCase();
    this.dom.gtkCardCatBadge.className = `card-badge cat-${picked.category}`;
    this.dom.gtkCardText.textContent = formattedText;

    this.dom.gtkCardWrapper.classList.remove('animate-flip');
    void this.dom.gtkCardWrapper.offsetWidth;
    this.dom.gtkCardWrapper.classList.add('animate-flip');
  }

  // ==========================================
  // SPIN THE BOTTLE WHEEL (CANVAS 2D/3D SIMULATION)
  // ==========================================
  renderBottleWheel() {
    const canvas = this.dom.bottleCanvas;
    if (!canvas) return;

    // Handle high DPI
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(rect.width || 340, 420);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 25;

    // Background circle
    ctx.clearRect(0, 0, size, size);

    // Outer glow ring
    const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(30, 27, 75, 0.4)');
    gradient.addColorStop(1, 'rgba(15, 12, 41, 0.95)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Render Players in Circle
    const count = this.players.length;
    if (count > 0) {
      const angleStep = (Math.PI * 2) / count;

      this.players.forEach((player, i) => {
        const angle = i * angleStep - Math.PI / 2;
        const pX = centerX + Math.cos(angle) * (radius - 28);
        const pY = centerY + Math.sin(angle) * (radius - 28);

        // Player node circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(pX, pY, 20, 0, Math.PI * 2);
        ctx.fillStyle = player.gender === 'female' ? '#ec4899' : '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Player avatar emoji
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.avatar || '👤', pX, pY);

        // Player name text below
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#f8fafc';
        const labelX = centerX + Math.cos(angle) * (radius + 10);
        const labelY = centerY + Math.sin(angle) * (radius + 10);
        ctx.fillText(player.name.substring(0, 8), labelX, labelY);
        ctx.restore();
      });
    }

    // Render Center Bottle
    this.drawBottle(ctx, centerX, centerY, this.bottleRotation);
  }

  drawBottle(ctx, cx, cy, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Bottle drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 6;

    // Glass Bottle Body (Gradient)
    const bottleGrad = ctx.createLinearGradient(-15, -70, 15, 70);
    bottleGrad.addColorStop(0, '#38bdf8');
    bottleGrad.addColorStop(0.3, '#818cf8');
    bottleGrad.addColorStop(0.7, '#c084fc');
    bottleGrad.addColorStop(1, '#f43f5e');

    // Bottle path: neck points upwards (negative Y is bottle tip)
    ctx.beginPath();
    // Neck tip
    ctx.moveTo(-6, -70);
    ctx.lineTo(6, -70);
    // Neck base
    ctx.lineTo(6, -35);
    // Shoulder right
    ctx.quadraticCurveTo(18, -25, 18, -10);
    // Body right
    ctx.lineTo(18, 50);
    // Bottom right curve
    ctx.quadraticCurveTo(18, 65, 0, 65);
    // Bottom left curve
    ctx.quadraticCurveTo(-18, 65, -18, 50);
    // Body left
    ctx.lineTo(-18, -10);
    // Shoulder left
    ctx.quadraticCurveTo(-18, -25, -6, -35);
    ctx.closePath();

    ctx.fillStyle = bottleGrad;
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Bottle Cap (Gold)
    ctx.beginPath();
    ctx.rect(-7, -76, 14, 8);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.stroke();

    // Bottle glass shine line
    ctx.beginPath();
    ctx.moveTo(-9, -20);
    ctx.lineTo(-9, 45);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center pivot knob
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  spinBottle() {
    if (this.isSpinning) return;
    if (this.players.length < 2) {
      alert("Please add at least 2 players to spin the bottle!");
      return;
    }

    this.isSpinning = true;
    this.dom.btnSpinBottle.disabled = true;
    soundFX.playBottleSpin();

    // Random total spins between 4 and 8 full rotations + target angle
    const extraRotations = (4 + Math.random() * 4) * Math.PI * 2;
    const targetAngle = this.bottleRotation + extraRotations;
    
    const startTime = performance.now();
    const duration = 3200; // ms
    const initialAngle = this.bottleRotation;

    let lastTickTime = 0;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      this.bottleRotation = initialAngle + (targetAngle - initialAngle) * ease;

      // Play tick sound every half rotation during early/mid spin
      if (currentTime - lastTickTime > 120 && progress < 0.85) {
        soundFX.playTick();
        lastTickTime = currentTime;
      }

      this.renderBottleWheel();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isSpinning = false;
        this.dom.btnSpinBottle.disabled = false;
        this.finishBottleSpin();
      }
    };

    requestAnimationFrame(animate);
  }

  finishBottleSpin() {
    soundFX.playSuccess();
    // Bottle neck points at angle - PI/2 in local coordinates
    // Normalize final angle in [0, 2*PI)
    let finalAngle = (this.bottleRotation - Math.PI / 2) % (Math.PI * 2);
    if (finalAngle < 0) finalAngle += Math.PI * 2;

    const count = this.players.length;
    const angleStep = (Math.PI * 2) / count;

    // Match closest player index
    // Player i is at: i * angleStep - Math.PI / 2
    let normalizedPlayerAngles = this.players.map((_, i) => {
      let a = (i * angleStep - Math.PI / 2) % (Math.PI * 2);
      if (a < 0) a += Math.PI * 2;
      return a;
    });

    // Find closest
    let closestIndex = 0;
    let minDiff = Infinity;
    normalizedPlayerAngles.forEach((a, i) => {
      let diff = Math.abs(finalAngle - a);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    });

    const selected = this.players[closestIndex];
    this.bottleSelectedPlayer = selected;

    // Show result modal
    this.dom.bottleResultName.textContent = selected.name;
    this.dom.bottleResultAvatar.textContent = selected.avatar;
    this.dom.bottleResultGender.textContent = selected.gender === 'female' ? '♀ Female' : '♂ Male';
    this.dom.bottleResultGender.className = `gender-pill ${selected.gender}`;
    this.dom.bottleResultModal.classList.remove('hidden');
  }

  // ==========================================
  // CUSTOM QUESTION BUILDER
  // ==========================================
  updateCustomSubcategoryOptions(gameType) {
    const select = this.dom.customSubCategorySelect;
    select.innerHTML = '';

    if (gameType === 'tod') {
      select.innerHTML = `
        <option value="classic">Level 1: Classic (Fun & Chill)</option>
        <option value="party">Level 2: Party (Goofy & High Energy)</option>
        <option value="spicy">Level 3: Spicy (Romantic & Flirty)</option>
        <option value="extreme">Level 4: Extreme (Daring & Savage)</option>
      `;
    } else {
      select.innerHTML = `
        <option value="icebreaker">Icebreaker & Fun</option>
        <option value="deep">Deep & Soulful</option>
        <option value="relationships">Love & Dating</option>
        <option value="hypothetical">Hypothetical & Dilemmas</option>
        <option value="hot_takes">Unfiltered Hot Takes</option>
      `;
    }
  }

  handleAddCustomQuestion() {
    const gameType = this.dom.customGameType.value; // 'tod' | 'gtk'
    const subCat = this.dom.customSubCategorySelect.value;
    const text = this.dom.customQuestionText.value.trim();

    if (!text) return;

    if (gameType === 'tod') {
      const isTruth = confirm('Click OK for Truth, or Cancel for Dare');
      this.customQuestions.tod.push({
        id: 'cust_tod_' + Date.now(),
        type: isTruth ? 'truth' : 'dare',
        level: subCat,
        text
      });
    } else {
      this.customQuestions.gtk.push({
        id: 'cust_gtk_' + Date.now(),
        category: subCat,
        text
      });
    }

    this.saveCustomQuestions();
    soundFX.playSuccess();
    alert('Custom question added to your game!');
    this.dom.customQuestionText.value = '';
    this.dom.customQuestionModal.classList.add('hidden');
  }

  // ==========================================
  // SCOREBOARD
  // ==========================================
  renderScoreboard() {
    const container = this.dom.scoreboardList;
    if (!container) return;

    if (this.players.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-400 py-4">No player scores yet.</p>';
      return;
    }

    // Sort descending by score
    const sorted = [...this.players].sort((a, b) => b.score - a.score);

    container.innerHTML = sorted.map((p, rank) => {
      let medal = '🎖️';
      if (rank === 0) medal = '🥇';
      if (rank === 1) medal = '🥈';
      if (rank === 2) medal = '🥉';

      return `
        <div class="score-card rank-${rank + 1}">
          <div class="score-rank">${medal} #${rank + 1}</div>
          <div class="score-player-info">
            <span class="score-avatar">${p.avatar}</span>
            <div class="score-names">
              <span class="score-name">${this.escapeHtml(p.name)}</span>
              <span class="score-sub">${p.gender === 'female' ? '♀ Female' : '♂ Male'}</span>
            </div>
          </div>
          <div class="score-stats">
            <div class="stat-badge"><span>Truths:</span> <b>${p.truths}</b></div>
            <div class="stat-badge"><span>Dares:</span> <b>${p.dares}</b></div>
            <div class="stat-badge chicken"><span>Chickens:</span> <b>${p.chickens}</b></div>
            <div class="stat-badge total"><b>${p.score} pts</b></div>
          </div>
        </div>
      `;
    }).join('');
  }

  escapeHtml(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}

  function startApp() {
    try {
      const engine = new PartyGameEngine();
      engine.init();
      window.partyGameEngine = engine;
    } catch (err) {
      console.error("Error initializing PartyGameEngine:", err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
})();
