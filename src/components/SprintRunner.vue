<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { dbRealTime, dbRef, runTransaction, onValue, remove } from '../config/firebase';
import { useUserStore } from '../../stores/userStore';
import { FINISH_DISTANCE, MIN_STEP, MAX_STEP, DASH_STEP, BOOST_STEP, COUNTDOWN_DURATION } from '../config/constants';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const roomId = computed(() => {
  const room = route.params.roomId as string;
  if (!room) {
    console.error('Room ID is required');
    return null;
  }
  return room;
});

// 사용자 정보
const userId = computed(() => userStore.userId || '');
const userNickname = computed(() => userStore.nickname || '참가자');

// 레이스 상태
interface RaceState {
  status: 'waiting' | 'preparing' | 'countdown' | 'started' | 'finished';
  countdownStartedAt?: number;
  finishDistance?: number;
  expiresAt?: number; // 방 만료 시간
}

const raceState = ref<RaceState>({ status: 'waiting' });

// 목표 거리 (Firebase에서 가져오거나 기본값 사용)
const finishDistance = computed(() => raceState.value.finishDistance || FINISH_DISTANCE);
const currentDistance = ref(0);
const isFinished = ref(false);
const isRunning = ref(false);

// 입장 상태
const isJoined = ref(false);
const isJoining = ref(false);

// 이모티콘 선택
const showEmojiModal = ref(false);
const selectedEmoji = ref('🐎'); // 기본값
const myEmoji = ref('🐎'); // 선택한 이모티콘

// 말 관련 이모티콘 목록
const horseEmojis = [
  "🚶", "🏃", "🏃‍♀️", "🏃‍♂️", "💃", "🕺", "🧍", "🧍‍♀️", "🧍‍♂️", "🧎",
  "🧎‍♀️", "🧎‍♂️", "🧗", "🧗‍♀️", "🧗‍♂️", "🧘", "🧘‍♀️", "🧘‍♂️", "🏇", "⛷️",
  "🏂", "🏌️", "🏌️‍♀️", "🏌️‍♂️", "🏄", "🏄‍♀️", "🏄‍♂️", "🚣", "🚣‍♀️", "🚣‍♂️",
  "🏊", "🏊‍♀️", "🏊‍♂️", "⛹️", "⛹️‍♀️", "⛹️‍♂️", "🏋️", "🏋️‍♀️", "🏋️‍♂️", "🚴",
  "🚴‍♀️", "🚴‍♂️", "🚵", "🚵‍♀️", "🚵‍♂️", "🤸", "🤸‍♀️", "🤸‍♂️", "🤼", "🤼‍♀️",
  "🤼‍♂️", "🤽", "🤽‍♀️", "🤽‍♂️", "🤾", "🤾‍♀️", "🤾‍♂️", "🤹", "🤹‍♀️", "🤹‍♂️",
  "🦵", "🦶", "👣", "🐶", "🐕", "🐩", "🐺", "🦊", "🦝", "🐱",
  "🐈", "🦁", "🐯", "🐅", "🐆", "🐴", "🐎", "🦄", "🦓", "🦌",
  "🦬", "🐮", "🐂", "🐃", "🐄", "🐷", "🐖", "🐗", "🐽", "🐏",
  "🐑", "🐐", "🐪", "🐫", "🦙", "🦒", "🐘", "🦣", "🦏", "🦛",
  "🐭", "🐁", "🐀", "🐹", "🐰", "🐇", "🐿️", "🦫", "🦔", "🦦",
  "🦥", "🐁", "🐀", "🐨", "🐻", "🐻‍❄️", "🐼", "🦘", "🦡", "🦃",
  "🐔", "🐓", "🐣", "🐤", "🐥", "🐦", "🐧", "🕊️", "🦅", "🦆",
  "🦢", "🦉", "🦤", "🦩", "🦜", "🐢", "🐊", "🐍", "🦎", "🦖",
  "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐸", "🐝", "🐜",
  "🐞", "🦗", "🕷️", "🦂", "🦟", "🦋", "🐛", "🐌", "👾", "👽",
  "👹", "👺", "👻", "🧟", "🧟‍♀️", "🧟‍♂️", "🧜", "🧜‍♀️", "🧜‍♂️", "🧚",
  "🧚‍♀️", "🧚‍♂️", "🧙", "🧙‍♀️", "🧙‍♂️", "🧛", "🧛‍♀️", "🧛‍♂️", "🧞", "🧞‍♀️",
  "🧞‍♂️", "👼", "🤶", "🎅", "💂", "💂‍♀️", "💂‍♂️", "🕵️", "🕵️‍♀️", "🕵️‍♂️",
  "👷", "👷‍♀️", "👷‍♂️", "👮", "👮‍♀️", "👮‍♂️"
];

// 카운트다운
const countdownNumber = ref<number | null>(null);
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// 순위
const myRank = ref<number | null>(null);

// 파티클 - 최대 개수 제한으로 메모리 관리
const MAX_PARTICLES = 50;
const particles = ref<Array<{ id: number; x: number; y: number; emoji: string; vx: number; vy: number }>>([]);
let particleId = 0;
const particleTimeouts = new Set<ReturnType<typeof setTimeout>>();

// 버튼 바운스 효과
const isBouncing = ref(false);

// 대시 효과 (푸른색)
const isDashActive = ref(false);

// 부스터 효과 (빨간색)
const isBoostActive = ref(false);
const lastStep = ref<number | null>(null);

// 리스너
let unsubscribe: (() => void) | null = null;
let raceStateUnsubscribe: (() => void) | null = null;
let rankUnsubscribe: (() => void) | null = null;

// 달리기 가능 여부
const canRun = computed(() => raceState.value.status === 'started' && isJoined.value);

// 진행률
const progressPercent = computed(() => 
  Math.min(100, (currentDistance.value / finishDistance.value) * 100)
);

