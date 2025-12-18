// src/stores/userStore.ts
import { defineStore } from 'pinia';

interface UserState {
  userId: string | null;
  nickname: string | null;
  isAdmin: boolean;
}

// 스토어 생성 시 즉시 localStorage에서 세션 복원
const getInitialState = (): UserState => {
  const savedUserId = localStorage.getItem('userId');
  const savedNickname = localStorage.getItem('nickname');
  const savedIsAdmin = localStorage.getItem('isAdmin') === 'true';
  
  return {
    userId: savedUserId,
    nickname: savedNickname,
    isAdmin: savedIsAdmin,
  };
};

export const useUserStore = defineStore('user', {
  state: (): UserState => getInitialState(),
  getters: {
    isLoggedIn: (state) => !!state.userId,
  },
  actions: {
    // 세션 초기화 (localStorage에서 복원)
    initSession() {
      const savedUserId = localStorage.getItem('userId');
      const savedNickname = localStorage.getItem('nickname');
      const savedIsAdmin = localStorage.getItem('isAdmin') === 'true';
      
      if (savedUserId && savedNickname) {
        this.userId = savedUserId;
        this.nickname = savedNickname;
        this.isAdmin = savedIsAdmin;
      }
    },
    
    // 사용자 설정 (로그인/회원가입 시)
    setUser(userId: string, nickname: string, isAdmin: boolean = false) {
      this.userId = userId;
      this.nickname = nickname;
      this.isAdmin = isAdmin;
      
      // localStorage에 저장
      localStorage.setItem('userId', userId);
      localStorage.setItem('nickname', nickname);
      localStorage.setItem('isAdmin', String(isAdmin));
    },
    
    // 로그아웃
    clearUser() {
      this.userId = null;
      this.nickname = null;
      this.isAdmin = false;
      
      // localStorage 정리
      localStorage.removeItem('userId');
      localStorage.removeItem('nickname');
      localStorage.removeItem('isAdmin');
    },
  }
});