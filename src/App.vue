<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { ref, onMounted, computed, watch } from 'vue';
import { useUserStore } from '../stores/userStore';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const isLoginPage = computed(() => route.path === '/login');
const hideNavToggle = computed(() => 
  route.path.includes('/sprint-display/')
  || route.path.includes('/room')
);
watch(hideNavToggle, () => {
  isNavOpen.value = false;
});
// 네비게이션 토글 상태
const isNavOpen = ref(false);

const toggleNav = () => {
  isNavOpen.value = !isNavOpen.value;
};

onMounted(() => {
  userStore.initSession();
});

const handleLogout = () => {
  if (confirm('로그아웃 하시겠습니까?')) {
    userStore.clearUser();
    router.push('/login');
  }
};
</script>

<template>
  <div>
    <!-- 토글 페이지: 버튼으로 열고 닫기 -->
    <template v-if="!isLoginPage">
      <button v-if="!hideNavToggle" class="nav-toggle-btn" @click="toggleNav">
        {{ isNavOpen ? '✕' : '☰' }}
      </button>
      
      <Transition name="nav-slide">
        <header v-if="isNavOpen">
          <div class="wrapper">
            <nav>
              <RouterLink to="/">홈</RouterLink>
              <button @click="handleLogout" class="btn-logout">로그아웃</button>
            </nav>
          </div>
        </header>
      </Transition>
    </template>
    <RouterView />
  </div>
</template>

<style scoped>
/* 네비게이션 토글 버튼 */
.nav-toggle-btn {
  position: fixed;
  top: 10px;
  left: 10px;
  z-index: 1000;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 105, 180, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  font-size: 1.2rem;
  color: #FF69B4;
  transition: all 0.2s ease;
}

.nav-toggle-btn:hover {
  background: white;
  box-shadow: 0 4px 12px rgba(255, 105, 180, 0.2);
}

/* 네비게이션 슬라이드 애니메이션 */
.nav-slide-enter-active,
.nav-slide-leave-active {
  transition: all 0.25s ease;
}

.nav-slide-enter-from,
.nav-slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

header {
  color: white;
  padding: 1rem 0;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  overflow: hidden;
  background: rgba(255, 182, 193, 0.4);
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(255, 105, 180, 0.15);
}

header::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.2), transparent);
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

.wrapper {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
  position: relative;
  z-index: 1;
}

nav {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1.5rem;
  border-radius: 25px;
  background: rgba(255, 255, 255, 0.2);
  transition: all 0.2s ease;
  font-weight: 600;
  border: 2px solid rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
}

nav a:hover {
  background: rgba(255, 255, 255, 0.55);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.6);
  box-shadow: 0 4px 15px rgba(255, 255, 255, 0.3);
  color: #FF90cb;
}

nav a.router-link-exact-active {
  background: rgba(255, 255, 255, 0.95);
  color: #FF1493;
  border-color: white;
  box-shadow: 0 4px 20px rgba(255, 255, 255, 0.5);
  text-shadow: none;
}

.btn-logout {
  color: white;
  background: rgba(255, 255, 255, 0.15);
  border: 2px solid rgba(255, 255, 255, 0.3);
  padding: 0.5rem 1.5rem;
  border-radius: 25px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: inherit;
  backdrop-filter: blur(10px);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
}

.btn-logout:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 15px rgba(255, 255, 255, 0.3);
  color: #FF90cb;
}

@media (min-width: 768px) {
  nav {
    gap: 1.5rem;
  }
  
  nav a,
  .btn-logout {
    padding: 0.6rem 2rem;
    font-size: 1.1rem;
  }
}
</style>
