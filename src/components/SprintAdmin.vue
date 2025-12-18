<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { dbRealTime, dbRef, onValue, set, update, remove } from '../config/firebase';
import { RACE_ID, FINISH_DISTANCE, DISTANCE_OPTIONS } from '../config/constants';

interface RaceState {
  status: 'waiting' | 'countdown' | 'started' | 'finished';
  createdAt?: number;
  countdownStartedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  finishDistance?: number;
}

interface Participant {
  name: string;
  distance: number;
  finish_time: number | null;
}

const raceState = ref<RaceState>({ status: 'waiting' });
const participants = ref<Record<string, Participant>>({});
const isInitializing = ref(false);
const selectedDistance = ref(1000); // 선택된 경기 거리
const showCreateModal = ref(false); // 레이스 생성 모달 표시 여부

// 현재 레이스의 목표 거리 (Firebase에서 가져온 값 또는 기본값)
const currentFinishDistance = computed(() => 
  raceState.value.finishDistance || FINISH_DISTANCE
);

let stateUnsubscribe: (() => void) | null = null;
let participantsUnsubscribe: (() => void) | null = null;

// 참가자 수
const participantCount = computed(() => Object.keys(participants.value).length);

// 정렬된 참가자 목록
const sortedParticipants = computed(() => {
  return Object.entries(participants.value)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => {
      // 완주한 참가자 우선, 그 다음 거리 순
      if (a.finish_time && b.finish_time) {
        return a.finish_time - b.finish_time;
      }
      if (a.finish_time) return -1;
      if (b.finish_time) return 1;
      return b.distance - a.distance;
    });
});

onMounted(() => {
  listenForRaceState();
  listenForParticipants();
});

onUnmounted(() => {
  stateUnsubscribe?.();
  participantsUnsubscribe?.();
});

/**
 * 레이스 상태를 실시간으로 가져옵니다.
 */
function listenForRaceState() {
  const raceStateRef = dbRef(dbRealTime, `${RACE_ID}/state`);
  
  stateUnsubscribe = onValue(raceStateRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      raceState.value = data as RaceState;
      // Firebase에서 가져온 거리로 선택값 동기화
      if (data.finishDistance) {
        selectedDistance.value = data.finishDistance;
      }
    } else {
      raceState.value = { status: 'waiting' };
    }
  });
}

/**
 * 참가자 목록을 실시간으로 가져옵니다.
 */
function listenForParticipants() {
  const participantsRef = dbRef(dbRealTime, `${RACE_ID}/participants`);
  
  participantsUnsubscribe = onValue(participantsRef, (snapshot) => {
    const data = snapshot.val();
    participants.value = data || {};
  });
}

/**
 * 레이스 생성 모달 열기
 */
function openCreateModal() {
  showCreateModal.value = true;
}

/**
 * 레이스 생성 모달 닫기
 */
function closeCreateModal() {
  showCreateModal.value = false;
}

/**
 * 모달에서 거리 선택
 */
function selectDistanceInModal(distance: number) {
  selectedDistance.value = distance;
}

/**
 * 새 레이스 생성 (모든 참가자 데이터 초기화)
 */
