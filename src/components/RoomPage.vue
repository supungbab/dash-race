<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dbRealTime, dbRef, onValue, set, update, remove } from '../config/firebase';
import { COUNTDOWN_DURATION } from '../config/constants';
import QRCode from 'qrcode';

const route = useRoute();
const router = useRouter();

interface RaceState {
  status: 'waiting' | 'preparing' | 'countdown' | 'started' | 'finished';
  createdAt?: number;
  preparingStartedAt?: number;
  countdownStartedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  finishDistance?: number;
  expiresAt?: number;
}

interface Participant {
  name: string;
  distance: number;
  finish_time: number | null;
}

const roomId = computed(() => route.params.roomId as string);
const raceState = ref<RaceState>({ status: 'waiting' });
const participants = ref<Record<string, Participant>>({});
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

// 방 만료 시간 체크 (입장 제한 시간만 표시)
function checkRoomExpiration() {
  if (roomExpiresAt.value) {
    const now = Date.now();
    timeRemaining.value = Math.max(0, Math.floor((roomExpiresAt.value - now) / 1000));
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function listenForRaceState(roomId: string) {
  const raceStateRef = dbRef(dbRealTime, `rooms/${roomId}/state`);
  
  stateUnsubscribe = onValue(raceStateRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      raceState.value = data as RaceState;
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

// QR 코드 생성
async function generateQRCode() {
  if (!roomId.value) return;
  
  try {
    const baseUrl = window.location.origin;
    const runnerUrl = `${baseUrl}/sprint-runner/${roomId.value}`;
    
    qrCodeDataUrl.value = await QRCode.toDataURL(runnerUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#FF69B4',
        light: '#FFFFFF'
      }
    });
  } catch (error) {
    console.error('QR 코드 생성 오류:', error);
  }
}

// 방 닫기
async function closeRoom() {
  if (!roomId.value) return;
  
  if (!confirm('방을 닫으시겠습니까? 모든 데이터가 삭제됩니다.')) {
    return;
  }
  
  try {
    // 리스너 정리
    stateUnsubscribe?.();
    participantsUnsubscribe?.();
    if (expirationTimer) {
      clearInterval(expirationTimer);
      expirationTimer = null;
    }
    
    const roomRef = dbRef(dbRealTime, `rooms/${roomId.value}`);
    await set(roomRef, null);
    
    router.push('/room');
  } catch (error) {
    console.error('방 닫기 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 레이스 시작
async function startRace() {
  if (!roomId.value) return;
  
  if (!confirm('레이스를 시작하시겠습니까?')) {
    return;
  }

  try {
    const raceStateRef = dbRef(dbRealTime, `rooms/${roomId.value}/state`);
    
    // 준비 상태로 변경 (전광판에서 "준비하세요!" 표시)
    await update(raceStateRef, {
      status: 'preparing',
      preparingStartedAt: Date.now()
    });

    // 전광판으로 이동
    router.push(`/sprint-display/${roomId.value}`);

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
  if (!roomId.value) return;
  const baseUrl = window.location.origin;
  const runnerUrl = `${baseUrl}/sprint-runner/${roomId.value}`;
  navigator.clipboard.writeText(runnerUrl).then(() => {
    alert('URL이 클립보드에 복사되었습니다!');
  });
}

// 참가자 강제 퇴장
async function kickParticipant(participantId: string, participantName: string) {
  if (!roomId.value) return;
  
  if (!confirm(`"${participantName}" 님을 퇴장시키시겠습니까?`)) {
    return;
  }

  try {
    const participantRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants/${participantId}`);
    await remove(participantRef);
    alert(`"${participantName}" 님이 퇴장되었습니다.`);
  } catch (error) {
    console.error('퇴장 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 모든 참가자 퇴장
async function kickAllParticipants() {
  if (!roomId.value) return;
  
  if (participantCount.value === 0) {
    alert('퇴장시킬 참가자가 없습니다.');
    return;
  }
  
  if (!confirm(`모든 참가자(${participantCount.value}명)를 퇴장시키시겠습니까?`)) {
    return;
  }

  try {
    const participantsRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants`);
    await set(participantsRef, null);
    alert('모든 참가자가 퇴장되었습니다.');
  } catch (error) {
    console.error('전체 퇴장 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 테스트용 가짜 참가자 추가
async function addFakeParticipants() {
  if (!roomId.value) return;
  
  if (!confirm('가짜 참가자 50명을 추가하시겠습니까?')) {
    return;
  }
  
  try {
    const participantsRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants`);
    const fakeNames = [
      '김철수', '이영희', '박민수', '최지영', '정수진', '강동원', '한지민', '송혜교', '이병헌', '전지현',
      '유재석', '강호동', '신동엽', '이승기', '아이유', '태연', '지드래곤', '빅뱅', 'BTS', '블랙핑크',
      '손흥민', '박지성', '이강인', '황희찬', '김민재', '조규성', '이재성', '황의조', '구자철', '기성용',
      '나나', '미미', '지효', '모모', '사나', '쯔위', '다현', '채영', '정연', '지은',
      '윤아', '태연', '써니', '티파니', '효연', '유리', '수영', '서현', '제시카', '서현진'
    ];
    
    const fakeParticipants: Record<string, Participant> = {};
    
    for (let i = 0; i < 50; i++) {
      const userId = `fake_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const nameIndex = i % fakeNames.length;
      fakeParticipants[userId] = {
        name: `${fakeNames[nameIndex]}${i >= fakeNames.length ? Math.floor(i / fakeNames.length) + 1 : ''}`,
        distance: 0,
        finish_time: null
      };
    }
    
    await set(participantsRef, fakeParticipants);
    alert('가짜 참가자 50명이 추가되었습니다!');
  } catch (error) {
    console.error('가짜 참가자 추가 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

onMounted(() => {
  if (roomId.value) {
    listenForRaceState(roomId.value);
    listenForParticipants(roomId.value);
    generateQRCode();
    
    // 만료 타이머 시작
    expirationTimer = setInterval(checkRoomExpiration, 1000);
  }
});

onUnmounted(() => {
  stateUnsubscribe?.();
  participantsUnsubscribe?.();
  if (expirationTimer) {
    clearInterval(expirationTimer);
  }
});
</script>

<template>
  <div class="room-container">
    <div class="room-content">
      <div class="room-layout">
        <!-- 왼쪽: 입장 리스트 -->
        <div class="participants-panel">
          <div class="participants-header">
            <h3>👥 참가자 ({{ participantCount }}명)</h3>
            <div class="header-right">
              <div class="room-timer" v-if="timeRemaining > 0">
                ⏰ {{ formatTime(timeRemaining) }}
              </div>
              <button 
                @click="kickAllParticipants" 
                class="kick-all-button"
                :disabled="participantCount === 0"
              >
                🚫 전체 퇴장
              </button>
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
              
              <button 
                @click="kickParticipant(participant.id, participant.name)"
                class="kick-button"
                title="퇴장시키기"
              >
                🚪
              </button>
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
              방 ID: <code>{{ roomId }}</code>
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
            <span>🚪 방 닫기</span>
            </button>
            
            <!-- 테스트용 가짜 참가자 추가 버튼 -->
            <button 
              v-if="false"
              @click="addFakeParticipants" 
              class="test-button"
            >
            <span>🧪 테스트 참가자 50명 추가</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.room-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #87CEEB 0%, #E0F6FF 50%, #FFE4E1 100%);
  padding: 30px 20px;
  position: relative;
  overflow: auto;
}

.room-container::before {
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

.room-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 30px;
  padding: 40px;
  box-shadow: 0 20px 60px rgba(255, 105, 180, 0.2);
  max-width: 1200px;
  width: 100%;
  position: relative;
  z-index: 1;
  border: 3px solid rgba(255, 182, 193, 0.5);
}

.room-layout {
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: 30px;
  align-items: stretch;
}

/* 왼쪽: 참가자 패널 */
.participants-panel {
  background: rgba(255, 182, 193, 0.15);
  border-radius: 20px;
  padding: 20px;
  border: 2px solid rgba(255, 182, 193, 0.4);
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
  max-height: 80vh;
}

.participants-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.participants-header h3 {
  color: #FF69B4;
  font-size: 1.2em;
  margin: 0;
}

.room-timer {
  font-size: 1.2em;
  font-weight: bold;
  background: rgba(255, 255, 255, 0.3);
  padding: 8px 16px;
  border-radius: 15px;
  color: #FF69B4;
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
  min-width: 0;
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
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.participant-item:hover {
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

.kick-button {
  padding: 8px 12px;
  font-size: 1.1em;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 40px;
}

.kick-button:hover {
  transform: scale(1.1);
  box-shadow: 0 5px 15px rgba(255, 71, 87, 0.4);
}

/* 가운데: QR 패널 */
.qr-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: 80vh;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.start-race-button {
  width: 100%;
  padding: 18px;
  font-size: 1.2em;
  font-weight: 800;
  color: white;
  background: linear-gradient(135deg, #98FB98 0%, #32CD32 50%, #00FF7F 100%);
  border: 4px solid rgba(255, 255, 255, 0.6);
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 10px 30px rgba(50, 205, 50, 0.4);
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

.start-race-button .button-text {
  font-size: 0.85em;
  line-height: 1.4;
}

.close-room-button {
  width: 100%;
  padding: 18px;
  font-size: 1.2em;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%);
  border: none;
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 15px rgba(255, 71, 87, 0.4);
}

.close-room-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 71, 87, 0.5);
}

.test-button {
  width: 100%;
  padding: 12px 20px;
  font-size: 1em;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #9B59B6 0%, #8E44AD 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 15px rgba(142, 68, 173, 0.4);
  margin-top: 10px;
}

.test-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(142, 68, 173, 0.5);
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
  .room-content {
    padding: 25px 20px;
  }
  
  .room-layout {
    gap: 20px;
  }
  
  .qr-content,
  .start-section {
    padding: 20px;
  }
}
</style>

