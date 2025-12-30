<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { dbRealTime, dbRef, onValue, set, update } from '../config/firebase';
import { DISTANCE_OPTIONS, COUNTDOWN_DURATION } from '../config/constants';
import QRCode from 'qrcode';

const router = useRouter();

interface RaceState {
  status: 'waiting' | 'preparing' | 'countdown' | 'started' | 'finished';
  createdAt?: number;
  preparingStartedAt?: number;
  countdownStartedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  finishDistance?: number;
  expiresAt?: number; // 방 만료 시간
}

interface Participant {
  name: string;
  distance: number;
  finish_time: number | null;
}

const currentRoomId = ref<string | null>(null);
const raceState = ref<RaceState>({ status: 'waiting' });
const participants = ref<Record<string, Participant>>({});
const isInitializing = ref(false);
const selectedDistance = ref(1000);
const showCreateModal = ref(false);
const qrCodeDataUrl = ref<string>('');
const roomExpiresAt = ref<number | null>(null);
const timeRemaining = ref<number>(0);

let stateUnsubscribe: (() => void) | null = null;
let participantsUnsubscribe: (() => void) | null = null;
let expirationTimer: ReturnType<typeof setInterval> | null = null;

const participantCount = computed(() => Object.keys(participants.value).length);

const sortedParticipants = computed(() => {
  return Object.entries(participants.value)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => {
      if (a.finish_time && b.finish_time) {
        return a.finish_time - b.finish_time;
      }
      if (a.finish_time) return -1;
      if (b.finish_time) return 1;
      return b.distance - a.distance;
    });
});

// 방 만료 시간 체크
function checkRoomExpiration() {
  if (roomExpiresAt.value) {
    const now = Date.now();
    timeRemaining.value = Math.max(0, Math.floor((roomExpiresAt.value - now) / 1000));
    
    if (timeRemaining.value <= 0 && currentRoomId.value) {
      // 방 만료 처리
      alert('방이 만료되었습니다.');
      closeRoom();
    }
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

onMounted(() => {
  // 만료 타이머 시작
  expirationTimer = setInterval(checkRoomExpiration, 1000);
});

onUnmounted(() => {
  stateUnsubscribe?.();
  participantsUnsubscribe?.();
  if (expirationTimer) {
    clearInterval(expirationTimer);
  }
});

function listenForRaceState(roomId: string) {
  const raceStateRef = dbRef(dbRealTime, `rooms/${roomId}/state`);
  
  stateUnsubscribe = onValue(raceStateRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      raceState.value = data as RaceState;
      if (data.finishDistance) {
        selectedDistance.value = data.finishDistance;
      }
      if (data.expiresAt) {
        roomExpiresAt.value = data.expiresAt;
      }
    } else {
      raceState.value = { status: 'waiting' };
    }
  });
}

function listenForParticipants(roomId: string) {
  const participantsRef = dbRef(dbRealTime, `rooms/${roomId}/participants`);
  
  participantsUnsubscribe = onValue(participantsRef, (snapshot) => {
    const data = snapshot.val();
    participants.value = data || {};
  });
}

function openCreateModal() {
  showCreateModal.value = true;
}

function closeCreateModal() {
  showCreateModal.value = false;
}

function selectDistanceInModal(distance: number) {
  selectedDistance.value = distance;
}

// 방 생성
async function createRoom() {
  isInitializing.value = true;
  try {
    // 랜덤 room ID 생성
    const roomId = Math.random().toString(36).substring(2, 15);
    const expiresAt = Date.now() + (3 * 60 * 1000); // 3분 후 만료
    
    // 방 데이터 생성
    const roomStateRef = dbRef(dbRealTime, `rooms/${roomId}/state`);
    await set(roomStateRef, {
      status: 'waiting',
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      finishDistance: selectedDistance.value,
      expiresAt: expiresAt
    });
    
    // 참가자 초기화
    const participantsRef = dbRef(dbRealTime, `rooms/${roomId}/participants`);
    await set(participantsRef, null);
    
    currentRoomId.value = roomId;
    roomExpiresAt.value = expiresAt;
    
    // QR 코드 생성
    const baseUrl = window.location.origin;
    const runnerUrl = `${baseUrl}/sprint-runner?room=${roomId}`;
    
    qrCodeDataUrl.value = await QRCode.toDataURL(runnerUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#FF69B4',
        light: '#FFFFFF'
      }
    });
    
    // 리스너 시작
    listenForRaceState(roomId);
    listenForParticipants(roomId);
    
    closeCreateModal();
    // QR 코드는 이미 생성되었으므로 바로 표시됨
  } catch (error) {
    console.error('방 생성 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isInitializing.value = false;
  }
}

