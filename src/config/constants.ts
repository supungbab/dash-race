/**
 * 레이스 관련 상수
 */

// 레이스 기본 설정
export const RACE_ID = 'race_session_vue3';
export const FINISH_DISTANCE = 1000; // 기본 목표 거리 (m)

// 거리 옵션
export const DISTANCE_OPTIONS = [
  { value: 100, label: '100m 단거리' },
  { value: 500, label: '500m 중거리' },
  { value: 1000, label: '1000m 장거리' }
] as const;

// 화면 레이아웃
export const LANE_HEIGHT = 90; // 각 레인의 높이 (px)

// 달리기 스텝 설정
export const MIN_STEP = 1; // 최소 스텝
export const MAX_STEP = 6; // 최대 스텝
export const DASH_STEP = 3; // 대시 발동 값 (푸른색)
export const BOOST_STEP = 6; // 부스터 발동 값 (빨간색)

// 카운트다운 설정
export const COUNTDOWN_DURATION = 3000; // 카운트다운 시간 (ms)

// 방 만료 시간 설정
export const ROOM_EXPIRATION_DURATION = 5 * 60 * 1000; // 5분 (ms)

// 레이스 상태 타입
export type RaceStatus = 'waiting' | 'countdown' | 'started' | 'finished';

