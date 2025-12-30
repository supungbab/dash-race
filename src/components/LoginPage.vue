<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '../../stores/userStore';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const nickname = ref('');
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

// 닉네임으로 간단 로그인
const handleLogin = async () => {
  const trimmedNickname = nickname.value.trim();
  
  if (!trimmedNickname) {
    errorMessage.value = '닉네임을 입력해주세요.';
    return;
  }

  // 닉네임 유효성 검사 (영문, 숫자, 한글만 허용, 2-20자)
  const nicknameRegex = /^[a-zA-Z0-9가-힣]{2,20}$/;
  if (!nicknameRegex.test(trimmedNickname)) {
    errorMessage.value = '닉네임은 2-20자의 영문, 숫자, 한글만 사용 가능합니다.';
    return;
  }

  isLoading.value = true;
  errorMessage.value = null;

  try {
    // 간단한 userId 생성 (닉네임 + 타임스탬프)
    const userId = `user_${trimmedNickname}_${Date.now()}`;
    
    // 관리자 체크 (특정 닉네임을 관리자로 설정)
    const isAdmin = trimmedNickname.toLowerCase() === 'admin';
    
    // 세션 저장
    userStore.setUser(userId, trimmedNickname, isAdmin);
    console.log('✅ 로그인 성공:', trimmedNickname, isAdmin ? '(관리자)' : '');
    
    // redirect 쿼리가 있으면 그 경로로, 없으면 홈으로
    const redirect = route.query.redirect as string;
    router.push(redirect || '/');
  } catch (error: unknown) {
    console.error('로그인 실패:', error);
    errorMessage.value = '로그인에 실패했습니다. 다시 시도해주세요.';
  } finally {
    isLoading.value = false;
  }
};

// Enter 키로 제출
const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    handleLogin();
  }
};
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h1>🏇 DASH RUN!</h1>
        <p>닉네임을 입력하고 시작하세요</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="nickname">닉네임</label>
          <input
            id="nickname"
            type="text"
            v-model="nickname"
            placeholder="닉네임을 입력하세요"
            class="form-input"
            :disabled="isLoading"
            autocomplete="username"
            @keydown="handleKeydown"
            autofocus
          />
        </div>

        <div v-if="errorMessage" class="error-message">
          ❌ {{ errorMessage }}
        </div>

        <button type="submit" class="btn-submit" :disabled="isLoading">
          <span v-if="isLoading">접속 중...</span>
          <span v-else>🚀 시작하기</span>
        </button>
      </form>

      <div class="info-box">
        <h4>💡 안내</h4>
        <ul>
          <li>닉네임만 입력하면 바로 참가할 수 있어요!</li>
          <li>실시간으로 레이스 현황을 확인할 수 있습니다</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #87CEEB 0%, #E0F6FF 50%, #FFE4E1 100%);
  padding: 2rem;
  position: relative;
  overflow: hidden;
}

/* 배경 장식 */
.login-container::before {
  content: '';
  position: absolute;
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
  0%, 100% {
    transform: translate(0, 0) rotate(0deg);
  }
  33% {
    transform: translate(30px, -30px) rotate(120deg);
  }
  66% {
    transform: translate(-30px, 30px) rotate(240deg);
  }
}

.login-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 30px;
  box-shadow: 0 20px 60px rgba(255, 105, 180, 0.2);
  max-width: 480px;
  width: 100%;
  overflow: hidden;
  border: 3px solid rgba(255, 182, 193, 0.5);
  position: relative;
  z-index: 1;
}

.login-header {
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  color: white;
  padding: 3rem 2rem;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.login-header::before {
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
  0% {
    transform: translateX(-100%) translateY(-100%) rotate(45deg);
  }
  100% {
    transform: translateX(100%) translateY(100%) rotate(45deg);
  }
}

.login-header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 2.5rem;
  font-weight: bold;
  position: relative;
  z-index: 1;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
}

.login-header p {
  margin: 0;
  opacity: 0.95;
  font-size: 1.1rem;
  position: relative;
  z-index: 1;
}

.login-form {
  padding: 2rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: #FF69B4;
  font-weight: 600;
  font-size: 0.95rem;
}

.form-input {
  width: 100%;
  padding: 1rem;
  border: 2px solid rgba(255, 182, 193, 0.5);
  border-radius: 15px;
  font-size: 1.1rem;
  transition: all 0.3s ease;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.8);
}

.form-input:focus {
  outline: none;
  border-color: #FF69B4;
  box-shadow: 0 0 0 3px rgba(255, 105, 180, 0.2);
}

.form-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.error-message {
  background: linear-gradient(135deg, #FFE4E1 0%, #FFB6C1 100%);
  color: #FF1493;
  padding: 0.875rem;
  border-radius: 15px;
  margin-bottom: 1rem;
  border: 2px solid rgba(255, 20, 147, 0.3);
  font-size: 0.9rem;
}

.btn-submit {
  width: 100%;
  padding: 1.1rem;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  color: white;
  border: none;
  border-radius: 15px;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 8px 20px rgba(255, 105, 180, 0.4);
  border: 3px solid rgba(255, 255, 255, 0.5);
}

.btn-submit:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 12px 30px rgba(255, 105, 180, 0.6);
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.info-box {
  background: linear-gradient(135deg, rgba(255, 182, 193, 0.2) 0%, rgba(255, 192, 203, 0.3) 100%);
  padding: 1.5rem 2rem;
  border-top: 2px solid rgba(255, 182, 193, 0.5);
}

.info-box h4 {
  margin: 0 0 1rem 0;
  color: #FF69B4;
  font-size: 1rem;
}

.info-box ul {
  margin: 0;
  padding-left: 1.25rem;
  color: #666;
}

.info-box li {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
  line-height: 1.5;
}

.info-box strong {
  color: #FF69B4;
  font-weight: 600;
}

@media (max-width: 768px) {
  .login-container {
    padding: 1rem;
  }

  .login-card {
    border-radius: 25px;
  }

  .login-header {
    padding: 2rem 1.5rem;
  }

  .login-header h1 {
    font-size: 2rem;
  }

  .login-form {
    padding: 1.5rem;
  }

  .info-box {
    padding: 1.25rem 1.5rem;
  }
}
</style>