// 진행률에 따른 응원 메시지
const runningMessage = computed(() => {
  const progress = progressPercent.value;
  
  if (progress < 10) {
    return { icon: '🏃', text: '빠르게 터치하세요!' };
  } else if (progress < 20) {
    return { icon: '🔥', text: '좋은 출발이에요!' };
  } else if (progress < 30) {
    return { icon: '💪', text: '워밍업 완료! 가즈아~' };
  } else if (progress < 40) {
    return { icon: '👆', text: '손가락이 뜨거워지고 있어요!' };
  } else if (progress < 50) {
    return { icon: '⚡', text: '절반 가까이 왔어요!' };
  } else if (progress < 60) {
    return { icon: '🌟', text: '절반 돌파! 대단해요!' };
  } else if (progress < 70) {
    return { icon: '💦', text: '손이 느려지면 안돼요~!' };
  } else if (progress < 80) {
    return { icon: '🎯', text: '거의 다 왔어요! 힘내세요!' };
  } else if (progress < 90) {
    return { icon: '🚀', text: '막판 스퍼트! 폭풍 터치!' };
  } else {
    return { icon: '🏆', text: '골인 직전! 끝까지 달려요!' };
  }
});

// 버튼 텍스트
const buttonText = computed(() => {
  if (isFinished.value) {
    return myRank.value ? `🏆 ${myRank.value}등!` : '🎉 완주!';
  }
  if (raceState.value.status === 'countdown' && countdownNumber.value) {
    return countdownNumber.value.toString();
  }
  if (raceState.value.status === 'waiting') {
    return '⏳';
  }
  if (raceState.value.status === 'started') {
    return '🐎';
  }
  return '🏁';
});

// --- 라이프사이클 ---
onMounted(() => {
  if (!userStore.isLoggedIn) {
    alert('로그인이 필요합니다.');
    router.push('/login');
    return;
  }
  
  if (!roomId.value) {
    alert('Room ID가 필요합니다. URL에 /sprint-runner/방ID 형식으로 접속해주세요.');
    return;
  }
  
  // 이 페이지에서만 스크롤/확대 방지
  document.body.style.cssText = `
    position: fixed;
    width: 100%;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: manipulation;
  `;
  document.documentElement.style.cssText = `
    position: fixed;
    width: 100%;
    height: 100%;
    overflow: hidden;
  `;
  
  listenForRaceState();
  checkIfAlreadyJoined();
});

onUnmounted(() => {
  unsubscribe?.();
  raceStateUnsubscribe?.();
  rankUnsubscribe?.();
  stopCountdown();
  
  // 파티클 타임아웃 정리 (메모리 누수 방지)
  particleTimeouts.forEach(timeout => clearTimeout(timeout));
  particleTimeouts.clear();
  particles.value = [];
  
  // body 스타일 복원
  document.body.style.cssText = '';
  document.documentElement.style.cssText = '';
});

// --- 입장 확인 ---
function checkIfAlreadyJoined() {
  if (!userId.value || !roomId.value) return;
  const participantRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants/${userId.value}`);
  
  onValue(participantRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      isJoined.value = true;
      listenForMyStatus();
      listenForRanking();
    } else {
      isJoined.value = false;
      currentDistance.value = 0;
      isFinished.value = false;
    }
  }, { onlyOnce: true });
}

// --- Firebase 리스너 ---
function listenForRaceState() {
  if (!roomId.value) return;
  const raceStateRef = dbRef(dbRealTime, `rooms/${roomId.value}/state`);
  
  raceStateUnsubscribe = onValue(raceStateRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const newState = data as RaceState;
      const oldStatus = raceState.value.status;
      raceState.value = newState;
      
      if (newState.status === 'countdown' && oldStatus !== 'countdown') {
        startCountdown(newState.countdownStartedAt);
      }
      
      if (newState.status !== 'countdown') {
        stopCountdown();
      }
    } else {
      raceState.value = { status: 'waiting' };
      stopCountdown();
    }
  });
}

function listenForMyStatus() {
  if (!userId.value || !roomId.value) return;
  
  // 기존 리스너 해제
  unsubscribe?.();
  
  const participantRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants/${userId.value}`);
  
  unsubscribe = onValue(participantRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      currentDistance.value = data.distance || 0;
      
      // 이모티콘 저장
      if (data.emoji) {
        myEmoji.value = data.emoji;
      }
      
      const hasFinishTime = data.finish_time !== null && 
                            data.finish_time !== undefined && 
                            typeof data.finish_time === 'number';
      const reachedFinish = currentDistance.value >= finishDistance.value;
      
      isFinished.value = hasFinishTime && reachedFinish;
      isJoined.value = true;
    } else {
      // 데이터가 삭제됨 (퇴장됨)
      isJoined.value = false;
      isFinished.value = false;
      currentDistance.value = 0;
      myEmoji.value = '🐎'; // 기본값으로 리셋
    }
  });
}

function listenForRanking() {
  if (!roomId.value) return;
  // 기존 리스너 해제
  rankUnsubscribe?.();
  
  const participantsRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants`);
  
  rankUnsubscribe = onValue(participantsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data || !userId.value) return;
    
    const finishedParticipants = Object.entries(data)
      .filter(([, p]) => {
        const participant = p as { finish_time?: number };
        return typeof participant.finish_time === 'number';
      })
      .sort((a, b) => {
        const aTime = (a[1] as { finish_time: number }).finish_time;
        const bTime = (b[1] as { finish_time: number }).finish_time;
        return aTime - bTime;
      });
    
    const myIndex = finishedParticipants.findIndex(([id]) => id === userId.value);
    myRank.value = myIndex !== -1 ? myIndex + 1 : null;
  });
}

// --- 카운트다운 ---
function startCountdown(countdownStartedAt?: number) {
  stopCountdown();
  
  const calculateRemaining = () => {
    if (!countdownStartedAt) return 3;
    const elapsed = Date.now() - countdownStartedAt;
    return Math.max(0, Math.ceil((COUNTDOWN_DURATION - elapsed) / 1000));
  };
  
  countdownNumber.value = calculateRemaining();
  
  if (countdownNumber.value <= 0) {
    stopCountdown();
    return;
  }
  
  countdownInterval = setInterval(() => {
    const remaining = calculateRemaining();
    if (remaining > 0) {
      countdownNumber.value = remaining;
    } else {
      stopCountdown();
    }
  }, 200); // 100ms → 200ms로 변경 (충분히 부드러움)
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  countdownNumber.value = null;
}

// --- 이모티콘 선택 모달 열기 ---
function openEmojiModal() {
  if (!userId.value || !roomId.value || isJoining.value) return;
  
  // 대기 상태에서만 입장 가능
  if (raceState.value.status !== 'waiting') {
    if (raceState.value.status === 'finished') {
      alert('이미 종료된 레이스입니다. 다음 레이스를 기다려주세요.');
    } else {
      alert('레이스가 이미 시작되었습니다. 다음 레이스를 기다려주세요.');
    }
    return;
  }
  
  // 만료시간 체크
  if (raceState.value.expiresAt && Date.now() > raceState.value.expiresAt) {
    alert('방이 만료되었습니다. 새로운 방에 참가해주세요.');
    return;
  }
  
  showEmojiModal.value = true;
}

// --- 이모티콘 선택 ---
function selectEmoji(emoji: string) {
  selectedEmoji.value = emoji;
}

// --- 이모티콘 선택 후 입장하기 ---
async function handleJoin() {
  if (!userId.value || !roomId.value || isJoining.value) return;
  
  showEmojiModal.value = false;
  myEmoji.value = selectedEmoji.value;
  isJoining.value = true;
  
  try {
    const participantRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants/${userId.value}`);
    
    await runTransaction(participantRef, (currentData) => {
      if (currentData === null) {
        return { name: userNickname.value, distance: 0, finish_time: null, emoji: selectedEmoji.value };
      }
      
      const isWaiting = raceState.value.status === 'waiting';
      const hasFinished = currentData.finish_time !== null && currentData.finish_time !== undefined;
      
      if (isWaiting && hasFinished) {
        return { ...currentData, name: userNickname.value, distance: 0, finish_time: null, emoji: selectedEmoji.value };
      }
      
      return { ...currentData, name: userNickname.value, emoji: selectedEmoji.value };
    });
    
    isJoined.value = true;
    listenForMyStatus();
    listenForRanking();
  } catch (error) {
    console.error('입장 오류:', error);
    alert('입장 중 오류가 발생했습니다.');
  } finally {
    isJoining.value = false;
  }
}

