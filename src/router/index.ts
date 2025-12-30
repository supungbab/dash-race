import { createRouter, createWebHistory } from 'vue-router';
import LoginPage from '../components/LoginPage.vue';
import HomePage from '../components/HomePage.vue';
import CreateRoomPage from '../components/CreateRoomPage.vue';

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
      component: HomePage,
    },
    {
      path: '/room',
      name: 'create-room',
      component: CreateRoomPage,
    },
    {
      path: '/room/:roomId',
      name: 'room',
      component: () => import('../components/RoomPage.vue'),
    },
    {
      path: '/sprint-runner/:roomId',
      name: 'sprint-runner',
      component: () => import('../components/SprintRunner.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/sprint-display/:roomId',
      name: 'sprint-display',
      component: () => import('../components/SprintDisplay.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../components/NotFoundPage.vue'),
    },
  ],
});

// 네비게이션 가드
router.beforeEach((to, from, next) => {
  const userId = localStorage.getItem('userId');
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest);
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);

  if (requiresGuest && userId) {
    // 로그인 페이지인데 이미 로그인한 경우
    // redirect 쿼리가 있으면 그 경로로, 없으면 홈으로
    const redirect = to.query.redirect as string;
    next(redirect || '/');
  } else if (requiresAuth && !userId) {
    // 인증이 필요한 페이지인데 로그인하지 않은 경우
    // 원래 가려던 경로를 redirect 쿼리로 전달
    next({
      path: '/login',
      query: { redirect: to.fullPath }
    });
  } else {
    next();
  }
});

export default router;
