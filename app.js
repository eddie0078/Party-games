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
   * ==========================================
   * REAL-TIME ROOM SYNC MANAGER (MQTT / WEBSOCKETS)
   * Free, zero-setup, real-time live sync across devices!
   * ==========================================
   */
  class RoomSync {
    constructor(engine) {
      this.engine = engine;
      this.client = null;
      this.roomCode = null;
      this.isHost = false;
      this.clientId = 'client_' + Math.random().toString(36).substring(2, 9);
      this.brokerUrl = 'wss://broker.emqx.io:8084/mqtt';
      this.connected = false;
      this.myPlayerId = null;
    }

    init() {
      this.updateStatusUI();
    }

    get topic() {
      return this.roomCode ? `vibes_dares/rooms/${this.roomCode}` : null;
    }

    hostRoom(onSuccess) {
      // Generate a random 4-digit code
      const code = String(Math.floor(1000 + Math.random() * 9000));
      this.connect(code, true, () => {
        soundFX.playSuccess();
        if (onSuccess) onSuccess(code);
      });
    }

    joinRoom(code, player, onSuccess) {
      const cleanCode = code.toUpperCase().trim();
      this.myPlayerId = player.id;
      this.connect(cleanCode, false, () => {
        // Send join request to host with player info
        this.broadcast({
          type: 'JOIN_REQUEST',
          player: player
        });
        soundFX.playSuccess();
        if (onSuccess) onSuccess(cleanCode);
      });
    }

    connect(roomCode, isHost, onReady) {
      if (!window.mqtt) {
        alert("Multiplayer requires an active internet connection to load the live sync broker.");
        return;
      }

      if (this.client) {
        this.disconnect();
      }

      this.roomCode = roomCode;
      this.isHost = isHost;

      try {
        this.client = window.mqtt.connect(this.brokerUrl, {
          clientId: this.clientId,
          clean: true,
          connectTimeout: 8000,
          reconnectPeriod: 3000
        });

        this.client.on('connect', () => {
          this.connected = true;
          this.client.subscribe(this.topic, (err) => {
            if (!err) {
              this.updateStatusUI();
              if (this.isHost) {
                this.broadcastState();
              }
              if (onReady) onReady();
            }
          });
        });

        this.client.on('message', (topic, message) => {
          try {
            const payload = JSON.parse(message.toString());
            this.handleMessage(payload);
          } catch (e) {
            console.error("MQTT message parse error:", e);
          }
        });

        this.client.on('error', (err) => {
          console.warn("MQTT connection error:", err);
        });

        this.client.on('close', () => {
          this.connected = false;
          this.updateStatusUI();
        });
      } catch (e) {
        alert("Could not connect to multiplayer room: " + e.message);
      }
    }

    disconnect() {
      if (this.client) {
        try {
          if (this.connected && this.topic) {
            this.broadcast({ type: 'PLAYER_LEFT', playerId: this.myPlayerId });
          }
          this.client.end(true);
        } catch (e) {}
      }
      this.client = null;
      this.roomCode = null;
      this.isHost = false;
      this.connected = false;
      this.updateStatusUI();
    }

    broadcast(data) {
      if (!this.connected || !this.client || !this.topic) return;
      try {
        const msg = JSON.stringify({
          ...data,
          senderId: this.clientId,
          timestamp: Date.now()
        });
        this.client.publish(this.topic, msg);
      } catch (e) {
        console.error("Failed to broadcast MQTT message:", e);
      }
    }

    broadcastState() {
      this.broadcast({
        type: 'SYNC_STATE',
        state: {
          players: this.engine.players,
          currentTurnIndex: this.engine.currentTurnIndex,
          activeTab: this.engine.activeTab,
          todCard: this.engine.currentTodCard,
          todChoice: this.engine.todChoice,
          todFormattedText: this.engine.dom.todCardText ? this.engine.dom.todCardText.textContent : '',
          gtkCard: this.engine.currentGtkCard,
          gtkFormattedText: this.engine.dom.gtkCardText ? this.engine.dom.gtkCardText.textContent : ''
        }
      });
    }

    handleMessage(msg) {
      if (msg.senderId === this.clientId) return; // Ignore own messages

      switch (msg.type) {
        case 'JOIN_REQUEST':
          if (this.isHost && msg.player) {
            // Check if player already exists
            const exists = this.engine.players.some(p => p.id === msg.player.id || p.name.toLowerCase() === msg.player.name.toLowerCase());
            if (!exists) {
              this.engine.players.push(msg.player);
              this.engine.savePlayers();
              this.engine.renderPlayersList();
              this.engine.renderBottleWheel();
            }
            // Host sends back complete state to update the newly joined player
            this.broadcastState();
          }
          break;

        case 'SYNC_STATE':
          if (msg.state) {
            this.engine.players = msg.state.players || [];
            this.engine.currentTurnIndex = msg.state.currentTurnIndex || 0;
            this.engine.savePlayers();
            this.engine.renderPlayersList();
            this.engine.updateActivePlayerDisplays();
            this.engine.renderBottleWheel();

            if (msg.state.activeTab && msg.state.activeTab !== this.engine.activeTab) {
              this.engine.showTab(msg.state.activeTab, true);
            }

            if (msg.state.todCard) {
              this.engine.renderTodCardDirect(msg.state.todCard, msg.state.todChoice, msg.state.todFormattedText);
            } else {
              this.engine.resetTodCard();
            }

            if (msg.state.gtkCard) {
              this.engine.renderGtkCardDirect(msg.state.gtkCard, msg.state.gtkFormattedText);
            }
          }
          break;

        case 'ACTION_TAB':
          this.engine.showTab(msg.tabId, true);
          break;

        case 'ACTION_TOD_DRAW':
          this.engine.renderTodCardDirect(msg.card, msg.choice, msg.formattedText);
          break;

        case 'ACTION_TOD_COMPLETE':
          this.engine.players = msg.players;
          this.engine.currentTurnIndex = msg.currentTurnIndex;
          this.engine.savePlayers();
          this.engine.advanceNextPlayer(true);
          this.engine.resetTodCard();
          if (msg.isComplete) soundFX.playSuccess();
          else soundFX.playBuzzer();
          break;

        case 'ACTION_GTK_DRAW':
          this.engine.renderGtkCardDirect(msg.card, msg.formattedText);
          break;

        case 'ACTION_SPIN_BOTTLE':
          this.engine.remoteSpinBottle(msg.targetAngle, msg.selectedPlayer);
          break;

        case 'ACTION_ADVANCE_TURN':
          this.engine.advanceNextPlayer(true);
          break;
      }

      this.updateConnectedPlayersUI();
    }

    updateStatusUI() {
      const pill = document.querySelector('.room-pill');
      const text = document.getElementById('room-btn-text');
      const connectedView = document.getElementById('room-connected-view');
      const unconnectedView = document.getElementById('room-unconnected-view');
      const codeDisplay = document.getElementById('connected-room-code-display');
      const roleBadge = document.getElementById('connected-room-role-badge');

      if (!pill || !text) return;

      if (this.connected && this.roomCode) {
        pill.classList.add('connected');
        text.textContent = `🟢 Room #${this.roomCode}`;
        if (connectedView) connectedView.classList.remove('hidden');
        if (unconnectedView) unconnectedView.classList.add('hidden');
        if (codeDisplay) codeDisplay.textContent = this.roomCode;
        if (roleBadge) roleBadge.textContent = this.isHost ? 'You are: Room Host 👑' : 'You are: Joined Player 📱';
      } else {
        pill.classList.remove('connected');
        text.textContent = `📡 Live Room`;
        if (connectedView) connectedView.classList.add('hidden');
        if (unconnectedView) unconnectedView.classList.remove('hidden');
      }

      this.updateConnectedPlayersUI();
    }

    updateConnectedPlayersUI() {
      const list = document.getElementById('room-connected-players-list');
      if (!list) return;
      if (this.engine.players.length === 0) {
        list.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted);">No players yet</span>';
        return;
      }
      list.innerHTML = this.engine.players.map(p => `
        <span class="player-online-badge">
          <span>${p.avatar}</span>
          <span>${p.name}</span>
        </span>
      `).join('');
    }
  }

  /**
   * ==========================================
   * PARTY GAME ENGINE
   * ==========================================
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

      // Real-time room sync
      this.roomSync = new RoomSync(this);

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
      this.roomSync.init();

      // Only auto-populate sample players on very first visit ever
      const hasInitialized = localStorage.getItem('party_game_has_initialized');
      if (!hasInitialized) {
        this.populateSamplePlayers();
        localStorage.setItem('party_game_has_initialized', 'true');
      }

      // Check URL parameters for invitation link (e.g. ?room=7842)
      this.checkUrlRoomCode();
    }

    checkUrlRoomCode() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        if (roomFromUrl && this.dom.joinRoomCodeInput) {
          this.dom.joinRoomCodeInput.value = roomFromUrl.toUpperCase();
          if (this.dom.roomModal) {
            this.dom.roomModal.classList.remove('hidden');
          }
        }
      } catch (e) {}
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
        btnCloseRules: document.getElementById('btn-close-rules'),

        // Room Sync Modal
        btnRoomModalOpen: document.getElementById('btn-room-modal-open'),
        roomModal: document.getElementById('room-modal'),
        btnCloseRoomModal: document.getElementById('btn-close-room-modal'),
        btnHostNewRoom: document.getElementById('btn-host-new-room'),
        joinRoomCodeInput: document.getElementById('join-room-code-input'),
        joinPlayerNameInput: document.getElementById('join-player-name-input'),
        joinPlayerGenderSelect: document.getElementById('join-player-gender-select'),
        joinPlayerAvatarSelect: document.getElementById('join-player-avatar-select'),
        btnSubmitJoinRoom: document.getElementById('btn-submit-join-room'),
        btnCopyRoomLink: document.getElementById('btn-copy-room-link'),
        btnShareRoomLink: document.getElementById('btn-share-room-link'),
        btnLeaveRoom: document.getElementById('btn-leave-room')
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
          if (this.roomSync.connected && this.roomSync.isHost) {
            this.roomSync.broadcastState();
          }
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
            if (this.roomSync.connected && this.roomSync.isHost) {
              this.roomSync.broadcastState();
            }
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

      // Room Sync Modal Events
      if (this.dom.btnRoomModalOpen) {
        this.dom.btnRoomModalOpen.addEventListener('click', () => {
          soundFX.playPop();
          this.dom.roomModal.classList.remove('hidden');
        });
      }
      if (this.dom.btnCloseRoomModal) {
        this.dom.btnCloseRoomModal.addEventListener('click', () => {
          this.dom.roomModal.classList.add('hidden');
        });
      }
      if (this.dom.btnHostNewRoom) {
        this.dom.btnHostNewRoom.addEventListener('click', () => {
          this.roomSync.hostRoom((code) => {
            alert(`Room #${code} is now LIVE! Share your invite link with your friends.`);
          });
        });
      }
      if (this.dom.btnSubmitJoinRoom) {
        this.dom.btnSubmitJoinRoom.addEventListener('click', () => {
          const code = this.dom.joinRoomCodeInput.value.trim();
          const name = this.dom.joinPlayerNameInput.value.trim();
          if (!code) {
            alert("Please enter the 4-digit room code.");
            return;
          }
          if (!name) {
            alert("Please enter your name to join.");
            return;
          }
          const gender = this.dom.joinPlayerGenderSelect.value;
          const avatar = this.dom.joinPlayerAvatarSelect.value;
          const playerObj = {
            id: 'p_' + Date.now(),
            name,
            gender,
            avatar,
            truths: 0,
            dares: 0,
            chickens: 0,
            score: 0
          };
          this.roomSync.joinRoom(code, playerObj, () => {
            alert(`Joined Room #${code} successfully!`);
          });
        });
      }
      if (this.dom.btnCopyRoomLink) {
        this.dom.btnCopyRoomLink.addEventListener('click', () => {
          const url = `${window.location.origin}${window.location.pathname}?room=${this.roomSync.roomCode}`;
          navigator.clipboard.writeText(url).then(() => {
            soundFX.playPop();
            alert("Invite link copied to clipboard! Send it to your friends on WhatsApp or text.");
          }).catch(() => {
            prompt("Copy this invite link:", url);
          });
        });
      }
      if (this.dom.btnShareRoomLink) {
        this.dom.btnShareRoomLink.addEventListener('click', () => {
          const url = `${window.location.origin}${window.location.pathname}?room=${this.roomSync.roomCode}`;
          if (navigator.share) {
            navigator.share({
              title: 'Join my Vibes & Dares Party Game!',
              text: `Join our live game room #${this.roomSync.roomCode}!`,
              url: url
            }).catch(() => {});
          } else {
            prompt("Copy this invite link:", url);
          }
        });
      }
      if (this.dom.btnLeaveRoom) {
        this.dom.btnLeaveRoom.addEventListener('click', () => {
          if (confirm("Are you sure you want to leave this multiplayer room?")) {
            this.roomSync.disconnect();
            soundFX.playBuzzer();
          }
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

    showTab(tabId, isRemote = false) {
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

      if (!isRemote && this.roomSync.connected) {
        this.roomSync.broadcast({ type: 'ACTION_TAB', tabId });
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

      if (this.roomSync.connected) {
        if (this.roomSync.isHost) {
          this.roomSync.broadcastState();
        } else {
          this.roomSync.broadcast({ type: 'JOIN_REQUEST', player: newPlayer });
        }
      }
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

      if (this.roomSync.connected && this.roomSync.isHost) {
        this.roomSync.broadcastState();
      }
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

    advanceNextPlayer(isRemote = false) {
      if (this.players.length <= 1) return;
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
      this.updateActivePlayerDisplays();
      this.renderPlayersList();

      if (!isRemote && this.roomSync.connected) {
        this.roomSync.broadcast({ type: 'ACTION_ADVANCE_TURN' });
      }
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
    resolveQuestionTokens(rawTemplate) {
      const currentPlayer = this.getCurrentPlayer();
      const others = this.players.filter(p => p.id !== currentPlayer.id);

      let targetPlayer = null;
      let oppositeTarget = null;
      let sameTarget = null;

      if (others.length > 0) {
        targetPlayer = others[Math.floor(Math.random() * others.length)];
        const oppositeGenderPlayers = others.filter(p => p.gender !== currentPlayer.gender);
        oppositeTarget = oppositeGenderPlayers.length > 0 
          ? oppositeGenderPlayers[Math.floor(Math.random() * oppositeGenderPlayers.length)]
          : targetPlayer;

        const sameGenderPlayers = others.filter(p => p.gender === currentPlayer.gender);
        sameTarget = sameGenderPlayers.length > 0
          ? sameGenderPlayers[Math.floor(Math.random() * sameGenderPlayers.length)]
          : targetPlayer;
      } else {
        targetPlayer = { name: 'someone in the room', gender: 'female' };
        oppositeTarget = { name: 'someone of the opposite gender', gender: 'female' };
        sameTarget = { name: 'a friend', gender: 'male' };
      }

      let text = rawTemplate;

      text = text.replace(/{player}/g, currentPlayer.name);
      text = text.replace(/{he_she}/g, currentPlayer.gender === 'female' ? 'she' : 'he');
      text = text.replace(/{him_her}/g, currentPlayer.gender === 'female' ? 'her' : 'him');
      text = text.replace(/{his_her}/g, currentPlayer.gender === 'female' ? 'her' : 'his');
      text = text.replace(/{his_hers}/g, currentPlayer.gender === 'female' ? 'hers' : 'his');

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

      const allItems = [...TRUTH_OR_DARE_DATA, ...this.customQuestions.tod];
      let eligible = allItems.filter(item => item.type === choice);

      if (this.todLevel !== 'all') {
        eligible = eligible.filter(item => item.level === this.todLevel);
      }

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
      this.renderTodCardDirect(picked, choice, formattedText);

      if (this.roomSync.connected) {
        this.roomSync.broadcast({
          type: 'ACTION_TOD_DRAW',
          choice: choice,
          card: picked,
          formattedText: formattedText
        });
      }
    }

    renderTodCardDirect(card, choice, formattedText) {
      this.currentTodCard = card;
      this.todChoice = choice;

      this.dom.todCardPlaceholder.classList.add('hidden');
      this.dom.todCardWrapper.classList.remove('hidden');
      this.dom.todActions.classList.remove('hidden');

      this.dom.todCardTypeBadge.textContent = choice.toUpperCase();
      this.dom.todCardTypeBadge.className = `card-badge type-${choice}`;

      this.dom.todCardLevelBadge.textContent = card.level.toUpperCase();
      this.dom.todCardLevelBadge.className = `card-badge level-${card.level}`;

      this.dom.todCardText.textContent = formattedText;

      this.dom.todCardWrapper.classList.remove('animate-flip');
      void this.dom.todCardWrapper.offsetWidth;
      this.dom.todCardWrapper.classList.add('animate-flip');
    }

    handleTodComplete(isComplete, isRemote = false) {
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
      this.advanceNextPlayer(true);
      this.resetTodCard();

      if (!isRemote && this.roomSync.connected) {
        this.roomSync.broadcast({
          type: 'ACTION_TOD_COMPLETE',
          isComplete: isComplete,
          players: this.players,
          currentTurnIndex: this.currentTurnIndex
        });
      }
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
    drawGtkCard(isRemote = false) {
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
      this.renderGtkCardDirect(picked, formattedText);

      if (!isRemote && this.roomSync.connected) {
        this.roomSync.broadcast({
          type: 'ACTION_GTK_DRAW',
          card: picked,
          formattedText: formattedText
        });
      }
    }

    renderGtkCardDirect(card, formattedText) {
      this.currentGtkCard = card;
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

      this.dom.gtkCardCatBadge.textContent = catLabels[card.category] || card.category.toUpperCase();
      this.dom.gtkCardCatBadge.className = `card-badge cat-${card.category}`;
      this.dom.gtkCardText.textContent = formattedText;

      this.dom.gtkCardWrapper.classList.remove('animate-flip');
      void this.dom.gtkCardWrapper.offsetWidth;
      this.dom.gtkCardWrapper.classList.add('animate-flip');
    }

    // ==========================================
    // SPIN THE BOTTLE WHEEL
    // ==========================================
    renderBottleWheel() {
      const canvas = this.dom.bottleCanvas;
      if (!canvas) return;

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

      ctx.clearRect(0, 0, size, size);

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

      const count = this.players.length;
      if (count > 0) {
        const angleStep = (Math.PI * 2) / count;

        this.players.forEach((player, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const pX = centerX + Math.cos(angle) * (radius - 28);
          const pY = centerY + Math.sin(angle) * (radius - 28);

          ctx.save();
          ctx.beginPath();
          ctx.arc(pX, pY, 20, 0, Math.PI * 2);
          ctx.fillStyle = player.gender === 'female' ? '#ec4899' : '#3b82f6';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(player.avatar || '👤', pX, pY);

          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = '#f8fafc';
          const labelX = centerX + Math.cos(angle) * (radius + 10);
          const labelY = centerY + Math.sin(angle) * (radius + 10);
          ctx.fillText(player.name.substring(0, 8), labelX, labelY);
          ctx.restore();
        });
      }

      this.drawBottle(ctx, centerX, centerY, this.bottleRotation);
    }

    drawBottle(ctx, cx, cy, angle) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 6;

      const bottleGrad = ctx.createLinearGradient(-15, -70, 15, 70);
      bottleGrad.addColorStop(0, '#38bdf8');
      bottleGrad.addColorStop(0.3, '#818cf8');
      bottleGrad.addColorStop(0.7, '#c084fc');
      bottleGrad.addColorStop(1, '#f43f5e');

      ctx.beginPath();
      ctx.moveTo(-6, -70);
      ctx.lineTo(6, -70);
      ctx.lineTo(6, -35);
      ctx.quadraticCurveTo(18, -25, 18, -10);
      ctx.lineTo(18, 50);
      ctx.quadraticCurveTo(18, 65, 0, 65);
      ctx.quadraticCurveTo(-18, 65, -18, 50);
      ctx.lineTo(-18, -10);
      ctx.quadraticCurveTo(-18, -25, -6, -35);
      ctx.closePath();

      ctx.fillStyle = bottleGrad;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.rect(-7, -76, 14, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-9, -20);
      ctx.lineTo(-9, 45);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

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

      const extraRotations = (4 + Math.random() * 4) * Math.PI * 2;
      const targetAngle = this.bottleRotation + extraRotations;
      
      const startTime = performance.now();
      const duration = 3200;
      const initialAngle = this.bottleRotation;

      let lastTickTime = 0;

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        this.bottleRotation = initialAngle + (targetAngle - initialAngle) * ease;

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
          const selected = this.finishBottleSpin();
          if (this.roomSync.connected) {
            this.roomSync.broadcast({
              type: 'ACTION_SPIN_BOTTLE',
              targetAngle: targetAngle,
              selectedPlayer: selected
            });
          }
        }
      };

      requestAnimationFrame(animate);
    }

    remoteSpinBottle(targetAngle, selectedPlayer) {
      if (this.isSpinning) return;
      this.isSpinning = true;
      this.dom.btnSpinBottle.disabled = true;
      soundFX.playBottleSpin();

      const startTime = performance.now();
      const duration = 3200;
      const initialAngle = this.bottleRotation;

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        this.bottleRotation = initialAngle + (targetAngle - initialAngle) * ease;
        this.renderBottleWheel();

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.isSpinning = false;
          this.dom.btnSpinBottle.disabled = false;
          this.bottleSelectedPlayer = selectedPlayer;
          soundFX.playSuccess();
          if (selectedPlayer) {
            this.dom.bottleResultName.textContent = selectedPlayer.name;
            this.dom.bottleResultAvatar.textContent = selectedPlayer.avatar;
            this.dom.bottleResultGender.textContent = selectedPlayer.gender === 'female' ? '♀ Female' : '♂ Male';
            this.dom.bottleResultGender.className = `gender-pill ${selectedPlayer.gender}`;
            this.dom.bottleResultModal.classList.remove('hidden');
          }
        }
      };

      requestAnimationFrame(animate);
    }

    finishBottleSpin() {
      soundFX.playSuccess();
      let finalAngle = (this.bottleRotation - Math.PI / 2) % (Math.PI * 2);
      if (finalAngle < 0) finalAngle += Math.PI * 2;

      const count = this.players.length;
      const angleStep = (Math.PI * 2) / count;

      let normalizedPlayerAngles = this.players.map((_, i) => {
        let a = (i * angleStep - Math.PI / 2) % (Math.PI * 2);
        if (a < 0) a += Math.PI * 2;
        return a;
      });

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

      this.dom.bottleResultName.textContent = selected.name;
      this.dom.bottleResultAvatar.textContent = selected.avatar;
      this.dom.bottleResultGender.textContent = selected.gender === 'female' ? '♀ Female' : '♂ Male';
      this.dom.bottleResultGender.className = `gender-pill ${selected.gender}`;
      this.dom.bottleResultModal.classList.remove('hidden');

      return selected;
    }

    // ==========================================
    // CUSTOM QUESTIONS
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
      const gameType = this.dom.customGameType.value;
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
