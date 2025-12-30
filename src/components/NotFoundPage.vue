<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goHome() {
  router.push('/');
}
</script>

<template>
  <div class="not-found-container">
    <div class="not-found-content">
      <div class="error-code">404</div>
      <div class="error-emoji">🤷‍♂️</div>
      <h1 class="error-title">길을 잃으셨나요?</h1>
      <p class="error-description">
        찾으시는 페이지가 사라졌거나<br>
        다른 차원으로 이동했을 수도 있습니다! 🚀
      </p>
      <div class="fun-message">
        <p>💡 팁: 레이스는 시작되었지만 페이지는 도착하지 못했습니다!</p>
      </div>
      <button @click="goHome" class="home-button">
        🏠 홈으로 돌아가기
      </button>
    </div>
    
    <!-- 움직이는 요소들 -->
    <div class="floating-elements">
      <div class="floating-emoji" style="--delay: 0s; --duration: 3s;">🏃</div>
      <div class="floating-emoji" style="--delay: 0.5s; --duration: 4s;">🏁</div>
      <div class="floating-emoji" style="--delay: 1s; --duration: 3.5s;">🚀</div>
      <div class="floating-emoji" style="--delay: 1.5s; --duration: 4.5s;">💨</div>
      <div class="floating-emoji" style="--delay: 2s; --duration: 3s;">⭐</div>
    </div>
  </div>
</template>

<style scoped>
.not-found-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #4facfe 75%, #00f2fe 100%);
  background-size: 400% 400%;
  animation: gradientShift 15s ease infinite;
  padding: 20px;
  position: relative;
  overflow: hidden;
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.not-found-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 30px;
  padding: 60px 40px;
  text-align: center;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3);
  border: 4px solid rgba(255, 255, 255, 0.6);
  position: relative;
  z-index: 1;
  max-width: 600px;
  width: 100%;
  animation: bounceIn 0.8s ease;
}

@keyframes bounceIn {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  50% {
    transform: scale(1.05);
  }
  70% {
    transform: scale(0.9);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.error-code {
  font-size: 8rem;
  font-weight: 900;
  background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #ffe66d, #ff6b6b);
  background-size: 300% 300%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: gradientText 3s ease infinite;
  line-height: 1;
  margin-bottom: 20px;
  text-shadow: 0 0 30px rgba(255, 107, 107, 0.5);
}

@keyframes gradientText {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.error-emoji {
  font-size: 5rem;
  margin-bottom: 20px;
  animation: rotate 2s ease-in-out infinite;
}

@keyframes rotate {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  75% { transform: rotate(10deg); }
}

.error-title {
  font-size: 2.5rem;
  font-weight: 800;
  color: #333;
  margin-bottom: 20px;
  background: linear-gradient(45deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.error-description {
  font-size: 1.2rem;
  color: #666;
  line-height: 1.8;
  margin-bottom: 30px;
}

.fun-message {
  background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
  border-radius: 15px;
  padding: 20px;
  margin-bottom: 30px;
  border: 3px solid rgba(255, 193, 7, 0.3);
  box-shadow: 0 10px 30px rgba(255, 193, 7, 0.2);
}

.fun-message p {
  margin: 0;
  font-size: 1.1rem;
  color: #856404;
  font-weight: 600;
}

.home-button {
  padding: 18px 40px;
  font-size: 1.3rem;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
  position: relative;
  overflow: hidden;
}

.home-button::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.home-button:hover::before {
  width: 300px;
  height: 300px;
}

.home-button:hover {
  transform: translateY(-5px) scale(1.05);
  box-shadow: 0 15px 40px rgba(102, 126, 234, 0.6);
}

.home-button:active {
  transform: translateY(-2px) scale(1.02);
}

/* 플로팅 이모지 */
.floating-elements {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.floating-emoji {
  position: absolute;
  font-size: 3rem;
  animation: float var(--duration) ease-in-out infinite;
  animation-delay: var(--delay);
  opacity: 0.6;
}

.floating-emoji:nth-child(1) {
  top: 10%;
  left: 10%;
}

.floating-emoji:nth-child(2) {
  top: 20%;
  right: 15%;
}

.floating-emoji:nth-child(3) {
  bottom: 30%;
  left: 20%;
}

.floating-emoji:nth-child(4) {
  bottom: 20%;
  right: 10%;
}

.floating-emoji:nth-child(5) {
  top: 50%;
  right: 30%;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-30px) rotate(10deg);
  }
  50% {
    transform: translateY(-60px) rotate(-10deg);
  }
  75% {
    transform: translateY(-30px) rotate(5deg);
  }
}

@media (max-width: 600px) {
  .not-found-content {
    padding: 40px 25px;
  }
  
  .error-code {
    font-size: 5rem;
  }
  
  .error-emoji {
    font-size: 3rem;
  }
  
  .error-title {
    font-size: 1.8rem;
  }
  
  .error-description {
    font-size: 1rem;
  }
  
  .home-button {
    padding: 15px 30px;
    font-size: 1.1rem;
  }
  
  .floating-emoji {
    font-size: 2rem;
  }
}
</style>

