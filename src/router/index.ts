import { createRouter, createWebHistory } from 'vue-router';
import LoginPage from '../components/LoginPage.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { requiresGuest: true }
    },
    {
      path: '/',
      name: 'home',
      redirect: '/sprint-runner'
    },
    {
      path: '/sprint-runner',
      name: 'sprint-runner',
      component: () => import('../components/SprintRunner.vue'),
    },
    {
      path: '/sprint-display',
      name: 'sprint-display',
      component: () => import('../components/SprintDisplay.vue'),
    },
    {
      path: '/sprint-admin',
      name: 'sprint-admin',
      component: () => import('../components/SprintAdmin.vue'),
    },
  ],
});

// 네비게이션 가드
router.beforeEach((to, from, next) => {
  const userId = localStorage.getItem('userId');
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest);

  if (requiresGuest && userId) {
    // 로그인 페이지인데 이미 로그인한 경우
    next('/sprint-runner');
  } else {
    next();
  }
});

export default router;