// --- 나가기 ---
async function handleLeave() {
  if (!userId.value || !roomId.value) return;
  
  // 레이스 진행 중에는 나갈 수 없음
  if (raceState.value.status === 'started' || raceState.value.status === 'countdown') {
    alert('레이스 진행 중에는 나갈 수 없습니다.');
    return;
  }
  
  if (!confirm('레이스에서 나가시겠습니까?')) return;
  
  try {
    const participantRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants/${userId.value}`);
    await remove(participantRef);
    
    isJoined.value = false;
    currentDistance.value = 0;
    isFinished.value = false;
    myRank.value = null;
  } catch (error) {
    console.error('나가기 오류:', error);
    alert('나가기 중 오류가 발생했습니다.');
  }
}

// --- 파티클 효과 (최적화됨) ---
function createParticles(event: MouseEvent | TouchEvent, isBoost: boolean = false) {
  const button = event.currentTarget as HTMLElement;
  const rect = button.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  
  // 부스터일 때는 불꽃 이모지
  const normalEmojis = ['⭐', '✨', '💖', '🌟', '💫', '🎀', '🌸'];
  const boostEmojis = ['🔥', '💥', '⚡', '🚀', '✨', '💢', '🌟'];
  const emojis = isBoost ? boostEmojis : normalEmojis;
  // 파티클 개수 줄임 (12→8, 20→12)
  const particleCount = isBoost ? 12 : 8;
  
  // 파티클 개수 제한: 너무 많으면 오래된 것부터 제거
  if (particles.value.length > MAX_PARTICLES - particleCount) {
    particles.value = particles.value.slice(-MAX_PARTICLES + particleCount);
  }
  
  const startId = particleId;
  const endId = particleId + particleCount;
  
  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
    const velocity = isBoost ? 200 + Math.random() * 150 : 150 + Math.random() * 100;
    const emoji = emojis[Math.floor(Math.random() * emojis.length)]!;
    
    particles.value.push({
      id: particleId++,
      x: centerX,
      y: centerY,
      emoji,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity
    });
  }
  
  // O(n) 복잡도로 개선 - ID 범위로 필터링
  const timeout = setTimeout(() => {
    particles.value = particles.value.filter(p => p.id < startId || p.id >= endId);
    particleTimeouts.delete(timeout);
  }, 600);
  particleTimeouts.add(timeout);
}

// --- 바운스 효과 ---
function triggerBounce() {
  if (canRun.value && !isFinished.value) {
    isBouncing.value = true;
    setTimeout(() => {
      isBouncing.value = false;
    }, 150);
  }
}

// --- 터치/클릭 이벤트 ---
function handleTouchStart(event: TouchEvent) {
  event.preventDefault();
}

function handleTouchEnd(event: TouchEvent) {
  event.preventDefault();
  if (canRun.value && !isFinished.value) {
    createParticles(event);
    triggerBounce();
  }
  handleRunClick();
}

function handleClick(event: MouseEvent) {
  if (canRun.value && !isFinished.value) {
    createParticles(event);
    triggerBounce();
  }
  handleRunClick();
}

// 랜덤 스텝 생성
function getRandomStep(): number {
  return Math.floor(Math.random() * (MAX_STEP - MIN_STEP + 1)) + MIN_STEP;
}

// 대시 효과 트리거 (푸른색)
function triggerDash() {
  isDashActive.value = true;
  
  // 대시 파티클 생성
  createDashParticles();
  
  setTimeout(() => {
    isDashActive.value = false;
  }, 400);
}

// 부스터 효과 트리거
function triggerBoost() {
  isBoostActive.value = true;
  
  // 부스터 파티클 생성
  createBoostParticles();
  
  setTimeout(() => {
    isBoostActive.value = false;
  }, 500);
}

// 대시 파티클 생성 (푸른색)
function createDashParticles() {
  const dashEmojis = ['💨', '🌊', '❄️', '💎', '✨', '🌀', '⚡'];
  const centerX = 130; // 버튼 중심
  const centerY = 130;
  const particleCount = 12;
  
  // 파티클 개수 제한
  if (particles.value.length > MAX_PARTICLES - particleCount) {
    particles.value = particles.value.slice(-MAX_PARTICLES + particleCount);
  }
  
  const startId = particleId;
  const endId = particleId + particleCount;
  
  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
    const velocity = 160 + Math.random() * 120;
    const emoji = dashEmojis[Math.floor(Math.random() * dashEmojis.length)]!;
    
    particles.value.push({
      id: particleId++,
      x: centerX,
      y: centerY,
      emoji,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity
    });
  }
  
  // O(n) 복잡도로 개선
  const timeout = setTimeout(() => {
    particles.value = particles.value.filter(p => p.id < startId || p.id >= endId);
    particleTimeouts.delete(timeout);
  }, 700);
  particleTimeouts.add(timeout);
}

// 부스터 파티클 생성 (최적화됨)
function createBoostParticles() {
  const boostEmojis = ['🔥', '💥', '⚡', '🚀', '✨', '💢', '🌟'];
  const centerX = 130; // 버튼 중심
  const centerY = 130;
  const particleCount = 16; // 24→16으로 줄임
  
  // 파티클 개수 제한
  if (particles.value.length > MAX_PARTICLES - particleCount) {
    particles.value = particles.value.slice(-MAX_PARTICLES + particleCount);
  }
  
  const startId = particleId;
  const endId = particleId + particleCount;
  
  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
    const velocity = 200 + Math.random() * 150;
    const emoji = boostEmojis[Math.floor(Math.random() * boostEmojis.length)]!;
    
    particles.value.push({
      id: particleId++,
      x: centerX,
      y: centerY,
      emoji,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity
    });
  }
  
  // O(n) 복잡도로 개선
  const timeout = setTimeout(() => {
    particles.value = particles.value.filter(p => p.id < startId || p.id >= endId);
    particleTimeouts.delete(timeout);
  }, 800);
  particleTimeouts.add(timeout);
}

async function handleRunClick() {
  if (!canRun.value || isFinished.value || isRunning.value || !userId.value || !roomId.value) return;
  
  isRunning.value = true;
  const participantRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants/${userId.value}`);

  // 랜덤 스텝 계산
  const step = getRandomStep();
  lastStep.value = step;
  
  // 5가 나오면 대시! (푸른색)
  if (step === DASH_STEP) {
    triggerDash();
  }
  
  // 10이 나오면 부스터! (빨간색)
  if (step === BOOST_STEP) {
    triggerBoost();
  }

  try {
    await runTransaction(participantRef, (currentData) => {
      if (currentData === null) {
        return { name: userNickname.value, distance: 0, finish_time: null };
      }
      
      if (currentData.finish_time !== null && currentData.finish_time !== undefined) {
        return;
      }
      
      const targetDistance = finishDistance.value;
      const newDistance = Math.min((currentData.distance || 0) + step, targetDistance);
      
      return {
        ...currentData,
        distance: newDistance,
        finish_time: newDistance >= targetDistance ? Date.now() : null
      };
    });
  } catch (error) {
    console.error('달리기 오류:', error);
  } finally {
    isRunning.value = false;
  }
}
</script>

