<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { dbRealTime, dbRef, onValue, update } from '../config/firebase';
import { FINISH_DISTANCE, COUNTDOWN_DURATION } from '../config/constants';

const route = useRoute();
const router = useRouter();
const roomId = computed(() => {
  const room = route.params.roomId as string;
  if (!room) {
    console.error('Room ID is required');
    return null;
  }
  return room;
});

interface Racer {
  name: string;
  distance: number;
  finish_time: number | null;
  emoji?: string; // 사용자가 선택한 이모티콘
}

interface RacersData {
  [uid: string]: Racer;
}

interface DramaEvent {
  type: 'overtake' | 'spurt' | 'close_race' | 'leader_change' | 'finish';
  text: string;
  subText?: string;
  duration: number;
  startTime: number;
  targetUid?: string;
}

interface RaceState {
  status: 'waiting' | 'preparing' | 'countdown' | 'started' | 'finished';
  preparingStartedAt?: number;
  countdownStartedAt?: number;
  finishDistance?: number;
}

const racers = ref<RacersData>({});
const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

// 레이스 상태
const raceState = ref<RaceState>({ status: 'waiting' });
const countdownNumber = ref<number | null>(null);
let countdownInterval: ReturnType<typeof setInterval> | null = null;
let raceStateUnsubscribe: (() => void) | null = null;

// 목표 거리 (Firebase에서 가져오거나 기본값 사용)
const finishDistance = computed(() => raceState.value.finishDistance || FINISH_DISTANCE);

// 카메라 시스템
let cameraX = 0;
let targetCameraX = 0;
let cameraScale = 1;
let targetCameraScale = 1;
let cameraShake = 0;

// 애니메이션 관련
let animationTime = 0;
let unsubscribe: (() => void) | null = null;
let animationFrameId: number | null = null;
let testIntervalId: ReturnType<typeof setInterval> | null = null;
let lastCanvasWidth = 0;
let lastCanvasHeight = 0;

// 드라마틱 연출
const currentDrama = ref<DramaEvent | null>(null);
const commentary = ref<string>('🏇 레이스 시작을 기다리는 중...');
let lastLeaderUid: string | null = null;
const lastPositions: Record<string, number> = {};
let dramaTimerId: ReturnType<typeof setTimeout> | null = null;

// 테스트 모드
const TEST_MODE = false;

// 트랙 설정
const TRACK_WIDTH = 3000; // 가상 트랙 너비
const LANE_COUNT = 5; // 레인 수 (주자들이 분산됨)

// 기본 이모티콘 (이모티콘이 없을 때 사용)
const DEFAULT_EMOJI = '🐎';

function generateTestRacers(): RacersData {
  const testNames = [
    '스페셜위크', '사일런스스즈카', '토카이테이오', '메지로맥퀸', '골드시프',
    '보드카', '다이와스칼렛', '우오카', '그래스원더', '엘콘돌파사',
    '심볼리루돌프', '에이신플래시', '마야노탑건', '타마모크로스', '오그리캡',
    '나이스네이처', '킹헤일로', '하루우라라', '아그네스타키온', '슈퍼크릭',
    '에어그루브', '유와캔캠프', '만하탄카페', '비와하야히데', '히시아마존',
    '후지기세키', '마치캔복킹', '에어샤카르', '비코페가수', '에어딱사이온',
    '세이운스카이', '스마트팔콘', '에어윈저', '비트하야테', '시리우스심볼',
    '토플라이트', '아야베', '슈티드', '라이스샤워', '도토',
    '세븐스타', '비와아쿠스', '덴노쇼', '케이퍼', '사코토', 
    '마쿠이', '리코리코', '하야테', '체리블로섬', '본드걸',
    '테스트1', '테스트2', '테스트3', '테스트4', '테스트5'
  ];

  // 다양한 이모티콘 목록
  const emojis = [
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
    "🦥", "🐨", "🐻", "🐻‍❄️", "🐼", "🦘", "🦡", "🦃", "🐔", "🐓",
    "🐣", "🐤", "🐥", "🐦", "🐧", "🕊️", "🦅", "🦆", "🦢", "🦉",
    "🦤", "🦩", "🦜", "🐢", "🐊", "🐍", "🦎", "🦖", "🦕", "🐙",
    "🦑", "🦐", "🦞", "🦀", "🐡", "🐸", "🐝", "🐜", "🐞", "🦗",
    "🕷️", "🦂", "🦟", "🦋", "🐛", "🐌", "👾", "👽", "👹", "👺",
    "👻", "🧟", "🧟‍♀️", "🧟‍♂️", "🧜", "🧜‍♀️", "🧜‍♂️", "🧚", "🧚‍♀️", "🧚‍♂️",
    "🧙", "🧙‍♀️", "🧙‍♂️", "🧛", "🧛‍♀️", "🧛‍♂️", "🧞", "🧞‍♀️", "🧞‍♂️", "👼",
    "🤶", "🎅", "💂", "💂‍♀️", "💂‍♂️", "🕵️", "🕵️‍♀️", "🕵️‍♂️", "👷", "👷‍♀️",
    "👷‍♂️", "👮", "👮‍♀️", "👮‍♂️"
  ];

  const testRacers: RacersData = {};
  for (let i = 0; i < 50; i++) {
    const uid = `test_${i}`;
    const name = testNames[i] || `참가자${i + 1}`;
    const progress = Math.random() * 4 + 1;
    const emoji = emojis[i % emojis.length]; // 이모티콘 순환 할당
    
    testRacers[uid] = {
      name,
      distance: progress,
      finish_time: null,
      emoji: emoji
    };
  }
  return testRacers;
}

// --- 카운트다운 시스템 ---

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
  }, 200);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  countdownNumber.value = null;
}

function listenForRaceState() {
  if (!roomId.value) return;
  const raceStateRef = dbRef(dbRealTime, `rooms/${roomId.value}/state`);
  
  raceStateUnsubscribe = onValue(raceStateRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const newState = data as RaceState;
      const oldStatus = raceState.value.status;
      raceState.value = newState;
      
      if (newState.status === 'preparing' && oldStatus !== 'preparing') {
        updateCommentary('🔔 준비하세요! 곧 시작됩니다!');
        stopCountdown();
      }
      
      if (newState.status === 'countdown' && oldStatus !== 'countdown') {
        startCountdown(newState.countdownStartedAt);
        updateCommentary('🔔 레이스 시작 준비! 카운트다운 시작!');
      }
      
      if (newState.status === 'started' && oldStatus !== 'started') {
        updateCommentary('🏇 레이스가 시작되었습니다! 과연 오늘의 주인공은?');
      }
      
      if (newState.status !== 'countdown' && newState.status !== 'preparing') {
        stopCountdown();
      }
    } else {
      raceState.value = { status: 'waiting' };
      stopCountdown();
    }
  });
}

// --- 드라마틱 연출 시스템 ---