// 방 닫기
async function closeRoom() {
  if (!currentRoomId.value) return;
  
  if (!confirm('방을 닫으시겠습니까? 모든 데이터가 삭제됩니다.')) {
    return;
  }
  
  try {
    const roomRef = dbRef(dbRealTime, `rooms/${currentRoomId.value}`);
    await set(roomRef, null);
    
    currentRoomId.value = null;
    roomExpiresAt.value = null;
    raceState.value = { status: 'waiting' };
    participants.value = {};
    qrCodeDataUrl.value = '';
    
    stateUnsubscribe?.();
    participantsUnsubscribe?.();
    stateUnsubscribe = null;
    participantsUnsubscribe = null;
  } catch (error) {
    console.error('방 닫기 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 레이스 시작
async function startRace() {
  if (!currentRoomId.value) return;
  
  if (!confirm('레이스를 시작하시겠습니까?')) {
    return;
  }

  try {
    const raceStateRef = dbRef(dbRealTime, `rooms/${currentRoomId.value}/state`);
    
    // 준비 상태로 변경 (전광판에서 "준비하세요!" 표시)
    await update(raceStateRef, {
      status: 'preparing',
      preparingStartedAt: Date.now()
    });

    // 전광판으로 이동
    router.push(`/sprint-display?room=${currentRoomId.value}`);

    // 2초 후 카운트다운 시작
    setTimeout(async () => {
      await update(raceStateRef, {
        status: 'countdown',
        countdownStartedAt: Date.now()
      });

      // 3초 후 실제 시작
      setTimeout(async () => {
        await update(raceStateRef, {
          status: 'started',
          startedAt: Date.now()
        });
      }, COUNTDOWN_DURATION);
    }, 2000);

  } catch (error) {
    console.error('레이스 시작 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}


function getRank(participant: { id: string; finish_time: number | null; distance: number }): number | null {
  if (!participant.finish_time) return null;
  
  const finishedInOrder = sortedParticipants.value
    .filter(p => p.finish_time !== null);
  
  const index = finishedInOrder.findIndex(p => p.id === participant.id);
  
  return index !== -1 ? index + 1 : null;
}

// QR 코드 URL 복사
function copyQRUrl() {
  if (!currentRoomId.value) return;
  const baseUrl = window.location.origin;
  const runnerUrl = `${baseUrl}/sprint-runner?room=${currentRoomId.value}`;
  navigator.clipboard.writeText(runnerUrl).then(() => {
    alert('URL이 클립보드에 복사되었습니다!');
  });
}
</script>

<template>
  <div class="home-container">
    <div class="home-content">
      <h1 class="home-title">🏇 DASH RUN!</h1>
      
      <!-- 방 만들기 버튼 -->
      <div v-if="!currentRoomId" class="create-room-section">
        <button 
          @click="openCreateModal" 
          class="create-room-button"
        >
          🆕 방 만들기
        </button>
      </div>
      
      <!-- 방 관리 섹션 -->
      <div v-else class="room-management-section">
        <div class="room-layout">
          <!-- 왼쪽: 입장 리스트 -->
          <div class="participants-panel">
            <div class="participants-header">
              <h3>👥 참가자 ({{ participantCount }}명)</h3>
              <div class="room-timer" v-if="timeRemaining > 0">
                ⏰ {{ formatTime(timeRemaining) }}
              </div>
            </div>
            
            <div v-if="participantCount === 0" class="no-participants">
              <p>아직 참가자가 없습니다.</p>
              <p class="hint-text">QR 코드를 스캔하여 참가하세요!</p>
            </div>
            
            <div v-else class="participants-list">
              <div 
                v-for="(participant, index) in sortedParticipants" 
                :key="participant.id"
                class="participant-item"
              >
                <div class="participant-rank">
                  <span v-if="getRank(participant)" class="rank-badge">
                    {{ getRank(participant) }}등
                  </span>
                  <span v-else class="rank-number">{{ index + 1 }}</span>
                </div>
                
                <div class="participant-info">
                  <div class="participant-name">{{ participant.name }}</div>
                  <div class="participant-status">
                    <span v-if="participant.finish_time" class="status-finished">🏆 완주</span>
                    <span v-else-if="participant.distance > 0" class="status-running">🏃 {{ Math.round(participant.distance) }}m</span>
                    <span v-else class="status-waiting">⏳ 대기</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 가운데: QR 코드 -->
          <div class="qr-panel">
            <div class="qr-content">
              <h3>📱 참가자 QR 코드</h3>
              <div v-if="qrCodeDataUrl" class="qr-image-wrapper">
                <img :src="qrCodeDataUrl" alt="QR Code" class="qr-image" />
              </div>
              <div v-else class="qr-placeholder">
                QR 코드 생성 중...
              </div>
              <button @click="copyQRUrl" class="copy-url-button">
                📋 URL 복사하기
              </button>
              <div class="room-id-info">
                방 ID: <code>{{ currentRoomId }}</code>
              </div>
            </div>
            
            <!-- 시작하기 버튼 -->
            <div class="start-section">
              <button 
                @click="startRace" 
                :disabled="raceState.status !== 'waiting'"
                class="start-race-button"
              >
                <span v-if="raceState.status === 'waiting'">🚀 레이스 시작하기</span>
                <span v-else-if="raceState.status === 'preparing'">⏳ 준비 중...</span>
                <span v-else-if="raceState.status === 'countdown'">🔔 카운트다운 중...</span>
                <span v-else-if="raceState.status === 'started'">🏃 진행 중</span>
                <span v-else-if="raceState.status === 'finished'">🏁 종료됨</span>
              </button>
              
              <button 
                @click="closeRoom" 
                class="close-room-button"
              >
                🚪 방 닫기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 방 생성 모달 -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>🏁 새 방 만들기</h2>
            <button class="modal-close" @click="closeCreateModal">×</button>
          </div>
          
          <div class="modal-body">
            <p class="modal-description">경기 거리를 선택해주세요 (방은 3분 후 자동으로 만료됩니다)</p>
            
            <div class="modal-distance-options">
              <button
                v-for="option in DISTANCE_OPTIONS"
                :key="option.value"
                @click="selectDistanceInModal(option.value)"
                :class="['modal-distance-button', { active: selectedDistance === option.value }]"
              >
                <span class="distance-icon">
                  <span v-if="option.value === 100">🚀</span>
                  <span v-else-if="option.value === 500">🏃</span>
                  <span v-else>🏅</span>
                </span>
                <span class="distance-label">{{ option.label }}</span>
                <span class="distance-desc">
                  <span v-if="option.value === 100">빠른 스프린트</span>
                  <span v-else-if="option.value === 500">균형잡힌 경주</span>
                  <span v-else>전략적 레이스</span>
                </span>
              </button>
            </div>

            <div class="modal-warning">
              ⚠️ 방은 3분 후 자동으로 만료됩니다.
            </div>
          </div>
          
          <div class="modal-footer">
            <button class="modal-cancel-button" @click="closeCreateModal">취소</button>
            <button 
              class="modal-confirm-button" 
              @click="createRoom"
              :disabled="isInitializing"
            >
              {{ isInitializing ? '생성 중...' : '방 만들기' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
.home-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #87CEEB 0%, #E0F6FF 50%, #FFE4E1 100%);
  padding: 30px 20px;
  position: relative;
  overflow: auto;
}

.home-container::before {
  content: '';
  position: fixed;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: 
    radial-gradient(circle at 20% 30%, rgba(255, 182, 193, 0.3) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(255, 192, 203, 0.3) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(255, 105, 180, 0.2) 0%, transparent 50%);
  animation: backgroundFloat 20s ease-in-out infinite;
  pointer-events: none;
}

@keyframes backgroundFloat {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(30px, -30px) rotate(120deg); }
  66% { transform: translate(-30px, 30px) rotate(240deg); }
}

.home-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 30px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(255, 105, 180, 0.2);
  max-width: 700px;
  width: 100%;
  position: relative;
  z-index: 1;
  border: 3px solid rgba(255, 182, 193, 0.5);
}

.home-title {
  font-size: 2.2em;
  margin-bottom: 25px;
  background: linear-gradient(45deg, #FF69B4, #FF1493, #FF69B4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
  font-weight: bold;
}

.create-room-section {
  text-align: center;
}

.create-room-button {
  padding: 25px 60px;
  font-size: 1.5rem;
  font-weight: 800;
  color: white;
  background: linear-gradient(145deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  border: 4px solid rgba(255, 255, 255, 0.6);
  border-radius: 30px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 15px 40px rgba(255, 105, 180, 0.5);
}

.create-room-button:hover {
  transform: translateY(-5px);
  box-shadow: 0 20px 50px rgba(255, 105, 180, 0.7);
}

.room-management-section {
  width: 100%;
}

.room-layout {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: 30px;
  align-items: start;
}

/* 왼쪽: 참가자 패널 */
.participants-panel {
  background: rgba(255, 182, 193, 0.15);
  border-radius: 20px;
  padding: 20px;
  border: 2px solid rgba(255, 182, 193, 0.4);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.participants-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
}

.participants-header h3 {
  color: #FF69B4;
  font-size: 1.2em;
  margin: 0;
}

.no-participants {
  text-align: center;
  color: #999;
  padding: 40px 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.no-participants p {
  margin: 5px 0;
}

.hint-text {
  font-size: 0.9em;
  color: #FF69B4;
  margin-top: 10px;
}

.participants-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex: 1;
}

.participant-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 15px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  border: 2px solid rgba(255, 182, 193, 0.3);
  transition: all 0.2s ease;
}

.participant-item:hover {
  transform: translateX(5px);
  box-shadow: 0 5px 15px rgba(255, 105, 180, 0.2);
}

.participant-rank {
  min-width: 40px;
  text-align: center;
}

.rank-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85em;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  color: #8B4513;
}

.rank-number {
  color: #999;
  font-size: 0.9em;
  font-weight: 600;
}

.participant-info {
  flex: 1;
  min-width: 0;
}

.participant-name {
  font-weight: 700;
  color: #333;
  font-size: 1.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.participant-status {
  font-size: 0.85em;
  margin-top: 3px;
}

.status-finished {
  color: #FFB700;
  font-weight: 600;
}

.status-running {
  color: #32CD32;
  font-weight: 600;
}

.status-waiting {
  color: #999;
}

/* 가운데: QR 패널 */
.qr-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.qr-content {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  padding: 30px;
  border: 2px solid rgba(255, 182, 193, 0.4);
  text-align: center;
}

.qr-content h3 {
  color: #FF69B4;
  font-size: 1.3em;
  margin: 0 0 20px 0;
}

.qr-image-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
}

.qr-image {
  width: 100%;
  max-width: 300px;
  height: auto;
  border-radius: 15px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.qr-placeholder {
  padding: 60px 20px;
  color: #999;
  font-size: 1.1em;
}

.copy-url-button {
  width: 100%;
  padding: 12px 24px;
  font-size: 1em;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 20px rgba(255, 105, 180, 0.4);
  margin-bottom: 15px;
}

.copy-url-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(255, 105, 180, 0.5);
}

.room-id-info {
  font-size: 0.9em;
  color: #666;
  margin-top: 15px;
}

.room-id-info code {
  background: rgba(255, 182, 193, 0.2);
  padding: 4px 8px;
  border-radius: 5px;
  font-family: monospace;
  color: #FF69B4;
  font-weight: 600;
}

/* 시작하기 섹션 */
.start-section {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 20px;
  padding: 30px;
  border: 2px solid rgba(255, 182, 193, 0.4);
  text-align: center;
}

.start-race-button {
  width: 100%;
  padding: 20px;
  font-size: 1.3em;
  font-weight: 800;
  color: white;
  background: linear-gradient(135deg, #98FB98 0%, #32CD32 50%, #00FF7F 100%);
  border: 4px solid rgba(255, 255, 255, 0.6);
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 10px 30px rgba(50, 205, 50, 0.4);
  margin-bottom: 15px;
}

.start-race-button:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 15px 40px rgba(50, 205, 50, 0.6);
}

.start-race-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: linear-gradient(135deg, #D3D3D3 0%, #A9A9A9 50%, #808080 100%);
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.close-room-button {
  width: 100%;
  padding: 12px 20px;
  font-size: 1em;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 15px rgba(255, 71, 87, 0.4);
}

.close-room-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 71, 87, 0.5);
}

.room-info-card {
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 25px;
  color: white;
  box-shadow: 0 10px 30px rgba(255, 105, 180, 0.4);
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.room-header h2 {
  margin: 0;
  font-size: 1.3em;
}

.room-timer {
  font-size: 1.2em;
  font-weight: bold;
  background: rgba(255, 255, 255, 0.3);
  padding: 8px 16px;
  border-radius: 15px;
}

.room-id-display {
  font-size: 0.9em;
  margin-top: 10px;
}

.room-id-display code {
  background: rgba(255, 255, 255, 0.3);
  padding: 4px 8px;
  border-radius: 5px;
  font-family: monospace;
}

.race-status-card {
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 25px;
  color: white;
  box-shadow: 0 10px 30px rgba(255, 105, 180, 0.4);
}

.race-status-card h2 {
  margin-bottom: 12px;
  color: white;
  font-size: 1.3em;
}

.status-display {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.1em;
}

.status-label {
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
}

.status-value {
  font-weight: bold;
  padding: 6px 16px;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.9);
}

.status-display.waiting .status-value { color: #FFB700; }
.status-display.countdown .status-value { color: #FF1493; }
.status-display.started .status-value { color: #32CD32; }
.status-display.finished .status-value { color: #FF1493; }

.admin-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 25px;
}

.admin-button {
  padding: 15px 18px;
  font-size: 1em;
  font-weight: bold;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
  border: 3px solid rgba(255, 255, 255, 0.5);
}

.admin-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-button {
  background: linear-gradient(135deg, #98FB98 0%, #32CD32 50%, #00FF7F 100%);
  box-shadow: 0 6px 15px rgba(50, 205, 50, 0.4);
}

.finish-button {
  background: linear-gradient(135deg, #87CEEB 0%, #4682B4 50%, #1E90FF 100%);
  box-shadow: 0 6px 15px rgba(30, 144, 255, 0.4);
}

.reset-button {
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%);
  box-shadow: 0 6px 15px rgba(255, 165, 0, 0.4);
}

.close-button {
  background: linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%);
  box-shadow: 0 6px 15px rgba(255, 71, 87, 0.4);
}

.admin-button:hover:not(:disabled) {
  transform: translateY(-2px);
}

.participants-section {
  background: rgba(255, 182, 193, 0.15);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 25px;
  border: 2px solid rgba(255, 182, 193, 0.4);
}

.participants-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.participants-header h3 {
  color: #FF69B4;
  font-size: 1.2em;
  margin: 0;
}

.kick-all-button {
  padding: 8px 16px;
  font-size: 0.9em;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%);
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.kick-all-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(255, 71, 87, 0.4);
}

.kick-all-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.no-participants {
  text-align: center;
  color: #999;
  padding: 30px;
  font-size: 1.1em;
}

.participants-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
}

.participant-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 15px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  border: 2px solid rgba(255, 182, 193, 0.3);
  transition: all 0.2s ease;
}

.participant-item:hover {
  transform: translateX(5px);
  box-shadow: 0 5px 15px rgba(255, 105, 180, 0.2);
}

.participant-item.finished {
  border-color: #FFD700;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1) 0%, rgba(255, 165, 0, 0.1) 100%);
}

.participant-item.rank-1 { border-color: #FFD700; }
.participant-item.rank-2 { border-color: #C0C0C0; }
.participant-item.rank-3 { border-color: #CD7F32; }

.participant-rank {
  min-width: 50px;
  text-align: center;
}

.rank-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85em;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  color: #8B4513;
}

.rank-number {
  color: #999;
  font-size: 0.9em;
}

.participant-info {
  flex: 1;
}

.participant-name {
  font-weight: 700;
  color: #333;
  font-size: 1.05em;
}

.participant-distance {
  font-size: 0.85em;
  color: #666;
  margin-top: 3px;
}

.progress-text {
  color: #FF69B4;
  font-weight: 600;
}

.participant-status {
  min-width: 80px;
  text-align: center;
}

.status-finished {
  color: #FFB700;
  font-weight: 600;
}

.status-running {
  color: #32CD32;
  font-weight: 600;
}

.status-waiting {
  color: #999;
}

.kick-button {
  padding: 8px 12px;
  font-size: 1.1em;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.kick-button:hover {
  transform: scale(1.1);
  box-shadow: 0 5px 15px rgba(255, 71, 87, 0.4);
}

/* 모달 스타일 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 24px;
  padding: 0;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 25px 80px rgba(255, 105, 180, 0.4);
  border: 3px solid rgba(255, 182, 193, 0.6);
  animation: slideUp 0.3s ease;
  overflow: hidden;
}

@keyframes slideUp {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 25px;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  color: white;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5em;
}

.modal-close {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  font-size: 1.8em;
  cursor: pointer;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  line-height: 1;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: rotate(90deg);
}

.modal-body {
  padding: 25px;
}

.modal-description {
  text-align: center;
  color: #666;
  margin-bottom: 20px;
  font-size: 1.1em;
}

.modal-distance-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-distance-button {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.9);
  border: 3px solid rgba(255, 182, 193, 0.4);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: left;
}

.modal-distance-button:hover {
  transform: translateX(5px);
  box-shadow: 0 8px 25px rgba(255, 105, 180, 0.2);
  border-color: rgba(255, 105, 180, 0.5);
}

.modal-distance-button.active {
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%);
  color: white;
  border-color: #FF8C00;
  box-shadow: 0 10px 30px rgba(255, 140, 0, 0.4);
  transform: scale(1.02);
}

.distance-icon {
  font-size: 2em;
  min-width: 50px;
  text-align: center;
}

.distance-label {
  font-weight: 700;
  font-size: 1.15em;
  flex: 1;
}

.modal-distance-button.active .distance-label {
  color: white;
}

.distance-desc {
  font-size: 0.85em;
  color: #999;
  white-space: nowrap;
}

.modal-distance-button.active .distance-desc {
  color: rgba(255, 255, 255, 0.9);
}

.modal-warning {
  margin-top: 20px;
  padding: 12px 15px;
  background: rgba(255, 193, 7, 0.15);
  border-radius: 12px;
  color: #856404;
  font-size: 0.9em;
  text-align: center;
  border: 2px solid rgba(255, 193, 7, 0.3);
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 20px 25px;
  background: rgba(255, 182, 193, 0.1);
  border-top: 2px solid rgba(255, 182, 193, 0.3);
}

.modal-cancel-button {
  flex: 1;
  padding: 15px;
  font-size: 1em;
  font-weight: 600;
  border: 3px solid rgba(150, 150, 150, 0.4);
  border-radius: 12px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.9);
  color: #666;
  transition: all 0.2s ease;
}

.modal-cancel-button:hover {
  background: #f0f0f0;
  transform: translateY(-2px);
}

.modal-confirm-button {
  flex: 1;
  padding: 15px;
  font-size: 1em;
  font-weight: bold;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  color: white;
  box-shadow: 0 6px 20px rgba(255, 105, 180, 0.4);
  transition: all 0.2s ease;
}

.modal-confirm-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(255, 105, 180, 0.5);
}

.modal-confirm-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* QR 모달 */
.qr-modal {
  max-width: 400px;
}

.qr-body {
  text-align: center;
  padding: 30px;
}

.qr-image {
  width: 100%;
  max-width: 300px;
  height: auto;
  border-radius: 15px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  margin-bottom: 20px;
}

.qr-instruction {
  font-size: 1.1em;
  color: #666;
  margin-bottom: 20px;
}

.qr-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.copy-url-button,
.display-button {
  padding: 12px 24px;
  font-size: 1em;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 20px rgba(255, 105, 180, 0.4);
  width: 100%;
}

.display-button {
  background: linear-gradient(135deg, #87CEEB 0%, #4682B4 50%, #1E90FF 100%);
  box-shadow: 0 6px 20px rgba(30, 144, 255, 0.4);
}

.copy-url-button:hover,
.display-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(255, 105, 180, 0.5);
}

.display-button:hover {
  box-shadow: 0 8px 25px rgba(30, 144, 255, 0.5);
}

@media (max-width: 900px) {
  .room-layout {
    grid-template-columns: 1fr;
  }
  
  .participants-panel {
    max-height: 400px;
  }
}

@media (max-width: 600px) {
  .home-content {
    padding: 25px 20px;
  }
  
  .home-title {
    font-size: 1.8em;
  }
  
  .room-layout {
    gap: 20px;
  }
  
  .qr-content,
  .start-section {
    padding: 20px;
  }
  
  .action-buttons {
    flex-direction: column;
  }
}
</style>