<template>
  <div class="race-container">
    <!-- 배경 장식 -->
    <div class="bg-decoration"></div>
    
    <!-- 입장 전 화면 -->
    <template v-if="!isJoined">
      <div class="lobby-content">
        <h1 class="lobby-title">🐎 DASH RUN!</h1>
        <p class="lobby-subtitle">레이스에 참가하세요!</p>
        
        <div class="race-status-badge" :class="raceState.status">
          <span v-if="raceState.status === 'waiting'">⏳ 대기 중</span>
          <span v-else-if="raceState.status === 'preparing'">🔔 준비 중!</span>
          <span v-else-if="raceState.status === 'countdown'">🔔 곧 시작!</span>
          <span v-else-if="raceState.status === 'started'">🏃 진행 중</span>
          <span v-else-if="raceState.status === 'finished'">🏁 종료</span>
        </div>
        
        <button 
          class="join-button"
          @click="openEmojiModal"
          :disabled="isJoining || raceState.status !== 'waiting' || !!(raceState.expiresAt && Date.now() > raceState.expiresAt)"
        >
          <span v-if="isJoining">입장 중...</span>
          <span v-else-if="raceState.status === 'finished'">🚫 종료된 레이스</span>
          <span v-else-if="raceState.status === 'started' || raceState.status === 'countdown' || raceState.status === 'preparing'">🚫 이미 시작됨</span>
          <span v-else-if="raceState.expiresAt && Date.now() > raceState.expiresAt">🚫 만료된 방</span>
          <span v-else>🚪 입장하기</span>
        </button>
        
        <div class="user-badge">
          <span class="user-icon">{{ myEmoji }}</span>
          {{ userNickname }}
        </div>
        
        <!-- 이모티콘 선택 모달 -->
        <Teleport to="body">
          <div v-if="showEmojiModal" class="emoji-modal-overlay" @click.self="showEmojiModal = false">
            <div class="emoji-modal">
              <div class="emoji-modal-header">
                <h2>말을 선택하세요</h2>
                <button class="close-button" @click="showEmojiModal = false">×</button>
              </div>
              <div class="emoji-grid">
                <button
                  v-for="emoji in horseEmojis"
                  :key="emoji"
                  class="emoji-button"
                  :class="{ selected: selectedEmoji === emoji }"
                  @click="selectEmoji(emoji)"
                >
                  {{ emoji }}
                </button>
              </div>
              <div class="emoji-modal-footer">
                <button class="cancel-button" @click="showEmojiModal = false">취소</button>
                <button class="confirm-button" @click="handleJoin" :disabled="isJoining">
                  {{ isJoining ? '입장 중...' : '입장하기' }}
                </button>
              </div>
            </div>
          </div>
        </Teleport>
      </div>
    </template>
    
    <!-- 입장 후 레이스 화면 -->
    <template v-else>
      <!-- 거리 표시 -->
      <div class="distance-display">
        <div class="distance-value">{{ currentDistance }}<span class="unit">m</span></div>
        <div class="distance-goal">/ {{ finishDistance }}m</div>
        
        <!-- 진행 바 -->
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          <div class="progress-shine"></div>
        </div>
      </div>

      <!-- 메인 버튼 -->
      <div class="button-wrapper">
        <!-- 대시 오버레이 (푸른색) -->
        <div class="dash-overlay" v-if="isDashActive">
          <div class="dash-ring"></div>
          <div class="dash-ring delay-1"></div>
          <div class="dash-ring delay-2"></div>
        </div>
        
        <!-- 대시 텍스트 -->
        <div class="dash-text" v-if="isDashActive">
          💨 DASH! 💨
        </div>
        
        <!-- 부스터 오버레이 -->
        <div class="boost-overlay" v-if="isBoostActive">
          <div class="boost-ring"></div>
          <div class="boost-ring delay-1"></div>
          <div class="boost-ring delay-2"></div>
        </div>
        
        <!-- 부스터 텍스트 -->
        <div class="boost-text" v-if="isBoostActive">
          🔥 BOOST! 🔥
        </div>
        
        <!-- 스텝 표시 -->
        <div class="step-indicator" v-if="lastStep && canRun && !isFinished" :class="{ 'is-dash': lastStep === DASH_STEP, 'is-boost': lastStep === BOOST_STEP }">
          +{{ lastStep }}m
        </div>
        
        <button 
          class="run-button"
          :class="{
            'waiting': raceState.status === 'waiting',
            'countdown': raceState.status === 'countdown',
            'running': canRun && !isFinished,
            'finished': isFinished,
            'rank-1': isFinished && myRank === 1,
            'rank-2': isFinished && myRank === 2,
            'rank-3': isFinished && myRank === 3,
            'rank-other': isFinished && myRank && myRank > 3,
            'bouncing': isBouncing,
            'dashing': isDashActive,
            'boosting': isBoostActive
          }"
          :disabled="!canRun || isFinished"
          @click="handleClick"
          @touchstart="handleTouchStart"
          @touchend="handleTouchEnd"
        >
          <div class="button-inner">
            <span class="button-text" :key="buttonText">{{ buttonText }}</span>
          </div>
          <div class="button-shine"></div>
          <div class="button-ripple" v-if="isBouncing"></div>
        </button>
        
        <!-- 파티클 -->
        <div class="particles-container">
          <div 
            v-for="particle in particles" 
            :key="particle.id"
            class="particle"
            :style="{
              left: particle.x + 'px',
              top: particle.y + 'px',
              '--vx': particle.vx + 'px',
              '--vy': particle.vy + 'px'
            }"
          >
            {{ particle.emoji }}
          </div>
        </div>
      </div>

      <!-- 상태 메시지 -->
      <div class="status-message">
        <template v-if="raceState.status === 'waiting'">
          <span class="status-icon">🚀</span>
          <span>입장이 완료되었습니다.</span>
        </template>
        <template v-else-if="raceState.status === 'preparing'">
          <span class="status-icon">🔔</span>
          <span>준비하세요!</span>
        </template>
        <template v-else-if="raceState.status === 'countdown'">
          <span class="status-icon">🔔</span>
          <span>준비하세요!</span>
        </template>
        <template v-else-if="raceState.status === 'finished' || isFinished">
          <span class="status-icon">🏁</span>
          <span v-if="isFinished && myRank === 1">🥇 1등 우승! 축하합니다! 🎊</span>
          <span v-else-if="isFinished && myRank === 2">🥈 2등! 대단해요! 🎉</span>
          <span v-else-if="isFinished && myRank === 3">🥉 3등! 멋져요! 🎉</span>
          <span v-else-if="isFinished && myRank">{{ myRank }}등으로 완주! 수고하셨습니다! 👏</span>
          <span v-else-if="isFinished">완주 성공! 수고하셨습니다! 🎉</span>
          <span v-else>레이스가 종료되었습니다 🏁</span>
        </template>
        <template v-else-if="canRun && !isFinished">
          <span class="status-icon" :key="runningMessage.icon">{{ runningMessage.icon }}</span>
          <span class="message-text" :key="runningMessage.text">{{ runningMessage.text }}</span>
        </template>
      </div>

      <!-- 하단 영역 (참가자 정보) -->
        <div class="user-info">
          <span class="user-icon">{{ myEmoji }}</span>
          {{ userNickname }}
        </div>

      <!-- 나가기 버튼 (오른쪽 하단 고정) -->
      <button 
        class="leave-button"
        @click="handleLeave"
        :disabled="raceState.status === 'started' || raceState.status === 'countdown'"
      >
        🚪 나가기
      </button>
    </template>
  </div>