function triggerDrama(type: DramaEvent['type'], text: string, subText?: string, targetUid?: string) {
  // finish 드라마가 진행 중이면 다른 드라마 무시
  if (currentDrama.value?.type === 'finish' && type !== 'finish') {
    return;
  }
  
  // 이전 타이머 취소
  if (dramaTimerId) {
    clearTimeout(dramaTimerId);
    dramaTimerId = null;
  }
  
  const duration = type === 'finish' ? 10000 : type === 'leader_change' ? 2500 : 2000;
  
  currentDrama.value = {
    type,
    text,
    subText,
    duration,
    startTime: Date.now(),
    targetUid
  };
  
  // 카메라 효과
  if (type === 'leader_change' || type === 'overtake') {
    targetCameraScale = 1.3;
    cameraShake = 15;
  } else if (type === 'spurt') {
    targetCameraScale = 1.2;
    cameraShake = 10;
  } else if (type === 'finish') {
    targetCameraScale = 1.5;
    cameraShake = 20;
  }
  
  dramaTimerId = setTimeout(() => {
    currentDrama.value = null;
    targetCameraScale = 1;
    dramaTimerId = null;
  }, duration);
}

function updateCommentary(text: string) {
  commentary.value = text;
}

function checkDramaticMoments() {
  const sorted = sortedRacers.value;
  if (sorted.length < 1) return;
  
  const leader = sorted[0];
  const second = sorted[1]; // 1명일 때는 undefined
  
  if (!leader) return;
  
  // 레이스가 진행 중일 때만 드라마 연출 (선두 교체, 접전, 추월 등)
  const isRacing = raceState.value.status === 'started';
  
  // 골인한 주자가 있으면 드라마 연출 안함 (완주 감지 제외)
  const hasFinished = sorted.some(r => r.finish_time !== null);
  
  if (!hasFinished && isRacing) {
    // 2명 이상일 때만 동작하는 드라마들
    if (second) {
      // 1등 변경 감지
      if (lastLeaderUid && lastLeaderUid !== leader.uid && !leader.finish_time) {
        triggerDrama('leader_change', '선두 교체!', `${leader.name}가 앞서 나갑니다!`, leader.uid);
        updateCommentary(`🔥 ${leader.name}, 선두로 치고 나갑니다!`);
      }
      
      // 접전 감지
      const gap = leader.distance - second.distance;
      if (gap < 10 && leader.distance > finishDistance.value * 0.7 && !currentDrama.value) {
        if (Math.random() < 0.02) {
          triggerDrama('close_race', '박빙의 승부!', `${leader.name} vs ${second.name}`, leader.uid);
          updateCommentary(`⚡ 막판 접전! ${leader.name}와 ${second.name}의 숨막히는 대결!`);
        }
      }
      
      // 추월 감지
      sorted.forEach((racer, index) => {
        const lastPos = lastPositions[racer.uid];
        
        // 새로 등록된 참가자거나 아직 달리지 않은 참가자는 추월 감지 건너뛰기
        // (입장 시 잘못된 추월 드라마 방지)
        if (lastPos === undefined || racer.distance === 0) {
          lastPositions[racer.uid] = index + 1;
          return;
        }
        
        if (lastPos > index + 1 && lastPos - (index + 1) >= 3) {
          if (!currentDrama.value && Math.random() < 0.3) {
            triggerDrama('overtake', '대역전!', `${racer.name}가 ${lastPos - index - 1}명을 추월!`, racer.uid);
            updateCommentary(`🌟 ${racer.name}, 엄청난 추월! ${index + 1}위로 급상승!`);
          }
        }
        lastPositions[racer.uid] = index + 1;
      });
    }
    
    // 1명이어도 동작하는 드라마: 막판 스퍼트
    if (leader.distance > finishDistance.value * 0.85 && !currentDrama.value) {
      if (Math.random() < 0.01) {
        triggerDrama('spurt', '최후의 스퍼트!', `${leader.name}의 질주!`, leader.uid);
        updateCommentary(`🚀 ${leader.name}, 결승선을 향해 전력 질주!`);
      }
    }
  }
  
  // lastLeaderUid 업데이트도 레이스 진행 중일 때만 (대기 중 입장 시 선두 교체 방지)
  if (isRacing) {
    lastLeaderUid = leader.uid;
  }
  
  // 완주 감지
  sorted.forEach(racer => {
    if (racer.finish_time && !lastPositions[`finished_${racer.uid}`]) {
      const rank = sorted.filter(r => r.finish_time && r.finish_time <= racer.finish_time!).length;
      if (rank === 1) {
        triggerDrama('finish', '🏆 우승!', `${racer.name}가 1등으로 골인!`, racer.uid);
        updateCommentary(`🎉 ${racer.name}, 영광의 1위! 축하합니다!`);
      } else {
        updateCommentary(`🏁 ${racer.name}, ${rank}위로 골인!`);
      }
      lastPositions[`finished_${racer.uid}`] = 1;
    }
  });
}

// --- 실시간 데이터 ---

