<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const roomIdInput = ref('');
const showCamera = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);
let stream: MediaStream | null = null;

function handleEnterRoom() {
  const trimmedRoomId = roomIdInput.value.trim();
  if (!trimmedRoomId) {
    alert('방 ID를 입력해주세요.');
    return;
  }
  router.push(`/sprint-runner/${trimmedRoomId}`);
}

async function openCamera() {
  showCamera.value = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
    }
  } catch (error) {
    console.error('카메라 접근 오류:', error);
    alert('카메라 접근 권한이 필요합니다.');
    showCamera.value = false;
  }
}

function closeCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }
  showCamera.value = false;
}

onUnmounted(() => {
  closeCamera();
});
</script>

<template>
  <div class="home-container">
    <div class="home-content">
      <h1 class="home-title">🏇 DASH RUN!</h1>
      
      <div class="enter-section">
        <input
          v-model="roomIdInput"
          type="text"
          placeholder="방 ID를 입력하세요"
          class="room-id-input"
          @keyup.enter="handleEnterRoom"
        />
        
        <button @click="handleEnterRoom" class="enter-button">
          입장하기
        </button>
        
        <button @click="openCamera" class="camera-button">
          카메라 열기
        </button>
      </div>
    </div>

    <!-- 카메라 모달 -->
    <Teleport to="body">
      <div v-if="showCamera" class="camera-overlay" @click.self="closeCamera">
        <div class="camera-modal">
          <div class="camera-header">
            <h2>📷 카메라</h2>
            <button class="close-button" @click="closeCamera">×</button>
          </div>
          <div class="camera-body">
            <video
              ref="videoRef"
              autoplay
              playsinline
              class="camera-video"
            ></video>
            <p class="camera-hint">QR 코드를 카메라에 맞춰주세요</p>
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
  margin-bottom: 40px;
  background: linear-gradient(45deg, #FF69B4, #FF1493, #FF69B4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
  font-weight: bold;
}

.enter-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.room-id-input {
  padding: 18px 20px;
  font-size: 1.1em;
  border: 3px solid rgba(255, 182, 193, 0.4);
  border-radius: 12px;
  background: white;
  transition: all 0.2s ease;
  text-align: center;
}

.room-id-input:focus {
  outline: none;
  border-color: #FF69B4;
  box-shadow: 0 0 0 3px rgba(255, 105, 180, 0.1);
}

.enter-button {
  padding: 18px 24px;
  font-size: 1.2em;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #87CEEB 0%, #4682B4 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 20px rgba(30, 144, 255, 0.4);
}

.enter-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(30, 144, 255, 0.5);
}

.camera-button {
  padding: 18px 24px;
  font-size: 1.2em;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 20px rgba(255, 105, 180, 0.4);
}

.camera-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(255, 105, 180, 0.5);
}

/* 카메라 모달 */
.camera-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
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

.camera-modal {
  background: white;
  border-radius: 24px;
  padding: 0;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  border: 3px solid rgba(255, 182, 193, 0.6);
  animation: slideUp 0.3s ease;
  overflow: hidden;
}

@keyframes slideUp {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.camera-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 25px;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  color: white;
}

.camera-header h2 {
  margin: 0;
  font-size: 1.5em;
}

.close-button {
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

.close-button:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: rotate(90deg);
}

.camera-body {
  padding: 30px;
  text-align: center;
}

.camera-video {
  width: 100%;
  max-width: 500px;
  height: auto;
  border-radius: 15px;
  background: #000;
  margin-bottom: 20px;
}

.camera-hint {
  color: #666;
  font-size: 1em;
  margin-top: 15px;
}

@media (max-width: 600px) {
  .home-content {
    padding: 25px 20px;
  }
  
  .home-title {
    font-size: 1.8em;
  }
  
  .camera-modal {
    width: 95%;
  }
}
</style>