</template>

<style scoped>
.race-container {
  /* 모바일 주소창 문제 해결 - 고정 뷰포트 */
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  height: 100dvh; /* dynamic viewport height - 모바일 주소창 고려 */
  
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #87CEEB 0%, #E0F6FF 50%, #FFE4E1 100%);
  padding: 20px;
  padding: env(safe-area-inset-top, 20px) 20px env(safe-area-inset-bottom, 20px) 20px;
  gap: 25px;
  
  /* 스크롤 및 확대 완전 방지 */
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  overflow: hidden;
  overscroll-behavior: none; /* 당겨서 새로고침 방지 */
}

/* 배경 장식 - GPU 가속 최적화 */
.bg-decoration {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: 
    radial-gradient(circle at 20% 30%, rgba(255, 182, 193, 0.4) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(255, 192, 203, 0.4) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(255, 105, 180, 0.2) 0%, transparent 50%);
  animation: bgFloat 30s linear infinite; /* 더 느리게, linear로 부드럽게 */
  pointer-events: none;
  will-change: transform; /* GPU 가속 힌트 */
  transform: translateZ(0); /* GPU 레이어 생성 */
}

@keyframes bgFloat {
  0%, 100% { transform: translateZ(0) translate(0, 0); }
  50% { transform: translateZ(0) translate(20px, -20px); }
}

/* 로비 화면 */
.lobby-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 25px;
  z-index: 1;
  text-align: center;
}