async function createNewRace() {
  const distanceLabel = DISTANCE_OPTIONS.find(d => d.value === selectedDistance.value)?.label || `${selectedDistance.value}m`;

  isInitializing.value = true;
  try {
    // 참가자 데이터 초기화
    const participantsRef = dbRef(dbRealTime, `${RACE_ID}/participants`);
    await set(participantsRef, null);
    
    // 레이스 상태 초기화 (선택된 거리 포함)
    const raceStateRef = dbRef(dbRealTime, `${RACE_ID}/state`);
    await set(raceStateRef, {
      status: 'waiting',
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      finishDistance: selectedDistance.value
    });

    closeCreateModal();
    alert(`${distanceLabel} 레이스가 생성되었습니다!`);
  } catch (error) {
    console.error('레이스 생성 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isInitializing.value = false;
  }
}

/**
 * 레이스 시작 (카운트다운 후 시작)
 */
async function startRace() {
  if (!confirm('레이스를 시작하시겠습니까? (3초 카운트다운 후 시작됩니다)')) {
    return;
  }

  try {
    const raceStateRef = dbRef(dbRealTime, `${RACE_ID}/state`);
    
    // 카운트다운 시작
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
    }, 3000);

  } catch (error) {
    console.error('레이스 시작 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 레이스 종료
 */
async function finishRace() {
  if (!confirm('레이스를 종료하시겠습니까?')) {
    return;
  }

  try {
    const raceStateRef = dbRef(dbRealTime, `${RACE_ID}/state`);
    await update(raceStateRef, {
      status: 'finished',
      finishedAt: Date.now()
    });

    alert('레이스가 종료되었습니다!');
  } catch (error) {
    console.error('레이스 종료 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 레이스 리셋 (전체 데이터 초기화)
 */
async function resetRace() {
  if (!confirm('⚠️ 모든 레이스 데이터를 삭제하시겠습니까?\n(참가자 데이터, 레이스 상태 모두 초기화됩니다)')) {
    return;
  }

  try {
    // 참가자 데이터 삭제
    const participantsRef = dbRef(dbRealTime, `${RACE_ID}/participants`);
    await set(participantsRef, null);
    
    // 레이스 상태 완전 초기화
    const raceStateRef = dbRef(dbRealTime, `${RACE_ID}/state`);
    await set(raceStateRef, null);
    
    // 선택된 거리도 기본값으로
    selectedDistance.value = 1000;

    alert('모든 레이스 데이터가 초기화되었습니다!');
  } catch (error) {
    console.error('레이스 리셋 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 참가자 강제 퇴장
 */
async function kickParticipant(participantId: string, participantName: string) {
  if (!confirm(`"${participantName}" 님을 퇴장시키시겠습니까?`)) {
    return;
  }

  try {
    const participantRef = dbRef(dbRealTime, `${RACE_ID}/participants/${participantId}`);
    await remove(participantRef);
    alert(`"${participantName}" 님이 퇴장되었습니다.`);
  } catch (error) {
    console.error('퇴장 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 모든 참가자 퇴장
 */
async function kickAllParticipants() {
  if (participantCount.value === 0) {
    alert('퇴장시킬 참가자가 없습니다.');
    return;
  }
  
  if (!confirm(`모든 참가자(${participantCount.value}명)를 퇴장시키시겠습니까?`)) {
    return;
  }

  try {
    const participantsRef = dbRef(dbRealTime, `${RACE_ID}/participants`);
    await set(participantsRef, null);
    alert('모든 참가자가 퇴장되었습니다.');
  } catch (error) {
    console.error('전체 퇴장 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 순위 계산
 */
function getRank(participant: { id: string; finish_time: number | null; distance: number }): number | null {
  if (!participant.finish_time) return null;
  
  // sortedParticipants에서 완주한 참가자들만 필터링하여 순위 계산
  const finishedInOrder = sortedParticipants.value
    .filter(p => p.finish_time !== null);
  
  const index = finishedInOrder.findIndex(p => p.id === participant.id);
  
  return index !== -1 ? index + 1 : null;
}
</script>

<template>
  <div class="admin-container">
    <div class="admin-content">
      <h1 class="admin-title">🏁 레이스 관리자 페이지</h1>
      
      <div class="race-status-card">
        <h2>현재 레이스 상태</h2>
        <div class="status-display" :class="raceState.status">
          <span class="status-label">상태:</span>
          <span class="status-value">
            <span v-if="raceState.status === 'waiting'">⏳ 대기 중</span>
            <span v-else-if="raceState.status === 'countdown'">🔔 카운트다운 중...</span>
            <span v-else-if="raceState.status === 'started'">🏃 진행 중</span>
            <span v-else-if="raceState.status === 'finished'">🏁 종료</span>
          </span>
        </div>
        <div v-if="raceState.startedAt" class="time-info">
          시작 시간: {{ new Date(raceState.startedAt).toLocaleString('ko-KR') }}
        </div>
      </div>

      <div class="admin-actions">
        <button 
          @click="openCreateModal" 
          :disabled="isInitializing"
          class="admin-button create-button"
        >
          {{ isInitializing ? '생성 중...' : '🆕 새 레이스 생성' }}
        </button>

        <button 
          @click="startRace" 
          :disabled="raceState.status !== 'waiting'"
          class="admin-button start-button"
        >
          🚀 레이스 시작
        </button>

        <button 
          @click="finishRace" 
          :disabled="raceState.status !== 'started'"
          class="admin-button finish-button"
        >
          🏁 레이스 종료
        </button>

        <button 
          @click="resetRace" 
          :disabled="raceState.status === 'waiting'"
          class="admin-button reset-button"
        >
          🔄 레이스 리셋
        </button>
      </div>

      <!-- 참가자 목록 -->
      <div class="participants-section">
        <div class="participants-header">
          <h3>👥 참가자 목록 ({{ participantCount }}명)</h3>
          <button 
            @click="kickAllParticipants" 
            class="kick-all-button"
            :disabled="participantCount === 0"
          >
            🚫 전체 퇴장
          </button>
        </div>
        
        <div v-if="participantCount === 0" class="no-participants">
          아직 참가자가 없습니다.
        </div>
        
        <div v-else class="participants-list">
          <div 
            v-for="(participant, index) in sortedParticipants" 
            :key="participant.id"
            class="participant-item"
            :class="{ 
              'finished': participant.finish_time,
              'rank-1': getRank(participant) === 1,
              'rank-2': getRank(participant) === 2,
              'rank-3': getRank(participant) === 3
            }"
          >
            <div class="participant-rank">
              <span v-if="getRank(participant)" class="rank-badge">
                {{ getRank(participant) }}등
              </span>
              <span v-else class="rank-number">{{ index + 1 }}</span>
            </div>
            
            <div class="participant-info">
              <div class="participant-name">{{ participant.name }}</div>
              <div class="participant-distance">
                {{ participant.distance }}m / {{ currentFinishDistance }}m
                <span class="progress-text">({{ Math.round((participant.distance / currentFinishDistance) * 100) }}%)</span>
              </div>
            </div>
            
            <div class="participant-status">
              <span v-if="participant.finish_time" class="status-finished">🏆 완주</span>
              <span v-else-if="participant.distance > 0" class="status-running">🏃 달리는 중</span>
              <span v-else class="status-waiting">⏳ 대기</span>
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

      <div class="race-info">
        <h3>레이스 정보</h3>
        <ul>
          <li>목표 거리: {{ currentFinishDistance }}m</li>
          <li>레이스 ID: {{ RACE_ID }}</li>
        </ul>
      </div>
    </div>

    <!-- 레이스 생성 모달 -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>🏁 새 레이스 생성</h2>
            <button class="modal-close" @click="closeCreateModal">×</button>
          </div>
          
          <div class="modal-body">
            <p class="modal-description">경기 거리를 선택해주세요</p>
            
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
              ⚠️ 새 레이스를 생성하면 모든 참가자 데이터가 초기화됩니다.
            </div>
          </div>
          
          <div class="modal-footer">
            <button class="modal-cancel-button" @click="closeCreateModal">취소</button>
            <button 
              class="modal-confirm-button" 
              @click="createNewRace"
              :disabled="isInitializing"
            >
              {{ isInitializing ? '생성 중...' : '레이스 생성' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.admin-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #87CEEB 0%, #E0F6FF 50%, #FFE4E1 100%);
  padding: 30px 20px;
  position: relative;
  overflow: auto;
}

/* 배경 장식 */
.admin-container::before {
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

.admin-content {
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

.admin-title {
  font-size: 2.2em;
  margin-bottom: 25px;
  background: linear-gradient(45deg, #FF69B4, #FF1493, #FF69B4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
  font-weight: bold;
}

.race-status-card {
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 25px;
  color: white;
  box-shadow: 0 10px 30px rgba(255, 105, 180, 0.4);
  position: relative;
  overflow: hidden;
}

.race-status-card::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: shine 3s infinite;
}

@keyframes shine {
  0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
  100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
}

.race-status-card h2 {
  margin-bottom: 12px;
  color: white;
  font-size: 1.3em;
  position: relative;
  z-index: 1;
}

.status-display {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.1em;
  position: relative;
  z-index: 1;
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

.time-info {
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85em;
  margin-top: 10px;
  position: relative;
  z-index: 1;
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

.create-button {
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  box-shadow: 0 6px 15px rgba(255, 105, 180, 0.4);
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

.admin-button:hover:not(:disabled) {
  transform: translateY(-2px);
}

/* 참가자 섹션 */
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

.race-info {
  background: linear-gradient(135deg, rgba(255, 182, 193, 0.3) 0%, rgba(255, 192, 203, 0.3) 100%);
  border-radius: 15px;
  padding: 20px;
  border: 2px solid rgba(255, 182, 193, 0.5);
}

.race-info h3 {
  margin-bottom: 12px;
  color: #FF69B4;
  font-size: 1.1em;
}

.race-info ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.race-info li {
  padding: 8px 0;
  color: #666;
  border-bottom: 1px solid rgba(255, 182, 193, 0.5);
  font-size: 0.95em;
}

.race-info li:last-child {
  border-bottom: none;
}

@media (max-width: 600px) {
  .admin-content {
    padding: 25px 20px;
  }
  
  .admin-actions {
    grid-template-columns: 1fr;
  }
  
  .admin-title {
    font-size: 1.8em;
  }
  
  .participants-header {
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  
  .participant-item {
    flex-wrap: wrap;
  }
  
  .participant-status {
    width: 100%;
    text-align: left;
    margin-top: 5px;
  }
}
</style>