onMounted(() => {
  if (!roomId.value) {
    alert('Room ID가 필요합니다. URL에 /sprint-display/방ID 형식으로 접속해주세요.');
    return;
  }
  
  if (TEST_MODE) {
    racers.value = generateTestRacers();
    testIntervalId = setInterval(() => {
      Object.keys(racers.value).forEach(uid => {
        const racer = racers.value[uid];
        if (racer && racer.finish_time === null && racer.distance < finishDistance.value) {
          // 랜덤 속도 변화 (우마무스메 느낌)
          const speedVariation = Math.random() * 4 - 0.5;
          racer.distance = Math.min(racer.distance + Math.random() * 2 + speedVariation, finishDistance.value);
          if (racer.distance >= finishDistance.value) {
            racer.finish_time = Date.now();
          }
        }
      });
      checkDramaticMoments();
    }, 100);
    updateCommentary('🏇 레이스가 시작되었습니다! 과연 오늘의 주인공은?');
  } else {
    listenForRaceState();
    listenForRaceUpdates();
  }
  
  nextTick(() => {
    startAnimation();
  });
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
  if (raceStateUnsubscribe) {
    raceStateUnsubscribe();
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  if (testIntervalId) {
    clearInterval(testIntervalId);
  }
  stopCountdown();
});

function listenForRaceUpdates() {
  if (!roomId.value) return;
  const participantsRef = dbRef(dbRealTime, `rooms/${roomId.value}/participants`);
  
  unsubscribe = onValue(participantsRef, (snapshot) => {
    const data = snapshot.val() || {};
    racers.value = data as RacersData;
    checkDramaticMoments();
  });
}

// --- Computed ---

const sortedRacers = computed(() => {
  const racerArray: Array<Racer & { uid: string; emoji: string }> = Object.keys(racers.value)
    .map(uid => {
      const racer = racers.value[uid];
      return {
        uid,
        name: racer?.name || `Player ${uid}`,
        distance: racer?.distance ?? 0,
        finish_time: racer?.finish_time ?? null,
        emoji: racer?.emoji || DEFAULT_EMOJI
      };
    })
    .filter((racer): racer is Racer & { uid: string; emoji: string } => 
      racer.name !== undefined && racer.distance !== undefined && racer.emoji !== undefined
    );

  return racerArray.sort((a, b) => {
    const aFinished = a.finish_time !== null;
    const bFinished = b.finish_time !== null;
    
    if (aFinished && !bFinished) return -1;
    if (!aFinished && bFinished) return 1;
    
    if (aFinished && bFinished && a.finish_time !== null && b.finish_time !== null) {
      return a.finish_time - b.finish_time;
    }
    
    return b.distance - a.distance;
  });
});

const finishedCount = computed(() => {
  return sortedRacers.value.filter(r => r.finish_time !== null).length;
});

const isRaceFinished = computed(() => {
  const total = Object.keys(racers.value).length;
  return total > 0 && finishedCount.value === total;
});

// 모든 참가자가 완주하면 자동으로 경기 종료
watch(isRaceFinished, async (finished) => {
  if (finished && raceState.value.status === 'started' && roomId.value) {
    try {
      const raceStateRef = dbRef(dbRealTime, `rooms/${roomId.value}/state`);
      await update(raceStateRef, {
        status: 'finished',
        finishedAt: Date.now()
      });
      updateCommentary('🏁 모든 참가자가 완주했습니다! 레이스 종료!');
    } catch (error) {
      console.error('자동 종료 오류:', error);
    }
  }
});

const showRankingModal = ref(false);

// 경기 종료 함수
async function finishRace() {
  if (!roomId.value) return;
  
  if (!confirm('레이스를 종료하시겠습니까?')) {
    return;
  }

  try {
    const raceStateRef = dbRef(dbRealTime, `rooms/${roomId.value}/state`);
    await update(raceStateRef, {
      status: 'finished',
      finishedAt: Date.now()
    });
    updateCommentary('🏁 레이스가 종료되었습니다!');
  } catch (error) {
    console.error('레이스 종료 오류:', error);
    alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// 현재 경기의 대기실로 이동
function goHome() {
  if (!confirm('대기실로 이동하시겠습니까?')) {
    return;
  }
  if (roomId.value) {
    router.push(`/room/${roomId.value}`);
  } else {
    router.push('/room');
  }
}

// --- 유틸리티 ---

function getProgress(distance: number): number {
  return Math.min((distance / finishDistance.value) * 100, 100);
}

function getRacerScreenX(distance: number): number {
  const progress = getProgress(distance);
  return (progress / 100) * TRACK_WIDTH;
}

// --- Canvas 애니메이션 ---

function startAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  
  if (!canvasRef.value) return;
  
  const canvas = canvasRef.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function animate() {
    if (!canvas || !ctx) return;
    
    animationTime += 1;
    
    // 캔버스 크기 조정
    const container = containerRef.value;
    if (container) {
      const rect = container.getBoundingClientRect();
      const newWidth = Math.floor(rect.width);
      const newHeight = Math.floor(rect.height);
      
      if (newWidth !== lastCanvasWidth || newHeight !== lastCanvasHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        lastCanvasWidth = newWidth;
        lastCanvasHeight = newHeight;
      }
    }

    // 카메라 업데이트 (1등 따라가기)
    updateCamera(canvas.width);
    
    // 카메라 흔들림 감소
    cameraShake *= 0.9;
    cameraScale += (targetCameraScale - cameraScale) * 0.1;

    // 캔버스 초기화 (이전 프레임 지우기)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 그리기
    ctx.save();
    
    // 카메라 흔들림 적용
    const shakeX = (Math.random() - 0.5) * cameraShake;
    const shakeY = (Math.random() - 0.5) * cameraShake;
    
    // 카메라 변환
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(cameraScale, cameraScale);
    ctx.translate(-canvas.width / 2 + shakeX, -canvas.height / 2 + shakeY);
    ctx.translate(-cameraX, 0);

    // 배경 그리기
    drawBackground(ctx, canvas.width, canvas.height);
    
    // 트랙 그리기
    drawTrack(ctx, canvas.width, canvas.height);
    
    // 출발선 그리기
    drawStartLine(ctx, canvas.width, canvas.height);
    
    // 주자들 그리기
    drawRacers(ctx, canvas.width, canvas.height);
    
    // 결승선 그리기
    drawFinishLine(ctx, canvas.width, canvas.height);
    
    ctx.restore();
    
    // 속도 이펙트 (카메라 변환 밖에서)
    drawSpeedEffects(ctx, canvas.width, canvas.height);

    animationFrameId = requestAnimationFrame(animate);
  }

  animate();
}

function updateCamera(canvasWidth: number) {
  const sorted = sortedRacers.value;
  if (sorted.length === 0) {
    // 참가자 없을 때도 여유있는 기본 위치
    targetCameraX = -canvasWidth * 0.15;
    cameraX += (targetCameraX - cameraX) * 0.08;
    return;
  }
  
  // 기본은 1등 추적
  let targetRacer = sorted[0];
  
  // 드라마 대상이 있으면 그 주자를 추적
  if (currentDrama.value?.targetUid) {
    const dramaTarget = sorted.find(r => r.uid === currentDrama.value?.targetUid);
    if (dramaTarget) {
      targetRacer = dramaTarget;
    }
  }
  
  if (!targetRacer) return;
  
  const targetX = getRacerScreenX(targetRacer.distance);
  
  // 드라마 중에는 대상을 정중앙에 배치
  if (currentDrama.value?.targetUid) {
    targetCameraX = targetX - canvasWidth / 2;
    // 드라마 중에는 음수 영역도 허용 (트랙 시작 부분 주자도 중앙에 배치 가능)
    targetCameraX = Math.max(-canvasWidth / 2, targetCameraX);
  } else {
    // 평소에는 1등보다 약간 앞을 보여주도록
    targetCameraX = targetX - canvasWidth * 0.3;
    // 시작점에서 여유있게 보여주기 위해 음수 허용
    targetCameraX = Math.max(-canvasWidth * 0.15, targetCameraX);
  }
  
  // 드라마 중에는 카메라 이동 속도 빠르게
  const smoothFactor = currentDrama.value?.targetUid ? 0.15 : 0.08;
  cameraX += (targetCameraX - cameraX) * smoothFactor;
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // 배경 시작점 (카메라가 음수일 때도 커버)
  const bgStartX = Math.min(cameraX, 0) - width;
  const bgWidth = width * 2 + TRACK_WIDTH + 500;
  
  // 하늘 그라데이션
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.6);
  skyGrad.addColorStop(0, '#87CEEB');
  skyGrad.addColorStop(0.5, '#B0E2FF');
  skyGrad.addColorStop(1, '#E0F4FF');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(bgStartX, 0, bgWidth, height * 0.6);
  
  // 구름
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  const cloudTime = animationTime * 0.005;
  for (let i = -2; i < 10; i++) {
    const cloudX = (i * 400) + Math.sin(cloudTime + i) * 20;
    const cloudY = 50 + (Math.abs(i) % 3) * 60;
    drawCloud(ctx, cloudX, cloudY, 50 + (Math.abs(i) % 3) * 20);
  }
  
  // 관중석 배경
  const standGrad = ctx.createLinearGradient(0, height * 0.1, 0, height * 0.4);
  standGrad.addColorStop(0, '#8B4513');
  standGrad.addColorStop(1, '#654321');
  ctx.fillStyle = standGrad;
  ctx.fillRect(bgStartX, height * 0.1, bgWidth, height * 0.3);
  
  // 관중 (간단한 원으로 표현)
  for (let i = 0; i < 100; i++) {
    const x = cameraX + (i * 35) + Math.sin(animationTime * 0.1 + i) * 3;
    const y = height * 0.2 + (i % 4) * 25 + Math.sin(animationTime * 0.15 + i * 0.5) * 5;
    
    // 관중 머리
    const colors = ['#FFE4B5', '#DEB887', '#F5DEB3', '#FFDAB9'] as const;
    ctx.fillStyle = colors[i % colors.length] ?? '#FFE4B5';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // 관중 응원 깃발 (일부만)
    if (i % 5 === 0) {
      const flagColors = ['#FF69B4', '#4169E1', '#32CD32', '#FFD700', '#FF4500'] as const;
      ctx.fillStyle = flagColors[i % flagColors.length] ?? '#FF69B4';
      ctx.fillRect(x - 2, y - 25, 15, 12);
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(x - 2, y - 25, 2, 25);
    }
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.5, y, size * 0.6, 0, Math.PI * 2);
  ctx.arc(x + size, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.7, y - size * 0.3, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrack(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const trackTop = height * 0.35;
  const trackHeight = height * 0.45;
  
  // 트랙 시작점 (카메라가 음수일 때도 커버)
  const trackStartX = Math.min(cameraX, 0) - width;
  const trackWidth = width * 2 + TRACK_WIDTH + 500;
  
  // 잔디 트랙
  const grassGrad = ctx.createLinearGradient(0, trackTop, 0, trackTop + trackHeight);
  grassGrad.addColorStop(0, '#4CAF50');
  grassGrad.addColorStop(0.5, '#66BB6A');
  grassGrad.addColorStop(1, '#43A047');
  ctx.fillStyle = grassGrad;
  ctx.fillRect(trackStartX, trackTop, trackWidth, trackHeight);
  
  // 트랙 라인 (레인 구분)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([20, 20]);
  
  for (let i = 1; i < LANE_COUNT; i++) {
    const y = trackTop + (trackHeight / LANE_COUNT) * i;
    ctx.beginPath();
    ctx.moveTo(trackStartX, y);
    ctx.lineTo(trackStartX + trackWidth, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  
  // 거리 마커
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  
  for (let i = 0; i <= 10; i++) {
    const distance = (finishDistance.value / 10) * i;
    const x = (distance / finishDistance.value) * TRACK_WIDTH;
    
    // 마커 라인
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, trackTop);
    ctx.lineTo(x, trackTop + trackHeight);
    ctx.stroke();
    
    // 거리 텍스트
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.strokeText(`${Math.round(distance)}m`, x, trackTop + trackHeight + 20);
    ctx.fillText(`${Math.round(distance)}m`, x, trackTop + trackHeight + 20);
  }
  
  // 트랙 테두리 (상단)
  ctx.fillStyle = '#8B4513';
  ctx.fillRect(trackStartX, trackTop - 10, trackWidth, 10);
  
  // 트랙 테두리 (하단) - 흙 트랙 느낌
  const dirtGrad = ctx.createLinearGradient(0, trackTop + trackHeight, 0, height);
  dirtGrad.addColorStop(0, '#8B4513');
  dirtGrad.addColorStop(0.1, '#654321');
  dirtGrad.addColorStop(1, '#4A3520');
  ctx.fillStyle = dirtGrad;
  ctx.fillRect(trackStartX, trackTop + trackHeight, trackWidth, height - trackTop - trackHeight);
}

function drawStartLine(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const trackTop = height * 0.35;
  const trackHeight = height * 0.45;
  const startX = 0;
  
  // 출발선 체크무늬 (흰색/빨간색)
  const checkSize = 15;
  for (let row = 0; row < Math.ceil(trackHeight / checkSize); row++) {
    for (let col = 0; col < 3; col++) {
      const isWhite = (row + col) % 2 === 0;
      ctx.fillStyle = isWhite ? '#FFFFFF' : '#FF4444';
      ctx.fillRect(
        startX - 45 + col * checkSize,
        trackTop + row * checkSize,
        checkSize,
        checkSize
      );
    }
  }
  
  // 출발선 빛나는 효과
  const glowIntensity = 0.2 + Math.sin(animationTime * 0.08) * 0.15;
  ctx.fillStyle = `rgba(255, 100, 100, ${glowIntensity})`;
  ctx.fillRect(startX - 50, trackTop - 20, 55, trackHeight + 40);
  
  // START 텍스트
  ctx.save();
  ctx.translate(startX - 22, trackTop - 45);
  ctx.fillStyle = '#FF4444';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  ctx.font = 'bold 26px "Comic Sans MS", cursive';
  ctx.textAlign = 'center';
  ctx.strokeText('START', 0, 0);
  ctx.fillText('START', 0, 0);
  ctx.restore();
  
  // 출발 게이트 (아치형)
  ctx.strokeStyle = '#FF4444';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(startX - 55, trackTop - 10);
  ctx.lineTo(startX - 55, trackTop - 70);
  ctx.lineTo(startX + 10, trackTop - 70);
  ctx.lineTo(startX + 10, trackTop - 10);
  ctx.stroke();
  
  // 게이트 장식 (가로 줄무늬)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    const y = trackTop - 25 - i * 15;
    ctx.beginPath();
    ctx.moveTo(startX - 55, y);
    ctx.lineTo(startX + 10, y);
    ctx.stroke();
  }
  
  // 출발 신호등
  const lightRadius = 12;
  const lightX = startX - 22;
  const lightBaseY = trackTop - 100;
  
  // 신호등 몸체
  ctx.fillStyle = '#333333';
  ctx.fillRect(lightX - 18, lightBaseY - 5, 36, 55);
  ctx.fillRect(lightX - 5, lightBaseY + 50, 10, 20);
  
  // 신호등 테두리
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 2;
  ctx.strokeRect(lightX - 18, lightBaseY - 5, 36, 55);
  
  // 빨강, 노랑, 초록 불
  const lights = [
    { color: '#FF0000', glowColor: 'rgba(255, 0, 0, 0.5)', y: lightBaseY + 5 },
    { color: '#FFFF00', glowColor: 'rgba(255, 255, 0, 0.5)', y: lightBaseY + 22 },
    { color: '#00FF00', glowColor: 'rgba(0, 255, 0, 0.5)', y: lightBaseY + 39 }
  ];
  
  // 레이스 진행 상태에 따라 불 켜기 (간단히 초록불만 켜진 상태로)
  lights.forEach((light, index) => {
    // 켜진 불 (초록불만)
    if (index === 2) {
      // 글로우 효과
      const gradient = ctx.createRadialGradient(lightX, light.y, 0, lightX, light.y, lightRadius * 2);
      gradient.addColorStop(0, light.glowColor);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(lightX, light.y, lightRadius * 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = light.color;
    } else {
      // 꺼진 불
      ctx.fillStyle = '#444444';
    }
    
    ctx.beginPath();
    ctx.arc(lightX, light.y, lightRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // 불 테두리
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawFinishLine(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const trackTop = height * 0.35;
  const trackHeight = height * 0.45;
  const finishX = TRACK_WIDTH;
  
  // 결승선 체크무늬
  const checkSize = 15;
  for (let row = 0; row < Math.ceil(trackHeight / checkSize); row++) {
    for (let col = 0; col < 3; col++) {
      const isWhite = (row + col) % 2 === 0;
      ctx.fillStyle = isWhite ? '#FFFFFF' : '#000000';
      ctx.fillRect(
        finishX + col * checkSize,
        trackTop + row * checkSize,
        checkSize,
        checkSize
      );
    }
  }
  
  // 결승선 반짝임 효과
  const glowIntensity = 0.3 + Math.sin(animationTime * 0.1) * 0.2;
  ctx.fillStyle = `rgba(255, 215, 0, ${glowIntensity})`;
  ctx.fillRect(finishX - 5, trackTop - 20, 55, trackHeight + 40);
  
  // GOAL 텍스트
  ctx.save();
  ctx.translate(finishX + 25, trackTop - 40);
  ctx.fillStyle = '#FFD700';
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 4;
  ctx.font = 'bold 28px "Comic Sans MS", cursive';
  ctx.textAlign = 'center';
  ctx.strokeText('GOAL', 0, 0);
  ctx.fillText('GOAL', 0, 0);
  ctx.restore();
  
  // 골 아치 (간단한 형태)
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(finishX - 10, trackTop - 10);
  ctx.lineTo(finishX - 10, trackTop - 60);
  ctx.lineTo(finishX + 60, trackTop - 60);
  ctx.lineTo(finishX + 60, trackTop - 10);
  ctx.stroke();
}

function drawRacers(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const trackTop = height * 0.35;
  const trackHeight = height * 0.45;
  const sorted = sortedRacers.value;
  
  // 뒤에서부터 그려서 앞에 있는 주자가 위에 그려지도록
  const sortedByDistance = [...sorted].sort((a, b) => a.distance - b.distance);
  
  sortedByDistance.forEach((racer, drawIndex) => {
    const rank = sorted.findIndex(r => r.uid === racer.uid) + 1;
    const x = getRacerScreenX(racer.distance);
    
    // 랜덤 배치 (uid 기반 시드로 고정된 랜덤값 생성)
    const seed = racer.uid.split('').reduce((acc, char, i) => {
      return ((acc << 5) - acc + char.charCodeAt(0) * (i + 7)) | 0;
    }, 0);
    const randomY = Math.abs(Math.sin(seed * 9999) * 10000) % 1; // 0~1 사이 균등 분포
    const y = trackTop + 25 + randomY * (trackHeight - 70); // 트랙 내 여유 두고 랜덤 배치
    
    const isFinished = racer.finish_time !== null;
    const isRunning = !isFinished && racer.distance > 0;
    const isLeader = rank === 1;
    
    // 달리기 애니메이션 오프셋
    const bounceY = isRunning ? Math.sin(animationTime * 0.5 + drawIndex) * 8 : 0;
    const bounceX = isRunning ? Math.cos(animationTime * 0.4 + drawIndex) * 3 : 0;
    
    // 1등 특별 후광 효과
    if (isLeader && !isFinished) {
      // 바깥쪽 큰 후광
      const outerGlowSize = 80 + Math.sin(animationTime * 0.1) * 15;
      const outerGradient = ctx.createRadialGradient(x + bounceX, y + bounceY, 0, x + bounceX, y + bounceY, outerGlowSize);
      outerGradient.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
      outerGradient.addColorStop(0.5, 'rgba(255, 165, 0, 0.2)');
      outerGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = outerGradient;
      ctx.beginPath();
      ctx.arc(x + bounceX, y + bounceY, outerGlowSize, 0, Math.PI * 2);
      ctx.fill();
      
      // 안쪽 강한 후광
      const innerGlowSize = 50 + Math.sin(animationTime * 0.15) * 10;
      const innerGradient = ctx.createRadialGradient(x + bounceX, y + bounceY, 0, x + bounceX, y + bounceY, innerGlowSize);
      innerGradient.addColorStop(0, 'rgba(255, 255, 200, 0.6)');
      innerGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = innerGradient;
      ctx.beginPath();
      ctx.arc(x + bounceX, y + bounceY, innerGlowSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 그림자
    ctx.fillStyle = isLeader ? 'rgba(255, 215, 0, 0.4)' : 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + bounceX, y + 35, isLeader ? 30 : 25, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 참가자의 이모티콘 가져오기
    const racerEmoji = racer.emoji || DEFAULT_EMOJI;
    
    // 속도 잔상 (빠를 때)
    if (isRunning && racer.distance > 10) {
      ctx.globalAlpha = 0.2;
      for (let i = 1; i <= 3; i++) {
        ctx.save();
        ctx.translate(x - i * 25, y + bounceY + 15);
        ctx.scale(-1, 1); // 수평 반전
        ctx.font = `${50 - i * 5}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText(racerEmoji, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    
    // 참가자 이모티콘 (오른쪽을 바라보도록 반전)
    ctx.save();
    ctx.translate(x + bounceX, y + bounceY + 15);
    ctx.scale(-1, 1); // 수평 반전
    // 1등은 더 크게
    ctx.font = isLeader ? '60px serif' : '50px serif';
    ctx.textAlign = 'center';
    ctx.fillText(racerEmoji, 0, 0);
    ctx.restore();
    
    // 1등 왕관 표시
    if (isLeader && !isFinished) {
      ctx.save();
      const crownY = y + bounceY - 50;
      const crownBounce = Math.sin(animationTime * 0.12) * 3;
      ctx.font = '28px serif';
      ctx.textAlign = 'center';
      ctx.fillText('👑', x + bounceX, crownY + crownBounce);
      ctx.restore();
    }
    
    // 순위 배지
    drawRankBadge(ctx, x + bounceX - 30, y + bounceY - 40, rank);
    
    // 이름 태그 (1등은 특별한 스타일)
    if (isLeader && !isFinished) {
      // 1등 이름 배경 (금색)
      ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
      const nameWidth = ctx.measureText(racer.name).width + 20;
      ctx.beginPath();
      ctx.roundRect(x + bounceX - nameWidth / 2, y + bounceY - 68, nameWidth, 26, 13);
      ctx.fill();
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#8B4513';
      ctx.font = 'bold 15px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(racer.name, x + bounceX, y + bounceY - 49);
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      const nameWidth = ctx.measureText(racer.name).width + 16;
      ctx.fillRect(x + bounceX - nameWidth / 2, y + bounceY - 65, nameWidth, 22);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(racer.name, x + bounceX, y + bounceY - 48);
    }
    
    // 완주 이펙트
    if (isFinished) {
      // 빛나는 효과
      const glowSize = 40 + Math.sin(animationTime * 0.15) * 10;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
      gradient.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
      gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, glowSize, 0, Math.PI * 2);
      ctx.fill();
      
      // 별 이펙트
      if (rank <= 3) {
        for (let i = 0; i < 5; i++) {
          const angle = (animationTime * 0.05) + (i * Math.PI * 2 / 5);
          const starX = x + Math.cos(angle) * 45;
          const starY = y + Math.sin(angle) * 30;
          ctx.fillStyle = '#FFD700';
          ctx.font = '16px serif';
          ctx.fillText('⭐', starX, starY);
        }
      }
    }
  });
}

function drawRankBadge(ctx: CanvasRenderingContext2D, x: number, y: number, rank: number) {
  let bgColor: string;
  let textColor: string = '#FFFFFF';
  
  if (rank === 1) {
    bgColor = '#FFD700';
    textColor = '#000000';
  } else if (rank === 2) {
    bgColor = '#C0C0C0';
    textColor = '#000000';
  } else if (rank === 3) {
    bgColor = '#CD7F32';
  } else {
    bgColor = '#4A4A4A';
  }
  
  // 배지 배경
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();
  
  // 테두리
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // 순위 텍스트
  ctx.fillStyle = textColor;
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rank.toString(), x, y);
  ctx.textBaseline = 'alphabetic';
}

function drawSpeedEffects(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // 레이스가 시작됐을 때만 속도선 효과
  if (raceState.value.status === 'started') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    
    for (let i = 0; i < 10; i++) {
      const y = Math.random() * height;
      const lineLength = Math.random() * 100 + 50;
      const x = Math.random() * width;
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lineLength, y);
      ctx.stroke();
    }
  }
  
  // 화면 가장자리 비네팅
  if (currentDrama.value) {
    const vignetteGrad = ctx.createRadialGradient(
      width / 2, height / 2, width * 0.3,
      width / 2, height / 2, width * 0.8
    );
    vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, width, height);
  }
}
</script>

<template>
  <div class="race-container">
    <!-- 상단 헤더 -->
    <div class="race-header">
      <div class="logo-section">
        <span class="logo-icon">🏇</span>
        <span class="logo-text">DASH RUN!</span>
      </div>
      
      <!-- 현재 1등 표시 (클릭시 순위표) -->
      <div v-if="sortedRacers.length > 0" class="leader-display" @click="showRankingModal = true">
        <div class="leader-crown">👑</div>
        <div class="leader-info">
          <span class="leader-label">{{ isRaceFinished ? '🏆 최종 1등' : '현재 1등' }} · 순위표 보기</span>
          <span class="leader-name">{{ sortedRacers[0]?.name }}</span>
          <span class="leader-distance">{{ Math.round(sortedRacers[0]?.distance || 0) }}m</span>
        </div>
        <div class="leader-horse">{{ sortedRacers[0]?.emoji || DEFAULT_EMOJI }}</div>
      </div>
      
      <div class="race-stats">
        <div class="stat-item">
          <span class="stat-label">참가</span>
          <span class="stat-value">{{ Object.keys(racers).length }}명</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">완주</span>
          <span class="stat-value">{{ finishedCount }}명</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">거리</span>
          <span class="stat-value">{{ finishDistance }}m</span>
        </div>
      </div>
    </div>

    <!-- 메인 레이스 캔버스 -->
    <div class="race-track-container" ref="containerRef">
      <canvas ref="canvasRef" class="race-canvas"></canvas>
      
      <!-- 준비 오버레이 -->
      <Transition name="countdown">
        <div v-if="raceState.status === 'preparing'" class="countdown-overlay preparing-overlay">
          <div class="countdown-content">
            <div class="preparing-text">준비하세요!</div>
          </div>
        </div>
      </Transition>
      
      <!-- 카운트다운 오버레이 -->
      <Transition name="countdown">
        <div v-if="countdownNumber" class="countdown-overlay">
          <div class="countdown-content">
            <div class="countdown-number" :key="countdownNumber">
              {{ countdownNumber }}!
            </div>
            <div class="countdown-text">준비하세요!</div>
          </div>
        </div>
      </Transition>
      
      <!-- 드라마틱 오버레이 -->
      <Transition name="drama">
        <div v-if="currentDrama" class="drama-overlay">
          <div class="drama-content">
            <h1 class="drama-title">{{ currentDrama.text }}</h1>
            <p v-if="currentDrama.subText" class="drama-subtitle">{{ currentDrama.subText }}</p>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 하단 실황 자막 -->
    <div class="commentary-bar">
      <div class="commentary-icon">📢</div>
      <div class="commentary-text">{{ commentary }}</div>
    </div>

    <!-- 순위 트래커 -->
    <div class="position-tracker">
      <div class="tracker-title">🏁 현재 순위</div>
      <div class="tracker-bar">
        <div 
          v-for="(racer, index) in sortedRacers.slice(0, 10)" 
          :key="racer.uid"
          class="tracker-marker"
          :style="{
            left: `${getProgress(racer.distance)}%`,
            zIndex: 100 - index
          }"
          :class="{ 
            'is-finished': racer.finish_time !== null,
            'is-leader': index === 0
          }"
        >
          <span class="marker-emoji">{{ racer.emoji || DEFAULT_EMOJI }}</span>
          <span class="marker-rank">{{ index + 1 }}</span>
          <span class="marker-name">{{ racer.name }}</span>
        </div>
      </div>
    </div>

    <!-- 순위표 모달 -->
    <Transition name="modal">
      <div v-if="showRankingModal" class="ranking-modal-overlay" @click.self="showRankingModal = false">
        <div class="ranking-modal">
          <div class="modal-header">
            <h2>🏆 {{ isRaceFinished ? '최종 순위표' : '현재 순위표' }}</h2>
            <button class="modal-close" @click="showRankingModal = false">✕</button>
          </div>
          <div class="modal-content">
            <div 
              v-for="(racer, index) in sortedRacers" 
              :key="racer.uid"
              class="ranking-item"
              :class="{
                'rank-1': index === 0,
                'rank-2': index === 1,
                'rank-3': index === 2
              }"
            >
              <div class="ranking-position">
                <span v-if="index === 0">🥇</span>
                <span v-else-if="index === 1">🥈</span>
                <span v-else-if="index === 2">🥉</span>
                <span v-else class="rank-number">{{ index + 1 }}</span>
              </div>
              <div class="ranking-horse">{{ racer.emoji || DEFAULT_EMOJI }}</div>
              <div class="ranking-name">{{ racer.name }}</div>
              <div class="ranking-distance">{{ Math.round(racer.distance) }}m</div>
            </div>
          </div>
          
          <!-- 경기 종료 및 홈 버튼 -->
          <div class="modal-footer">
            <button 
              @click="finishRace" 
              :disabled="raceState.status !== 'started'"
              class="finish-race-button"
            >
              🏁 경기 종료
            </button>
            <button 
              @click="goHome" 
              class="home-button"
            >
              🏠 대기실로 이동
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Noto+Sans+KR:wght@400;700;900&display=swap');

.race-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #87CEEB 0%, #E0F6FF 50%, #FFE4E1 100%);
  overflow: hidden;
  font-family: 'Noto Sans KR', sans-serif;
}

/* 헤더 */
.race-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 50%, #FF1493 100%);
  box-shadow: 0 4px 20px rgba(255, 105, 180, 0.4);
  z-index: 10;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  font-size: 2rem;
  animation: bounce 1s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

.logo-text {
  font-family: 'Black Han Sans', sans-serif;
  font-size: 1.8rem;
  color: #FFFFFF;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

/* 현재 1등 표시 */
.leader-display {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%);
  padding: 8px 20px;
  border-radius: 50px;
  box-shadow: 
    0 4px 20px rgba(255, 215, 0, 0.5),
    inset 0 2px 4px rgba(255, 255, 255, 0.3);
  animation: leaderGlow 1.5s ease-in-out infinite;
  border: 2px solid rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: transform 0.2s ease;
}

.leader-display:hover {
  transform: scale(1.05);
}

@keyframes leaderGlow {
  0%, 100% { 
    box-shadow: 0 4px 20px rgba(255, 215, 0, 0.5), inset 0 2px 4px rgba(255, 255, 255, 0.3);
    transform: scale(1);
  }
  50% { 
    box-shadow: 0 6px 30px rgba(255, 215, 0, 0.8), inset 0 2px 4px rgba(255, 255, 255, 0.3);
    transform: scale(1.02);
  }
}

.leader-crown {
  font-size: 1.8rem;
  animation: crownBounce 0.8s ease-in-out infinite;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

@keyframes crownBounce {
  0%, 100% { transform: translateY(0) rotate(-5deg); }
  50% { transform: translateY(-3px) rotate(5deg); }
}

.leader-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.leader-label {
  font-size: 0.65rem;
  color: rgba(139, 69, 19, 0.8);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.leader-name {
  font-family: 'Black Han Sans', sans-serif;
  font-size: 1.2rem;
  color: #8B4513;
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.5);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.leader-distance {
  font-size: 0.75rem;
  color: #654321;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.4);
  padding: 2px 8px;
  border-radius: 10px;
}

.leader-horse {
  font-size: 1.6rem;
  animation: horseRun 0.25s ease-in-out infinite;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  transform-origin: bottom center;
}

@keyframes horseRun {
  0%, 100% { 
    transform: translateX(0) translateY(0) rotate(-5deg) scaleY(1);
  }
  20% { 
    transform: translateX(2px) translateY(-6px) rotate(-10deg) scaleY(1.05);
  }
  40% { 
    transform: translateX(4px) translateY(-8px) rotate(-8deg) scaleY(1.08);
  }
  60% { 
    transform: translateX(3px) translateY(-4px) rotate(-6deg) scaleY(0.95);
  }
  80% { 
    transform: translateX(1px) translateY(-1px) rotate(-4deg) scaleY(0.98);
  }
}

.race-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.finish-race-button {
  width: 100%;
  padding: 15px 24px;
  font-size: 1.1rem;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #FF6B6B 0%, #FF4757 100%);
  border: 3px solid rgba(255, 255, 255, 0.6);
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 20px rgba(255, 71, 87, 0.4);
}

.finish-race-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 71, 87, 0.5);
}

.finish-race-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, #D3D3D3 0%, #A9A9A9 100%);
}

.home-button {
  width: 100%;
  padding: 15px 24px;
  font-size: 1.1rem;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #87CEEB 0%, #4682B4 100%);
  border: 3px solid rgba(255, 255, 255, 0.6);
  border-radius: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 6px 20px rgba(30, 144, 255, 0.4);
}

.home-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(30, 144, 255, 0.5);
}

.race-stats {
  display: flex;
  gap: 20px;
  align-items: center;
}

.ranking-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  border: none;
  border-radius: 25px;
  font-size: 1rem;
  font-weight: 700;
  color: #8B4513;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
  transition: all 0.2s ease;
  animation: btnPulse 1.5s ease-in-out infinite;
}

.ranking-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.6);
}

@keyframes btnPulse {
  0%, 100% { box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4); }
  50% { box-shadow: 0 4px 25px rgba(255, 215, 0, 0.7); }
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.stat-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  text-transform: uppercase;
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 900;
  color: #FFFFFF;
}

/* 메인 트랙 컨테이너 */
.race-track-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.race-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* 드라마틱 오버레이 */
.drama-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, transparent 30%, rgba(0, 0, 0, 0.7) 100%);
  pointer-events: none;
  z-index: 50;
}

.drama-content {
  text-align: center;
  animation: dramaPop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes dramaPop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.drama-title {
  font-family: 'Black Han Sans', sans-serif;
  font-size: 4rem;
  color: #FFD700;
  text-shadow: 
    3px 3px 0 #FF69B4,
    6px 6px 0 rgba(0, 0, 0, 0.5),
    0 0 30px rgba(255, 215, 0, 0.8);
  margin: 0;
  transform: rotate(-3deg);
  animation: shake 0.5s ease-in-out infinite;
}

@keyframes shake {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}

.drama-subtitle {
  font-size: 1.8rem;
  color: #FFFFFF;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  margin-top: 10px;
  font-weight: 700;
}

.drama-enter-active,
.drama-leave-active {
  transition: all 0.3s ease;
}

.drama-enter-from,
.drama-leave-to {
  opacity: 0;
  transform: scale(1.2);
}

/* 카운트다운 오버레이 */
.countdown-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.7) 100%);
  pointer-events: none;
  z-index: 100;
}

.countdown-content {
  text-align: center;
}

.countdown-number {
  font-family: 'Black Han Sans', sans-serif;
  font-size: 15rem;
  font-weight: 900;
  color: #FFFFFF;
  text-shadow: 
    0 0 30px rgba(255, 255, 255, 0.8),
    0 0 60px rgba(255, 215, 0, 0.8),
    0 0 100px rgba(255, 105, 180, 0.6),
    8px 8px 0 #FF1493,
    -8px -8px 0 #FFD700;
  animation: countdownPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  line-height: 1;
}

@keyframes countdownPop {
  0% { 
    transform: scale(0.3) rotate(-10deg); 
    opacity: 0;
  }
  50% { 
    transform: scale(1.2) rotate(5deg); 
  }
  70% {
    transform: scale(0.95) rotate(-2deg);
  }
  100% { 
    transform: scale(1) rotate(0deg); 
    opacity: 1;
  }
}

.countdown-text {
  font-size: 2.5rem;
  font-weight: 700;
  color: #FFD700;
  text-shadow: 
    2px 2px 4px rgba(0, 0, 0, 0.8),
    0 0 20px rgba(255, 215, 0, 0.6);
  margin-top: -20px;
  animation: countdownTextPulse 0.8s ease-in-out infinite;
}

.preparing-overlay {
  z-index: 101;
}

.preparing-text {
  font-family: 'Black Han Sans', sans-serif;
  font-size: 8rem;
  font-weight: 900;
  color: #FFFFFF;
  text-shadow: 
    0 0 30px rgba(255, 255, 255, 0.8),
    0 0 60px rgba(255, 215, 0, 0.8),
    0 0 100px rgba(255, 105, 180, 0.6),
    8px 8px 0 #FF1493,
    -8px -8px 0 #FFD700;
  animation: preparingPulse 1s ease-in-out infinite;
  line-height: 1;
}

@keyframes preparingPulse {
  0%, 100% { 
    transform: scale(1); 
    opacity: 1;
  }
  50% { 
    transform: scale(1.05); 
    opacity: 0.9;
  }
}

@keyframes countdownTextPulse {
  0%, 100% { 
    transform: scale(1); 
    opacity: 1;
  }
  50% { 
    transform: scale(1.1); 
    opacity: 0.8;
  }
}

.countdown-enter-active {
  transition: all 0.3s ease;
}

.countdown-leave-active {
  transition: all 0.2s ease;
}

.countdown-enter-from {
  opacity: 0;
}

.countdown-leave-to {
  opacity: 0;
  transform: scale(1.5);
}

/* 실황 자막 */
.commentary-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.95);
  border-top: 3px solid #FF69B4;
  box-shadow: 0 -4px 20px rgba(255, 105, 180, 0.2);
}

.commentary-icon {
  font-size: 1.5rem;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.commentary-text {
  font-size: 1.2rem;
  font-weight: 700;
  color: #FF69B4;
  text-shadow: 0 0 10px rgba(255, 105, 180, 0.3);
  animation: textGlow 2s ease-in-out infinite;
}

@keyframes textGlow {
  0%, 100% { text-shadow: 0 0 10px rgba(255, 105, 180, 0.3); }
  50% { text-shadow: 0 0 20px rgba(255, 105, 180, 0.5); }
}

/* 순위 트래커 */
.position-tracker {
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.95);
  border-top: 2px solid rgba(255, 182, 193, 0.5);
  box-shadow: 0 -4px 15px rgba(255, 105, 180, 0.1);
}

.tracker-title {
  font-size: 0.9rem;
  color: #FF69B4;
  font-weight: 700;
  margin-bottom: 8px;
}

.tracker-bar {
  position: relative;
  height: 50px;
  background: linear-gradient(90deg, #FFE4E1 0%, #FFB6C1 100%);
  border-radius: 8px;
  overflow: visible;
  border: 2px solid rgba(255, 182, 193, 0.5);
}

.tracker-marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: left 0.3s ease-out;
}

.marker-emoji {
  font-size: 1.5rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  animation: markerGallop 0.25s ease-in-out infinite;
  transform-origin: bottom center;
}

@keyframes markerGallop {
  0%, 100% { 
    transform: translateY(0) rotate(-5deg) scaleX(-1) scaleY(1);
  }
  30% { 
    transform: translateY(-8px) rotate(-8deg) scaleX(-1) scaleY(1.05);
  }
  50% { 
    transform: translateY(-10px) rotate(-6deg) scaleX(-1) scaleY(1.08);
  }
  80% { 
    transform: translateY(-2px) rotate(-3deg) scaleX(-1) scaleY(0.95);
  }
}

.marker-rank {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 18px;
  height: 18px;
  background: #FF69B4;
  border-radius: 50%;
  font-size: 0.7rem;
  font-weight: 900;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

.marker-name {
  position: absolute;
  top: -25px;
  font-size: 0.65rem;
  color: #FF69B4;
  white-space: nowrap;
  font-weight: 700;
  text-shadow: 1px 1px 2px white;
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 182, 193, 0.5);
}

.tracker-marker.is-leader .marker-rank {
  background: #FFD700;
  color: #000;
  animation: leaderPulse 0.5s ease-in-out infinite;
}

.tracker-marker.is-leader .marker-emoji {
  animation: leaderGallop 0.2s ease-in-out infinite;
  font-size: 1.8rem;
}

@keyframes leaderGallop {
  0%, 100% { 
    transform: translateY(0) translateX(0) rotate(-8deg) scaleX(-1) scaleY(1);
  }
  25% { 
    transform: translateY(-12px) translateX(2px) rotate(-12deg) scaleX(-1) scaleY(1.1);
  }
  50% { 
    transform: translateY(-14px) translateX(3px) rotate(-10deg) scaleX(-1) scaleY(1.12);
  }
  75% { 
    transform: translateY(-4px) translateX(1px) rotate(-6deg) scaleX(-1) scaleY(0.92);
  }
}

@keyframes leaderPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

.tracker-marker.is-finished {
  filter: drop-shadow(0 0 10px gold);
}

.tracker-marker.is-finished .marker-emoji {
  animation: finishCelebrate 0.5s ease-in-out infinite;
}

@keyframes finishCelebrate {
  0%, 100% { transform: translateY(0) rotate(0deg) scaleX(-1); }
  25% { transform: translateY(-5px) rotate(-10deg) scaleX(-1); }
  75% { transform: translateY(-5px) rotate(10deg) scaleX(-1); }
}

/* 반응형 */
@media (max-width: 768px) {
  .race-header {
    flex-direction: column;
    gap: 10px;
    padding: 10px 16px;
  }
  
  .logo-text {
    font-size: 1.4rem;
  }
  
  .leader-display {
    padding: 6px 14px;
    gap: 8px;
  }
  
  .leader-crown {
    font-size: 1.4rem;
  }
  
  .leader-name {
    font-size: 1rem;
    max-width: 100px;
  }
  
  .leader-horse {
    font-size: 1.3rem;
  }
  
  .race-stats {
    gap: 10px;
  }
  
  .stat-item {
    padding: 6px 12px;
  }
  
  .drama-title {
    font-size: 2.5rem;
  }
  
  .drama-subtitle {
    font-size: 1.2rem;
  }
  
  .commentary-text {
    font-size: 1rem;
  }
  
  .marker-name {
    display: none;
  }
}

/* 순위표 모달 */
.ranking-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.ranking-modal {
  background: linear-gradient(135deg, #FFFFFF 0%, #FFF0F5 100%);
  border-radius: 25px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(255, 105, 180, 0.3);
  border: 3px solid rgba(255, 182, 193, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #FFB6C1 0%, #FF69B4 100%);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: white;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
}

.modal-close {
  background: rgba(255, 255, 255, 0.3);
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 1.2rem;
  color: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.5);
  transform: scale(1.1);
}

.modal-content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  min-height: 0; /* flexbox에서 스크롤을 위해 필요 */
}

.modal-footer {
  padding: 20px;
  border-top: 2px solid rgba(255, 182, 193, 0.3);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(255, 182, 193, 0.1);
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 15px;
  border: 2px solid rgba(255, 182, 193, 0.3);
  transition: all 0.2s ease;
}

.ranking-item:hover {
  transform: translateX(5px);
  box-shadow: 0 4px 15px rgba(255, 105, 180, 0.2);
}

.ranking-item.rank-1 {
  background: linear-gradient(135deg, #FFF9E6 0%, #FFD700 100%);
  border-color: #FFD700;
  box-shadow: 0 4px 20px rgba(255, 215, 0, 0.4);
}

.ranking-item.rank-2 {
  background: linear-gradient(135deg, #F8F8F8 0%, #C0C0C0 100%);
  border-color: #C0C0C0;
}

.ranking-item.rank-3 {
  background: linear-gradient(135deg, #FFF0E6 0%, #CD7F32 100%);
  border-color: #CD7F32;
}

.ranking-position {
  font-size: 1.8rem;
  min-width: 40px;
  text-align: center;
}

.rank-number {
  font-size: 1.2rem;
  font-weight: 900;
  color: #FF69B4;
}

.ranking-horse {
  font-size: 1.5rem;
}

.ranking-name {
  flex: 1;
  font-size: 1.1rem;
  font-weight: 700;
  color: #333;
}

.ranking-distance {
  font-size: 0.9rem;
  color: #FF69B4;
  font-weight: 600;
  background: rgba(255, 105, 180, 0.1);
  padding: 4px 10px;
  border-radius: 10px;
}

/* 모달 트랜지션 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .ranking-modal,
.modal-leave-to .ranking-modal {
  transform: scale(0.9) translateY(20px);
}
</style>