.lobby-title {
  font-size: 3rem;
  font-weight: 900;
  background: linear-gradient(135deg, #FF69B4 0%, #FF1493 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.lobby-subtitle {
  font-size: 1.2rem;
  color: #666;
  margin: 0;
}

.race-status-badge {
  padding: 12px 30px;
  border-radius: 50px;
  font-weight: 700;
  font-size: 1.1rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
}

.race-status-badge.waiting { color: #FFB700; }
.race-status-badge.countdown { color: #FF4757; }
.race-status-badge.started { color: #32CD32; }
.race-status-badge.finished { color: #FF1493; }

.join-button {
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

.join-button:hover:not(:disabled) {
  transform: translateY(-5px);
  box-shadow: 0 20px 50px rgba(255, 105, 180, 0.7);
}

.join-button:active:not(:disabled) {
  transform: translateY(-2px);
}

.join-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 25px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 25px;
  color: #FF69B4;
  font-weight: 600;
  font-size: 1.1rem;
}

/* 하단 영역 */
.bottom-section {
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
}

/* 나가기 버튼 (오른쪽 하단 고정) */
.leave-button {
  position: fixed;
  right: 20px;
  bottom: calc(env(safe-area-inset-bottom, 20px) + 10px);
  padding: 10px 25px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #888;
  background: rgba(255, 255, 255, 0.7);
  border: 2px solid rgba(200, 200, 200, 0.5);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 100;
}

.leave-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.9);
  color: #FF4757;
  border-color: rgba(255, 71, 87, 0.3);
}

.leave-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 거리 표시 */
.distance-display {
  text-align: center;
  z-index: 1;
  background: rgba(255, 255, 255, 0.9);
  padding: 20px 40px;
  border-radius: 25px;
  box-shadow: 0 10px 30px rgba(255, 105, 180, 0.2);
  border: 3px solid rgba(255, 182, 193, 0.5);
}

.distance-value {
  font-size: 3.5rem;
  font-weight: 900;
  background: linear-gradient(135deg, #FF69B4 0%, #FF1493 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.distance-value .unit {
  font-size: 1.8rem;
  font-weight: 700;
}

.distance-goal {
  font-size: 1.1rem;
  color: #999;
  margin-top: 5px;
  font-weight: 500;
}

/* 진행 바 */
.progress-bar {
  width: 200px;
  height: 12px;
  background: rgba(255, 182, 193, 0.3);
  border-radius: 6px;
  margin: 15px auto 0;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  border-radius: 6px;
  transition: width 0.1s ease-out;
  position: relative;
}

.progress-shine {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  animation: progressShine 2.5s ease-in-out infinite;
  will-change: transform;
}

@keyframes progressShine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 버튼 래퍼 */
.button-wrapper {
  position: relative;
  z-index: 1;
}

/* 메인 버튼 */
.run-button {
  width: 260px;
  height: 260px;
  border-radius: 50%;
  border: 5px solid rgba(255, 255, 255, 0.8);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  
  /* 모바일 확대/축소 완전 방지 */
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  
  transition: transform 0.1s ease, box-shadow 0.2s ease;
}

.button-inner {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.button-text {
  font-size: 5rem;
  text-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  z-index: 1;
}

.button-shine {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  animation: buttonShine 4s ease-in-out infinite; /* 더 느리게 */
  pointer-events: none;
  will-change: transform;
}

@keyframes buttonShine {
  0% { transform: translate3d(-100%, -100%, 0) rotate(45deg); }
  100% { transform: translate3d(100%, 100%, 0) rotate(45deg); }
}

/* 바운스 효과 */
.run-button.bouncing {
  animation: buttonBounce 0.15s ease-out !important;
}

@keyframes buttonBounce {
  0% { transform: scale(1); }
  50% { transform: scale(0.88); }
  100% { transform: scale(1); }
}

/* 클릭 리플 효과 */
.button-ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  transform: translate(-50%, -50%) scale(0);
  background: radial-gradient(circle, rgba(255, 255, 255, 0.6) 0%, transparent 70%);
  border-radius: 50%;
  animation: rippleEffect 0.4s ease-out forwards;
  pointer-events: none;
}

@keyframes rippleEffect {
  0% { 
    transform: translate(-50%, -50%) scale(0.3);
    opacity: 1;
  }
  100% { 
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
}

/* 대기 상태 */
.run-button.waiting {
  background: linear-gradient(145deg, #DDA0DD 0%, #DA70D6 100%);
  box-shadow: 
    0 15px 40px rgba(221, 160, 221, 0.5),
    inset 0 3px 15px rgba(255, 255, 255, 0.4);
}

.run-button.waiting .button-text {
  font-size: 4rem;
}

/* 카운트다운 상태 */
.run-button.countdown {
  background: linear-gradient(145deg, #FF6B6B 0%, #FF4757 100%);
  box-shadow: 
    0 15px 50px rgba(255, 107, 107, 0.6),
    inset 0 3px 15px rgba(255, 255, 255, 0.4);
  animation: countdownPulse 0.5s ease-in-out infinite;
}

.run-button.countdown .button-text {
  font-size: 7rem;
  font-weight: 900;
  color: white;
}

@keyframes countdownPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

/* 달리기 가능 상태 */
.run-button.running {
  background: linear-gradient(145deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  box-shadow: 
    0 15px 50px rgba(255, 105, 180, 0.6),
    inset 0 3px 15px rgba(255, 255, 255, 0.4);
}

.run-button.running:not(.bouncing) {
  animation: readyPulse 1s ease-in-out infinite;
}

@keyframes readyPulse {
  0%, 100% { 
    box-shadow: 
      0 15px 50px rgba(255, 105, 180, 0.6),
      inset 0 3px 15px rgba(255, 255, 255, 0.4);
  }
  50% { 
    box-shadow: 
      0 20px 70px rgba(255, 105, 180, 0.8),
      inset 0 3px 15px rgba(255, 255, 255, 0.5);
  }
}

/* 완주 상태 - 기본 */
.run-button.finished {
  cursor: default;
}

.run-button.finished .button-text {
  font-size: 2.5rem;
  font-weight: 800;
}

/* 1등 - 골드 */
.run-button.rank-1 {
  background: linear-gradient(145deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%);
  box-shadow: 
    0 0 60px rgba(255, 215, 0, 0.8),
    0 15px 50px rgba(255, 165, 0, 0.6),
    inset 0 3px 15px rgba(255, 255, 255, 0.5);
  animation: rank1Glow 1s ease-in-out infinite;
}

.run-button.rank-1 .button-text {
  color: #8B4513;
  text-shadow: 0 2px 10px rgba(255, 215, 0, 0.8);
}

@keyframes rank1Glow {
  0%, 100% { 
    transform: scale(1);
    box-shadow: 
      0 0 60px rgba(255, 215, 0, 0.8),
      0 15px 50px rgba(255, 165, 0, 0.6),
      inset 0 3px 15px rgba(255, 255, 255, 0.5);
  }
  50% { 
    transform: scale(1.05);
    box-shadow: 
      0 0 100px rgba(255, 215, 0, 1),
      0 20px 70px rgba(255, 165, 0, 0.8),
      inset 0 3px 15px rgba(255, 255, 255, 0.6);
  }
}

/* 2등 - 실버 */
.run-button.rank-2 {
  background: linear-gradient(145deg, #E8E8E8 0%, #C0C0C0 50%, #A8A8A8 100%);
  box-shadow: 
    0 0 40px rgba(192, 192, 192, 0.6),
    0 15px 50px rgba(150, 150, 150, 0.5),
    inset 0 3px 15px rgba(255, 255, 255, 0.6);
  animation: rank2Glow 1.2s ease-in-out infinite;
}

.run-button.rank-2 .button-text {
  color: #4A4A4A;
  text-shadow: 0 2px 10px rgba(255, 255, 255, 0.8);
}

@keyframes rank2Glow {
  0%, 100% { 
    transform: scale(1);
    box-shadow: 
      0 0 40px rgba(192, 192, 192, 0.6),
      0 15px 50px rgba(150, 150, 150, 0.5),
      inset 0 3px 15px rgba(255, 255, 255, 0.6);
  }
  50% { 
    transform: scale(1.03);
    box-shadow: 
      0 0 60px rgba(192, 192, 192, 0.8),
      0 20px 60px rgba(150, 150, 150, 0.6),
      inset 0 3px 15px rgba(255, 255, 255, 0.7);
  }
}

/* 3등 - 브론즈 */
.run-button.rank-3 {
  background: linear-gradient(145deg, #E67E22 0%, #CD7F32 50%, #B8860B 100%);
  box-shadow: 
    0 0 40px rgba(205, 127, 50, 0.6),
    0 15px 50px rgba(184, 134, 11, 0.5),
    inset 0 3px 15px rgba(255, 255, 255, 0.4);
  animation: rank3Glow 1.3s ease-in-out infinite;
}

.run-button.rank-3 .button-text {
  color: #5D3A1A;
  text-shadow: 0 2px 10px rgba(255, 200, 150, 0.8);
}

@keyframes rank3Glow {
  0%, 100% { 
    transform: scale(1);
    box-shadow: 
      0 0 40px rgba(205, 127, 50, 0.6),
      0 15px 50px rgba(184, 134, 11, 0.5),
      inset 0 3px 15px rgba(255, 255, 255, 0.4);
  }
  50% { 
    transform: scale(1.03);
    box-shadow: 
      0 0 60px rgba(205, 127, 50, 0.8),
      0 20px 60px rgba(184, 134, 11, 0.6),
      inset 0 3px 15px rgba(255, 255, 255, 0.5);
  }
}

/* 4등 이상 - 핑크/라벤더 */
.run-button.rank-other {
  background: linear-gradient(145deg, #DDA0DD 0%, #BA55D3 50%, #9932CC 100%);
  box-shadow: 
    0 0 30px rgba(186, 85, 211, 0.5),
    0 15px 40px rgba(153, 50, 204, 0.4),
    inset 0 3px 15px rgba(255, 255, 255, 0.4);
  animation: rankOtherGlow 1.5s ease-in-out infinite;
}

.run-button.rank-other .button-text {
  color: white;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

@keyframes rankOtherGlow {
  0%, 100% { 
    transform: scale(1);
    box-shadow: 
      0 0 30px rgba(186, 85, 211, 0.5),
      0 15px 40px rgba(153, 50, 204, 0.4),
      inset 0 3px 15px rgba(255, 255, 255, 0.4);
  }
  50% { 
    transform: scale(1.02);
    box-shadow: 
      0 0 50px rgba(186, 85, 211, 0.7),
      0 18px 50px rgba(153, 50, 204, 0.5),
      inset 0 3px 15px rgba(255, 255, 255, 0.5);
  }
}

/* 비활성화 */
.run-button:disabled:not(.finished):not(.countdown) {
  cursor: not-allowed;
}

/* 대시 상태 (푸른색) */
.run-button.dashing {
  background: linear-gradient(145deg, #4FC3F7 0%, #03A9F4 50%, #0288D1 100%) !important;
  box-shadow: 
    0 0 50px rgba(3, 169, 244, 0.8),
    0 0 80px rgba(3, 169, 244, 0.6),
    inset 0 3px 15px rgba(255, 255, 255, 0.5) !important;
  animation: dashPulse 0.1s ease-in-out infinite !important;
}

@keyframes dashPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

/* 대시 오버레이 */
.dash-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 380px;
  height: 380px;
  pointer-events: none;
  z-index: 5;
}

.dash-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border: 6px solid rgba(3, 169, 244, 0.8);
  border-radius: 50%;
  animation: dashRing 0.4s ease-out forwards;
}

.dash-ring.delay-1 {
  animation-delay: 0.08s;
}

.dash-ring.delay-2 {
  animation-delay: 0.16s;
}

@keyframes dashRing {
  0% {
    width: 260px;
    height: 260px;
    opacity: 1;
    border-width: 6px;
  }
  100% {
    width: 380px;
    height: 380px;
    opacity: 0;
    border-width: 2px;
  }
}

/* 대시 텍스트 */
.dash-text {
  position: absolute;
  top: -60px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 2.2rem;
  font-weight: 900;
  color: #03A9F4;
  text-shadow: 
    0 0 10px rgba(3, 169, 244, 0.8),
    0 0 20px rgba(3, 169, 244, 0.6),
    0 0 30px rgba(3, 169, 244, 0.4),
    2px 2px 0 #E1F5FE;
  animation: dashTextPop 0.4s ease-out forwards;
  white-space: nowrap;
  z-index: 20;
}

@keyframes dashTextPop {
  0% {
    transform: translateX(-50%) scale(0.5) translateY(20px);
    opacity: 0;
  }
  50% {
    transform: translateX(-50%) scale(1.2) translateY(-8px);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) scale(1) translateY(0);
    opacity: 1;
  }
}

/* 부스터 상태 */
.run-button.boosting {
  background: linear-gradient(145deg, #FF6B6B 0%, #FF0000 50%, #CC0000 100%) !important;
  box-shadow: 
    0 0 60px rgba(255, 0, 0, 0.8),
    0 0 100px rgba(255, 0, 0, 0.6),
    inset 0 3px 15px rgba(255, 255, 255, 0.5) !important;
  animation: boostPulse 0.1s ease-in-out infinite !important;
}

@keyframes boostPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* 부스터 오버레이 */
.boost-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  height: 400px;
  pointer-events: none;
  z-index: 5;
}

.boost-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  border: 8px solid rgba(255, 0, 0, 0.8);
  border-radius: 50%;
  animation: boostRing 0.5s ease-out forwards;
}

.boost-ring.delay-1 {
  animation-delay: 0.1s;
}

.boost-ring.delay-2 {
  animation-delay: 0.2s;
}

@keyframes boostRing {
  0% {
    width: 260px;
    height: 260px;
    opacity: 1;
    border-width: 8px;
  }
  100% {
    width: 400px;
    height: 400px;
    opacity: 0;
    border-width: 2px;
  }
}

/* 부스터 텍스트 */
.boost-text {
  position: absolute;
  top: -60px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 2.5rem;
  font-weight: 900;
  color: #FF0000;
  text-shadow: 
    0 0 10px rgba(255, 0, 0, 0.8),
    0 0 20px rgba(255, 0, 0, 0.6),
    0 0 30px rgba(255, 0, 0, 0.4),
    2px 2px 0 #FFD700;
  animation: boostTextPop 0.5s ease-out forwards;
  white-space: nowrap;
  z-index: 20;
}

@keyframes boostTextPop {
  0% {
    transform: translateX(-50%) scale(0.5) translateY(20px);
    opacity: 0;
  }
  50% {
    transform: translateX(-50%) scale(1.3) translateY(-10px);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) scale(1) translateY(0);
    opacity: 1;
  }
}

/* 스텝 표시 */
.step-indicator {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 1.5rem;
  font-weight: 800;
  color: #FF69B4;
  text-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  animation: stepPop 0.3s ease-out forwards;
  z-index: 15;
}

.step-indicator.is-dash {
  font-size: 1.8rem;
  color: #03A9F4;
  text-shadow: 
    0 0 10px rgba(3, 169, 244, 0.8),
    2px 2px 0 #E1F5FE;
}

.step-indicator.is-boost {
  font-size: 2rem;
  color: #FF0000;
  text-shadow: 
    0 0 10px rgba(255, 0, 0, 0.8),
    2px 2px 0 #FFD700;
}

@keyframes stepPop {
  0% {
    transform: translateX(-50%) translateY(10px) scale(0.5);
    opacity: 0;
  }
  50% {
    transform: translateX(-50%) translateY(-15px) scale(1.2);
    opacity: 1;
  }
  100% {
    transform: translateX(-50%) translateY(0) scale(1);
    opacity: 0.8;
  }
}

/* 파티클 - GPU 가속 최적화 */
.particles-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  contain: layout style; /* 레이아웃 격리 */
}

.particle {
  position: absolute;
  font-size: 1.8rem; /* 약간 작게 */
  animation: particleFly 0.6s ease-out forwards;
  pointer-events: none;
  will-change: transform, opacity; /* GPU 가속 */
  backface-visibility: hidden;
}

@keyframes particleFly {
  0% {
    transform: translate3d(0, 0, 0) scale(0.5);
    opacity: 1;
  }
  100% {
    transform: translate3d(var(--vx), var(--vy), 0) scale(1.3);
    opacity: 0;
  }
}

/* 상태 메시지 */
.status-message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 30px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50px;
  box-shadow: 0 8px 25px rgba(255, 105, 180, 0.2);
  border: 2px solid rgba(255, 182, 193, 0.5);
  color: #FF69B4;
  font-weight: 600;
  font-size: 1.1rem;
  z-index: 1;
}

.status-icon {
  font-size: 1.5rem;
  animation: iconPop 0.3s ease-out;
}

.message-text {
  animation: messageSlide 0.3s ease-out;
}

@keyframes iconPop {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes messageSlide {
  0% { transform: translateY(10px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

/* 참가자 정보 */
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #FF69B4;
  padding: 10px 25px;
  font-size: 0.9rem;
  font-weight: 600;
  z-index: 1;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 20px;
}

.user-icon {
  font-size: 0.9rem;
}

/* 모바일 대응 */
@media (max-width: 400px) {
  .run-button {
    width: 220px;
    height: 220px;
  }
  
  .button-text {
    font-size: 4rem;
  }
  
  .run-button.countdown .button-text {
    font-size: 6rem;
  }
  
  .run-button.finished .button-text {
    font-size: 2rem;
  }
  
  .distance-value {
    font-size: 2.8rem;
  }
  
  .distance-display {
    padding: 15px 30px;
  }
  
  .progress-bar {
    width: 160px;
  }
  
  .status-message {
    font-size: 1rem;
    padding: 12px 20px;
  }
  
  .lobby-title {
    font-size: 2.2rem;
  }
  
  .join-button {
    padding: 20px 45px;
    font-size: 1.3rem;
  }
}

/* 이모티콘 선택 모달 */
.emoji-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.emoji-modal {
  background: white;
  border-radius: 25px;
  padding: 30px;
  max-width: 500px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
  from {
    transform: translateY(-50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.emoji-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.emoji-modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #FF69B4;
  font-weight: 800;
}

.emoji-modal-header .close-button {
  background: none;
  border: none;
  font-size: 2rem;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.emoji-modal-header .close-button:hover {
  background: rgba(255, 105, 180, 0.1);
  color: #FF69B4;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 25px;
}

.emoji-button {
  aspect-ratio: 1;
  border: 3px solid rgba(255, 182, 193, 0.5);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.8);
  font-size: 2rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.emoji-button:hover {
  transform: scale(1.1);
  border-color: #FF69B4;
  background: rgba(255, 182, 193, 0.2);
  box-shadow: 0 5px 15px rgba(255, 105, 180, 0.3);
}

.emoji-button.selected {
  border-color: #FF69B4;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 100%);
  box-shadow: 0 5px 20px rgba(255, 105, 180, 0.5);
  transform: scale(1.15);
}

.emoji-modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.cancel-button,
.confirm-button {
  padding: 12px 30px;
  border-radius: 15px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.cancel-button {
  background: rgba(200, 200, 200, 0.3);
  color: #666;
}

.cancel-button:hover {
  background: rgba(200, 200, 200, 0.5);
}

.confirm-button {
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 100%);
  color: white;
  box-shadow: 0 5px 15px rgba(255, 105, 180, 0.3);
}

.confirm-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(255, 105, 180, 0.4);
}

.confirm-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 400px) {
  .emoji-grid {
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
  }
  
  .emoji-button {
    font-size: 1.5rem;
  }
  
  .emoji-modal {
    padding: 20px;
  }
  
  .emoji-modal-header h2 {
    font-size: 1.2rem;
  }
}
</style>
