<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { dbRealTime, dbRef, set } from '../config/firebase';
import { DISTANCE_OPTIONS, ROOM_EXPIRATION_DURATION } from '../config/constants';

const router = useRouter();

const isInitializing = ref(false);
const selectedDistance = ref(500);
const showCreateModal = ref(false);

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
    const expiresAt = Date.now() + ROOM_EXPIRATION_DURATION;
    
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
    
    closeCreateModal();
    
    // 방 관리 페이지로 이동
    router.push(`/room/${roomId}`);
  } catch (error) {
    console.error('방 생성 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isInitializing.value = false;
  }
}
</script>

<template>
  <div class="home-container">
    <div class="home-content">
      <h1 class="home-title">🏇 DASH RUN!</h1>
      
      <!-- 방 만들기 버튼 -->
      <div class="create-room-section">
        <button 
          @click="openCreateModal" 
          class="create-room-button"
        >
          🆕 방 만들기
        </button>
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
            <p class="modal-description">경기 거리를 선택해주세요.</p>
            
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
              ⚠️ 방은 {{ROOM_EXPIRATION_DURATION / 1000 / 60}}분 후 자동으로 만료됩니다.
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

@media (max-width: 600px) {
  .home-content {
    padding: 25px 20px;
  }
  
  .home-title {
    font-size: 1.8em;
  }
}
</style>

